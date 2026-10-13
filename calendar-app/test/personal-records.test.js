"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createSqliteAdapter } = require("./helpers/sqlite-adapter");
const { migratePersonalRecords, VERSION } = require("../migrations/personal-records");
const register = require("../personal-api");

function fixture() {
  const db = createSqliteAdapter();
  db.raw.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users(id INTEGER PRIMARY KEY, username TEXT, password_hash TEXT);
    CREATE TABLE tasks(id TEXT PRIMARY KEY, user_id INTEGER, title TEXT);
    INSERT INTO users VALUES(1,'alice','hash-1'),(2,'bob','hash-2');
    INSERT INTO tasks VALUES('old-task',1,'keep me');`);
  return db;
}

function appHarness(db) {
  const routes = new Map();
  const app = {};
  for (const method of ["get", "post", "put", "delete"]) {
    app[method] = (path, login, handler) => routes.set(`${method} ${path}`, [login, handler]);
  }
  const requireLogin = (req, res, next) => req.session?.user ? next() : res.status(401).json({ message: "未登录" });
  register(app, { requireLogin, db });
  return async (method, path, user, body = {}, query = {}) => {
    let id;
    let routePath = path;
    const match = path.match(/^(\/api\/personal\/(?:diary|weight|exercise))\/(\d+)$/);
    if (match) { routePath = `${match[1]}/:id`; id = match[2]; }
    const handlers = routes.get(`${method} ${routePath}`);
    assert.ok(handlers, `${method} ${routePath}`);
    const result = { status: 200, body: null, headers: {} };
    const res = {
      status(code) { result.status = code; return this; },
      set(name, value) { result.headers[name] = value; return this; },
      json(value) { result.body = value; return this; }
    };
    let allowed = false;
    handlers[0]({ session: user ? { user: { id: user, role: user === 1 ? "admin" : "user" } } : {} }, res, () => { allowed = true; });
    if (allowed) await handlers[1]({ session: { user: { id: user, role: user === 1 ? "admin" : "user" } }, body, query, params: { id } }, res);
    return result;
  };
}

test("migration is repeatable and retains prior users and tasks", async () => {
  const db = fixture();
  await migratePersonalRecords(db);
  await migratePersonalRecords(db);
  assert.deepEqual((await db.all("SELECT * FROM users ORDER BY id")).map(row => ({ ...row })), [
    { id: 1, username: "alice", password_hash: "hash-1" },
    { id: 2, username: "bob", password_hash: "hash-2" }
  ]);
  assert.equal((await db.get("SELECT title FROM tasks WHERE id='old-task'")).title, "keep me");
  assert.equal((await db.get("SELECT COUNT(*) AS n FROM schema_migrations WHERE version=?", [VERSION])).n, 1);
  assert.deepEqual(await db.all("PRAGMA foreign_key_check"), []);
  db.close();
});

test("private records ignore userId and constrain every object mutation to session owner", async () => {
  const db = fixture(); await migratePersonalRecords(db);
  const call = appHarness(db);
  assert.equal((await call("get", "/api/personal/diary", null)).status, 401);
  const diary = await call("post", "/api/personal/diary", 2,
    { entry_date: "2026-09-29", title: "Bob", body: "private", userId: 1 });
  assert.equal(diary.status, 201);
  assert.equal(diary.body.user_id, 2);
  assert.deepEqual((await call("get", "/api/personal/diary", 1, {}, { userId: "2" })).body, []);
  assert.equal((await call("put", `/api/personal/diary/${diary.body.id}`, 1,
    { entry_date: "2026-09-29", title: "stolen", body: "text" })).status, 404);
  assert.equal((await call("delete", `/api/personal/diary/${diary.body.id}`, 1)).status, 404);
  assert.equal((await call("post", "/api/personal/diary", 2,
    { entry_date: "2026-09-29", title: "duplicate", body: "" })).status, 409);
  const updated = await call("put", `/api/personal/diary/${diary.body.id}`, 2,
    { entry_date: "2026-09-29", title: "revised", body: "second version" });
  assert.equal(updated.body.body, "second version");
  assert.equal((await call("get", "/api/personal/diary", 2)).body.length, 1);
  assert.equal((await call("post", "/api/personal/diary", 1,
    { entry_date: "2026-09-29", title: "Alice", body: "own" })).status, 201);
  assert.equal((await call("get", "/api/personal/diary", 1)).body.length, 1);
  assert.equal((await call("get", "/api/personal/diary", 2, {}, { q: "second" })).body.length, 1);
  assert.equal((await call("get", "/api/personal/diary", 2, {}, { q: "%" })).body.length, 0);
  db.close();
});

test("date and input checks, exact stored grams, exercise weekly summary", async () => {
  const db = fixture(); await migratePersonalRecords(db);
  const call = appHarness(db);
  for (const date of ["2026-02-29", "2026-9-29", "2026-09-29T00:00:00Z"]) {
    assert.equal((await call("post", "/api/personal/diary", 1,
      { entry_date: date, title: "hi", body: "" })).status, 400);
  }
  assert.equal((await call("post", "/api/personal/diary", 1,
    { entry_date: "2026-09-29", title: "  ", body: " " })).status, 400);
  const w = await call("post", "/api/personal/weight", 1,
    { entry_date: "2026-09-29", weight: "150", unit: "lb", note: "" });
  assert.equal(w.body.weight_g, 68039);
  const second = await call("post", "/api/personal/weight", 1,
    { entry_date: "2026-09-29", weight: "69.2", unit: "kg", note: "later" });
  assert.equal(second.status, 201);
  assert.equal((await call("get", "/api/personal/weight", 1)).body.length, 2);
  assert.deepEqual((await call("get", "/api/personal/weight", 2, {}, { userId: 1 })).body, []);
  assert.equal((await call("put", `/api/personal/weight/${w.body.id}`, 2,
    { entry_date: "2026-09-29", weight: "70", unit: "kg" })).status, 404);
  assert.equal((await call("delete", `/api/personal/weight/${w.body.id}`, 2)).status, 404);
  assert.equal((await call("post", "/api/personal/weight", 1,
    { entry_date: "2026-09-29", weight: "NaN", unit: "kg", note: "" })).status, 400);
  assert.equal((await call("put", `/api/personal/weight/${w.body.id}`, 1,
    { entry_date: "2026-09-29", weight_g: w.body.weight_g, note: "updated" })).body.weight_g, 68039);
  assert.equal((await call("delete", `/api/personal/weight/${second.body.id}`, 1)).status, 200);
  assert.equal((await call("get", "/api/personal/weight", 1)).body.length, 1);
  assert.equal((await call("post", "/api/personal/exercise", 1,
    { entry_date: "2026-09-28", activity_type: "跑步", duration_minutes: 0 })).status, 400);
  await call("post", "/api/personal/exercise", 1,
    { entry_date: "2026-09-28", activity_type: "跑步", duration_minutes: 30 });
  await call("post", "/api/personal/exercise", 2,
    { entry_date: "2026-09-28", activity_type: "跑步", duration_minutes: 45 });
  const summary = await call("get", "/api/personal/exercise/summary", 1, {},
    { period: "week", start: "2026-09-28", userId: 2 });
  assert.equal(summary.body.total_minutes, 30);
  assert.equal(summary.body.count, 1);
  assert.equal((await call("get", "/api/personal/exercise/summary", 1, {},
    { period: "week", start: "2026-09-29" })).status, 400);
  db.close();
});

test('old diary schema gains mood without changing records; repeated migration and old-client edits preserve it',async()=>{
 const db=fixture();
 await db.exec("CREATE TABLE diary_entries(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,entry_date TEXT,title TEXT NOT NULL DEFAULT '',body TEXT NOT NULL DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(user_id,entry_date)); INSERT INTO diary_entries(user_id,entry_date,title,body) VALUES(2,'2026-10-01','Old title','Original body');");
 await migratePersonalRecords(db);await migratePersonalRecords(db);
 let row=await db.get('SELECT * FROM diary_entries WHERE id=1');assert.equal(row.body,'Original body');assert.equal(row.mood,'');
 const call=appHarness(db);let r=await call('put','/api/personal/diary/1',2,{entry_date:'2026-10-01',title:'Old title',body:'Original body',mood:'happy'});assert.equal(r.body.mood,'happy');
 r=await call('put','/api/personal/diary/1',2,{entry_date:'2026-10-01',title:'Old client',body:'Still here'});assert.equal(r.body.mood,'happy');
 assert.equal((await call('post','/api/personal/diary',2,{entry_date:'2026-10-02',title:'Bad mood',mood:'not-valid'})).status,400);db.close();
});
test('diary paging is complete, summaries omit body, title-only and dates compose, detail and markers stay private',async()=>{
 const db=fixture();await migratePersonalRecords(db);const call=appHarness(db);
 for(let n=1;n<=25;n++)await call('post','/api/personal/diary',2,{entry_date:`2026-10-${String(n).padStart(2,'0')}`,title:n===3?'needle title':`Day ${n}`,body:'needle private body',mood:'calm'});
 const pages=[];for(let page=1;page<=3;page++){const r=await call('get','/api/personal/diary',2,{}, {page:String(page),page_size:'10'});assert.equal(r.body.total,25);pages.push(...r.body.items);assert.ok(r.body.items.every(x=>!('body' in x)));}
 assert.equal(new Set(pages.map(x=>x.id)).size,25);
 const filtered=await call('get','/api/personal/diary',2,{}, {page:'1',title:'needle',date:'2026-10-03'});assert.equal(filtered.body.total,1);
 assert.equal((await call('get','/api/personal/diary',2,{}, {page:'1',title:'needle',date:'2026-10-04'})).body.total,0);
 assert.equal((await call('get','/api/personal/diary/dates',2,{}, {month:'2026-10',title:'needle'})).body.length,1);
 assert.equal((await call('get','/api/personal/diary/dates',1,{}, {month:'2026-10',userId:'2'})).body.length,0);
 assert.equal((await call('get','/api/personal/diary/1',1)).status,404);
 assert.equal((await call('get','/api/personal/diary/1',2)).body.body,'needle private body');
 for(const page of ['0','-1','1.1','Infinity','100001'])assert.equal((await call('get','/api/personal/diary',2,{}, {page})).status,400);
 assert.equal((await call('get','/api/personal/diary',2,{}, {page:'1',date:'2026-02-30'})).status,400);
 assert.equal((await call('get','/api/personal/diary/dates',2,{}, {month:'2026-13'})).status,400);db.close();
});
