'use strict';
// Run only on an isolated copy supplied by the updater, never on the live data mount.
const assert=require('node:assert/strict'),db=require('../db');
(async()=>{
 const before=await db.all('SELECT * FROM ledger_entries ORDER BY id');
 await require('../ledger-api').migrateLedger(db);
 await require('../password-reset').migratePasswordReset(db);
 const after=await db.all('SELECT * FROM ledger_entries ORDER BY id');
 assert.deepEqual(after,before,'currency migration must preserve every existing ledger field');
 assert.deepEqual(await db.all('PRAGMA foreign_key_check'),[]);
 await require('../ledger-api').migrateLedger(db);await require('../password-reset').migratePasswordReset(db);
 assert.deepEqual(await db.all('SELECT * FROM ledger_entries ORDER BY id'),before,'migration retry must preserve records');
 console.log(JSON.stringify({ok:true,rowsPreserved:before.length,foreignKeys:'ok',idempotent:true}));
 await new Promise((resolve,reject)=>db.db.close(e=>e?reject(e):resolve()));
})().catch(e=>{console.error('Isolated migration verification failed: '+e.message);process.exit(1)});
