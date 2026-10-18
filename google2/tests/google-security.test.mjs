import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {OAuth2Client} from 'google-auth-library';
import {config,seal,unseal,guard,session,matchUser,SESSION_COOKIE,FLOW_COOKIE} from '../server/security.js';
import handler from '../api/auth/[action].js';
const env={APP_URL:'https://records.example.com',GOOGLE_CLIENT_ID:'sample.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'server-secret',SESSION_SECRET:'a'.repeat(64)};Object.assign(process.env,env);
const cfg=config();
function res(){return{headers:{},setHeader(k,v){this.headers[k]=v;},getHeader(k){return this.headers[k];},end(v){this.body=v;}};}
function req(action,other={}){return{method:'GET',url:'/api/auth/'+action,headers:{host:'records.example.com'},...other};}
test('encrypted session is private, authenticated, purpose-bound and expiring',()=>{
 const value={user:{id:'u1',email:'teacher@example.com'},refreshToken:'private-token',exp:Date.now()+10000};const token=seal(value,'session');
 assert.ok(!token.includes('private-token'));assert.deepEqual(unseal(token,'session'),value);
 assert.throws(()=>unseal(token,'oauth'));assert.throws(()=>unseal(token.slice(0,30)+'X'+token.slice(31),'session'));
 assert.throws(()=>unseal(seal({...value,exp:Date.now()-1},'session'),'session'));
 assert.throws(()=>unseal(token,'session',{...cfg,secret:'b'.repeat(64)}));
 const request=req('session',{headers:{cookie:SESSION_COOKIE+'='+token,'x-record-user':'u2'}});assert.equal(session(request).user.id,'u1');assert.throws(()=>matchUser(request,value),{code:'ACCOUNT_CHANGED'});
});
test('mutation origin and configured host are mandatory',()=>{
 assert.throws(()=>guard(req('logout',{method:'POST',headers:{host:'records.example.com',origin:'https://evil.example'}}),['POST']),{code:'ORIGIN'});
 assert.throws(()=>guard(req('session',{headers:{host:'preview.example.com'}}),['GET']),{code:'ORIGIN'});
 assert.throws(()=>config({...env,APP_URL:'https://records.example.com/google2'}),{code:'CONFIG'});
 assert.throws(()=>config({...env,SESSION_SECRET:'short'}),{code:'CONFIG'});
});
test('login uses server flow cookie, state, nonce, PKCE and minimal Drive scope',async()=>{
 const response=res();await handler(req('login'),response);assert.equal(response.statusCode,302);
 const url=new URL(response.headers.Location);assert.equal(url.hostname,'accounts.google.com');assert.equal(url.searchParams.get('redirect_uri'),cfg.redirectUri);
 assert.equal(url.searchParams.get('access_type'),'offline');assert.equal(url.searchParams.get('code_challenge_method'),'S256');
 assert.equal(url.searchParams.get('scope'),'openid email https://www.googleapis.com/auth/drive.appdata');
 assert.ok(!response.headers.Location.includes(env.GOOGLE_CLIENT_SECRET));
 const cookie=response.headers['Set-Cookie'][0];assert.match(cookie,/HttpOnly; Secure; SameSite=Lax/);assert.match(cookie,/Max-Age=600/);
 const flow=unseal(cookie.split(';')[0].split('=')[1],'oauth');assert.equal(url.searchParams.get('state'),flow.state);assert.equal(url.searchParams.get('nonce'),flow.nonce);
});
test('callback rejects forged state before making an external request',async()=>{
 const token=seal({state:'correct',nonce:'nonce',verifier:'verify',exp:Date.now()+10000},'oauth');const response=res();
 await handler(req('callback',{url:'/api/auth/callback?state=wrong&code=never-exchanged',headers:{host:'records.example.com',cookie:FLOW_COOKIE+'='+token}}),response);
 assert.match(response.headers.Location,/auth_error=/);assert.equal(response.headers['Set-Cookie'].length,2);assert.ok(!response.headers['Set-Cookie'].some(x=>x.startsWith(SESSION_COOKIE+'=')));
});
test('verified callback creates reusable HTTP-only session; refresh and logout work',async(t)=>{
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});const now=Math.floor(Date.now()/1000);
 const head=Buffer.from(JSON.stringify({alg:'RS256',kid:'test-key'})).toString('base64url');
 const claims=Buffer.from(JSON.stringify({iss:'https://accounts.google.com',aud:cfg.clientId,sub:'teacher1',email:'teacher@example.com',email_verified:true,nonce:'test-nonce',iat:now,exp:now+3600})).toString('base64url');
 const jwt=head+'.'+claims+'.'+sign('RSA-SHA256',Buffer.from(head+'.'+claims),privateKey).toString('base64url');
 t.mock.method(OAuth2Client.prototype,'getFederatedSignonCertsAsync',async()=>({certs:{'test-key':publicKey.export({type:'spki',format:'pem'})}}));
 const calls=[];t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push({url,body:String(options.body)});return new Response(JSON.stringify({access_token:'access-private',refresh_token:'refresh-private',id_token:jwt,expires_in:3600,scope:'openid email https://www.googleapis.com/auth/drive.appdata'}),{status:200});});
 const flow=seal({state:'test-state',nonce:'test-nonce',verifier:'test-verifier',exp:Date.now()+10000},'oauth');const response=res();
 await handler(req('callback',{url:'/api/auth/callback?state=test-state&code=test-code',headers:{host:'records.example.com',cookie:FLOW_COOKIE+'='+flow}}),response);
 assert.equal(response.headers.Location,'/');const stored=response.headers['Set-Cookie'].find(x=>x.startsWith(SESSION_COOKIE+'='));assert.ok(stored);assert.ok(stored.length<4000);assert.ok(!stored.includes('refresh-private'));
 const request=req('session',{headers:{host:'records.example.com',cookie:stored.split(';')[0]}}),again=res();await handler(request,again);
 assert.deepEqual(JSON.parse(again.body),{user:{id:'teacher1',email:'teacher@example.com'}});assert.equal(calls.length,2);assert.match(calls[1].body,/grant_type=refresh_token/);assert.ok(!again.body.includes('private'));
 const logout=res();await handler(req('logout',{method:'POST',headers:{host:'records.example.com',origin:cfg.origin,cookie:stored.split(';')[0]}}),logout);assert.equal(logout.statusCode,200);assert.match(logout.headers['Set-Cookie'][0],/Max-Age=0/);
});
