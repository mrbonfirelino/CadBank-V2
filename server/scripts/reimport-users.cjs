// Reimporta usuários do V1 que não existem mais no banco (após restauração acidental)
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(process.argv[2] || path.join(__dirname, '..', 'data', 'cadbank.db'));

const sql = fs.readFileSync(path.join(__dirname, '..', 'data', 'import-v1', 'cadbank2025.sql'), 'utf8');
const lines = sql.split(/\r?\n/);
const start = lines.findIndex(l => l.startsWith('COPY public.usuarios'));
if (start === -1) { console.error('bloco usuarios não encontrado'); process.exit(1); }

const ins = db.prepare('INSERT OR IGNORE INTO users (username, password_hash, full_name, role) VALUES (?,?,?,?)');
let added = 0, skipped = 0;
for (let i = start + 1; i < lines.length; i++) {
  const l = lines[i];
  if (l === '\\.') break;
  if (!l.trim()) continue;
  const p = l.split('\t');
  const nome = p[1], senha = p[2], grupo = p[3];
  const exists = db.prepare('SELECT id FROM users WHERE username=?').get(nome);
  if (exists) { skipped++; continue; }
  const role = String(grupo).trim() === '1' ? 'admin' : 'viewer';
  ins.run(nome, senha, '', role);
  added++;
  console.log('adicionado:', nome, '→', role);
}
console.log(`concluído: ${added} adicionados, ${skipped} já existiam`);
console.log('total users:', db.prepare('SELECT COUNT(*) n FROM users').get().n);
db.close();
