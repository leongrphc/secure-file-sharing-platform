import { Router } from 'express';
import { z } from 'zod';
import { db } from './db.js';
import { hash,HttpError,passwordHash,passwordMatches,rateLimit,requireAuth,token } from './security.js';
import { readMetadata,signTicket,verifyTicket,decryptContent } from './crypto.js';
import { storage } from './storage.js';
import { disposition } from './filesafety.js';
import { uuid } from './files.js';
export const managedShares=Router();managedShares.use(requireAuth);
const shareInput=z.object({expiresInHours:z.number().int().min(1).max(168),maxDownloads:z.number().int().min(1).max(100),password:z.string().min(8).max(128).optional()}).strict();
managedShares.post('/:id/shares',rateLimit('create-share',50,3600),async(req,res)=>{
 const id=uuid.parse(req.params.id);const ownerId:string=res.locals.userId;const input=shareInput.parse(req.body);
 const raw=token();const expiresAt=new Date(Date.now()+input.expiresInHours*3600_000);
 const pass=input.password?await passwordHash(input.password):undefined;
 const share=await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "File" WHERE id=${id}::uuid FOR UPDATE`;
  const file=await tx.file.findFirst({where:{id,ownerId,deletedAt:null}});if(!file) throw new HttpError(404,'File not found');
  if(await tx.share.count({where:{fileId:id}})>=100) throw new HttpError(409,'Share limit reached for this file');
  const share=await tx.share.create({data:{fileId:id,tokenHash:hash(raw),expiresAt,maxDownloads:input.maxDownloads,passwordHash:pass}});
  await tx.audit.create({data:{ownerId,action:'share.create',resourceId:share.id}});return share;
 });
 res.status(201).json({share:{id:share.id,expiresAt,maxDownloads:share.maxDownloads},path:`/share#${raw}`});
});
managedShares.get('/:id/shares',async(req,res)=>{
 const id=uuid.parse(req.params.id);const file=await db.file.findFirst({where:{id,ownerId:res.locals.userId,deletedAt:null}});
 if(!file) throw new HttpError(404,'File not found');
 const shares=await db.share.findMany({where:{fileId:id},select:{id:true,expiresAt:true,maxDownloads:true,downloads:true,revokedAt:true,createdAt:true,passwordHash:true},orderBy:{createdAt:'desc'},take:100});
 res.json({shares:shares.map(({passwordHash,...share})=>({...share,passwordProtected:!!passwordHash}))});
});
managedShares.delete('/:id/shares/:shareId',async(req,res)=>{
 const id=uuid.parse(req.params.id);const shareId=uuid.parse(req.params.shareId);const ownerId:string=res.locals.userId;
 await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "File" WHERE id=${id}::uuid FOR UPDATE`;
  const file=await tx.file.findFirst({where:{id,ownerId,deletedAt:null}});if(!file) throw new HttpError(404,'File not found');
  const result=await tx.share.updateMany({where:{id:shareId,fileId:id,revokedAt:null},data:{revokedAt:new Date()}});
  if(!result.count) throw new HttpError(404,'Share not found');
  await tx.audit.create({data:{ownerId,action:'share.revoke',resourceId:shareId}});
 });res.status(204).end();
});
export const publicShares=Router();
const redeemInput=z.object({token:z.string().regex(/^[A-Za-z0-9_-]{43}$/),password:z.string().max(128).default('')}).strict();
const dummyHash=await passwordHash(token());
publicShares.post('/redeem',rateLimit('redeem',20,900),async(req,res)=>{
 const input=redeemInput.parse(req.body);
 const initial=await db.share.findUnique({where:{tokenHash:hash(input.token)}});
 const validPassword=await passwordMatches(input.password,initial?.passwordHash || dummyHash);
 const unavailable=()=>new HttpError(404,'Share unavailable or password incorrect');
 if(!initial || (initial.passwordHash && !validPassword)) throw unavailable();
 const expiresAt=new Date(Math.min(Date.now()+60_000,initial.expiresAt.getTime()));
 const signed=signTicket(Math.floor(expiresAt.getTime()/1000));
 const metadata=await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "File" WHERE id=${initial.fileId}::uuid FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "Share" WHERE id=${initial.id}::uuid FOR UPDATE`;
  const share=await tx.share.findUnique({where:{id:initial.id}});
  const file=await tx.file.findUnique({where:{id:initial.fileId}});
  if(!share || !file || file.deletedAt || share.revokedAt || share.expiresAt<=new Date() || share.downloads>=share.maxDownloads) throw unavailable();
  await tx.share.update({where:{id:share.id},data:{downloads:{increment:1}}});
  await tx.ticket.create({data:{tokenHash:hash(signed),fileId:file.id,shareId:share.id,expiresAt}});
  await tx.audit.create({data:{ownerId:file.ownerId,action:'share.redeem',resourceId:share.id}});
  return {...readMetadata(file),size:file.size};
 });res.json({url:`/api/download/${signed}`,expiresAt,file:metadata});
});
export const downloads=Router();
// Express automatically maps HEAD to GET; reject explicitly so link scanners cannot consume tickets.
downloads.head('/:signed',(_req,res)=>{res.status(405).end();});
downloads.get('/:signed',rateLimit('download',60,60),async(req,res)=>{
 const signed=z.string().max(180).parse(req.params.signed);verifyTicket(signed);
 const initial=await db.ticket.findUnique({where:{tokenHash:hash(signed)}});if(!initial) throw new HttpError(404,'Download unavailable');
 const file=await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "File" WHERE id=${initial.fileId}::uuid FOR UPDATE`;
  const file=await tx.file.findUnique({where:{id:initial.fileId}});
  if(!file || file.deletedAt) throw new HttpError(404,'Download unavailable');
  if(initial.shareId) {
   await tx.$queryRaw`SELECT id FROM "Share" WHERE id=${initial.shareId}::uuid FOR UPDATE`;
   const share=await tx.share.findUnique({where:{id:initial.shareId}});
   if(!share || share.revokedAt || share.expiresAt<=new Date()) throw new HttpError(404,'Download unavailable');
  }
  const claimed=await tx.ticket.updateMany({where:{id:initial.id,consumedAt:null,expiresAt:{gt:new Date()}},data:{consumedAt:new Date()}});
  if(!claimed.count) throw new HttpError(404,'Download unavailable');
  await tx.audit.create({data:{ownerId:file.ownerId,action:'download.claim',resourceId:file.id}});
  return file;
 });
 // A failed storage request consumes the authorization; retry requires a fresh issuance.
 const bytes=decryptContent(file,await storage.get(file.objectKey));const metadata=readMetadata(file);
 res.set({'Content-Type':'application/octet-stream','Content-Disposition':disposition(metadata.name),'Content-Length':String(bytes.length),'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"});res.send(bytes);
});
