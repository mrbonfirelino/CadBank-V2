const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
const { DATA_DIR } = require('./config');

const db = new Database(path.join(DATA_DIR, 'cadbank.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','editor','viewer')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS drawings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  descricao TEXT DEFAULT '',
  desenhista TEXT DEFAULT '',
  projetista TEXT DEFAULT '',
  empresa TEXT DEFAULT '',
  planta TEXT DEFAULT '',
  os TEXT DEFAULT '',
  anotacoes TEXT DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drawing_id INTEGER NOT NULL REFERENCES drawings(id) ON DELETE CASCADE,
  revisao INTEGER NOT NULL,
  subrev INTEGER NOT NULL DEFAULT 0,
  descricao TEXT DEFAULT '',
  dwg_path TEXT,
  pdf_path TEXT,
  original_name TEXT DEFAULT '',
  dwg_size INTEGER DEFAULT 0,
  pdf_size INTEGER DEFAULT 0,
  uploaded_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (drawing_id, revisao, subrev)
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drawing_id INTEGER NOT NULL REFERENCES drawings(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  texto TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  revision_id INTEGER NOT NULL REFERENCES revisions(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'dwg2pdf',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','error')),
  error TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_revisions_drawing ON revisions(drawing_id);
CREATE INDEX IF NOT EXISTS idx_comments_drawing ON comments(drawing_id);
`);

// migração: sub-revisões (rebuild da tabela por causa do UNIQUE antigo)
try {
  const cols = db.prepare("PRAGMA table_info(revisions)").all().map(c => c.name);
  if (!cols.includes('subrev')) {
    const rebuild = db.transaction(() => {
      db.exec(`
        CREATE TABLE revisions_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          drawing_id INTEGER NOT NULL REFERENCES drawings(id) ON DELETE CASCADE,
          revisao INTEGER NOT NULL,
          subrev INTEGER NOT NULL DEFAULT 0,
          descricao TEXT DEFAULT '',
          dwg_path TEXT,
          pdf_path TEXT,
          original_name TEXT DEFAULT '',
          dwg_size INTEGER DEFAULT 0,
          pdf_size INTEGER DEFAULT 0,
          uploaded_by INTEGER REFERENCES users(id),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE (drawing_id, revisao, subrev)
        );
        INSERT INTO revisions_new (id, drawing_id, revisao, subrev, descricao, dwg_path, pdf_path, original_name, dwg_size, pdf_size, uploaded_by, created_at)
          SELECT id, drawing_id, revisao, 0, descricao, dwg_path, pdf_path, original_name, dwg_size, pdf_size, uploaded_by, created_at FROM revisions;
        DROP TABLE revisions;
        ALTER TABLE revisions_new RENAME TO revisions;
      `);
    });
    rebuild();
    console.log('Migração aplicada: revisions com subrev');
  }
} catch (e) {
  console.error('Falha na migração subrev:', e);
}

// migração: campos herdados do CadBank V1 (formato da folha e tag)
try {
  const cols = db.prepare("PRAGMA table_info(drawings)").all().map(c => c.name);
  if (!cols.includes('formato_folha')) db.exec("ALTER TABLE drawings ADD COLUMN formato_folha TEXT DEFAULT ''");
  if (!cols.includes('tag')) db.exec("ALTER TABLE drawings ADD COLUMN tag TEXT DEFAULT ''");
} catch (e) {
  console.error('Falha na migração formato_folha/tag:', e);
}

// seed admin
const admin = db.prepare("SELECT id FROM users WHERE username='admin'").get();
if (!admin) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare("INSERT INTO users (username, password_hash, full_name, role) VALUES ('admin', ?, 'Administrador', 'admin')").run(hash);
}

const DEFAULT_SETTINGS = {
  oda_path: '',
  backup_cron: '',
  backup_dir: '',
  auto_convert: '1'
};

const setStmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) setStmt.run(k, v);

module.exports = db;
