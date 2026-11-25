// v1.52(1.54 수정: 객관식 직접 추가): 학생 설문. 교사 확인·비밀번호 해시·입력 정리는 이 서버 함수에서만 합니다.
// Supabase에는 classsurvey_install_v3.sql을 한 번 실행해야 합니다. 환경 변수는 온라인 퀴즈와 같은 것을 씁니다.
const crypto = require('node:crypto');
const { getSession, sameOrigin } = require('../lib/oauth');
const STUDENT = new Set(['join', 'state', 'save']);
const TEACHER = new Set(['list', 'create', 'results', 'close', 'open', 'delete', 'unlock', 'remove']);
const digest = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function passwordHash(code, password) {
  return crypto.createHmac('sha256', process.env.SESSION_ENCRYPTION_KEY).update('classsurvey-v1:' + code + ':' + password).digest('hex');
}
const text = (v, max) => String(v ?? '').replace(/\u0000/g, '').slice(0, max);
const id = v => text(v, 100).replace(/[^A-Za-z0-9_.:-]/g, '') || crypto.randomUUID();
function cleanTag(v) { return text(v, 60).trim().replace(/^#+/, '').replace(/\s+/g, '_').slice(0, 30); }
// 교사가 보낸 문항을 서버에 저장하기 전에 정리합니다. 알 수 없는 필드는 버립니다.
function cleanQuestions(list) {
  if (!Array.isArray(list) || list.length < 1 || list.length > 100) throw Error('설문 문항은 1~100개여야 합니다.');
  const seen = new Set();
  return list.map((q, i) => {
    const type = ['choice', 'text', 'tags'].includes(q?.type) ? q.type : null;
    if (!type) throw Error((i + 1) + '번 문항의 종류가 올바르지 않습니다.');
    let qid = id(q.id); if (seen.has(qid)) qid = crypto.randomUUID(); seen.add(qid);
    const prompt = text(q.prompt, 4000).trim();
    if (!prompt) throw Error((i + 1) + '번 문항의 질문을 입력하세요.');
    const out = { id: qid, type, prompt, required: !!q.required };
    if (type === 'choice') {
      const ids = new Set();
      out.choices = (Array.isArray(q.choices) ? q.choices : []).slice(0, 30).map(c => {
        let cid = id(c?.id); if (ids.has(cid)) cid = crypto.randomUUID(); ids.add(cid);
        return { id: cid, text: text(c?.text, 500).trim() };
      }).filter(c => c.text);
      if (out.choices.length < 2) throw Error((i + 1) + '번 객관식 문항에 선택지를 2개 이상 입력하세요.');
      out.multiple = !!q.multiple;
      out.allowOther = !!q.allowOther;
    } else if (type === 'text') {
      out.long = q.long !== false;
    } else {
      out.tags = [...new Set((Array.isArray(q.tags) ? q.tags : []).slice(0, 50).map(cleanTag).filter(Boolean))];
      out.allowCustom = q.allowCustom !== false;
      out.maxTags = Math.max(1, Math.min(20, Math.round(Number(q.maxTags) || 5)));
      if (!out.allowCustom && !out.tags.length) throw Error((i + 1) + '번 해시태그 문항에 고를 태그를 넣거나 학생이 직접 추가할 수 있게 하세요.');
    }
    return out;
  });
}
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 사용할 수 있습니다.' });
  try {
    if (!sameOrigin(req)) return res.status(403).json({ error: '교실 도구 사이트에서 다시 접속하세요.' });
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) return res.status(415).json({ error: 'JSON 요청이 필요합니다.' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || Buffer.byteLength(JSON.stringify(body)) > 600000) return res.status(413).json({ error: '한 번에 보낼 수 있는 크기를 넘었습니다.' });
    const action = String(body.action || '');
    if (!STUDENT.has(action) && !TEACHER.has(action)) return res.status(400).json({ error: '지원하지 않는 설문 요청입니다.' });
    const url = (process.env.CLASSQUIZ_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
    const key = process.env.CLASSQUIZ_SUPABASE_SECRET_KEY || process.env.CLASSQUIZ_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!/^https?:\/\/[a-z0-9.:-]+$/i.test(url) || !key) return res.status(503).json({ error: '온라인 설문 설정이 필요합니다. Vercel의 CLASSQUIZ_SUPABASE_URL과 CLASSQUIZ_SUPABASE_SECRET_KEY를 등록하세요.' });
    if (!process.env.SESSION_ENCRYPTION_KEY) return res.status(503).json({ error: 'Vercel의 SESSION_ENCRYPTION_KEY 설정이 필요합니다.' });
    let owner = null, token = null; const data = {};
    for (const k of ['roomId', 'responseId']) if (body[k] !== undefined) { if (!UUID.test(String(body[k]))) return res.status(400).json({ error: '설문 방 정보가 올바르지 않습니다.' }); data[k] = String(body[k]); }
    if (TEACHER.has(action)) {
      const session = getSession(req);
      if (!session?.email || !session?.refreshToken) return res.status(401).json({ error: '교사 Google 로그인이 필요합니다. 상단의 Google Drive에서 로그인하세요.' });
      owner = String(session.email).toLowerCase();
    } else {
      token = String(req.headers['x-classsurvey-token'] || '');
      if (action === 'join' && !token) token = crypto.randomBytes(32).toString('base64url');
      if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return res.status(401).json({ error: '입장 정보가 없습니다. 다시 입장하세요.' });
    }
    if (action === 'create') {
      const pass = String(body.password || '');
      if (pass.length < 1 || pass.length > 80) return res.status(400).json({ error: '입장 비밀번호를 1~80자로 입력하세요.' });
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', bytes = crypto.randomBytes(7);
      data.code = 'S' + [...bytes].map(b => alphabet[b % alphabet.length]).join('');
      data.passwordHash = passwordHash(data.code, pass);
      data.title = text(body.title, 160).trim() || '설문';
      data.intro = text(body.intro, 4000);
      try { data.questions = cleanQuestions(body.questions); } catch (e) { return res.status(400).json({ error: e.message }); }
      data.settings = { surveyId: text(body.surveyId, 100) };
    }
    if (action === 'join') {
      data.code = String(body.code || '').toUpperCase().replace(/\s/g, '').slice(0, 20);
      data.passwordHash = passwordHash(data.code, String(body.password || '').slice(0, 80));
      data.studentNumber = text(body.studentNumber, 20).trim(); data.name = text(body.name, 30).trim();
    }
    if (action === 'save') {
      if (!body.answers || typeof body.answers !== 'object' || Array.isArray(body.answers)) return res.status(400).json({ error: '답 형식이 올바르지 않습니다.' });
      data.answers = body.answers; data.submit = !!body.submit;
    }
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
    let response;
    try {
      response = await fetch(url + '/rest/v1/rpc/classsurvey_api', { method: 'POST', headers: { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: 'Bearer ' + key } : {}), 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_action: action, p_data: data, p_owner: owner, p_token_hash: token ? digest(token) : null, p_ip: digest(String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0]) }), signal: controller.signal });
    } finally { clearTimeout(timer); }
    const result = await response.json();
    if (!response.ok) {
      if (result.code === 'P0001') return res.status(400).json({ error: result.message });
      if (result.code === 'PGRST202' || result.code === '42883' || result.code === '42P01') return res.status(503).json({ error: 'Supabase에 설문 SQL 설치가 필요합니다. classsurvey_install_v3.sql을 SQL Editor에서 실행하세요.' });
      console.error('classsurvey database error', result.code);
      return res.status(500).json({ error: '설문 요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.' });
    }
    if (result?.error) return res.status(result.status || 400).json({ error: result.error });
    if (action === 'join') result.token = token;
    return res.status(200).json(result);
  } catch (error) {
    if (error.name === 'AbortError') return res.status(504).json({ error: '서버 응답이 지연됩니다. 작성한 답은 이 기기에 남아 있으니 다시 시도하세요.' });
    console.error('classsurvey request error', error.name);
    return res.status(400).json({ error: '요청을 확인할 수 없습니다. 페이지를 새로고침한 뒤 다시 시도하세요.' });
  }
};
module.exports.cleanQuestions = cleanQuestions;
