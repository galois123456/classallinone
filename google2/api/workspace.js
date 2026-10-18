import {config,session,guard,matchUser,json,errorResponse,fail} from '../server/security.js';
import {pack,unpack,body} from '../server/codec.js';
import {driveStore} from '../server/workspace.js';
export default async function handler(req,res){
 try{
  const cfg=config();guard(req,['GET','POST'],cfg);const s=session(req,cfg);matchUser(req,s);
  if(req.method==='GET')return json(res,200,pack(await driveStore.read(s)));
  if(!req.headers['content-type']?.startsWith('application/json'))throw fail('JSON 요청이 필요합니다.','22023',400);
  const data=unpack(await body(req));return json(res,200,await driveStore.save(s,data.payload,data.revision));
 }catch(e){return errorResponse(res,e);}
}
