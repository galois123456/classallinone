import test from 'node:test';
import assert from 'node:assert/strict';
import {createDriveStore} from '../server/workspace.js';
import {compress,decompress,pack,unpack} from '../server/codec.js';
import {pack as browserPack,unpack as browserUnpack} from '../src/remote.js';
import {emptyPayload,APP_KEYS} from '../src/sync.js';
const user={user:{id:'teacher1'}};
const payload=n=>({schemaVersion:1,storage:{[APP_KEYS[1]]:JSON.stringify({text:'가나다',value:n})}});
const record=(n=1)=>({format:'school-record-google-v1',owner:user.user.id,revision:n,updated_at:'2026-10-18T00:00:00Z',payload:payload(n)});
function fake(initial=record()){
 const files=new Map(initial?[['file1',{row:initial,etag:'"version1"',createdTime:'2026-10-18T00:00:00Z'}]]:[]);let calls=[],writes=0,serial=1;
 const json=o=>new Response(JSON.stringify(o));
 const request=async(s,path,options={})=>{
  calls.push({path,options});const url=new URL('https://www.googleapis.com'+path),id=url.pathname.split('/').pop();
  if(url.pathname==='/drive/v3/files')return json({files:[...files].map(([id,f])=>({id,createdTime:f.createdTime}))});
  if(url.pathname==='/upload/drive/v3/files'){
   const body=options.body,start=body.indexOf(Buffer.from('Content-Type: application/gzip\r\n\r\n'))+Buffer.byteLength('Content-Type: application/gzip\r\n\r\n');const end=body.indexOf(Buffer.from('\r\n--record_'),start);const row=decompress(body.subarray(start,end));const id='file'+(++serial);files.set(id,{row,etag:'"new"',createdTime:'2026-10-18T00:00:00Z'});return json({id,createdTime:'2026-10-18T00:00:00Z'});
  }
  const f=files.get(id);assert.ok(f,'known file');
  if(options.method==='PUT'){
   if(options.headers['If-Match']!==f.etag)throw Object.assign(Error('conflict'),{code:'40001'});
   f.row=decompress(options.body);f.etag='"version'+(++serial)+'"';writes++;return json({id,etag:f.etag});
  }
  if(url.searchParams.get('alt')==='media')return new Response(compress(f.row));
  return json({id,etag:f.etag,fileSize:String(compress(f.row).length)});
 };
 return{files,request,calls,get writes(){return writes;}};
}
test('wire compression roundtrips with browser and enforces invalid input',async()=>{
 const p=payload('test');assert.deepEqual(await browserUnpack(pack(p)),p);assert.deepEqual(unpack(await browserPack(p)),p);
 assert.throws(()=>unpack({encoding:'json',data:'123'}));assert.throws(()=>decompress(Buffer.from('bad')));
});
test('first open initializes only an empty owned app-data file',async()=>{
 const f=fake(null),store=createDriveStore(f.request);const row=await store.read(user);assert.equal(row.revision,0);assert.deepEqual(row.payload,emptyPayload());assert.equal(f.files.size,1);assert.equal(f.writes,0);
});
test('same data verifies without writing, changed data uses metadata If-Match',async()=>{
 const f=fake(),store=createDriveStore(f.request);const same=await store.save(user,payload(1),1);assert.equal(same.revision,1);assert.equal(f.writes,0);
 const next=await store.save(user,payload(2),1);assert.equal(next.revision,2);assert.equal(f.writes,1);assert.equal(f.calls.find(x=>x.options.method==='PUT').options.headers['If-Match'],'"version1"');
 assert.equal((await store.read(user)).payload.storage[APP_KEYS[1]],payload(2).storage[APP_KEYS[1]]);
 const retry=await store.save(user,payload(2),1);assert.equal(retry.revision,2);assert.equal(f.writes,1);
});
test('stale revision and wrong account cannot overwrite a workspace',async()=>{
 const f=fake(record(4)),store=createDriveStore(f.request);await assert.rejects(store.save(user,payload(9),2),{code:'40001'});await assert.rejects(store.read({user:{id:'different-account'}}),{code:'22023'});assert.equal(f.writes,0);
});
test('concurrent writes with same revision keep one and report the other conflict',async()=>{
 const f=fake(),store=createDriveStore(f.request);const results=await Promise.allSettled([store.save(user,payload('A'),1),store.save(user,payload('B'),1)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.filter(x=>x.status==='rejected'&&x.reason.code==='40001').length,1);assert.equal(f.writes,1);
});
test('concurrent identical retries succeed with only one write',async()=>{
 const f=fake(),store=createDriveStore(f.request);const results=await Promise.all([store.save(user,payload('A'),1),store.save(user,payload('A'),1)]);assert.equal(f.writes,1);assert.ok(results.every(x=>x.revision===2));
});
test('duplicate nonempty files stop writes, duplicate empty placeholder is safe',async()=>{
 const f=fake();f.files.set('file2',{row:record(2),etag:'"dup"',createdTime:'2026-10-19T00:00:00Z'});const store=createDriveStore(f.request);await assert.rejects(store.save(user,payload(9),1),{code:'DUPLICATE_FILES'});assert.equal(f.writes,0);
 f.files.get('file2').row={...record(0),payload:emptyPayload()};assert.equal((await store.read(user)).revision,1);
});
test('network error never reports completion, lost response retry is idempotent',async()=>{
 const f=fake();let lose=true;const store=createDriveStore(async(...args)=>{const r=await f.request(...args);if(args[2]?.method==='PUT'&&lose){lose=false;throw Error('lost response');}return r;});
 await assert.rejects(store.save(user,payload(2),1),/lost/);assert.equal(f.writes,1);const retry=await store.save(user,payload(2),1);assert.equal(retry.revision,2);assert.equal(f.writes,1);
});
