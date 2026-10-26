'use strict';
const fail=(message,status=422)=>{throw Object.assign(Error(message),{status,code:'PLAN_LIMIT'});};
const premium=user=>!!user&&(user.role==='admin'||(user.account_tier??user.accountTier)==='subscriber');
function limits(user){const paid=premium(user);return {fixedExpenses:paid?300:5,todos:paid?300:5,points:paid?100:10,personalMusic:paid};}
async function currentUser(db,req){
 const user=await db.get('SELECT id,role,account_tier,enabled,deletion_pending,auth_version,must_change_password FROM users WHERE id=?',[req.session.user.id]);
 if(!user||user.enabled!==1||user.deletion_pending||user.auth_version!==(req.session.authVersion||0))fail('登录已失效',401);
 if(user.must_change_password)fail('请先修改临时密码',428);
 return user;
}
// Over-limit legacy records remain editable. Only existing IDs may survive above
// the new limit, so replacing IDs, imports and completed items cannot bypass it.
function checkTodos(user,before,after){
 const cap=limits(user),old=new Map(before.map(t=>[t.id,t]));
 if(after.length>cap.todos&&after.some(t=>!old.has(t.id)))fail(`当前账号最多保存 ${cap.todos} 条待办；已有超额内容保留，请先整理或升级订阅。`);
 for(const t of after){const previous=new Set((old.get(t.id)?.points||[]).map(p=>p.id));
  if(t.points.length>cap.points&&t.points.some(p=>!previous.has(p.id)))fail(`当前账号每条待办最多 ${cap.points} 个 points；已有超额内容保留。`);
 }
}
module.exports={premium,limits,currentUser,checkTodos};
