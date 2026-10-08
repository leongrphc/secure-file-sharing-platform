import { mkdir, writeFile, readFile, unlink, readdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { S3Client, HeadBucketCommand, CreateBucketCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, GetBucketPolicyCommand } from '@aws-sdk/client-s3';
import { config,MAX_BYTES } from './config.js';
export interface Storage {
 init():Promise<void>; ready():Promise<void>; put(key:string,data:Buffer):Promise<void>;get(key:string):Promise<Buffer>;delete(key:string):Promise<void>;list():Promise<{key:string;modified:Date}[]>;
}
function validKey(key:string) {if(!/^[a-f0-9-]{36}$/.test(key)) throw new Error('Invalid storage key');return key;}
class LocalStorage implements Storage {
 private root=resolve(fileURLToPath(new URL('.',import.meta.url)),config.LOCAL_STORAGE_DIR);
 private path(key:string) {return join(this.root,validKey(key));}
 async init(){await mkdir(this.root,{recursive:true,mode:0o700});}
 async ready(){await stat(this.root);}
 async put(key:string,data:Buffer){await writeFile(this.path(key),data,{mode:0o600,flag:'wx'});}
 async get(key:string){return readFile(this.path(key));}
 async delete(key:string){try{await unlink(this.path(key));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT') throw error;}}
 async list(){const names=await readdir(this.root);return Promise.all(names.filter(n=>/^[a-f0-9-]{36}$/.test(n)).map(async key=>({key,modified:(await stat(this.path(key))).mtime})));}
}
export class S3Storage implements Storage {
 private client=new S3Client({endpoint:config.S3_ENDPOINT,region:config.S3_REGION,forcePathStyle:true,credentials:{accessKeyId:config.S3_ACCESS_KEY!,secretAccessKey:config.S3_SECRET_KEY!},requestHandler:{requestTimeout:15000,connectionTimeout:5000}});
 async init(){
  try{await this.ready();}catch(error){if((error as {name:string}).name!=='NotFound') throw error;await this.client.send(new CreateBucketCommand({Bucket:config.S3_BUCKET}));}
  // Dedicated buckets only. Refuse ANY policy rather than silently accepting public access.
  try{await this.client.send(new GetBucketPolicyCommand({Bucket:config.S3_BUCKET}));throw new Error('Storage bucket policy must be absent');}
  catch(error){if((error as {name:string}).name!=='NoSuchBucketPolicy') throw error;}
 }
 async ready(){await this.client.send(new HeadBucketCommand({Bucket:config.S3_BUCKET}));}
 async put(key:string,data:Buffer){await this.client.send(new PutObjectCommand({Bucket:config.S3_BUCKET,Key:validKey(key),Body:data,ContentType:'application/octet-stream'}));}
 async get(key:string){const result=await this.client.send(new GetObjectCommand({Bucket:config.S3_BUCKET,Key:validKey(key)}));if((result.ContentLength||0)>MAX_BYTES+28) throw new Error('Oversized encrypted object');return Buffer.from(await result.Body!.transformToByteArray());}
 async delete(key:string){await this.client.send(new DeleteObjectCommand({Bucket:config.S3_BUCKET,Key:validKey(key)}));}
 async list(){const all:{key:string;modified:Date}[]=[];let cursor:string|undefined;
 do{const page=await this.client.send(new ListObjectsV2Command({Bucket:config.S3_BUCKET,ContinuationToken:cursor}));for(const item of page.Contents||[]) if(item.Key&&item.LastModified) all.push({key:validKey(item.Key),modified:item.LastModified});cursor=page.IsTruncated?page.NextContinuationToken:undefined;}while(cursor);return all;
 }
}
export const storage:Storage=config.STORAGE_DRIVER==='s3'?new S3Storage():new LocalStorage();
