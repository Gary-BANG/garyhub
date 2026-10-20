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

test('approved index aliases keep their query and fragment without opening unknown directories',()=>{
 const cases=[
  ['https://lab.garyhub.uk/lab/index.html?pack=demo#q7','https://lab.garyhub.uk/lab/?pack=demo#q7'],
  ['https://calendar.garyhub.uk/ledger/fixed/index.html?currency=USD#summary','https://calendar.garyhub.uk/ledger/fixed/?currency=USD#summary'],
  ['https://calendar.garyhub.uk/journal/index.html?date=2026-10-19','https://calendar.garyhub.uk/journal/?date=2026-10-19'],
  ['https://tools.garyhub.uk/admin/index.html','https://tools.garyhub.uk/admin/'],
  ['https://tools.garyhub.uk/academic/index.html?course=one#reading','https://tools.garyhub.uk/academic/index.html?course=one#reading'],
  ['https://garyhub.uk/index.html?preview=member','https://garyhub.uk/?preview=member']
 ];
 for(const [input,expected]of cases){assert.equal(auth.safeNext(input),expected);assert.equal(new URL(auth.loginUrl(input)).searchParams.get('next'),expected);}
 for(const input of ['https://calendar.garyhub.uk/unknown/index.html','https://evil.garyhub.uk/lab/index.html','https://evil.example/lab/index.html','https://tools.garyhub.uk/api/index.html','https://tools.garyhub.uk/login/index.html'])assert.equal(auth.safeNext(input),'https://calendar.garyhub.uk/');
});
