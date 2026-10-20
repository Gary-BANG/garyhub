'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const F=require('../public/todos/import-format');
const document=todos=>({format:F.FORMAT,todos}),item=(title='Task',text='Point')=>({title,done:false,points:[{text,done:false}]});
const existing=t=>F.withIds(t,()=>crypto.randomUUID());
function rejects(value,code,path){assert.throws(()=>F.parse(value),e=>e.name==='TodoImportError'&&e.code===code&&(path===undefined||e.path===path));}
test('import accepts AI JSON, optional fields, arrays, BOMs and one complete code fence',()=>{
 const a=item(' 中文 Task ','A\nB: "quoted" \\ slash'),expected=document([{...a,title:a.title.trim()}]);
 assert.deepEqual(F.parse(document([a])),expected);
 assert.deepEqual(F.parse('\uFEFF'+JSON.stringify(document([a]))),expected);
 assert.deepEqual(F.parse('```json\n'+JSON.stringify([a])+'\n```'),expected);
 assert.deepEqual(F.parse({todos:[{title:'Minimal'}]}),document([{title:'Minimal',done:false,points:[]}]));
 assert.deepEqual(F.parse(document([{...existing(a),done:true,points:[{id:'untrusted id',text:'Done',done:true}]}])).todos[0],{title:'中文 Task',done:true,points:[{text:'Done',done:true}]});
});
test('import rejects malformed or unsupported content instead of dropping it',()=>{
 rejects('', 'empty');rejects('Explanation\n{}','json');rejects('{"todos":[],}','json');rejects(null,'document');
 rejects({format:'other',todos:[item()]},'format','format');rejects(document([]),'list','todos');
 rejects({todos:[item()],accountId:3},'field','accountId');rejects(document([{...item(),dueDate:'tomorrow'}]),'field','todos[0].dueDate');
 rejects(document([{title:'x',points:['string']}]),'point','todos[0].points[0]');rejects(document([{title:'x',points:null}]),'points');
 rejects(document([{title:' ',points:[]}]),'title');rejects(document([{title:'x',done:'false'}]),'done','todos[0].done');
 rejects(document([{title:'x',points:[{text:'x',done:0}]}]),'done','todos[0].points[0].done');
 rejects(JSON.parse('{"todos":[{"title":"X","__proto__":{"polluted":true}}]}'),'field','todos[0].__proto__');assert.equal({}.polluted,undefined);
});
test('all title, point and count boundaries are checked before deduplication',()=>{
 assert.equal(F.parse(document([item('t'.repeat(160),'p'.repeat(1000))])).todos[0].points[0].text.length,1000);
 rejects(document([item('t'.repeat(161))]),'title','todos[0].title');rejects(document([item('x','p'.repeat(1001))]),'text','todos[0].points[0].text');
 const points=Array.from({length:100},()=>({text:'P'}));assert.equal(F.parse({todos:[{title:'x',points}]}).todos[0].points.length,100);
 rejects({todos:[{title:'x',points:[...points,{text:'P'}]}]},'points');rejects(document(Array.from({length:301},()=>item())),'list');
 rejects(' '.repeat(F.limits.inputBytes+1),'inputSize');
});
test('preview preserves order, skips exact duplicates within the file and marks differing same-title items',()=>{
 const a=item('A'),b=item('B'),changed=item('A','Different'),before=[existing(a)],copy=structuredClone(before);
 const plan=F.plan(before,F.parse(document([a,b,b,changed])));
 assert.deepEqual(plan.summary,{inputCount:4,addedCount:2,pointCount:2,skippedCount:2,sameTitleCount:1,totalCount:3});
 assert.deepEqual(plan.additions,[b,changed]);assert.equal(plan.entries[3].sameTitle,true);assert.deepEqual(before,copy);
 assert.equal(F.plan(before,F.parse(document([a,a])),false).summary.addedCount,2);
 assert.throws(()=>F.plan(before,F.parse(document([b])), 'false'),e=>e.code==='option');
});
test('capacity and final serialized size apply to the combined list, including generated IDs',()=>{
 const full=Array.from({length:300},(_,i)=>existing({title:String(i),done:false,points:[]}));
 assert.equal(F.plan(full,F.parse({todos:[{title:'0'}]})).summary.addedCount,0);
 assert.throws(()=>F.plan(full,F.parse({todos:[{title:'new'}]})),e=>e.code==='capacity');
 const large=Array.from({length:8},(_,i)=>existing({title:String(i),done:false,points:Array.from({length:100},()=>({text:'汉'.repeat(1000),done:false}))}));
 assert.throws(()=>F.plan(large,F.parse({todos:[{title:'new'}]})),e=>e.code==='size');
 const input=item('X','汉\n'.repeat(400)),normal=F.parse(document([input])).todos[0];
 const appended=F.withIds(normal,()=>crypto.randomUUID());assert.equal(appended.id.length,36);assert.notEqual(appended.id,appended.points[0].id);assert.deepEqual(F.parse(document([appended])).todos[0],normal);
});
test('Chinese and English prompts match the import contract and show remaining capacity',()=>{
 for(const lang of ['zh','en']){
  const text=F.prompt(lang,7);assert.ok(text.includes(F.FORMAT));assert.ok(text.includes('160'));assert.ok(text.includes('1,000'));assert.ok(text.includes('7'));
  const raw=text.match(/\{\n  "format"[\s\S]*?\n\}/)[0];assert.equal(F.parse(raw).todos.length,1);
 }
 const e=new F.TodoImportError('text','todos[1].points[0].text');assert.match(F.describeError(e,'en'),/Points must/);assert.match(F.describeError(e,'zh'),/子要点/);
});
