-- Class all in one · 학생 설문 서버 v1 (classsurvey_install_v1.sql)
-- Supabase 대시보드 → SQL Editor → New query에 전체를 붙여넣고 Run을 한 번 누르세요.
-- 기존 온라인 퀴즈(classquiz) 표와 함수는 건드리지 않습니다. 다시 실행해도 기존 설문 응답은 지워지지 않습니다.
-- 학생·교사 브라우저는 이 표에 직접 접근할 수 없고, Vercel의 api/classsurvey.js(서비스 키)만 아래 함수를 호출합니다.

create extension if not exists pgcrypto;

create table if not exists public.classsurvey_rooms (
  id uuid primary key default gen_random_uuid(),
  owner text not null,
  code text not null unique,
  password_hash text not null,
  title text not null,
  intro text not null default '',
  questions jsonb not null,
  settings jsonb not null default '{}'::jsonb,
  phase text not null default 'open' check (phase in ('open','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists classsurvey_rooms_owner_idx on public.classsurvey_rooms (owner, created_at desc);

create table if not exists public.classsurvey_responses (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.classsurvey_rooms(id) on delete cascade,
  token_hash text,
  student_number text not null,
  name text not null,
  answers jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, student_number, name)
);
create index if not exists classsurvey_responses_room_idx on public.classsurvey_responses (room_id);
create index if not exists classsurvey_responses_token_idx on public.classsurvey_responses (room_id, token_hash);

create table if not exists public.classsurvey_attempts (
  id bigserial primary key,
  ip text not null,
  code text not null,
  at timestamptz not null default now()
);
create index if not exists classsurvey_attempts_idx on public.classsurvey_attempts (ip, at);

alter table public.classsurvey_rooms enable row level security;
alter table public.classsurvey_responses enable row level security;
alter table public.classsurvey_attempts enable row level security;
revoke all on public.classsurvey_rooms, public.classsurvey_responses, public.classsurvey_attempts from anon, authenticated;

-- 문항 하나에 대한 학생 답을 검사하고 정리합니다. 잘못된 답이면 예외를 냅니다.
create or replace function public.classsurvey_clean_answer(q jsonb, a jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  t text := q->>'type';
  out jsonb;
  v jsonb;
  s text;
  n int;
  maxn int;
begin
  if a is null or a = 'null'::jsonb then return null; end if;
  if t = 'choice' then
    if jsonb_typeof(a) <> 'array' then raise exception using errcode = 'P0001', message = '객관식 답 형식이 올바르지 않습니다.'; end if;
    out := '[]'::jsonb;
    for v in select * from jsonb_array_elements(a) loop
      if jsonb_typeof(v) <> 'string' or not exists (select 1 from jsonb_array_elements(q->'choices') c where c->>'id' = v#>>'{}') then
        raise exception using errcode = 'P0001', message = '없는 선택지를 골랐습니다. 새로고침한 뒤 다시 고르세요.';
      end if;
      if not out @> jsonb_build_array(v) then out := out || jsonb_build_array(v); end if;
    end loop;
    n := jsonb_array_length(out);
    if n > 1 and coalesce((q->>'multiple')::boolean, false) = false then
      raise exception using errcode = 'P0001', message = '이 문항은 하나만 고를 수 있습니다.';
    end if;
    if n = 0 then return null; end if;
    return out;
  elsif t = 'text' then
    if jsonb_typeof(a) <> 'string' then raise exception using errcode = 'P0001', message = '서술형 답 형식이 올바르지 않습니다.'; end if;
    s := a#>>'{}';
    if length(s) > 3000 then raise exception using errcode = 'P0001', message = '서술형 답은 3000자까지 쓸 수 있습니다.'; end if;
    if btrim(s) = '' then return null; end if;
    return to_jsonb(s);
  elsif t = 'tags' then
    if jsonb_typeof(a) <> 'array' then raise exception using errcode = 'P0001', message = '해시태그 답 형식이 올바르지 않습니다.'; end if;
    maxn := greatest(1, least(20, coalesce((q->>'maxTags')::int, 5)));
    out := '[]'::jsonb;
    for v in select * from jsonb_array_elements(a) loop
      if jsonb_typeof(v) <> 'string' then raise exception using errcode = 'P0001', message = '해시태그 형식이 올바르지 않습니다.'; end if;
      s := btrim(regexp_replace(v#>>'{}', '^#+', ''));
      s := regexp_replace(s, '\s+', '_', 'g');
      if s = '' then continue; end if;
      if length(s) > 30 then raise exception using errcode = 'P0001', message = '해시태그는 30자까지 쓸 수 있습니다.'; end if;
      if coalesce((q->>'allowCustom')::boolean, true) = false
         and not exists (select 1 from jsonb_array_elements_text(q->'tags') x where x = s) then
        raise exception using errcode = 'P0001', message = '이 문항은 선생님이 준비한 해시태그만 고를 수 있습니다.';
      end if;
      if not out @> jsonb_build_array(s) then out := out || jsonb_build_array(s); end if;
    end loop;
    if jsonb_array_length(out) > maxn then
      raise exception using errcode = 'P0001', message = format('해시태그는 %s개까지 고를 수 있습니다.', maxn);
    end if;
    if jsonb_array_length(out) = 0 then return null; end if;
    return out;
  end if;
  raise exception using errcode = 'P0001', message = '지원하지 않는 문항입니다.';
end $$;

-- 학생에게 보낼 방 정보 (비밀번호 해시·교사 정보 제외)
create or replace function public.classsurvey_room_public(r public.classsurvey_rooms)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object('id', r.id, 'code', r.code, 'title', r.title, 'intro', r.intro,
    'questions', r.questions, 'settings', r.settings, 'phase', r.phase, 'now', now());
$$;

create or replace function public.classsurvey_api(p_action text, p_data jsonb, p_owner text, p_token_hash text, p_ip text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.classsurvey_rooms;
  s public.classsurvey_responses;
  q jsonb;
  ans jsonb;
  cleaned jsonb;
  v jsonb;
  num text;
  nm text;
  fails int;
  missing int;
begin
  -- 교사 요청: Vercel이 Google 로그인으로 확인한 이메일만 owner로 넘깁니다.
  if p_action in ('list','create','results','close','open','delete','unlock','remove') then
    if p_owner is null or p_owner = '' then return jsonb_build_object('error','교사 로그인이 필요합니다.','status',401); end if;
    if p_action = 'list' then
      return jsonb_build_object('rooms', coalesce((select jsonb_agg(jsonb_build_object(
          'id', x.id, 'code', x.code, 'title', x.title, 'phase', x.phase, 'created_at', x.created_at,
          'surveyId', x.settings->>'surveyId', 'questions', jsonb_array_length(x.questions),
          'responses', (select count(*) from public.classsurvey_responses y where y.room_id = x.id),
          'submitted', (select count(*) from public.classsurvey_responses y where y.room_id = x.id and y.submitted_at is not null))
        order by x.created_at desc) from (select * from public.classsurvey_rooms where owner = p_owner order by created_at desc limit 300) x), '[]'::jsonb));
    elsif p_action = 'create' then
      if jsonb_typeof(p_data->'questions') <> 'array' or jsonb_array_length(p_data->'questions') not between 1 and 100 then
        return jsonb_build_object('error','설문 문항은 1~100개여야 합니다.','status',400);
      end if;
      if (select count(*) from public.classsurvey_rooms where owner = p_owner) >= 1000 then
        return jsonb_build_object('error','설문 방이 너무 많습니다. 지난 설문 방을 삭제한 뒤 다시 만드세요.','status',400);
      end if;
      insert into public.classsurvey_rooms (owner, code, password_hash, title, intro, questions, settings)
      values (p_owner, p_data->>'code', p_data->>'passwordHash', left(coalesce(p_data->>'title','설문'),160), left(coalesce(p_data->>'intro',''),4000),
              p_data->'questions', coalesce(p_data->'settings','{}'::jsonb))
      returning * into r;
      return jsonb_build_object('room', public.classsurvey_room_public(r));
    end if;
    select * into r from public.classsurvey_rooms where id = (p_data->>'roomId')::uuid and owner = p_owner;
    if not found then return jsonb_build_object('error','설문 방을 찾지 못했습니다.','status',404); end if;
    if p_action = 'close' or p_action = 'open' then
      update public.classsurvey_rooms set phase = case when p_action = 'close' then 'closed' else 'open' end, updated_at = now() where id = r.id returning * into r;
    elsif p_action = 'delete' then
      delete from public.classsurvey_rooms where id = r.id;
      return jsonb_build_object('ok', true);
    elsif p_action = 'unlock' then
      update public.classsurvey_responses set token_hash = null, updated_at = now() where id = (p_data->>'responseId')::uuid and room_id = r.id;
    elsif p_action = 'remove' then
      delete from public.classsurvey_responses where id = (p_data->>'responseId')::uuid and room_id = r.id;
    end if;
    return jsonb_build_object('room', public.classsurvey_room_public(r),
      'responses', coalesce((select jsonb_agg(jsonb_build_object('id', y.id, 'studentNumber', y.student_number, 'name', y.name,
          'answers', y.answers, 'submittedAt', y.submitted_at, 'updatedAt', y.updated_at, 'locked', y.token_hash is not null)
        order by y.student_number, y.name) from public.classsurvey_responses y where y.room_id = r.id), '[]'::jsonb));
  end if;

  -- 학생 요청: 기기마다 받은 무작위 토큰의 해시로만 구분합니다.
  if p_token_hash is null or length(p_token_hash) < 40 then return jsonb_build_object('error','입장 정보가 없습니다. 다시 입장하세요.','status',401); end if;
  if p_action = 'join' then
    select count(*) into fails from public.classsurvey_attempts where ip = coalesce(p_ip,'') and at > now() - interval '10 minutes';
    if fails >= 20 then return jsonb_build_object('error','입장 시도가 너무 많습니다. 10분 뒤 다시 시도하세요.','status',429); end if;
    select * into r from public.classsurvey_rooms where code = upper(coalesce(p_data->>'code',''));
    if not found or r.password_hash <> coalesce(p_data->>'passwordHash','') then
      insert into public.classsurvey_attempts (ip, code) values (coalesce(p_ip,''), left(coalesce(p_data->>'code',''),20));
      delete from public.classsurvey_attempts where at < now() - interval '1 day';
      return jsonb_build_object('error','입장 코드 또는 비밀번호가 맞지 않습니다.','status',403);
    end if;
    num := btrim(coalesce(p_data->>'studentNumber','')); nm := btrim(coalesce(p_data->>'name',''));
    if num = '' or nm = '' or length(num) > 20 or length(nm) > 30 then return jsonb_build_object('error','학번(1~20자)과 이름(1~30자)을 입력하세요.','status',400); end if;
    select * into s from public.classsurvey_responses where room_id = r.id and student_number = num and name = nm;
    if found then
      if s.token_hash is distinct from p_token_hash then
        if s.token_hash is not null and (s.submitted_at is not null or s.answers <> '{}'::jsonb) then
          return jsonb_build_object('error','이 학번·이름으로 다른 기기에서 이미 응답했습니다. 선생님께 "다시 입장 허용"을 요청하세요.','status',409);
        end if;
        update public.classsurvey_responses set token_hash = p_token_hash, updated_at = now() where id = s.id returning * into s;
      end if;
    else
      if r.phase <> 'open' then return jsonb_build_object('error','설문이 마감되었습니다.','status',409); end if;
      if (select count(*) from public.classsurvey_responses where room_id = r.id) >= 500 then return jsonb_build_object('error','참여 인원이 너무 많습니다.','status',400); end if;
      insert into public.classsurvey_responses (room_id, token_hash, student_number, name) values (r.id, p_token_hash, num, nm) returning * into s;
    end if;
  else
    select * into s from public.classsurvey_responses where room_id = (p_data->>'roomId')::uuid and token_hash = p_token_hash;
    if not found then return jsonb_build_object('error','입장 정보가 바뀌었습니다. 다시 입장하세요.','status',401); end if;
    select * into r from public.classsurvey_rooms where id = s.room_id;
    if p_action = 'save' then
      if r.phase <> 'open' then return jsonb_build_object('error','설문이 마감되어 답을 바꿀 수 없습니다.','status',409); end if;
      ans := coalesce(p_data->'answers','{}'::jsonb);
      if jsonb_typeof(ans) <> 'object' then return jsonb_build_object('error','답 형식이 올바르지 않습니다.','status',400); end if;
      cleaned := '{}'::jsonb; missing := 0;
      for q in select * from jsonb_array_elements(r.questions) loop
        v := public.classsurvey_clean_answer(q, ans->(q->>'id'));
        if v is not null then cleaned := cleaned || jsonb_build_object(q->>'id', v);
        elsif coalesce((q->>'required')::boolean, false) then missing := missing + 1; end if;
      end loop;
      if coalesce((p_data->>'submit')::boolean, false) and missing > 0 then
        return jsonb_build_object('error', format('필수 문항 %s개에 답하지 않았습니다.', missing), 'status', 400);
      end if;
      update public.classsurvey_responses set answers = cleaned, updated_at = now(),
        submitted_at = case when coalesce((p_data->>'submit')::boolean, false) then now() else submitted_at end
      where id = s.id returning * into s;
    elsif p_action <> 'state' then
      return jsonb_build_object('error','지원하지 않는 설문 요청입니다.','status',400);
    end if;
  end if;
  return jsonb_build_object('room', public.classsurvey_room_public(r),
    'response', jsonb_build_object('studentNumber', s.student_number, 'name', s.name, 'answers', s.answers, 'submittedAt', s.submitted_at, 'updatedAt', s.updated_at));
end $$;

revoke all on function public.classsurvey_api(text, jsonb, text, text, text) from public;
revoke all on function public.classsurvey_clean_answer(jsonb, jsonb) from public;
revoke all on function public.classsurvey_room_public(public.classsurvey_rooms) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.classsurvey_api(text, jsonb, text, text, text) from anon, authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.classsurvey_api(text, jsonb, text, text, text) to service_role';
    execute 'grant execute on function public.classsurvey_clean_answer(jsonb, jsonb) to service_role';
    execute 'grant execute on function public.classsurvey_room_public(public.classsurvey_rooms) to service_role';
  end if;
end $$;
