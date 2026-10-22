// Limpa dados de teste do snapshot que vai dentro do instalador
const path = require('path');
const Database = require('better-sqlite3');
const f = path.join(__dirname, '..', '..', 'installer', 'stage', 'CadBank', 'app', 'data', 'cadbank.db');
const db = new Database(f);
const t = db.prepare("SELECT id FROM drawings WHERE codigo='TEST-R0'").get();
if (t) {
  db.prepare('DELETE FROM revisions WHERE drawing_id=?').run(t.id);
  db.prepare('DELETE FROM drawings WHERE id=?').run(t.id);
  console.log('TEST-R0 removido do pacote');
} else console.log('sem TEST-R0 no pacote');
console.log('pacote users:', JSON.stringify(db.prepare('SELECT username,role FROM users').all().map(u => u.username + '/' + u.role)));
console.log('pacote drawings:', db.prepare('SELECT COUNT(*) n FROM drawings').get().n);
console.log('pacote cron:', db.prepare("SELECT value FROM settings WHERE key='backup_cron'").get().value);
db.close();
