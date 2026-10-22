const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const SRC_DB = path.join(__dirname, '..', 'data', 'cadbank.db');
const db = new Database(SRC_DB);

// 1) cron de backup = meio-dia
db.prepare("UPDATE settings SET value='0 12 * * *' WHERE key='backup_cron'").run();
console.log('settings:', JSON.stringify(db.prepare('SELECT * FROM settings').all()));

// 2) staging do pacote
const STAGE = path.join(__dirname, '..', '..', 'installer', 'stage', 'CadBank');
const APP = path.join(STAGE, 'app');
fs.rmSync(STAGE, { recursive: true, force: true });
for (const d of ['runtime/node', 'app/server', 'app/web/dist', 'app/data/files']) {
  fs.mkdirSync(path.join(STAGE, ...d.split('/')), { recursive: true });
}

// 3) banco consistente via backup API
const snap = path.join(APP, 'data', 'cadbank.db');
db.backup(snap).then(() => {
  db.close();
  const d2 = new Database(snap);
  d2.pragma('journal_mode = DELETE'); // sem WAL no pacote (evita -wal/-shm pendentes)
  d2.close();
  console.log('db snapshot OK:', fs.statSync(snap).size, 'bytes');
});
