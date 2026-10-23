'use strict';
const root=process.env.APP_DIR||'/app',db=require(root+'/db'),{hashPassword}=require(root+'/auth-utils');
(async()=>{await db.initDb();await require(root+'/migrations/unified-schema').migrateUnifiedCalendar(db);await require(root+'/migrations/personal-records').migratePersonalRecords(db);await require(root+'/hub-api').migrateHub(db);await require(root+'/ledger-api').migrateLedger(db);await require(root+'/account-admin').migrateAccounts(db);if(require('fs').existsSync(root+'/membership.js'))await require(root+'/membership').migrateMembership(db);await require(root+'/profile-access').migrateProfile(db);if(require('fs').existsSync(root+'/totp-api.js'))await require(root+'/totp-api').migrateTotp(db);await require(root+'/todos-api').migrateTodos(db);await require(root+'/password-reset').migratePasswordReset(db);
for(const [id,name,role]of [[1,'admin','admin'],[2,'alice','user'],[3,'bob','user'],[4,'otheradmin','admin'],[5,'victim','user']])await db.run('INSERT OR IGNORE INTO users(id,username,password_hash,role,enabled,email,email_normalized,email_verified_at)VALUES(?,?,?,?,1,?,?,?)',[id,'check_'+name,hashPassword('Synthetic-Only-2026!'),role,name+'@example.invalid',name+'@example.invalid',id===2?'2026-10-15T00:00:00Z':null]);
for(const uid of [2,5]){await db.run("INSERT INTO diary_entries(user_id,entry_date,title,body)VALUES(?,'2026-01-01','Preserved diary','Synthetic private diary')",[uid]);await db.run("INSERT INTO weight_entries(user_id,entry_date,weight_g)VALUES(?,'2026-01-01',70000)",[uid]);}
for(const uid of [2,5]){
 const cat='synthetic-cat-'+uid,task='synthetic-task-'+uid;
 await db.run("INSERT INTO categories(id,user_id,name,name_normalized,color)VALUES(?,?,'Fixture','fixture','#64748b')",[cat,uid]);
 await db.run("INSERT INTO tasks(id,user_id,title,start_date,end_date,category_id)VALUES(?,?,'Synthetic task','2026-01-01','2026-01-01',?)",[task,uid,cat]);
 await db.run("INSERT INTO reminder_settings(task_id,frequency,time_1)VALUES(?,1,'09:00')",[task]);
 await db.run("INSERT INTO reminder_deliveries(id,task_id,user_id,scheduled_for_utc,local_date,local_time)VALUES(?,?,?,'2026-01-01T09:00:00Z','2026-01-01','09:00')",['synthetic-delivery-'+uid,task,uid]);
 await db.run("INSERT INTO events(user_id,title,start_date)VALUES(?,'Synthetic legacy event','2026-01-01')",[uid]);
 await db.run("INSERT INTO exercise_entries(user_id,entry_date,activity_type,duration_minutes)VALUES(?,'2026-01-01','running',30)",[uid]);
 await db.run("INSERT INTO notifications(user_id,type,title,body)VALUES(?,'test','Synthetic notice','Synthetic body')",[uid]);
 await db.run("INSERT INTO email_verifications(id,user_id,email,email_normalized,purpose,code_digest,expires_at,last_sent_at)VALUES(?,?,?,?,'add_email','synthetic-only','2026-01-01','2026-01-01')",['synthetic-email-'+uid,uid,'synthetic-'+uid+'@example.invalid','synthetic-'+uid+'@example.invalid']);
 await db.run('INSERT INTO hub_permissions(user_id,view_academics)VALUES(?,0)',[uid]);
 await db.run("INSERT INTO ledger_categories(id,user_id,type,name,icon)VALUES('synthetic-category',?,'expense','Synthetic','X')",[uid]);
}
await db.run("INSERT INTO register_requests(username,password_hash,status,reviewed_by)VALUES('check_victim',?,'approved',1)",[hashPassword('Synthetic-Only-2026!')]);
// A deployed v1 policy is deliberately seeded to verify non-disclosing migration to both audience policies.
await db.run('UPDATE homepage_privacy SET settings=? WHERE id=1',[JSON.stringify({required:true,protected:['identity','education','academics','projects','skills'],revision:8,salt:null,hash:null})]);
await new Promise(r=>db.db.close(r));console.log('SYNTHETIC SEED PASS');})().catch(e=>{console.error(e);process.exit(1)});
