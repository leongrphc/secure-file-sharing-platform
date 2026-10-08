import { db } from './db.js';
import { storage } from './storage.js';
export async function cleanup() {
 const now=new Date();
 const oldDemo=new Date(now.getTime()-24*3600_000);
 // Lock order matches uploads/deletes. Demo files expire after 24 hours, including existing grants.
 const demos=await db.user.findMany({where:{demo:true,createdAt:{lt:oldDemo}},select:{id:true},take:100});
 for(const user of demos) await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id}::uuid FOR UPDATE`;
  const files=await tx.file.findMany({where:{ownerId:user.id,deletedAt:null},select:{id:true}});
  for(const file of files) {await tx.$queryRaw`SELECT id FROM "File" WHERE id=${file.id}::uuid FOR UPDATE`;await tx.file.update({where:{id:file.id},data:{deletedAt:now}});await tx.share.updateMany({where:{fileId:file.id,revokedAt:null},data:{revokedAt:now}});}
 });
 await db.ticket.deleteMany({where:{expiresAt:{lt:now}}});
 const deleted=await db.file.findMany({where:{deletedAt:{not:null}},take:100});
 for(const file of deleted) {
  await storage.delete(file.objectKey);
  await db.$transaction(async tx=>{await tx.ticket.deleteMany({where:{fileId:file.id}});await tx.share.deleteMany({where:{fileId:file.id}});await tx.file.delete({where:{id:file.id}});});
 }
 // Crashes between object put and DB commit leave an orphan. One-hour grace exceeds upload timeout.
 const objects=await storage.list();
 for(const object of objects) if(object.modified.getTime()<now.getTime()-3600_000) {
  if(!await db.file.findUnique({where:{objectKey:object.key},select:{id:true}})) await storage.delete(object.key);
 }
 await db.audit.deleteMany({where:{createdAt:{lt:new Date(now.getTime()-30*24*3600_000)}}});
 // Delete empty expired demo accounts. Active sessions naturally expire after eight hours.
 for(const user of demos) if(!await db.file.count({where:{ownerId:user.id}})) await db.$transaction(async tx=>{await tx.audit.deleteMany({where:{ownerId:user.id}});await tx.user.delete({where:{id:user.id}});});
}
