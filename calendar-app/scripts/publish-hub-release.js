'use strict';
const fs=require('fs'),db=require('../db'),{migrateHub,publishRelease}=require('../hub-api');
(async()=>{try{const release=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));await migrateHub(db);console.log(JSON.stringify(await publishRelease(db,release)));db.db.close();}catch(e){console.error('Release publication failed:',e.message);db.db.close();process.exitCode=1;}})();
