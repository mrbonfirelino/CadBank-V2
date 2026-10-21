#!/usr/bin/env node
/**
 * Importação dos dados do CadBank V1 (backup PostgreSQL) para o CadBank V2 (SQLite).
 *
 * Uso:
 *   node scripts/import-v1.cjs [--dry-run] ["caminho do .sql restaurado"]
 *
 * Padrão: importa de <repo>/data/import-v1/cadbank2025.sql (gerado via pg_restore).
 * Para gerar o .sql a partir do dump binário:
 *   pg_restore.exe -f saida.sql "CADBANK 10-01-2025.sql"
 *
 * Regras acordadas:
 *  - Todo código do V1 recebe prefixo "V1-" (ex.: V1-M4891).
 *  - Duplicados ganham sufixo numérico: V1-M4891, V1-M4891 (2), V1-M4891 (3)...
 *  - Usuários migrados com os hashes bcrypt $2y$ originais (senhas continuam valendo).
 *  - formato_folha e tag são campos novos do V2.
 *  - Revisões (REV1, REV2...) viram registros de revisão sem arquivo anexado.
 *  - Registros anômalos do V1 (campo revisão com texto que não é "REV n") são
 *    importados normalmente e listados no relatório para revisão manual.
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const sqlArg = args.find(a => !a.startsWith('--'));
const SQL_PATH = sqlArg || path.join(__dirname, '..', 'data', 'import-v1', 'cadbank2025.sql');
const DB_PATH = path.join(__dirname, '..', 'data', 'cadbank.db');
const REPORT_PATH = path.join(__dirname, '..', 'data', 'import-v1-relatorio.txt');

if (!fs.existsSync(SQL_PATH)) {
  console.error(`Arquivo SQL não encontrado: ${SQL_PATH}`);
  process.exit(1);
}

// ---------- leitura do dump ----------
const raw = fs.readFileSync(SQL_PATH, 'utf8');
const lines = raw.split(/\r?\n/);

function parseCopy(table) {
  const start = lines.findIndex(l => l.startsWith(`COPY public.${table} `));
  if (start === -1) throw new Error(`Bloco COPY de ${table} não encontrado`);
  const header = lines[start].match(/\((.*)\)/)[1].split(',').map(s => s.trim());
  const rows = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i] === '\\.') break;
    const parts = lines[i].split('\t').map(v => {
      if (v === '\\N') return '';
      return v.replace(/\\t/g, '\t').replace(/\\n/g, '\n').replace(/\\\\/g, '\\').replace(/\r/g, '');
    });
    const row = {};
    header.forEach((h, idx) => { row[h] = parts[idx] || ''; });
    rows.push(row);
  }
  return rows;
}

const formatos = parseCopy('formatos_folha');
const usuarios = parseCopy('usuarios');
const projetos = parseCopy('projetos');
const formatoNome = new Map(formatos.map(f => [String(f.id), (f.nome || '').trim()]));

console.log(`V1: ${projetos.length} projetos, ${usuarios.length} usuários, ${formatos.length} formatos de folha.`);

// ---------- preparação ----------
let db, insertUser, insertDrawing, insertRevision;
let stats;
if (!dryRun) {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  // garante colunas novas (mesma migração do db.js)
  const cols = db.prepare('PRAGMA table_info(drawings)').all().map(c => c.name);
  if (!cols.includes('formato_folha')) db.exec("ALTER TABLE drawings ADD COLUMN formato_folha TEXT DEFAULT ''");
  if (!cols.includes('tag')) db.exec("ALTER TABLE drawings ADD COLUMN tag TEXT DEFAULT ''");
  insertUser = db.prepare(`INSERT INTO users (username, password_hash, full_name, role) VALUES (?,?,?,?)`);
  insertDrawing = db.prepare(`INSERT INTO drawings
    (codigo, nome, descricao, desenhista, projetista, empresa, planta, formato_folha, tag, os, anotacoes, created_at, updated_at)
    VALUES (@codigo,@nome,@descricao,@desenhista,'',@empresa,'',@formato_folha,@tag,'',@anotacoes,@data,@data)`);
  insertRevision = db.prepare(`INSERT INTO revisions (drawing_id, revisao, subrev, descricao, uploaded_by, created_at)
    VALUES (?,?,'0','',NULL,?)`);
} else {
  const noop = { run: () => ({ lastInsertRowid: 0 }) };
  insertUser = noop; insertDrawing = noop; insertRevision = noop;
}

function uniqueCodigo(base) {
  if (!db) {
    // dry-run: dedupe apenas em memória
    if (!seenCodes.has(base)) return base;
    stats.duplicated++;
    let n = 2;
    while (seenCodes.has(`${base} (${n})`)) n++;
    return `${base} (${n})`;
  }
  if (!db.prepare('SELECT 1 FROM drawings WHERE codigo=?').get(base)) return base;
  stats.duplicated++;
  let n = 2;
  while (db.prepare('SELECT 1 FROM drawings WHERE codigo=?').get(`${base} (${n})`)) n++;
  return `${base} (${n})`;
}

const seenCodes = new Set();

const anomalous = [];
// extrai número de revisão: "0", "REV3", "REV.01" → int; letras/texto → null (anômalo)
function parseRev(rev) {
  if (/^\d+$/.test(rev)) return parseInt(rev, 10);
  if (/^REV/i.test(rev)) {
    const m = rev.match(/(\d+)/);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}
stats = { users: 0, usersSkipped: 0, drawings: 0, duplicated: 0, revisions: 0, anomalous: 0 };

const importAll = () => {
  // usuários
  for (const u of usuarios) {
    const username = (u.nome || '').trim();
    if (!username) continue;
    if (db && db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) { stats.usersSkipped++; continue; }
    const role = String(u.grupo) === '1' ? 'admin' : (String(u.grupo) === '2' ? 'viewer' : 'editor');
    insertUser.run(username, (u.senha || '').trim(), username, role);
    stats.users++;
  }
  // projetos
  for (const p of projetos) {
    const numero = (p.numero || '').trim();
    if (!numero) { anomalous.push(`id=${p.id}: sem numero`); stats.anomalous++; continue; }
    const codigo = uniqueCodigo('V1-' + numero);
    const desenhista = (p.desenhista || '').trim() === '.' ? '' : (p.desenhista || '').trim();
    const formato = formatoNome.get(String(p.formato_folha)) || '';
    const info = insertDrawing.run({
      codigo,
      nome: (p.titulo || '').trim() || numero,
      descricao: '',
      desenhista,
      empresa: (p.empresa || '').trim(),
      formato_folha: formato,
      tag: (p.tag || '').trim(),
      anotacoes: (p.nota || '').trim(),
      data: (p.data || '').trim()
    });
    seenCodes.add(codigo);
    stats.drawings++;
    const rev = (p.revisao || '').trim();
    if (rev) {
      const n = parseRev(rev);
      if (n !== null) { if (db) insertRevision.run(info.lastInsertRowid, n, (p.data || '').trim()); stats.revisions++; }
      else { anomalous.push(`${codigo}: campo revisão com valor não padrão "${rev}" (não virou revisão)`); stats.anomalous++; }
    }
  }
};
const run = dryRun ? importAll : db.transaction(importAll);
run();

// ---------- relatório ----------
const rep = [
  `Importação CadBank V1 → V2  (${dryRun ? 'SIMULAÇÃO' : 'EXECUTADO'}) ${new Date().toISOString()}`,
  `Origem: ${SQL_PATH}`,
  `Usuários: ${stats.users} inseridos, ${stats.usersSkipped} já existiam`,
  `Desenhos: ${stats.drawings} inseridos (${stats.duplicated} com sufixo por código duplicado)`,
  `Revisões (sem arquivo): ${stats.revisions}`,
  `Registros anômalos: ${stats.anomalous}`,
  '', ...anomalous.map(l => `- ${l}`)
].join('\n');
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, rep, 'utf8');
if (db) db.close();
console.log(rep.split('\n').slice(0, 6).join('\n'));
console.log(`Relatório completo: ${REPORT_PATH}`);
