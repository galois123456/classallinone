import './backup-crypto.js';
import { attachCloudToolbar } from './cloud-toolbar.js';
import { bindSaveFeedback } from './save-feedback.js';
import { WorkspaceSync, validatePayload } from './sync.js';
import {createWorkspaceRemote,api} from './remote.js';
const $=id=>document.getElementById(id);
const project=location.origin;
let detachCloudToolbar=()=>{};
let currentUser=null,engine=null,frame=null,releaseLock=null,loadingUser=null,epoch=0,readyTimer=null;
const remote=createWorkspaceRemote();
const remoteFor=uid=>({save:(payload,revision)=>remote.save(uid,payload,revision)});
function cacheFor(uid){const key=`school-record-google:${project}:${uid}`;return{read(){const raw=localStorage.getItem(key);if(!raw)return null;const p=JSON.parse(raw);if(!Number.isSafeInteger(p.baseRevision)||p.baseRevision<0)throw Error('기기 임시 자료가 손상되었습니다.');validatePayload(p.payload);return p;},write(p){localStorage.setItem(key,JSON.stringify(p));},remove(){localStorage.removeItem(key);}};}
function notice(text=''){$('cloudNotice').textContent=text;$('cloudNotice').hidden=!text;}
function message(text){$('authMessage').textContent=text;}
const authError=new URLSearchParams(location.search).get('auth_error');
if(authError){message(authError);history.replaceState(null,'',location.pathname);}

