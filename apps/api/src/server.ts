import { app, logger } from './app.js';
import { config } from './config.js';
import { db,redis } from './db.js';
const server=app.listen(config.PORT,()=>logger.info({port:config.PORT},'api listening'));
let closing=false;
async function shutdown() {
 if(closing) return; closing=true;
 const timer=setTimeout(()=>process.exit(1),10_000); timer.unref();
 server.close(async()=>{await db.$disconnect();redis.disconnect();clearTimeout(timer);process.exit(0);});
}
process.on('SIGTERM',shutdown); process.on('SIGINT',shutdown);
