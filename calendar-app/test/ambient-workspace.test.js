'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {dailyQuote,quotes}=require('../daily-quote');
const {allowed}=require('../tool-access');
test('daily quote respects local date, remains stable and has no adjacent duplicate',()=>{
 const instant=new Date('2026-10-25T05:30:00Z');assert.equal(dailyQuote(instant,'America/Chicago').date,'2026-10-25');assert.equal(dailyQuote(instant,'America/Los_Angeles').date,'2026-10-24');assert.deepEqual(dailyQuote(instant,'America/Chicago'),dailyQuote(instant,'America/Chicago'));assert.equal(dailyQuote(instant,'invalid-zone').timezone,'Etc/UTC');
 const ids=new Set();for(let i=0;i<quotes.length;i++)ids.add(dailyQuote(new Date(Date.UTC(2026,0,1+i))).id);assert.equal(ids.size,quotes.length);
});
test('tool permission uses account subscription independently of VPN grants',()=>{
 for(const tool of ['files','status','reading','server-monitor'])assert.equal(allowed({role:'admin'},tool),true);
 assert.equal(allowed({role:'user',accountTier:'subscriber'},'reading'),true);assert.equal(allowed({role:'user',accountTier:'subscriber'},'files'),false);assert.equal(allowed({role:'user',vpnGranted:true},'reading'),false);assert.equal(allowed(null,'reading'),false);assert.equal(allowed({role:'admin',mustChangePassword:true},'reading'),false);
});
