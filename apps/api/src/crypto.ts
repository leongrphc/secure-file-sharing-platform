import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import { HttpError, token } from './security.js';
const masterKey=Buffer.from(config.MASTER_KEY,'hex');
export function seal(data:Buffer,key:Buffer,aad:string):Buffer {
 const iv=randomBytes(12); const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(aad));
 const encrypted=Buffer.concat([cipher.update(data),cipher.final()]);
 return Buffer.concat([iv,cipher.getAuthTag(),encrypted]);
}
export function open(data:Buffer,key:Buffer,aad:string):Buffer {
 if(data.length<28) throw new Error('Invalid encrypted payload');
 const decipher=createDecipheriv('aes-256-gcm',key,data.subarray(0,12));
 decipher.setAAD(Buffer.from(aad));decipher.setAuthTag(data.subarray(12,28));
 return Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]);
}
export interface Metadata {name:string;type:string}
export function encryptFile(id:string,ownerId:string,bytes:Buffer,metadata:Metadata) {
 const key=randomBytes(32);const context=`${id}:${ownerId}`;
 return {bytes:seal(bytes,key,context+':content'),metadata:seal(Buffer.from(JSON.stringify(metadata)),key,context+':metadata').toString('base64'),wrappedKey:seal(key,masterKey,context+':key').toString('base64')};
}
interface EncryptedRecord {id:string;ownerId:string;wrappedKey:string;metadata:string}
function fileKey(file:EncryptedRecord) {return open(Buffer.from(file.wrappedKey,'base64'),masterKey,`${file.id}:${file.ownerId}:key`);}
export function readMetadata(file:EncryptedRecord):Metadata {
 return JSON.parse(open(Buffer.from(file.metadata,'base64'),fileKey(file),`${file.id}:${file.ownerId}:metadata`).toString('utf8'));
}
export function decryptContent(file:EncryptedRecord,bytes:Buffer) {return open(bytes,fileKey(file),`${file.id}:${file.ownerId}:content`);}
export function signTicket(expires:number) {
 const payload=`${token()}.${expires}`;
 return `${payload}.${createHmac('sha256',config.SIGNING_KEY).update(payload).digest('base64url')}`;
}
export function verifyTicket(value:string) {
 if(!/^[\w-]{43}\.\d{10}\.[\w-]{43}$/.test(value)) throw new HttpError(404,'Download unavailable');
 const [secret,expires,signature]=value.split('.');
 const expected=createHmac('sha256',config.SIGNING_KEY).update(`${secret}.${expires}`).digest();
 const actual=Buffer.from(signature!,'base64url');
 if(actual.length!==expected.length || !timingSafeEqual(actual,expected) || Number(expires)*1000<=Date.now()) throw new HttpError(404,'Download unavailable');
}
