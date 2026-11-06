'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createSqliteAdapter}=require('./helpers/sqlite-adapter');
const personal=require('../assistant-personal');
const {migratePersonalRecords}=require('../migrations/personal-records');
const {migrateTodos}=require('../todos-api');

test('health corrections and per-item todo changes commit once and preserve concurrent unrelated edits',async()=>{
  const db=createSqliteAdapter();
  try {
    await db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,role TEXT,account_tier TEXT,enabled INTEGER,deletion_pending INTEGER,auth_version INTEGER,must_change_password INTEGER); INSERT INTO users VALUES(1,'user','standard',1,0,0,0),(2,'user','standard',1,0,0,0);CREATE TABLE assistant_actions(id TEXT PRIMARY KEY,user_id INTEGER,kind TEXT,payload TEXT,state TEXT,expires_at INTEGER)");
    await migratePersonalRecords(db);await migrateTodos(db);
    const req={session:{user:{id:1}}},day='2026-11-06';
    async function draft(name,args){
      const {payload,summary}=await personal.prepare(db,1,name,args,day),id=randomUUID();
      await db.run("INSERT INTO assistant_actions VALUES(?,1,?,?,'pending',?)",[id,name,JSON.stringify(payload),Date.now()+60000]);
      return {id,summary};
    }
    const save=card=>personal.confirm(req,card.id,db);
    const todo=args=>draft('change_todo',args);
    const health=args=>draft('change_health',args);
    const list=()=>personal.read(db,1,'read_todos',{},day);
    const record=args=>personal.read(db,1,'read_health',args,day);
    await assert.rejects(health({kind:'weight',weight:150}),/单位/);
    await assert.rejects(health({kind:'exercise',activity_type:'跑步'}),/时长/);
    await save(await health({kind:'weight',weight:68.4,unit:'kg'}));
    assert.equal((await record({kind:'weight',mode:'latest'}))[0].kg,68.4);
    await save(await health({kind:'exercise',activity_type:'跑步',duration_minutes:30}));
    const exercise=(await record({kind:'exercise',mode:'records',date:day}))[0];
    const edit=await health({kind:'exercise',record_id:exercise.id,duration_minutes:35});
    await save(edit);await assert.rejects(save(edit));
    for(const mode of ['week','month']){
      const result=await record({kind:'exercise',mode});assert.equal(result.count,1);assert.equal(result.minutes,35);
    }
    await assert.rejects(personal.prepare(db,2,'change_health',{kind:'exercise',record_id:exercise.id,note:'x'},day));
    const create=await todo({operation:'create',title:'Lab',points:['A','B']});
    assert.equal((await list()).length,0);
    await assert.rejects(personal.confirm({session:{user:{id:2}}},create.id,db));
    await save(create);
    const tid=(await list())[0].todo_id,details=()=>personal.read(db,1,'read_todos',{todo_id:tid},day);
    const op=(operation,extra={})=>todo({todo_id:tid,operation,...extra});
    const pid=(await details()).points[0].id;
    const rename=await op('rename',{title:'Lab 5'});
    await save(await todo({operation:'create',title:'Keep me'}));
    await save(rename);assert.equal((await list()).length,2);
    await save(await op('add_point',{text:'C'}));
    await save(await op('edit_point',{point_id:pid,text:'Edited'}));
    assert.equal((await details()).points[0].text,'Edited');
    for(const done of [true,false]){
      await save(await op('set_point_done',{point_id:pid,done}));
      assert.equal((await details()).points[0].done,done);
      await save(await op('set_done',{done}));assert.equal((await details()).done,done);
    }
    const stale=await op('delete');assert.equal(stale.summary.note,'3');
    await save(await op('delete_point',{point_id:pid}));
    await assert.rejects(save(stale),/已变化/);
    assert.equal((await details()).points.length,2);
    await save(await op('delete'));assert.equal((await list())[0].title,'Keep me');
  } finally {db.close();}
});
