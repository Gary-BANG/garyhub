'use strict';
const columns = ['id','user_id','kind','currency','date','category_id','amount','notes','refund_of','revision','request_id','created_at','updated_at'];
function table(name) {
  return `CREATE TABLE IF NOT EXISTS ${name}(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN('expense','income','refund')),currency TEXT NOT NULL CHECK(currency IN('CNY','USD','CAD','HKD')),date TEXT NOT NULL,category_id TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>0),notes TEXT NOT NULL DEFAULT '',refund_of TEXT REFERENCES ${name}(id) ON DELETE RESTRICT,revision INTEGER NOT NULL DEFAULT 1,request_id TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(user_id,request_id))`;
}
async function migrateCurrencies(db) {
  await db.run(table('ledger_entries'));
  const schema = await db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='ledger_entries'");
  if (schema.sql.includes("'CAD'") && schema.sql.includes("'HKD'")) return;
  const existing = (await db.all('PRAGMA table_info(ledger_entries)')).map(x => x.name);
  if (JSON.stringify(existing) !== JSON.stringify(columns)) throw Error('Unknown ledger schema; currency migration stopped');
  if ((await db.all("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='ledger_entries'")).length) throw Error('Custom ledger triggers require review before migration');
  const indexes = await db.all("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='ledger_entries' AND sql IS NOT NULL");
  if (indexes.some(x => !['idx_ledger_user_date','idx_ledger_refund'].includes(x.name))) throw Error('Custom ledger indexes require review before migration');
  const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  for (const t of tables) {
    if (!/^[A-Za-z_]\w*$/.test(t.name)) throw Error('Unknown table name; currency migration stopped');
    if (t.name !== 'ledger_entries' && (await db.all('PRAGMA foreign_key_list(' + t.name + ')')).some(x => x.table === 'ledger_entries')) throw Error('External ledger references require review before migration');
  }
  const foreign = (await db.get('PRAGMA foreign_keys')).foreign_keys;
  await db.run('PRAGMA foreign_keys=OFF');
  try {
    await db.run('BEGIN IMMEDIATE');
    try {
      if (await db.get("SELECT 1 FROM sqlite_master WHERE name='ledger_entries_v1351'")) throw Error('Unexpected migration table; review required');
      await db.run(table('ledger_entries_v1351'));
      await db.run('INSERT INTO ledger_entries_v1351(' + columns.join(',') + ') SELECT ' + columns.join(',') + ' FROM ledger_entries');
      const old = await db.get('SELECT COUNT(*) AS n FROM ledger_entries');
      const copied = await db.get('SELECT COUNT(*) AS n FROM ledger_entries_v1351');
      if (old.n !== copied.n) throw Error('Ledger migration row count mismatch');
      await db.run('DROP TABLE ledger_entries');
      await db.run('ALTER TABLE ledger_entries_v1351 RENAME TO ledger_entries');
      await db.run('CREATE INDEX idx_ledger_user_date ON ledger_entries(user_id,currency,date)');
      await db.run('CREATE INDEX idx_ledger_refund ON ledger_entries(refund_of)');
      if ((await db.all('PRAGMA foreign_key_check')).length) throw Error('Ledger migration foreign key check failed');
      await db.run('COMMIT');
    } catch (error) { await db.run('ROLLBACK'); throw error; }
  } finally { await db.run('PRAGMA foreign_keys=' + (foreign ? 'ON' : 'OFF')); }
}
module.exports = { migrateCurrencies };
