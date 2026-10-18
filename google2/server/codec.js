import {gzipSync,gunzipSync} from 'node:zlib';
import {fail} from './security.js';
export const MAX_WIRE=3*1024*1024,MAX_RAW=9*1024*1024;
export function compress(value){const data=gzipSync(Buffer.from(JSON.stringify(value)));if(data.length>MAX_WIRE)throw fail('압축한 자료가 3MB를 넘었습니다. 백업 후 오래된 자료를 정리하세요.','PAYLOAD_TOO_LARGE',413);return data;}
export function decompress(bytes){try{if(bytes.length>MAX_WIRE)throw Error();return JSON.parse(gunzipSync(bytes,{maxOutputLength:MAX_RAW}).toString('utf8'));}catch{throw fail('자료 형식이 잘못되었거나 크기 제한을 넘었습니다.','22023',400);}}
export const pack=value=>({encoding:'gzip-base64',data:compress(value).toString('base64')});
export function unpack(value){if(value?.encoding!=='gzip-base64'||typeof value.data!=='string'||value.data.length>MAX_WIRE*4/3||!/^[A-Za-z0-9+/]*={0,2}$/.test(value.data))throw fail('지원하지 않는 전송 자료입니다.','22023',400);return decompress(Buffer.from(value.data,'base64'));}
export async function body(req){
 if(req.body!==undefined){if(typeof req.body==='object'&&!Buffer.isBuffer(req.body))return req.body;try{return JSON.parse(String(req.body));}catch{throw fail('잘못된 요청입니다.','22023',400);}}
 let bytes=0,parts=[];for await(const part of req){bytes+=part.length;if(bytes>MAX_WIRE*4/3+2048)throw fail('전송 자료가 너무 큽니다.','PAYLOAD_TOO_LARGE',413);parts.push(part);}
 try{return JSON.parse(Buffer.concat(parts).toString());}catch{throw fail('잘못된 요청입니다.','22023',400);}
}
