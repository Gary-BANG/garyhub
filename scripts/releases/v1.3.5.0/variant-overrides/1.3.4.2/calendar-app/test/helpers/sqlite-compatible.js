'use strict';
// Uses the production sqlite3 driver, including on Node 20 servers.
function createSqliteAdapter(filename=':memory:'){
 const raw=new (require('sqlite3').Database)(filename);raw.configure('busyTimeout',5000);
 return {raw,run:(s,p=[])=>new Promise((y,n)=>raw.run(s,p,function(e){e?n(e):y(this);})),get:(s,p=[])=>new Promise((y,n)=>raw.get(s,p,(e,r)=>e?n(e):y(r))),all:(s,p=[])=>new Promise((y,n)=>raw.all(s,p,(e,r)=>e?n(e):y(r))),exec:s=>new Promise((y,n)=>raw.exec(s,e=>e?n(e):y())),close:()=>new Promise((y,n)=>raw.close(e=>e?n(e):y()))};
}
module.exports={createSqliteAdapter};
