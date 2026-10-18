import {createCipheriv,createDecipheriv,createHash,randomBytes,timingSafeEqual} from 'node:crypto';
export const SESSION_COOKIE='__Host-school-record-google';
export const FLOW_COOKIE='__Host-school-record-oauth';
export const SESSION_SECONDS=30*24*60*60;
export const fail=(message,code='SERVER_ERROR',status=500)=>Object.assign(new Error(message),{code,status});
export function config(env=process.env){
 const {GOOGLE_CLIENT_ID:clientId,GOOGLE_CLIENT_SECRET:clientSecret,SESSION_SECRET:secret,APP_URL:raw}=env;
 if(!clientId?.endsWith('.apps.googleusercontent.com')||!clientSecret||!secret||secret.length<32||/REPLACE|YOUR-/i.test([clientId,clientSecret,secret].join(' ')))throw fail('Vercel의 Google 로그인 환경변수를 확인하세요.','CONFIG',503);
 let url;try{url=new URL(raw);}catch{throw fail('APP_URL에 배포한 사이트의 HTTPS 주소를 입력하세요.','CONFIG',503);}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw fail('APP_URL은 경로 없는 HTTPS 사이트 주소여야 합니다.','CONFIG',503);
 return{clientId,clientSecret,secret,origin:url.origin,redirectUri:url.origin+'/api/auth/callback'};
}
export function seal(value,purpose,cfg=config()){
 const iv=randomBytes(12),key=createHash('sha256').update(cfg.secret).digest();
 const c=createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from('school-record-google-v1:'+purpose));
 const data=Buffer.concat([c.update(JSON.stringify(value)),c.final()]);
 return Buffer.concat([iv,c.getAuthTag(),data]).toString('base64url');
}
export function unseal(token,purpose,cfg=config()){
 try{if(typeof token!=='string'||token.length>6000)throw Error();const bytes=Buffer.from(token,'base64url');
 const d=createDecipheriv('aes-256-gcm',createHash('sha256').update(cfg.secret).digest(),bytes.subarray(0,12));d.setAAD(Buffer.from('school-record-google-v1:'+purpose));d.setAuthTag(bytes.subarray(12,28));
 const value=JSON.parse(Buffer.concat([d.update(bytes.subarray(28)),d.final()]).toString());
 if(!Number.isFinite(value.exp)||value.exp<=Date.now())throw Error();return value;
 }catch{throw fail('로그인이 만료되었습니다. Google 계정으로 다시 연결하세요.','AUTH_REQUIRED',401);}
}
export function cookie(req,name){return(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1)||'';}
export function setCookie(res,name,value,seconds){
 const entry=`${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
 if(entry.length>4000)throw fail('로그인 정보가 너무 깁니다. 다시 연결하세요.','AUTH_REQUIRED',401);
 const previous=res.getHeader('Set-Cookie');res.setHeader('Set-Cookie',[...(Array.isArray(previous)?previous:previous?[previous]:[]),entry]);
}
export function clearSession(res){setCookie(res,SESSION_COOKIE,'',0);}
export function session(req,cfg=config()){
 const s=unseal(cookie(req,SESSION_COOKIE),'session',cfg);
 if(!s.refreshToken||!s.user?.id||!s.user?.email)throw fail('Google 로그인이 필요합니다.','AUTH_REQUIRED',401);
 return s;
}
export function guard(req,methods,cfg=config()){
 if(!methods.includes(req.method))throw fail('허용되지 않은 요청입니다.','METHOD',405);
 if(req.headers.host!==new URL(cfg.origin).host)throw fail('APP_URL에 등록된 사이트 주소로 접속하세요.','ORIGIN',403);
 if(!['GET','HEAD'].includes(req.method)&&req.headers.origin!==cfg.origin)throw fail('같은 사이트에서 다시 요청하세요.','ORIGIN',403);
}
export function matchUser(req,s){if(req.headers['x-record-user']!==s.user.id)throw fail('로그인 계정이 변경되었습니다. 현재 자료를 백업한 뒤 다시 로그인하세요.','ACCOUNT_CHANGED',401);}
export function equal(a,b){const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length>0&&x.length===y.length&&timingSafeEqual(x,y);}
export function headers(res){res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');}
export function json(res,status,value){headers(res);res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(value));}
export function errorResponse(res,e){json(res,e.status||500,{error:{code:e.code||'SERVER_ERROR',message:e.status?e.message:'요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.'}});}
