import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db, redis } from './db.js';
import { config } from './config.js';
import { hash, HttpError, passwordHash, passwordMatches, rateLimit, requireAuth, token } from './security.js';
const credentials=z.object({email:z.email().max(254).transform(v=>v.toLowerCase()),password:z.string().min(12).max(128)}).strict();
const router=Router();
const cookieOptions={httpOnly:true,secure:config.COOKIE_SECURE==='true',sameSite:'strict' as const,path:'/api',maxAge:8*3600*1000};
async function session(userId:string,res:import('express').Response) {
 const value=token(); await redis.set('session:'+hash(value),userId,'EX',8*3600);
 res.cookie('sfs_session',value,cookieOptions);
}
router.post('/register',rateLimit('register',5,3600),async(req,res)=>{
 const input=credentials.parse(req.body);
 const password=await passwordHash(input.password);
 // Unique violation is intentionally generic (handled centrally).
 const user=await db.user.create({data:{email:input.email,passwordHash:password}});
 await session(user.id,res);
 await db.audit.create({data:{ownerId:user.id,action:'auth.register'}});
 res.status(201).json({user:{id:user.id,email:user.email,demo:false}});
});
const dummyHash=await passwordHash(token());
router.post('/login',rateLimit('login',10,900),async(req,res)=>{
 const input=credentials.parse(req.body);
 const user=await db.user.findUnique({where:{email:input.email}});
 const valid=await passwordMatches(input.password,user?.passwordHash || dummyHash);
 if(!user?.passwordHash || !valid) throw new HttpError(401,'Invalid credentials');
 await session(user.id,res);
 await db.audit.create({data:{ownerId:user.id,action:'auth.login'}});
 res.json({user:{id:user.id,email:user.email,demo:user.demo}});
});
router.post('/demo',rateLimit('demo',10,3600),async(_req,res)=>{
 if(config.DEMO_ENABLED!=='true') throw new HttpError(404,'Not found');
 const user=await db.user.create({data:{email:`demo-${randomUUID()}@example.invalid`,demo:true}});
 await session(user.id,res);
 await db.audit.create({data:{ownerId:user.id,action:'auth.demo'}});
 res.status(201).json({user:{id:user.id,email:user.email,demo:true}});
});
router.get('/me',requireAuth,async(_req,res)=>{
 const user=await db.user.findUnique({where:{id:res.locals.userId},select:{id:true,email:true,demo:true}});
 if(!user) throw new HttpError(401,'Session expired');
 res.json({user});
});
router.post('/logout',async(req,res)=>{
 if(typeof req.cookies?.sfs_session==='string') await redis.del('session:'+hash(req.cookies.sfs_session));
 res.clearCookie('sfs_session',{...cookieOptions,maxAge:undefined}); res.status(204).end();
});
export default router;
