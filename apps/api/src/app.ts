import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pino from 'pino';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { db, redis } from './db.js';
import { HttpError, originGuard, rateLimit } from './security.js';
import auth from './auth.js';
import files from './files.js';
import { managedShares,publicShares,downloads } from './shares.js';
import { storage } from './storage.js';
import { requireAuth } from './security.js';
import { z } from 'zod';
import multer from 'multer';
export const logger=pino({redact:{paths:['password','token','email','cookie','authorization','req.headers','url'],censor:'[REDACTED]'}});
export const app=express();
app.disable('x-powered-by');
app.set('trust proxy',false);
app.use(helmet());
app.use((req,res,next)=>{
 const requestId=randomUUID(); res.set('X-Request-Id',requestId); res.set('Cache-Control','no-store');
 res.on('finish',()=>logger.info({requestId,method:req.method,status:res.statusCode},'request completed'));
 next();
});
app.get('/api/health',(_req,res)=>res.json({status:'ok'}));
app.get('/api/ready',async(_req,res)=>{
 try {await Promise.all([db.$queryRaw`SELECT 1`,redis.ping(),storage.ready()]);res.json({status:'ready'});}catch{res.status(503).json({status:'unavailable'});}
});
app.use('/api',rateLimit('global',300,60),originGuard,express.json({limit:'16kb'}),cookieParser());
app.use('/api/auth',auth);
app.use('/api/files',files,managedShares);
app.use('/api/shares',publicShares);
app.use('/api/download',downloads);
app.get('/api/audit',requireAuth,async(req,res)=>{
 const page=z.coerce.number().int().min(1).max(10000).default(1).parse(req.query.page);
 const where={ownerId:res.locals.userId as string};
 const [events,total]=await db.$transaction([db.audit.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],take:20,skip:(page-1)*20}),db.audit.count({where})]);
 res.json({events,total,page,pageSize:20});
});
app.use((_req,_res,next)=>next(new HttpError(404,'Not found')));
export const errorHandler:express.ErrorRequestHandler=(error,_req,res,_next)=>{
 let status=error instanceof HttpError?error.status:500;
 let message=error instanceof HttpError?error.message:'Service unavailable';
 if(error instanceof ZodError) {status=400;message='Invalid request';}
 if(error instanceof Prisma.PrismaClientKnownRequestError && error.code==='P2002') {status=409;message='Request conflicts with existing data';}
 if(error instanceof multer.MulterError) {status=400;message='Upload rejected: one file, no extra fields, maximum 10 MiB';}
 if(error?.type==='entity.too.large') {status=413;message='Request too large';}
 if(error instanceof SyntaxError) {status=400;message='Invalid JSON';}
 if(status>=500) logger.error({kind:error?.constructor?.name},'request failed');
 res.status(status).json({error:message});
};
app.use(errorHandler);
