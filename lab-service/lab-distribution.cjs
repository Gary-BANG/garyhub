'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const validation = import('./public/lab/pack-validation.mjs');
const LIMIT = 24 * 1024 * 1024;
const fail = (message, status = 400) => { throw Object.assign(Error(message), {status}); };
const canonical = v => JSON.stringify(v, (_, x) => x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
const hash = v => crypto.createHash('sha256').update(v).digest('hex');
const group = p => p.assignment || '未分组作业';
const empty = () => ({custom: [], images: {}, instances: [], history: [], current: null});

function createDistribution({DATA, ROOT, identity, validCsrf, calendar, json, body}) {
  function read(uid) {
    const file = path.join(DATA, `user-${uid}.json`);
    if (fs.existsSync(path.join(DATA, '.deleting-user-' + uid))) fail('账号正在删除，请重新选择接收人', 409);
    if (!fs.existsSync(file)) return {revision: 0, state: null};
    if (fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size > LIMIT + 65536) fail('用户空间需要检查，未执行分发', 409);
    const v = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Number.isSafeInteger(v.revision) || v.revision < 0 || !v.state || !Array.isArray(v.state.custom)
      || !Array.isArray(v.state.instances) || !Array.isArray(v.state.history) || !v.state.images || Array.isArray(v.state.images)) fail('用户空间格式需要检查', 409);
    return v;
  }
  function imageData(p, state) {
    if (!p.image) return null;
    if (!/^images\/[a-zA-Z0-9_./-]+\.(png|jpg|jpeg|webp)$/.test(p.image) || p.image.includes('..')) fail('题目图片路径无效');
    let value = state.images[p.image];
    if (!value) {
      const file = path.join(ROOT, 'lab', p.image);
      if (!fs.existsSync(file) || fs.lstatSync(file).isSymbolicLink()) fail('缺少题目图片：' + p.image);
      const bytes = fs.readFileSync(file);
      value = 'data:image/' + (/\.png$/.test(p.image) ? 'png' : /\.webp$/.test(p.image) ? 'webp' : 'jpeg') + ';base64,' + bytes.toString('base64');
    }
    const m = typeof value === 'string' && value.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!m) fail('图片格式无效：' + p.image);
    const bytes = Buffer.from(m[2], 'base64');
    if (bytes.length > 5 * 1024 * 1024 || bytes.toString('base64') !== m[2]) fail('图片无效或超过 5 MB：' + p.image);
    const valid = m[1] === 'png' ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : m[1] === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP';
    if (!valid) fail('图片内容与格式不符：' + p.image);
    return {value, digest: hash(bytes), extension: m[1] === 'jpeg' ? 'jpg' : m[1]};
  }
  function fingerprint(p, state) {
    const copy = {...p}; delete copy.id;
    if (copy.image) copy.image = imageData(p, state).digest;
    return hash(canonical(copy));
  }
  function merge(source, incoming) {
    const state = structuredClone(source.state || empty());
    const builtin = JSON.parse(fs.readFileSync(path.join(ROOT, 'lab/data/starter.json'), 'utf8')).problems;
    const effective = new Map(builtin.map(p => [p.id,p]));
    for (const p of state.custom) effective.set(p.id,p);
    const fingerprints = new Set([...effective.values()].map(p => fingerprint(p,state)));
    const ids = new Set(effective.keys()); let added = 0, skipped = 0, renamed = 0;
    for (const item of incoming) {
      if (fingerprints.has(item.digest)) { skipped++; continue; }
      const p = structuredClone(item.problem);
      if (ids.has(p.id)) {
        p.id = 'distributed-' + item.digest.slice(0,32);
        let suffix = 1; while (ids.has(p.id)) p.id = 'distributed-' + item.digest.slice(0,32) + '-' + suffix++;
        renamed++;
      }
      if (item.image) {
        const image = item.image;
        let name = 'images/distributed-' + image.digest + '.' + image.extension;
        let suffix = 1;
        while (Object.hasOwn(state.images,name) && state.images[name] !== image.value) name = 'images/distributed-' + image.digest + '-' + suffix++ + '.' + image.extension;
        p.image = name; state.images[name] = image.value;
      }
      state.custom.push(p); ids.add(p.id); fingerprints.add(item.digest); added++;
    }
    if (Buffer.byteLength(JSON.stringify(state)) > LIMIT - 65536) fail('接收用户的题库空间将超过 24 MiB，请先整理空间', 409);
    return {state, added, skipped, renamed};
  }
  function write(uid, old, state) {
    const file = path.join(DATA, `user-${uid}.json`), tmp = file + '.distribution-' + crypto.randomUUID();
    const value = {...old, revision: old.revision + 1, state, updatedAt: new Date().toISOString()};
    const fd = fs.openSync(tmp, 'wx', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(value)); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    try { fs.renameSync(tmp,file); const dir = fs.openSync(DATA,'r'); try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); } }
    finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
  }
  return async (req,res,url) => {
    if (!url.pathname.startsWith('/api/lab/distribution')) return false;
    if (!['/api/lab/distribution/options','/api/lab/distribution/preview','/api/lab/distribution/send'].includes(url.pathname)) {json(res,404,{message:'Not found'});return true;}
    const actor = await identity(req);
    if (!actor) fail('请先登录',401);
    if (actor.role !== 'admin') fail('只有管理员可以分发题库',403);
    const isOptions = url.pathname.endsWith('/options');
    if (req.method !== (isOptions ? 'GET' : 'POST')) fail('请求方法不支持',405);
    if (!isOptions && (!['https://tools.garyhub.uk','https://lab.garyhub.uk'].includes(req.headers.origin) || !await validCsrf(req))) fail('页面校验失效，请刷新',403);
    const input = isOptions ? null : await body(req);
    if (input && input.accountId !== actor.id) fail('管理员登录身份已变化，请重新打开分发窗口',409);
    const {validatePack} = await validation;
    // Calendar authorizes the request again; the returned list is never forwarded with private fields.
    const upstream = await calendar(req, '/api/hub/admin/users');
    if (!upstream.ok) fail('管理员身份已失效或账号服务不可用',upstream.status === 401 || upstream.status === 403 ? upstream.status : 503);
    const users = await upstream.json();
    const me = users.find(u => u.id === actor.id);
    if (!me || me.role !== 'admin' || !me.enabled || me.deletion_pending) fail('管理员身份已失效',403);
    const eligible = users.filter(u => u.id !== actor.id && u.enabled === 1 && !u.deletion_pending);
    const source = read(actor.id), saved = source.state || empty();
    const groups = [...new Set(saved.custom.map(group))].map(assignment => ({assignment,count:saved.custom.filter(p => group(p) === assignment).length}));
    if (isOptions) {json(res,200,{accountId:actor.id,sourceRevision:source.revision,groups,users:eligible.map(u=>({id:u.id,username:u.username,role:u.role}))});return true;}
    if (!input || typeof input.assignment !== 'string' || !Number.isSafeInteger(input.sourceRevision) || input.sourceRevision !== source.revision) fail('管理员题库已经更新，请重新打开分发窗口',409);
    if (!Array.isArray(input.recipientIds) || !input.recipientIds.length || input.recipientIds.length > 50 || input.recipientIds.some(id=>!Number.isSafeInteger(id)||!eligible.some(u=>u.id===id)) || new Set(input.recipientIds).size !== input.recipientIds.length) fail('请选择 1–50 个有效接收用户');
    const problems = saved.custom.filter(p => group(p) === input.assignment);
    try { validatePack({schema_version:1,problems}); } catch(e) { fail('题库检查失败：' + e.message); }
    const incoming = problems.map(problem=>({problem,image:imageData(problem,saved),digest:fingerprint(problem,saved)}));
    // No await below: preview checking and per-user durable replacement cannot interleave with workspace PUTs.
    const plans = input.recipientIds.map(id => {
      const old=read(id), user=eligible.find(u=>u.id===id);
      const {added,skipped,renamed}=merge(old,incoming);
      return {id,username:user.username,revision:old.revision,stateHash:hash(canonical(old.state)),added,skipped,renamed};
    });
    const previewId = hash(canonical({actor:actor.id,source:source.revision,assignment:input.assignment,content:incoming.map(i=>i.digest),targets:plans.map(p=>[p.id,p.revision,p.stateHash])}));
    const rows = plans.map(p=>({id:p.id,username:p.username,added:p.added,skipped:p.skipped,renamed:p.renamed}));
    if (url.pathname.endsWith('/preview')) {json(res,200,{previewId,assignment:input.assignment,count:problems.length,results:rows});return true;}
    if (input.previewId !== previewId) fail('题库或接收用户的空间已更新，请重新预览后再分发；未覆盖任何内容',409);
    const results = plans.map((p,i)=>{
      try {if(p.added){const old=read(p.id);write(p.id,old,merge(old,incoming).state);}return {...rows[i],status:'complete'};}
      catch {return {...rows[i],status:'failed',message:'保存未确认；请重新预览后重试，已存在的相同题目会跳过'};}
    });
    json(res,200,{complete:results.every(p=>p.status==='complete'),results});return true;
  };
}
module.exports={createDistribution};
