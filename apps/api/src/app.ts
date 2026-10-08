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
 try {await Promise.all([db.$queryRaw`SELECT 1`,redis.ping()]);res.json({status:'ready'});}catch{res.status(503).json({status:'unavailable'});}
});
app.use('/api',rateLimit('global',300,60),originGuard,express.json({limit:'16kb'}),cookieParser());
app.use('/api/auth',auth);
app.use((_req,_res,next)=>next(new HttpError(404,'Not found')));
export const errorHandler:express.ErrorRequestHandler=(error,_req,res,_next)=>{
 let status=error instanceof HttpError?error.status:500;
 let message=error instanceof HttpError?error.message:'Service unavailable';
 if(error instanceof ZodError) {status=400;message='Invalid request';}
 if(error instanceof Prisma.PrismaClientKnownRequestError && error.code==='P2002') {status=409;message='Request conflicts with existing data';}
 if(error instanceof SyntaxError) {status=400;message='Invalid JSON';}
 if(status>=500) logger.error({kind:error?.constructor?.name},'request failed');
 res.status(status).json({error:message});
};
app.use(errorHandler);
