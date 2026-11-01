// v1.29: all authorization and scoring happen behind this same-origin endpoint.
const crypto = require('node:crypto');
const { getSession, sameOrigin } = require('../lib/oauth');
const STUDENT = new Set(['join','state','answer','move','submit']);
const TEACHER = new Set(['list','prepare','upload','publish','teacher_state','start','next','close_question','end','retake','reconnect','detail','delete']);
const digest = s => crypto.createHash('sha256').update(String(s)).digest('hex');
function passwordHash(code,password) {
  return crypto.createHmac('sha256',process.env.SESSION_ENCRYPTION_KEY).update('classquiz-v1:'+code+':'+password).digest('hex');
}
module.exports = async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST')return res.status(405).json({error:'POST 요청만 사용할 수 있습니다.'});
  try {
    if(!sameOrigin(req))return res.status(403).json({error:'교실 도구 사이트에서 다시 접속하세요.'});
    if(!String(req.headers['content-type']||'').startsWith('application/json'))return res.status(415).json({error:'JSON 요청이 필요합니다.'});
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(!body||Buffer.byteLength(JSON.stringify(body))>1800000)return res.status(413).json({error:'한 번에 보낼 수 있는 크기를 넘었습니다.'});
    const action=String(body.action||'');
    if(!STUDENT.has(action)&&!TEACHER.has(action))return res.status(400).json({error:'지원하지 않는 퀴즈 요청입니다.'});
    const url=(process.env.CLASSQUIZ_SUPABASE_URL||process.env.SUPABASE_URL||'').replace(/\/$/,'');
    const key=process.env.CLASSQUIZ_SUPABASE_SECRET_KEY||process.env.CLASSQUIZ_SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!/^https:\/\/[a-z0-9.-]+$/i.test(url)||!key)return res.status(503).json({error:'온라인 퀴즈 설정이 필요합니다. Vercel의 CLASSQUIZ_SUPABASE_URL과 CLASSQUIZ_SUPABASE_SECRET_KEY를 등록하세요.'});
    let owner=null,token=null;const data={...body};delete data.action;
    if(TEACHER.has(action)) {
      const session=getSession(req);
      if(!session?.email||!session?.refreshToken)return res.status(401).json({error:'교사 Google 로그인이 필요합니다.'});
      owner=String(session.email).toLowerCase();
    } else {
      token=String(req.headers['x-classquiz-token']||'');
      if(action==='join'&&!token)token=crypto.randomBytes(32).toString('base64url');
      if(!/^[A-Za-z0-9_-]{40,64}$/.test(token))return res.status(401).json({error:'입장 정보가 없습니다. 다시 입장하세요.'});
    }
    if(action==='prepare') {
      const pass=String(data.password||'');
      if(pass.length<1||pass.length>80)return res.status(400).json({error:'입장 비밀번호를 1~80자로 입력하세요.'});
      const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',bytes=crypto.randomBytes(8);
      data.code=[...bytes].map(b=>alphabet[b%alphabet.length]).join('');
      data.passwordHash=passwordHash(data.code,pass);delete data.password;
    }
    if(action==='join') {
      data.code=String(data.code||'').toUpperCase().replace(/\s/g,'');
      data.passwordHash=passwordHash(data.code,String(data.password||''));delete data.password;
      data.studentNumber=String(data.studentNumber||'').trim();data.name=String(data.name||'').trim();
    }
    // Owner identity and token hashes never come from user-controlled JSON fields.
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    let response;
    try {response=await fetch(url+'/rest/v1/rpc/classquiz_api',{method:'POST',headers:{apikey:key,...(key.startsWith('eyJ')?{Authorization:'Bearer '+key}:{}),'Content-Type':'application/json'},body:JSON.stringify({p_action:action,p_data:data,p_owner:owner,p_token_hash:token?digest(token):null,p_ip:digest(String(req.headers['x-forwarded-for']||'unknown').split(',')[0])}),signal:controller.signal});}
    finally {clearTimeout(timer);}
    const result=await response.json();
    if(!response.ok) {
      if(result.code==='P0001')return res.status(400).json({error:result.message});
      if(result.code==='PGRST202'||result.code==='42883')return res.status(503).json({error:'Supabase SQL 설치가 필요합니다. classquiz_install_v1.29.sql을 실행하세요.'});
      console.error('classquiz database error',result.code);
      return res.status(500).json({error:'퀴즈 요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.'});
    }
    if(result?.error)return res.status(result.status||400).json({error:result.error});
    if(action==='join')result.token=token;
    return res.status(200).json(result);
  } catch(error) {
    if(error.name==='AbortError')return res.status(504).json({error:'서버 응답이 지연됩니다. 저장된 답안을 유지하고 다시 연결하세요.'});
    console.error('classquiz request error',error.name);
    return res.status(400).json({error:'요청을 확인할 수 없습니다. 페이지를 새로고침한 뒤 다시 시도하세요.'});
  }
};
