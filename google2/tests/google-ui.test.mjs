import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {JSDOM,VirtualConsole} from 'jsdom';
import {build} from 'esbuild';
import {transformEditor} from '../scripts/editor-transform.mjs';
import {pack,unpack} from '../server/codec.js';
import {emptyPayload} from '../src/sync.js';
const root=new URL('../',import.meta.url);
const pages=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function page(html,parent,runScripts='outside-only'){
 const errors=[];const d=new JSDOM(html,{url:'https://records.example.com/',runScripts,pretendToBeVisual:true,virtualConsole:new VirtualConsole().on('jsdomError',e=>{if(e.type!=='css parsing')errors.push(e.message);}),beforeParse(w){
  w.__dispose=w.close.bind(w);Object.defineProperty(w,'crypto',{value:webcrypto});w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.CompressionStream=CompressionStream;w.DecompressionStream=DecompressionStream;w.Response=Response;w.Blob=Blob;w.BroadcastChannel=undefined;
  w.confirm=()=>true;w.alert=()=>{};w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.print=()=>{};
  w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
  w.matchMedia=q=>({matches:false,media:q,addEventListener(){},removeEventListener(){},addListener(){}});
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  if(parent){Object.defineProperty(w,'parent',{value:parent});}
 }});const entry={d,w:d.window,errors};pages.push(entry);return entry;
}
test('Google sign-in resumes session, opens all five editors, saves assessment and logs out',async(t)=>{
 t.after(()=>{for(const p of pages.reverse())p.w.__dispose();});
 const source=fs.readFileSync(new URL('src/editor.html',root),'utf8'),editor=transformEditor(source);
 const bundled=await build({entryPoints:[new URL('src/main.js',root).pathname],bundle:true,write:false,format:'iife',define:{__EDITOR_HTML__:JSON.stringify(editor)}});
 const outer=page(fs.readFileSync(new URL('src/index.html',root),'utf8')),w=outer.w;let row={revision:0,payload:emptyPayload()},saved=0;const requests=[];
 Object.defineProperty(w.navigator,'locks',{value:{request:async(name,opts,callback)=>callback({name})}});
 w.fetch=async(path,options={})=>{requests.push({path,options});if(path==='/api/auth/session')return new Response(JSON.stringify({user:{id:'test-user',email:'teacher@example.com'}}));
 if(path==='/api/auth/logout')return new Response('{"ok":true}');
 assert.equal(path,'/api/workspace');assert.equal(options.headers['X-Record-User'],'test-user');
 if(options.method==='POST'){const data=unpack(JSON.parse(options.body));assert.equal(data.revision,row.revision);row={revision:row.revision+1,payload:data.payload};saved++;return new Response(JSON.stringify({revision:row.revision,updated_at:new Date().toISOString()}));}
 return new Response(JSON.stringify(pack(row)));
 };
 vm.runInContext(bundled.outputFiles[0].text,outer.d.getInternalVMContext());await sleep(100);
 assert.equal(w.document.getElementById('workspace').hidden,false);assert.equal(w.document.getElementById('userEmail').textContent,'teacher@example.com');assert.ok(w.__recordStorage);
 const frame=w.document.querySelector('#editorHost iframe');assert.ok(frame);
 const shell=page(frame.srcdoc,w);Object.defineProperty(frame,'contentWindow',{value:shell.w});Object.defineProperty(frame,'contentDocument',{value:shell.w.document});
 shell.w.__recordStorage=w.__recordStorage;
 const apps={};for(const name of ['journal','integrated','macro','helper','assessment']){
  const html=Buffer.from(frame.srcdoc.match(new RegExp(name+":'([^']+)'"))[1],'base64').toString();apps[name]=page(html,shell.w,'dangerously');
  const inner=shell.w.document.getElementById(name+'Frame');Object.defineProperty(inner,'contentWindow',{value:apps[name].w});Object.defineProperty(inner,'contentDocument',{value:apps[name].w.document});
 }
 for(const script of shell.w.document.scripts)vm.runInContext(script.textContent,shell.d.getInternalVMContext());
 shell.w.eval("installSharedRoster()");await sleep(200);assert.deepEqual(shell.errors,[]);assert.ok(shell.w.document.querySelector('.desktop-cloud-status'));assert.match(shell.w.document.body.textContent,/구글 ver1.04/);
 const a=apps.assessment.w;const ab=JSON.parse(JSON.stringify(a.recordApp.getState()));ab.classes.find(c=>c.id===ab.activeId).data.students=[{id:'test-student',no:'30101',name:'가상학생',scores:{}}];const ac=ab.classes.find(c=>c.id===ab.activeId);ac.data.evaluations.forEach(e=>e.weight='0');ac.data.evaluations.push({id:'idwrittencheck',kind:'written',writtenOrder:1,name:'1회고사',items:[],objectiveMax:'60',essayMax:'40',weight:'100'});ac.data.students[0].scores={'idwrittencheck:objective':'30','idwrittencheck:essay':'20'};
 const common={classes:ab.classes.map(c=>({id:c.id,name:c.name,students:c.data.students.map(st=>({id:st.id,number:st.no,name:st.name+' 수정'}))}))};
 const projected=shell.w.projectRoster('assessment',ab,common);assert.equal(projected.classes.find(c=>c.id===ab.activeId).data.students[0].scores['idwrittencheck:objective'],'30');
 a.recordApp.setState(projected);a.recordApp.save();const input=a.document.getElementById('printMessage');input.value='구글 통합 검증 문구';input.dispatchEvent(new a.Event('input',{bubbles:true}));
 await sleep(3400);assert.ok(saved>=1);assert.match(w.document.getElementById('syncState').textContent,/Drive 저장 완료/);assert.ok(row.payload.storage['school-record-assessment-v1'].includes('구글 통합 검증 문구'));assert.ok(row.payload.storage['school-record-assessment-v1'].includes('idwrittencheck:essay'));assert.match(a.document.querySelector('.semester-cell').textContent,/50.00/);
 a.document.getElementById('printAll').click();const print=a.document.querySelector('#printArea .print-class');assert.equal(print.nextElementSibling.textContent,'구글 통합 검증 문구');
 assert.deepEqual(outer.errors,[]);assert.deepEqual(shell.errors,[]);for(const app of Object.values(apps))assert.deepEqual(app.errors,[]);
 w.document.getElementById('logoutBtn').click();await sleep(100);assert.equal(w.document.getElementById('workspace').hidden,true);assert.equal(w.__recordStorage,undefined);assert.ok(requests.some(x=>x.path==='/api/auth/logout'));
 for(const app of Object.values(apps))app.w.__dispose();shell.w.__dispose();w.__dispose();
});
