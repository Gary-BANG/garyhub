'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{money,date}=require('../ledger-api');
test('decimal cents remain exact and reject fractional cents',()=>{assert.equal(money('0.10')+money('0.20'),30);for(const v of ['0','-1','1.001','1e2','100000000'])assert.throws(()=>money(v));});
test('leap dates and invalid calendar days',()=>{assert.equal(date('2024-02-29'),'2024-02-29');for(const v of ['2026-02-29','2026-02-30','2026-99-01'])assert.throws(()=>date(v));});
