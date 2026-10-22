const Database = require('better-sqlite3');
const db = new Database(require('path').join(__dirname, '..', 'data', 'cadbank.db'));
console.log('drawings:', db.prepare('SELECT COUNT(*) n FROM drawings').get().n);
console.log('teste:', JSON.stringify(db.prepare("SELECT id,codigo FROM drawings WHERE codigo LIKE 'TEST%'").all()));
console.log('cron:', db.prepare("SELECT value FROM settings WHERE key='backup_cron'").get().value);
db.close();
