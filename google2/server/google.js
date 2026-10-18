import {OAuth2Client} from 'google-auth-library';
import {createHash} from 'node:crypto';
import {config,fail} from './security.js';
export const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.appdata';
const tokens=new Map();
export async function googleFetch(url,options={},timeout=15000){
 try{return await fetch(url,{...options,signal:AbortSignal.timeout(timeout)});}
 catch{throw fail('Google에 연결하지 못했습니다. 인터넷 연결 또는 잠시 후 재시도를 확인하세요.','NETWORK',503);}
}
export async function exchange(params,cfg=config()){
 const response=await googleFetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:cfg.clientId,client_secret:cfg.clientSecret,...params})});
 const body=await response.json();
 if(!response.ok){if(body.error==='invalid_grant')throw fail('Google 연결이 만료되거나 취소되었습니다. 다시 로그인하세요.','AUTH_REQUIRED',401);if(response.status>=500||response.status===429)throw fail('Google 인증 서버가 응답하지 않습니다. 잠시 후 다시 시도하세요.','NETWORK',503);throw fail('Google OAuth 클라이언트와 리디렉션 주소 설정을 확인하세요.','OAUTH_CONFIG',503);}
 return body;
}
export async function identity(idToken,nonce,cfg=config()){
 const verifier=new OAuth2Client(cfg.clientId);let payload;
 try{payload=(await verifier.verifyIdToken({idToken,audience:cfg.clientId})).getPayload();}catch{throw fail('Google 로그인 서명을 확인하지 못했습니다. 다시 로그인하세요.','AUTH_REQUIRED',401);}
 if(payload.nonce!==nonce||!payload.sub||!payload.email||!payload.email_verified)throw fail('Google 계정 인증을 확인하지 못했습니다.','AUTH_REQUIRED',401);
 return{id:payload.sub,email:payload.email};
}
export async function accessToken(s,cfg=config()){
 const key=createHash('sha256').update(s.refreshToken).digest('hex');let cached=tokens.get(key);
 if(cached?.until>Date.now())return cached.token;
 if(cached?.pending)return cached.pending;
 const pending=exchange({grant_type:'refresh_token',refresh_token:s.refreshToken},cfg).then(result=>{
  if(!result.access_token)throw fail('Google 인증 응답을 확인하지 못했습니다.','AUTH_REQUIRED',401);
  tokens.set(key,{token:result.access_token,until:Date.now()+Math.max(0,(result.expires_in||3600)-120)*1000});
  if(tokens.size>100)tokens.delete(tokens.keys().next().value);return result.access_token;
 }).catch(e=>{tokens.delete(key);throw e;});tokens.set(key,{pending});return pending;
}
export async function driveFetch(s,path,options={}){
 // All URLs are constructed by this server; a client never supplies a target URL.
 const token=await accessToken(s);const response=await googleFetch('https://www.googleapis.com'+path,{...options,headers:{...options.headers,Authorization:'Bearer '+token}});
 if(response.ok)return response;
 if(response.status===412)throw fail('다른 기기에서 자료가 변경되었습니다.','40001',409);
 if(response.status===401)throw fail('Google 연결을 다시 확인해야 합니다. 백업 후 다시 로그인하세요.','AUTH_REQUIRED',401);
 let reason='';try{const b=await response.json();reason=b.error?.errors?.[0]?.reason||'';}catch{}
 if(response.status===429||response.status>=500||['rateLimitExceeded','userRateLimitExceeded'].includes(reason))throw fail('Google 요청 한도 또는 일시적인 오류입니다. 잠시 후 다시 시도합니다.','NETWORK',503);
 if(reason==='storageQuotaExceeded')throw fail('Google Drive 저장공간이 부족합니다. 공간을 확보한 뒤 지금 저장을 누르세요.','DRIVE_QUOTA',413);
 if(response.status===404)throw fail('Google Drive의 저장 파일을 찾지 못했습니다. 자료를 백업하고 다시 여세요.','DRIVE_MISSING',404);
 throw fail('Google Drive 접근에 실패했습니다. Drive API 활성화와 앱 데이터 저장 권한을 확인하세요.','DRIVE_PERMISSION',403);
}
