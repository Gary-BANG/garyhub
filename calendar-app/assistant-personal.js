'use strict';
const {randomUUID,createHash}=require('node:crypto');
const {validate}=require('./personal-api');
const {validateTodos}=require('./todos-api');
const {validDate}=require('./tasks-api');
const entitlement=require('./entitlements');
const {openConnection,transaction}=require('./sqlite-connection');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const tables={weight:'weight_entries',exercise:'exercise_entries'};
const str={type:'string'},int={type:'integer'},bool={type:'boolean'};
const choice=(...values)=>({type:'string',enum:values});
const health=choice('weight','exercise');
const edits=['create','rename','delete','set_done','add_point','edit_point','delete_point','set_point_done'];
const names=['read_health','change_health','read_todos','change_todo'];
function tools(fn){
  return [
    fn('read_health','Read own latest or dated weight/exercise records, or aggregate exercise over a week/month. IDs identify correction targets.',{kind:health,mode:choice('latest','records','week','month'),date:str},['kind','mode']),
    fn('change_health','Prepare a confirmed addition or correction. For correction first find record_id. Ask for missing kg/lb or exercise type and minutes. Send only fields the user supplied.',{kind:health,record_id:int,date:str,weight:{type:'number'},unit:choice('kg','lb'),activity_type:str,duration_minutes:int,note:str},['kind']),
    fn('read_todos','List todo titles, filter by title/status, or get all points of one todo by its ID. Use returned IDs when editing.',{todo_id:str,keyword:str,done:bool},[]),
    fn('change_todo','Prepare one change. create accepts title and optional points. rename uses title. Point additions/edits use text. Completion/restoration requires explicit done.',{operation:choice(...edits),todo_id:str,point_id:str,title:str,text:str,points:{type:'array',items:str},done:bool},['operation'])
  ];
}
function table(kind){if(!Object.hasOwn(tables,kind))fail('请选择体重或运动');return tables[kind];}
const columns=kind=>kind==='weight'?['entry_date','weight_g','note']:['entry_date','activity_type','duration_minutes','note'];
async function todoList(db,uid){
  const row=await db.get('SELECT state FROM todo_lists WHERE user_id=?',[uid]);
  return JSON.parse(row?.state||'[]');
}
function target(items,id){const value=items.find(item=>item.id===id);if(!value)fail('找不到目标，请重新查询');return value;}
async function read(db,uid,name,a,today){
  if(name==='read_todos'){
    const items=await todoList(db,uid);
    if(a.todo_id)return target(items,a.todo_id);
    return items.filter(t=>(a.done===undefined||a.done===t.done)&&t.title.toLowerCase().includes(String(a.keyword||'').toLowerCase())).map(t=>({todo_id:t.id,title:t.title,done:t.done,points:t.points.length}));
  }
  const tbl=table(a.kind),date=a.date??today;
  if(!validDate(date))fail('日期无效');
  if(a.mode==='week'||a.mode==='month'){
    if(a.kind!=='exercise')fail('汇总支持运动记录');
    const start=new Date(date+'T00:00:00Z');
    if(a.mode==='week')start.setUTCDate(start.getUTCDate()-(start.getUTCDay()+6)%7);else start.setUTCDate(1);
    const end=new Date(start);
    if(a.mode==='week')end.setUTCDate(end.getUTCDate()+7);else end.setUTCMonth(end.getUTCMonth()+1);
    const from=start.toISOString().slice(0,10),to=end.toISOString().slice(0,10);
    const rows=await db.all('SELECT activity_type,COUNT(*) AS count,SUM(duration_minutes) AS minutes FROM exercise_entries WHERE user_id=? AND entry_date>=? AND entry_date<? GROUP BY activity_type',[uid,from,to]);
    return {from,end_exclusive:to,count:rows.reduce((n,r)=>n+r.count,0),minutes:rows.reduce((n,r)=>n+r.minutes,0),by_type:rows};
  }
  if(!['latest','records'].includes(a.mode))fail('请选择查询范围');
  const where=a.mode==='records'?'entry_date=?':'entry_date<=?';
  return db.all('SELECT id,entry_date,'+(a.kind==='weight'?'weight_g/1000.0 AS kg':'activity_type,duration_minutes')+' FROM '+tbl+' WHERE user_id=? AND '+where+' ORDER BY entry_date DESC,id DESC'+(a.mode==='latest'?' LIMIT 1':''),[uid,date]);
}
function healthText(kind,row){
  return [row.entry_date,kind==='weight'?row.weight_g/1000+' kg':row.activity_type+' · '+row.duration_minutes+' min',row.note].filter(Boolean).join(' · ');
}
async function prepare(db,uid,name,a,today){
  if(name==='change_health'){
    const tbl=table(a.kind),fields=columns(a.kind);
    const before=a.record_id===undefined?null:await db.get('SELECT '+fields.join(',')+' FROM '+tbl+' WHERE user_id=? AND id=?',[uid,a.record_id]);
    if(a.record_id!==undefined&&!before)fail('找不到这条健康记录');
    const input={...before,...a,entry_date:a.date??before?.entry_date??today};
    delete input.weight_g;
    if(a.kind==='weight'){
      if(a.weight!==undefined||!before){if(!['kg','lb'].includes(a.unit))fail('请问体重单位是公斤还是磅？');}
      else if(a.unit!==undefined)fail('请同时提供体重数值');else input.weight_g=before.weight_g;
    }
    let item;
    try{item=validate(a.kind,input);}catch(error){fail(error.message);}
    const title=a.kind==='weight' && a.unit==='lb' && a.weight!==undefined
      ? [item.entry_date,a.weight+' lb ('+item.weight_g/1000+' kg)',item.note].filter(Boolean).join(' · ')
      : healthText(a.kind,item);
    if(before&&fields.every(k=>before[k]===item[k]))fail('请说明需要修改的字段');
    return {payload:{kind:a.kind,id:a.record_id,before,item},summary:{title,note:before?healthText(a.kind,before)+' → '+title:null,editing:!!before}};
  }
  const items=await todoList(db,uid);
  const operation=a.operation;
  if(!edits.includes(operation))fail('未知待办操作');
  const todo=operation==='create'?{id:randomUUID(),title:a.title,done:false,points:[]}:target(items,a.todo_id);
  const before=operation==='create'?null:JSON.stringify(todo);
  let detail='';
  if(operation==='create'){
    if(a.points!==undefined&&!Array.isArray(a.points))fail('子项格式无效');
    todo.points=(a.points||[]).map(text=>({id:randomUUID(),text,done:false}));
    detail=todo.points.map(p=>p.text).join('\n');
  }else if(operation==='rename'){detail=todo.title+' → '+a.title;todo.title=a.title;}
  else if(operation==='delete'){detail=String(todo.points.length);}
  else if(operation==='set_done'){todo.done=a.done;}
  else if(operation==='add_point'){todo.points.push({id:randomUUID(),text:a.text,done:false});detail=a.text;}
  else{
    const point=target(todo.points,a.point_id);detail=point.text;
    if(operation==='edit_point'){detail+=' → '+a.text;point.text=a.text;}
    if(operation==='set_point_done')point.done=a.done;
    if(operation==='delete_point')todo.points=todo.points.filter(p=>p.id!==point.id);
  }
  const after=operation==='delete'?null:validateTodos([todo])[0];
  if(before===JSON.stringify(after))fail('待办已是这个状态');
  return {payload:{id:todo.id,beforeHash:before?digest(before):null,after},summary:{title:todo.title,note:detail,operation,done:a.done}};
}
const digest=s=>createHash('sha256').update(s).digest('hex');
async function apply(db,req,name,p){
  const uid=req.session.user.id;
  if(name==='change_health'){
    const tbl=table(p.kind),fields=columns(p.kind),values=fields.map(k=>p.item[k]);
    if(!p.before){await db.run('INSERT INTO '+tbl+' (user_id,'+fields.join(',')+') VALUES ('+[uid,...values].map(()=>'?').join(',')+')',[uid,...values]);return;}
    const changed=await db.run('UPDATE '+tbl+' SET '+fields.map(k=>k+'=?').join(',')+',updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND '+fields.map(k=>k+' IS ?').join(' AND '),[...values,p.id,uid,...fields.map(k=>p.before[k])]);
    if(!changed.changes)fail('健康记录已变化，请重新查询并确认',409);
    return;
  }
  const items=await todoList(db,uid),index=items.findIndex(t=>t.id===p.id);
  if((index<0?null:digest(JSON.stringify(items[index])))!==p.beforeHash)fail('这条待办已变化，请重新查看并确认',409);
  const next=items.slice();
  if(!p.after)next.splice(index,1);else if(index<0)next.push(p.after);else next[index]=p.after;
  validateTodos(next);entitlement.checkTodos(await entitlement.currentUser(db,req),items,next);
  await db.run('INSERT INTO todo_lists(user_id,state,revision) VALUES(?,?,1) ON CONFLICT(user_id) DO UPDATE SET state=excluded.state,revision=revision+1,request_id=NULL,request_hash=NULL,updated_at=CURRENT_TIMESTAMP',[uid,JSON.stringify(next)]);
}
let queue=Promise.resolve(),conn;
function confirm(req,id,dbOverride){
  const job=queue.then(async()=>{
    const db=dbOverride||(conn??=openConnection());
    return transaction(db,async()=>{
      const uid=req.session.user.id,row=await db.get("SELECT kind,payload FROM assistant_actions WHERE id=? AND user_id=? AND state='pending' AND expires_at>?",[id,uid,Date.now()]);
      if(!row||!['change_health','change_todo'].includes(row.kind))fail('操作已失效，请重新查询',409);
      await apply(db,req,row.kind,JSON.parse(row.payload));
      await db.run("UPDATE assistant_actions SET state='done' WHERE id=?",[id]);
      return row.kind;
    });
  });
  queue=job.catch(()=>{});return job;
}
module.exports={tools,names,read,prepare,confirm};
