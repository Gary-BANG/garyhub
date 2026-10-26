'use strict';
const {execFileSync}=require('node:child_process'),path=require('node:path');
execFileSync(process.execPath,[path.join(__dirname,'seed-base.cjs')],{stdio:'inherit',env:process.env});
const root=process.env.APP_DIR||'/app',db=require(root+'/db');
(async()=>{await require(root+'/tool-access').migrateToolAccess(db);await require(root+'/music-api').migrateMusic(db);await db.run("UPDATE users SET account_tier='subscriber' WHERE id=3");await new Promise(r=>db.db.close(r));console.log('SUBSCRIPTION SEED PASS');})().catch(e=>{console.error(e);process.exit(1);});
