'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const auth=require('../public/auth-redirect');
test('unified login keeps approved destinations, query strings and lecture anchors',()=>{
 for(const u of ['https://tools.garyhub.uk/study/?course=x#lecture-7','https://lab.garyhub.uk/lab/','https://calendar.garyhub.uk/ledger/fixed/','https://garyhub.uk/'])assert.equal(auth.safeNext(u),u);
 assert.equal(auth.safeNext('/study/?course=x','https://tools.garyhub.uk'), 'https://tools.garyhub.uk/study/?course=x');
 assert.equal(auth.safeNext('/lab','https://lab.garyhub.uk'), 'https://lab.garyhub.uk/lab/');
});
test('unified login rejects external destinations, credentials, unexpected ports and login loops',()=>{
 for(const bad of ['https://evil.example/','//evil.example/','https://tools.garyhub.uk.evil.example/','https://evil.garyhub.uk/','http://tools.garyhub.uk/','https://user@tools.garyhub.uk/','https://tools.garyhub.uk:444/','/api/logout','/login/','/register/','https://tools.garyhub.uk/%2f%2fevil.example','https://tools.garyhub.uk/\\evil','javascript:alert(1)','https://tools.garyhub.uk/\n'])assert.equal(auth.safeNext(bad),'https://calendar.garyhub.uk/',bad);
 const u=new URL(auth.loginUrl('https://tools.garyhub.uk/study/#lecture'));assert.equal(u.origin,'https://calendar.garyhub.uk');assert.equal(u.searchParams.get('next'),'https://tools.garyhub.uk/study/#lecture');
});
