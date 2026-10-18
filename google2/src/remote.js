import {validatePayload} from './sync.js';
const MAX_WIRE=3*1024*1024;
const fault=(message,code='NETWORK')=>Object.assign(Error(message),{code});
export async function api(path,options={}){
 let response;try{response=await fetch(path,{...options,credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(65000)});}catch{throw fault('서버에 연결하지 못했습니다. 인터넷 연결을 확인하세요.');}
 let result;try{result=await response.json();}catch{throw fault(response.status===413?'전송할 자료가 너무 큽니다. 백업 후 오래된 자료를 정리하세요.':'서버 응답을 확인하지 못했습니다. Vercel 배포와 환경변수를 확인하세요.',response.status===413?'PAYLOAD_TOO_LARGE':'NETWORK');}
 if(!response.ok){if(['AUTH_REQUIRED','ACCOUNT_CHANGED'].includes(result.error?.code)&&typeof window!=='undefined')window.dispatchEvent(new Event('record-auth-required'));throw fault(result.error?.message||'요청에 실패했습니다.',result.error?.code||'NETWORK');}return result;
}
export async function pack(value){
 if(!globalThis.CompressionStream)throw fault('압축 저장을 지원하는 최신 Chrome, Edge, Safari 또는 Firefox를 사용하세요.','UNSUPPORTED_BROWSER');
 const bytes=new Uint8Array(await new Response(new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
 if(bytes.length>MAX_WIRE)throw fault('압축 자료가 3MB를 넘었습니다. 백업 후 오래된 자료를 정리하세요.','PAYLOAD_TOO_LARGE');
 let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return{encoding:'gzip-base64',data:btoa(binary)};
}
export async function unpack(wire){
 if(wire?.encoding!=='gzip-base64'||typeof wire.data!=='string'||wire.data.length>MAX_WIRE*4/3)throw fault('서버 자료 형식을 확인할 수 없습니다.','22023');
 const bytes=Uint8Array.from(atob(wire.data),c=>c.charCodeAt(0));
 const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();let size=0,chunks=[];
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>9*1024*1024){await reader.cancel();throw fault('서버 자료가 크기 제한을 넘었습니다.','22023');}chunks.push(value);}
 return JSON.parse(await new Blob(chunks).text());
}
export function createWorkspaceRemote(){return{
 async read(uid){const row=await unpack(await api('/api/workspace',{headers:{'X-Record-User':uid}}));if(!Number.isSafeInteger(row.revision)||row.revision<0)throw fault('자료 버전이 손상되었습니다.','22023');return{...row,payload:validatePayload(row.payload)};},
 async save(uid,payload,revision){const data=await api('/api/workspace',{method:'POST',headers:{'Content-Type':'application/json','X-Record-User':uid},body:JSON.stringify(await pack({payload:validatePayload(payload),revision}))});if(!Number.isSafeInteger(data.revision)||data.revision<0)throw fault('저장 응답을 확인하지 못했습니다.');return data;}
};}
