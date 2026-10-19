import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {JSDOM,VirtualConsole} from 'jsdom';
const shell=readFileSync(new URL('../src/editor.html',import.meta.url),'utf8'),html=Buffer.from(shell.match(/assessment:'([^']+)'/)[1],'base64').toString();
const clone=o=>JSON.parse(JSON.stringify(o));
function load(t,stored){const errors=[],alerts=[],listeners=[];const d=new JSDOM(html,{url:'https://records.example.com',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole().on('jsdomError',e=>{if(e.type!=='css parsing')errors.push(e.message)}),beforeParse(w){w.confirm=()=>true;w.alert=s=>alerts.push(s);w.print=()=>{};w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.matchMedia=q=>{const m={matches:false,media:q,addEventListener(type,fn){listeners.push({m,fn})},removeEventListener(){},addListener(){}};return m};if(stored)w.localStorage.setItem('school-record-assessment-v1',JSON.stringify(stored));}});t.after(()=>d.window.close());assert.deepEqual(errors,[]);return{w:d.window,doc:d.window.document,errors,alerts,mobile(value){for(const {m,fn} of listeners){m.matches=value;fn(m)}}};}
function fixture(){return{version:2,activeId:'class-one',classes:[{id:'class-one',name:'3-1',data:{version:1,classTitle:'2026 2학기 3-1 실용수학',message:'평가 점수 확인 문구',evaluations:[
{id:'idp1',name:'수학도서 서평쓰기',items:[{name:'항목',scores:'0,45,50'}],weight:'20'},
{id:'idw1',kind:'written',writtenOrder:1,name:'1회고사',items:[],objectiveMax:'60',essayMax:'40',weight:'30'},
{id:'idp2',name:'문제해결력평가',items:[{name:'항목',scores:'0,85,100'}],weight:'20'},
{id:'idw2',kind:'written',writtenOrder:2,name:'2회고사',items:[],objectiveMax:'60',essayMax:'40',weight:'30'}],students:[{id:'student-one',no:'30101',name:'가상학생',scores:{idp1:'45',idp2:'85','idw1:objective':'48','idw1:essay':'32','idw2:objective':'42','idw2:essay':'28'}}]}}]};}
const data=w=>w.recordApp.getState().classes.find(c=>c.id===w.recordApp.getState().activeId).data;
function edit(w,id,value){const input=w.document.querySelector(id);assert.ok(input,id);input.value=value;input.dispatchEvent(new w.Event('input',{bubbles:true}));return input;}
test('legacy performance backup remains valid with all scores and exceptions',t=>{
 const old=fixture();old.classes[0].data.evaluations=old.classes[0].data.evaluations.filter(e=>!e.kind);for(const e of old.classes[0].data.evaluations)delete e.weight;
 old.classes[0].data.evaluations[0].exceptions=[{score:'7',reason:'가상 예외'}];const x=load(t,old),w=x.w;
 assert.deepEqual(clone(w.recordApp.getState()),old);assert.equal(w.semesterResult(data(w).students[0]).ok,false);assert.equal(x.doc.querySelectorAll('.evalWeight').length,2);
});
test('written exam buttons produce two fixed sections, independent performance numbering',t=>{
 const x=load(t),w=x.w;const button=x.doc.getElementById('addWritten');assert.equal(button.nextElementSibling.id,'addEval');button.click();x.doc.getElementById('addWritten').click();let s=data(w),written=s.evaluations.filter(w.isWritten);assert.deepEqual(clone(written.map(e=>e.name)),['1회고사','2회고사']);
 for(const e of written){const card=x.doc.querySelector('[data-card="'+e.id+'"]');assert.equal(card.querySelector('[data-action="addItem"]'),null);assert.ok(card.querySelector('.objectiveMax'));assert.ok(card.querySelector('.essayMax'));}
 button.click();assert.equal(data(w).evaluations.filter(w.isWritten).length,2);assert.ok(x.alerts.at(-1).includes('2회고사'));
 x.doc.getElementById('addEval').click();assert.equal(data(w).evaluations.at(-1).name,'수행평가 4');assert.equal(x.doc.querySelector('.written-card .exception-section'),null);
 const card=x.doc.querySelector('[data-card="'+written[0].id+'"]');edit(w,'[data-card="'+written[0].id+'"] .objectiveMax','55.5');edit(w,'[data-card="'+written[0].id+'"] .essayMax','44.5');edit(w,'[data-card="'+written[0].id+'"] .evalWeight','30');card.querySelector('[data-action="apply"]').click();written=data(w).evaluations.filter(w.isWritten);assert.equal(written[0].objectiveMax,'55.5');assert.equal(written[0].weight,'30');assert.equal(w.maximum(written[0]),10000);
});
test('component bounds, missing versus zero, exact weighted total and rounding',t=>{
 const {w}=load(t,fixture());let s=data(w),st=s.students[0];assert.equal(w.semesterResult(st).label,'80.00');assert.equal(w.rawValue(st,s.evaluations[1]),8000);
 st.scores['idw1:objective']='61';assert.equal(w.status(s.evaluations[1],w.rawScore(st,s.evaluations[1])).type,'bad');assert.equal(w.semesterResult(st).ok,false);
 st.scores['idw1:objective']='';assert.equal(w.status(s.evaluations[1],w.rawScore(st,s.evaluations[1])).type,'pending');assert.equal(w.rawValue(st,s.evaluations[1]),null);assert.equal(w.semesterResult(st).ok,false);
 st.scores['idw1:objective']='0';st.scores['idw1:essay']='0';assert.equal(w.status(s.evaluations[1],w.rawScore(st,s.evaluations[1])).type,'good');assert.equal(w.semesterResult(st).label,'56.00');
 const book=fixture(),d=book.classes[0].data;d.evaluations=[{id:'idround',name:'소수 검증',weight:'100',items:[{name:'항목',scores:'0,1,32'}]}];d.students[0].scores={idround:'1'};w.recordApp.setState(book);assert.equal(w.semesterResult(data(w).students[0]).label,'3.13');
 d.evaluations[0].items[0].scores='0,1,3';w.recordApp.setState(book);assert.equal(w.semesterResult(data(w).students[0]).label,'33.33');
 d.evaluations[0].items[0].scores='0';d.students[0].scores={idround:'0'};w.recordApp.setState(book);assert.equal(w.semesterResult(data(w).students[0]).ok,false);
});
test('weights must be specified and sum to 100; zero-weight assessments do not require scores',t=>{
 const {w}=load(t,fixture());const b=fixture(),s=b.classes[0].data;s.evaluations[0].weight='19.99';w.recordApp.setState(b);assert.equal(w.weightCheck().ok,false);assert.equal(w.semesterResult(data(w).students[0]).ok,false);
 delete s.evaluations[0].weight;w.recordApp.setState(b);assert.equal(w.weightCheck().ok,false);
 s.evaluations[0].weight='0';s.evaluations[2].weight='40';delete s.students[0].scores.idp1;w.recordApp.setState(b);assert.equal(w.semesterResult(data(w).students[0]).label,'79.00');
});
test('mobile has four columns and written inputs update totals without discarding other grades',t=>{
 const x=load(t,fixture()),{w,doc}=x;x.mobile(true);let select=doc.getElementById('mobileEvaluationSelect');select.value='idw1';select.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(doc.querySelectorAll('#scoreTable thead th').length,4);assert.equal(doc.querySelectorAll('#scoreTable input[data-part]').length,2);
 edit(w,'#scoreTable input[data-part="objective"]','50');assert.match(doc.querySelector('.written-total').textContent,/82/);assert.match(doc.querySelector('.semester-cell').textContent,/80.60/);assert.equal(data(w).students[0].scores.idp2,'85');assert.equal(JSON.parse(w.localStorage.getItem('school-record-assessment-v1')).classes[0].data.students[0].scores['idw1:objective'],'50');
 x.mobile(false);assert.equal(doc.querySelectorAll('#scoreTable thead th').length,8);assert.match(doc.querySelector('td.semester-cell').textContent,/80.60/);
});
test('print checklist controls both print layouts; semester uses hidden evaluation weights too',t=>{
 const x=load(t,fixture()),{w,doc}=x;function check(id,value){doc.getElementById(id).checked=value;doc.getElementById(id).dispatchEvent(new w.Event('change',{bubbles:true}));}
 check('printWritten',false);check('printSemester',true);doc.getElementById('printAll').click();let out=doc.getElementById('printArea');assert.ok(!out.textContent.includes('1회고사'));assert.ok(out.textContent.includes('80.00'));assert.ok(out.textContent.includes('수학도서 서평쓰기'));assert.equal(out.querySelector('.print-class').nextElementSibling.textContent,'평가 점수 확인 문구');
 check('printPerformance',false);doc.getElementById('printIndividual').click();assert.equal(out.querySelectorAll('tbody tr').length,1);assert.ok(out.textContent.includes('80.00'));assert.ok(!out.textContent.includes('수학도서 서평쓰기'));
 check('printWritten',true);check('printSemester',false);doc.getElementById('printAll').click();assert.ok(out.textContent.includes('객관식 48 / 60'));assert.ok(!out.textContent.includes('수학도서 서평쓰기'));assert.ok(!out.textContent.includes('80.00'));
 const b=fixture();b.classes[0].data.printOptions={written:true,performance:false,semester:true};b.classes[0].data.evaluations[0].weight='19';w.recordApp.setState(b);doc.getElementById('printAll').click();assert.ok(x.alerts.at(-1).includes('100%'));assert.equal(doc.getElementById('printArea').textContent,'');
});
test('new backup validates, reloads and keeps per-class print options and scores',t=>{
 const x=load(t,fixture()),b=fixture();b.classes[0].data.printOptions={written:false,performance:true,semester:true};x.w.recordApp.setState(b);x.w.recordApp.save();const reloaded=load(t,JSON.parse(x.w.localStorage.getItem('school-record-assessment-v1')));assert.deepEqual(clone(reloaded.w.recordApp.getState()),b);assert.equal(reloaded.doc.getElementById('printWritten').checked,false);assert.equal(reloaded.doc.getElementById('printSemester').checked,true);assert.equal(reloaded.w.semesterResult(data(reloaded.w).students[0]).label,'80.00');
 const broken=clone(b);broken.classes[0].data.evaluations[1].objectiveMax='-1';assert.throws(()=>x.w.recordApp.validate(broken));broken.classes[0].data.evaluations[1].objectiveMax='60';broken.classes[0].data.evaluations[1].weight='101';assert.throws(()=>x.w.recordApp.validate(broken));
});
test('criteria copying matches written rounds, keeps scores, deletes only selected evaluation',t=>{
 const b=fixture(),other=clone(b.classes[0]);other.id='class-two';other.name='3-2';other.data.evaluations.reverse();b.classes.push(other);const x=load(t,b),{w,doc}=x,plan=w.criteriaCopyPlan('class-two');assert.equal(plan.find(e=>e.writtenOrder===1).id,'idw1');assert.equal(plan.find(e=>e.writtenOrder===2).id,'idw2');assert.equal(plan.find(e=>!e.kind).id,'idp1');
 doc.querySelector('[data-card="idw1"] [data-action="removeEval"]').click();let s=data(w);assert.equal(s.students[0].scores['idw1:objective'],undefined);assert.equal(s.students[0].scores['idw2:objective'],'42');doc.getElementById('addWritten').click();s=data(w);assert.equal(s.evaluations.filter(w.isWritten).length,2);assert.equal(s.evaluations.at(-1).writtenOrder,1);
});

test('shared roster rename keeps written components and stable student IDs',()=>{
 const start=shell.indexOf('function projectRoster('),end=shell.indexOf('\nfunction ',start+1);assert.ok(start>0&&end>start);const raw=fixture(),context={raw,roster:{classes:[{id:'class-one',name:'3-1',students:[{id:'student-one',number:'30101',name:'이름 수정'}]}]},clone,rosterGroups:()=>[],appApi:()=>{throw Error('unexpected fallback')}};
 vm.runInNewContext(shell.slice(start,end)+";result=projectRoster('assessment',raw,roster);",context);const st=context.result.classes[0].data.students[0];assert.equal(st.name,'이름 수정');assert.equal(st.scores['idw1:objective'],'48');assert.equal(st.scores['idw2:essay'],'28');assert.equal(context.result.classes[0].data.evaluations[1].weight,'30');
});
