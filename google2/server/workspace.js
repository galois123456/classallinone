import {randomBytes} from 'node:crypto';
import {driveFetch} from './google.js';
import {compress,decompress,MAX_WIRE} from './codec.js';
import {validatePayload,emptyPayload,fingerprint} from '../src/sync.js';
import {fail} from './security.js';
const NAME='school-record-google-v1.json.gz';
const QUERY="trashed = false and appProperties has { key='schoolRecordGoogle' and value='workspace-v1' }";
function verifyRow(row,uid){
 if(row?.format!=='school-record-google-v1'||row.owner!==uid||!Number.isSafeInteger(row.revision)||row.revision<0)throw fail('Google Drive 자료 형식 또는 계정이 일치하지 않습니다.','22023',400);
 try{validatePayload(row.payload);}catch{throw fail('Google Drive의 생기부 자료 형식을 확인하세요.','22023',400);}return row;
}
// Read metadata ETags, not media ETags: they are different representations.
// A second metadata read ensures that downloaded content belongs to that ETag.
export function createDriveStore(request=driveFetch){
 async function files(s){const q=new URLSearchParams({spaces:'appDataFolder',q:QUERY,fields:'files(id,createdTime),nextPageToken',orderBy:'createdTime',pageSize:'100'});const all=[];
  for(let page=0;page<10;page++){const r=await(await request(s,'/drive/v3/files?'+q)).json();all.push(...(r.files||[]));if(!r.nextPageToken)return all.sort((a,b)=>a.createdTime.localeCompare(b.createdTime)||a.id.localeCompare(b.id));q.set('pageToken',r.nextPageToken);}
  throw fail('앱 저장 파일이 너무 많습니다. 백업 후 문의하세요.','DUPLICATE_FILES',409);
 }
 async function metadata(s,id){return(await request(s,`/drive/v2/files/${encodeURIComponent(id)}?fields=id,etag,fileSize`)).json();}
 async function readFile(s,id){
  for(let attempt=0;attempt<3;attempt++){
   const before=await metadata(s,id);if(!before.etag||Number(before.fileSize)>MAX_WIRE)throw fail('저장 파일의 버전 또는 크기를 확인할 수 없습니다.','22023',400);
   const response=await request(s,`/drive/v3/files/${encodeURIComponent(id)}?alt=media`);
   const bytes=Buffer.from(await response.arrayBuffer());const row=verifyRow(decompress(bytes),s.user.id);const after=await metadata(s,id);
   if(before.etag===after.etag)return{row,etag:after.etag,id};
  }throw fail('다른 기기에서 자료를 수정 중입니다. 잠시 후 다시 여세요.','40001',409);
 }
 async function createEmpty(s){
  const row={format:'school-record-google-v1',owner:s.user.id,revision:0,updated_at:null,payload:emptyPayload()};
  const boundary='record_'+randomBytes(16).toString('hex');const metadata={name:NAME,mimeType:'application/gzip',parents:['appDataFolder'],appProperties:{schoolRecordGoogle:'workspace-v1'}};
  const data=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/gzip\r\n\r\n`),compress(row),Buffer.from(`\r\n--${boundary}--\r\n`)]);
  return(await request(s,'/upload/drive/v3/files?uploadType=multipart&fields=id,createdTime',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body:data})).json();
 }
 async function current(s){
  let list=await files(s);if(!list.length){const created=await createEmpty(s);list=await files(s);if(!list.length)list=[created];}
  // Concurrent first opens may create empty placeholders. Never merge or delete data.
  // A populated file wins over empty placeholders; conflicting populated files stop writes.
  const heads=[];for(const f of list)heads.push(await readFile(s,f.id));
  const populated=heads.filter(h=>h.row.revision>0);
  if(populated.length>1)throw fail('초기 연결 중 저장 파일이 중복되었습니다. 자동 덮어쓰기를 중단했습니다. 현재 기기 자료를 백업하고 관리자에게 문의하세요.','DUPLICATE_FILES',409);
  return populated[0]||heads[0];
 }
 return{
  async read(s){return(await current(s)).row;},
  async save(s,payload,revision){
   try{validatePayload(payload);}catch{throw fail('저장 자료 형식이나 8MB 크기 제한을 확인하세요.','22023',400);}
   if(!Number.isSafeInteger(revision)||revision<0)throw fail('자료 버전이 잘못되었습니다.','22023',400);
   const head=await current(s);
   const same=()=>fingerprint(head.row.payload)===fingerprint(payload);
   if(same())return{revision:head.row.revision,updated_at:head.row.updated_at};
   if(head.row.revision!==revision)throw fail('다른 기기에서 자료가 변경되었습니다.','40001',409);
   const next={...head.row,revision:revision+1,updated_at:new Date().toISOString(),payload};
   try{
    await request(s,`/upload/drive/v2/files/${encodeURIComponent(head.id)}?uploadType=media&newRevision=true&fields=id,etag`,{method:'PUT',headers:{'Content-Type':'application/gzip','If-Match':head.etag},body:compress(next)});
   }catch(e){
    if(e.code==='40001'){const newest=await readFile(s,head.id);if(fingerprint(newest.row.payload)===fingerprint(payload))return{revision:newest.row.revision,updated_at:newest.row.updated_at};}
    throw e;
   }
   return{revision:next.revision,updated_at:next.updated_at};
  }
 };
}
export const driveStore=createDriveStore();
