const Database = require('better-sqlite3');
const db = new Database(require('path').join(__dirname, '..', 'data', 'cadbank.db'));
console.log(JSON.stringify(db.prepare("SELECT id,codigo,nome,created_at FROM drawings WHERE codigo NOT LIKE 'V1-%' ORDER BY id").all(), null, 1));
db.close();
