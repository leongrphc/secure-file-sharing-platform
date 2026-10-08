import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from './db.js';
import { storage } from './storage.js';
import { encryptFile,readMetadata,signTicket } from './crypto.js';
import { validateFile } from './filesafety.js';
import { FILE_QUOTA,MAX_BYTES } from './config.js';
import { hash,HttpError,rateLimit,requireAuth } from './security.js';
const router=Router();router.use(requireAuth);
export const uuid=z.uuid();
const pageInput=z.object({page:z.coerce.number().int().min(1).max(10000).default(1),q:z.string().max(100).default('')});
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:MAX_BYTES,files:1,fields:0,parts:1}}).single('file');
router.get('/',async(req,res)=>{
 const {page,q}=pageInput.parse(req.query);
 // Cap per-owner files to 100 so encrypted-name search stays bounded without plaintext indexing.
 const files=await db.file.findMany({where:{ownerId:res.locals.userId,deletedAt:null},orderBy:[{createdAt:'desc'},{id:'desc'}],take:FILE_QUOTA});
 const found=files.map(file=>({id:file.id,size:file.size,createdAt:file.createdAt,...readMetadata(file)})).filter(file=>file.name.toLowerCase().includes(q.toLowerCase()));
 res.json({files:found.slice((page-1)*10,page*10),page,total:found.length,pageSize:10});
});
router.post('/',rateLimit('upload',20,3600),upload,async(req,res)=>{
 if(!req.file) throw new HttpError(400,'A file is required');
 const metadata=validateFile(req.file);const id=randomUUID();const objectKey=randomUUID();const ownerId:string=res.locals.userId;
 const encrypted=encryptFile(id,ownerId,req.file.buffer,metadata);
 await storage.put(objectKey,encrypted.bytes);
 try {
  await db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "User" WHERE id=${ownerId}::uuid FOR UPDATE`;
   if(await tx.file.count({where:{ownerId,deletedAt:null}})>=FILE_QUOTA) throw new HttpError(409,'Account limit: 100 files');
   await tx.file.create({data:{id,ownerId,objectKey,metadata:encrypted.metadata,wrappedKey:encrypted.wrappedKey,size:req.file!.size}});
   await tx.audit.create({data:{ownerId,action:'file.upload',resourceId:id}});
  });
 }catch(error){await storage.delete(objectKey).catch(()=>{});throw error;}
 res.status(201).json({file:{id,...metadata,size:req.file.size}});
});
router.delete('/:id',async(req,res)=>{
 const id=uuid.parse(req.params.id);const ownerId:string=res.locals.userId;
 await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "File" WHERE id=${id}::uuid FOR UPDATE`;
  const file=await tx.file.findFirst({where:{id,ownerId,deletedAt:null}});
  if(!file) throw new HttpError(404,'File not found');
  await tx.file.update({where:{id},data:{deletedAt:new Date()}});
  await tx.share.updateMany({where:{fileId:id,revokedAt:null},data:{revokedAt:new Date()}});
  await tx.audit.create({data:{ownerId,action:'file.delete',resourceId:id}});
 });
 res.status(204).end();
});
router.post('/:id/download',async(req,res)=>{
 const id=uuid.parse(req.params.id);const ownerId:string=res.locals.userId;
 const expiresAt=new Date(Date.now()+60_000);const signed=signTicket(Math.floor(expiresAt.getTime()/1000));
 await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "File" WHERE id=${id}::uuid FOR UPDATE`;
  const file=await tx.file.findFirst({where:{id,ownerId,deletedAt:null}});
  if(!file) throw new HttpError(404,'File not found');
  await tx.ticket.create({data:{tokenHash:hash(signed),fileId:id,expiresAt}});
  await tx.audit.create({data:{ownerId,action:'download.issue',resourceId:id}});
 });
 res.json({url:`/api/download/${signed}`,expiresAt});
});
export default router;
