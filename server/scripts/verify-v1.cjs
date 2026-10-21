const D = require('better-sqlite3');
const db = new D(require('path').join(__dirname, '..', 'data', 'cadbank.db'), { readonly: true });
console.log('users:', db.prepare('SELECT COUNT(*) c FROM users').get().c);
console.log('drawings:', db.prepare('SELECT COUNT(*) c FROM drawings').get().c);
console.log('revisions:', db.prepare('SELECT COUNT(*) c FROM revisions').get().c);
console.log(JSON.stringify(db.prepare("SELECT codigo,nome,empresa,formato_folha,tag,desenhista,anotacoes,created_at FROM drawings WHERE codigo IN ('V1-M4891','V1-K0176','V1-M3901')").all(), null, 1));
console.log(JSON.stringify(db.prepare('SELECT username,role,substr(password_hash,1,4) h,active FROM users').all(), null, 1));
console.log('revs do V1-M3901:', JSON.stringify(db.prepare("SELECT r.revisao FROM revisions r JOIN drawings d ON d.id=r.drawing_id WHERE d.codigo='V1-M3901'").all()));
