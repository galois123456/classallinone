import {randomBytes,createHash} from 'node:crypto';
import {config,seal,unseal,cookie,setCookie,clearSession,session,guard,headers,json,errorResponse,fail,equal,SESSION_COOKIE,FLOW_COOKIE,SESSION_SECONDS} from '../../server/security.js';
import {DRIVE_SCOPE,exchange,identity,accessToken} from '../../server/google.js';
const random=()=>randomBytes(32).toString('base64url');
function redirect(res,path){headers(res);res.statusCode=302;res.setHeader('Location',path);res.end();}
export default async function handler(req,res){
 let action;
 try{
  const cfg=config(),url=new URL(req.url,cfg.origin);action=url.pathname.split('/').pop();
  guard(req,action==='logout'?['POST']:['GET'],cfg);headers(res);
  if(action==='login'){
   const flow={state:random(),nonce:random(),verifier:random(),exp:Date.now()+10*60000};
   setCookie(res,FLOW_COOKIE,seal(flow,'oauth',cfg),600);
   const query=new URLSearchParams({client_id:cfg.clientId,redirect_uri:cfg.redirectUri,response_type:'code',scope:'openid email '+DRIVE_SCOPE,access_type:'offline',prompt:'consent select_account',state:flow.state,nonce:flow.nonce,code_challenge:createHash('sha256').update(flow.verifier).digest('base64url'),code_challenge_method:'S256'});
   return redirect(res,'https://accounts.google.com/o/oauth2/v2/auth?'+query);
  }
  if(action==='callback'){
   const flow=unseal(cookie(req,FLOW_COOKIE),'oauth',cfg);setCookie(res,FLOW_COOKIE,'',0);
   if(!equal(flow.state,url.searchParams.get('state')))throw fail('로그인 요청이 일치하지 않습니다. 다시 로그인하세요.','OAUTH_STATE',400);
   if(url.searchParams.has('error'))throw fail('Google 로그인이 취소되었거나 권한이 허용되지 않았습니다.','OAUTH_DENIED',400);
   const code=url.searchParams.get('code');if(!code)throw fail('Google 인증 코드가 없습니다.','OAUTH_CODE',400);
   const result=await exchange({code,code_verifier:flow.verifier,grant_type:'authorization_code',redirect_uri:cfg.redirectUri},cfg);
   if(!result.refresh_token||!result.scope?.split(' ').includes(DRIVE_SCOPE))throw fail('Google Drive 앱 데이터 저장 권한을 허용하고 다시 로그인하세요.','OAUTH_SCOPE',403);
   const user=await identity(result.id_token,flow.nonce,cfg);
   setCookie(res,SESSION_COOKIE,seal({user,refreshToken:result.refresh_token,exp:Date.now()+SESSION_SECONDS*1000},'session',cfg),SESSION_SECONDS);
   return redirect(res,'/');
  }
  if(action==='session'){
   if(!cookie(req,SESSION_COOKIE))return json(res,200,{user:null});
   const s=session(req,cfg);await accessToken(s,cfg);
   setCookie(res,SESSION_COOKIE,seal({...s,exp:Date.now()+SESSION_SECONDS*1000},'session',cfg),SESSION_SECONDS);
   return json(res,200,{user:s.user});
  }
  if(action==='logout'){clearSession(res);setCookie(res,FLOW_COOKIE,'',0);return json(res,200,{ok:true});}
  throw fail('경로를 찾지 못했습니다.','NOT_FOUND',404);
 }catch(e){
  if(action==='callback'){setCookie(res,FLOW_COOKIE,'',0);return redirect(res,'/?auth_error='+encodeURIComponent(e.status?e.message:'로그인을 완료하지 못했습니다. 다시 시도하세요.'));}
  if(e.code==='AUTH_REQUIRED')clearSession(res);return errorResponse(res,e);
 }
}