function explain(error){return error?.message||'요청을 처리하지 못했습니다.';}
function status({state,detail,cacheError,confirmedAt}){
 const time=confirmedAt?new Date(confirmedAt).toLocaleTimeString('ko-KR',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'}):'';
 const label={pending:'Drive 저장 대기 중',saving:'Drive 저장 중…',saved:'Drive 저장 완료'+(time?' · '+time:''),offline:'연결 끊김 · 서버 저장 불가',error:'서버 저장 실패 · 재시도 필요',conflict:'기기 간 충돌 · 선택 필요'};
 $('syncState').textContent=label[state]||state;$('syncState').dataset.state=state;
 if(cacheError)notice('이 브라우저에 임시 자료를 보관하지 못했습니다. 서버 저장 완료를 확인하거나 통합 백업을 받으세요.');
 else if(state==='offline')notice('인터넷 연결이 끊겨 서버에 저장할 수 없습니다. 이 기기에 보관한 변경 사항은 연결 후 저장됩니다.');
 else if(state==='error')notice(explain({message:detail})+' 현재 화면을 닫지 말고 다시 저장해 주세요.');
 else notice();
 if(state==='conflict'&&!$('resolveDialog').open){$('resolveDialog').showModal();flushEditor();}
}
function flushEditor(strict=false){try{frame?.contentWindow?.cloudFlush?.();}catch(e){notice(explain(e));if(strict)throw e;}}
function detachEditor(){detachCloudToolbar();detachCloudToolbar=()=>{};clearTimeout(readyTimer);frame?.remove();frame=null;window.__recordStorage=undefined;}
function stop(){epoch++;resetSaveFeedback();flushEditor();engine?.close();engine=null;detachEditor();releaseLock?.();releaseLock=null;currentUser=null;loadingUser=null;for(const id of ['resolveDialog'])if($(id).open)$(id).close();}
function loading(text){$('editorHost').replaceChildren();const div=document.createElement('div');div.className='loading';div.textContent=text;$('editorHost').append(div);return div;}
async function lock(uid){if(!navigator.locks)throw Error('이 브라우저에서는 안전한 탭 잠금을 사용할 수 없습니다. 최신 Chrome, Edge, Safari 또는 Firefox의 HTTPS 주소로 접속하세요.');let unlock;const held=new Promise(r=>unlock=r);return new Promise((resolve,reject)=>{navigator.locks.request(`school-record-google:${project}:${uid}`,{ifAvailable:true},async acquired=>{if(!acquired){resolve(null);return;}resolve(unlock);await held;}).catch(reject);});}
function mountEditor(){
 detachEditor();window.__recordStorage=engine.storage;
 frame=document.createElement('iframe');frame.title='생기부 작성 도우미 편집기';frame.setAttribute('allow','clipboard-read; clipboard-write');frame.srcdoc=__EDITOR_HTML__;
 $('editorHost').replaceChildren(frame);
 readyTimer=setTimeout(()=>notice('편집기 준비가 지연되고 있습니다. 자료를 백업한 뒤 새로고침하세요. 서버 자동 저장은 아직 시작하지 않았습니다.'),15000);
}
window.cloudEditorReady=()=>{clearTimeout(readyTimer);detachCloudToolbar();detachCloudToolbar=attachCloudToolbar(document,frame.contentDocument);engine?.start();};
async function openAccount(user){
 if(loadingUser===user.id||currentUser?.id===user.id)return;
 stop();const ticket=epoch;loadingUser=user.id;
 $('authView').hidden=true;$('workspace').hidden=false;$('reconnectBtn').hidden=true;$('userEmail').textContent=user.email||'';
 $('saveBtn').disabled=true;$('reloadBtn').disabled=true;loading('저장한 자료를 불러오는 중입니다…');
 try {
  const unlock=await lock(user.id);if(ticket!==epoch){unlock?.();return;}if(!unlock)throw Error('다른 탭에서 이 계정의 생기부를 사용 중입니다. 해당 탭을 닫은 뒤 다시 열어 주세요.');releaseLock=unlock;
  const row=await remote.read(user.id);if(ticket!==epoch)return;
  const cache=cacheFor(user.id);let pending;try{pending=cache.read();}catch(cause){throw Object.assign(Error('기기에 보관된 임시 자료를 읽지 못했습니다. 백업 후 기기 임시 자료만 비우고 다시 열 수 있습니다.'),{code:'LOCAL_DRAFT_INVALID'});}
  currentUser=user;loadingUser=null;
  engine=new WorkspaceSync({remote:remoteFor(user.id),cache,revision:row.revision,payload:row.payload,pending,onState:status,isOnline:()=>navigator.onLine!==false});
  $('saveBtn').disabled=false;$('reloadBtn').disabled=false;
  if(engine.blocked){loading('기기 임시 자료와 서버 자료 중 사용할 자료를 선택하세요.');status({state:'conflict'});}else mountEditor();
 }catch(e){if(ticket!==epoch)return;loadingUser=null;currentUser=null;engine?.close();engine=null;detachEditor();releaseLock?.();releaseLock=null;const area=loading(explain(e));const retry=document.createElement('button');retry.className='primary';retry.textContent='다시 열기';retry.onclick=()=>openAccount(user);area.append(retry);
  if(e.code==='LOCAL_DRAFT_INVALID'){
   const backup=document.createElement('button');backup.textContent='기기 임시 자료 내려받기';backup.onclick=()=>{const raw=localStorage.getItem(`school-record-google:${project}:${user.id}`);downloadJSON({app:'school-record-raw-recovery',raw},'생기부_임시자료복구');};
   const discard=document.createElement('button');discard.textContent='기기 임시 자료 비우고 서버에서 열기';discard.onclick=()=>{if(confirm('기기에만 남은 미저장 자료를 버릴까요? 서버 자료는 유지됩니다.')){cacheFor(user.id).remove();openAccount(user);}};area.append(backup,discard);
  }
  $('syncState').textContent='자료를 불러오지 못했습니다';}
}
async function saveNow({force=false,automatic=false}={}){flushEditor(true);if(!engine)throw Error('편집기를 먼저 열어 주세요.');if(engine.paused)throw Error('편집기를 준비 중입니다. 잠시 후 다시 시도하세요.');if(automatic&&engine.dirty){engine.schedule();return;}await engine.flush({force,automatic});}
const resetSaveFeedback=bindSaveFeedback({button:$('saveBtn'),save:()=>saveNow({force:true}),onError:e=>status({state:engine?.blocked?'conflict':navigator.onLine===false?'offline':'error',detail:explain(e),cacheError:engine?.cacheError})});
$('reloadBtn').onclick=async()=>{try{await saveNow();const user=currentUser;stop();await openAccount(user);}catch(e){notice(explain(e));}};
$('logoutBtn').onclick=async()=>{
 $('logoutBtn').disabled=true;
 try{
  if(engine){await saveNow();if(engine.dirty)throw Error('아직 저장하지 못한 변경 사항이 있습니다.');}
  // Hide the previous account before changing the authentication session.
  await api('/api/auth/logout',{method:'POST'});stop();authChannel?.postMessage('logout');
  $('workspace').hidden=true;$('authView').hidden=false;message('로그아웃했습니다.');
 }catch(e){notice('로그아웃을 완료하지 못했습니다. '+explain(e));}
 finally{$('logoutBtn').disabled=false;}
};
async function downloadJSON(payload,prefix){const d=new Date(),pad=n=>String(n).padStart(2,'0'),stamp=`${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;return window.RecordBackup.download(payload,prefix+'_'+stamp+'.json');}
function localBackup(){flushEditor();if(frame?.contentWindow?.getCombinedBackup)return frame.contentWindow.getCombinedBackup();const raw=engine.storage.snapshot().storage;const names={journal:'school-record-student-journal-v1',integrated:'school-record-class-activity-manager-v2',macro:'student-sentence-macro-v1',helper:'student-record-helper-v1',assessment:'school-record-assessment-v1'};const apps=Object.fromEntries(Object.entries(names).map(([name,key])=>[name,raw[key]?JSON.parse(raw[key]):null]));if(Object.values(apps).some(x=>!x))return{app:'school-record-cloud-recovery',...engine.storage.snapshot()};const shell=JSON.parse(raw['school-record-combined-shell-v1']||'{}');return{app:'school-record-combined',schemaVersion:2,version:'google1.04',exportedAt:new Date().toISOString(),...shell,apps};}
$('downloadLocal').onclick=()=>downloadJSON(localBackup(),'생기부_충돌자료백업');
$('resolveDialog').addEventListener('cancel',e=>e.preventDefault());
async function resolveConflict(useLocal){
 if(!engine)return;const old=engine;
 if(!confirm(useLocal?'현재 기기 자료로 서버 전체 자료를 교체할까요? 다른 기기의 변경 내용은 사라집니다. 먼저 백업을 권장합니다.':'현재 기기의 미저장 변경 사항을 버리고 서버 자료를 열까요?'))return;
 const buttons=$('resolveDialog').querySelectorAll('button');buttons.forEach(b=>b.disabled=true);
 try{
  const row=await remote.read(currentUser.id);
  if(engine!==old)return;
  if(useLocal){old.paused=false;await old.replaceRemote(row.revision);if(old.dirty)await old.flush();$('resolveDialog').close();if(!frame)mountEditor();}
  else {old.close();detachEditor();const cache=cacheFor(currentUser.id);cache.remove();engine=new WorkspaceSync({remote:remoteFor(currentUser.id),cache,revision:row.revision,payload:row.payload,onState:status,isOnline:()=>navigator.onLine!==false});$('resolveDialog').close();mountEditor();}
 }catch(e){$('resolveMessage').textContent=explain(e);}
 finally{buttons.forEach(b=>b.disabled=false);}
}
$('useServer').onclick=()=>resolveConflict(false);$('useLocal').onclick=()=>resolveConflict(true);
const authChannel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('school-record-google-auth'):null;
authChannel?.addEventListener('message',e=>{if(e.data==='logout'){stop();$('workspace').hidden=true;$('authView').hidden=false;message('다른 탭에서 로그아웃했습니다.');}});
$('loginBtn').onclick=()=>{location.href='/api/auth/login';};
$('reconnectBtn').onclick=async()=>{if(engine?.dirty){flushEditor();engine.persist();}location.href='/api/auth/login';};
window.addEventListener('record-auth-required',()=>{$('reconnectBtn').hidden=false;});
async function initialize(){
 $('loginBtn').disabled=true;$('retryAuthBtn').hidden=true;if(!authError)message('Google 로그인 상태를 확인하는 중입니다…');
 try{const data=await api('/api/auth/session');if(data.user){await openAccount(data.user);}else if(!authError)message('Google 계정으로 로그인하세요.');}
 catch(e){message(explain(e));$('retryAuthBtn').hidden=false;}
 finally{$('loginBtn').disabled=false;}
}
$('retryAuthBtn').onclick=initialize;
initialize();
window.addEventListener('online',()=>{if(engine&&!engine.blocked)saveNow({force:true,automatic:true}).catch(()=>{});});
window.addEventListener('offline',()=>{if(engine)engine.connectionLost();else notice('인터넷 연결이 끊겼습니다. 연결 후 다시 시도하세요.');});
window.addEventListener('beforeunload',e=>{flushEditor();if(engine?.dirty){e.preventDefault();e.returnValue='';}});
window.addEventListener('pagehide',()=>{flushEditor();if(engine?.dirty)engine.persist();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){flushEditor();engine?.schedule();}else if(engine&&!engine.blocked)saveNow({automatic:true}).catch(()=>{});});
// Bounded retries and backoff are owned by WorkspaceSync; no background retry interval.
