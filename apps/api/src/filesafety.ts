import path from 'node:path';
import { HttpError } from './security.js';
import { MAX_BYTES } from './config.js';
export function safeFilename(input:string) {
 const name=input.normalize('NFKC').replace(/[\\/]/g,'_').replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g,'').replace(/[^\p{L}\p{N} ._()-]/gu,'_').replace(/^\.+/,'').trim().slice(0,120);
 return name || 'download';
}
export function disposition(name:string) {
 const safe=safeFilename(name);
 const ascii=safe.replace(/[^\x20-\x7e]/g,'_');
 return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())}`;
}
export function validateFile(file:{buffer:Buffer;originalname:string;mimetype:string;size:number}) {
 if(file.size===0 || file.size>MAX_BYTES) throw new HttpError(400,'File must be between 1 byte and 10 MiB');
 const name=safeFilename(file.originalname);const ext=path.extname(name).toLowerCase();
 const bytes=file.buffer;
 let type:string;
 if(ext==='.txt' && file.mimetype==='text/plain') {
  const text=new TextDecoder('utf-8',{fatal:true});
  try {text.decode(bytes);}catch{throw new HttpError(400,'Text files must contain UTF-8');}
  if(bytes.includes(0)) throw new HttpError(400,'Binary text file rejected');
  type='text/plain';
 } else if(ext==='.pdf' && file.mimetype==='application/pdf' && bytes.subarray(0,5).toString()==='%PDF-') type='application/pdf';
 else if(ext==='.png' && file.mimetype==='image/png' && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) type='image/png';
 else if(['.jpg','.jpeg'].includes(ext) && file.mimetype==='image/jpeg' && bytes.subarray(0,3).equals(Buffer.from([255,216,255]))) type='image/jpeg';
 else throw new HttpError(400,'Allowed types: UTF-8 TXT, PDF, PNG, JPEG. Extension, MIME and signature must agree');
 return {name,type};
}
