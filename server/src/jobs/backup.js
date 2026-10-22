const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const AdmZip = require('adm-zip');
const db = require('../db');
const { DATA_DIR, BACKUP_DIR } = require('../config');
const { requireAuth, requireRole } = require('../auth');

const express = require('express');
const router = express.Router();

let task = null;

function getSetting(key) {
  const r = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return r ? r.value : '';
}

function createBackup() {
  return new Promise((resolve, reject) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const zipPath = path.join(BACKUP_DIR, `cadbank-backup-${stamp}.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => {
      // limpar backups antigos (manter últimos 20)
      const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('cadbank-backup-')).sort();
      while (files.length > 20) fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
      resolve(zipPath);
    });
    archive.on('error', reject);
    archive.pipe(output);
    // snapshot consistente do DB
    const snapshot = path.join(DATA_DIR, `snapshot-${stamp}.db`);
    db.backup(snapshot)
      .then(() => {
        archive.file(snapshot, { name: 'cadbank.db' });
        archive.on('entry', () => {});
        archive.directory(path.join(DATA_DIR, 'files'), 'files');
        archive.finalize();
        archive.on('end', () => { try { fs.unlinkSync(snapshot); } catch {} });
      })
      .catch(reject);
  });
}

function reloadCron() {
  if (task) { task.stop(); task = null; }
  const expr = getSetting('backup_cron');
  if (expr && cron.validate(expr)) {
    task = cron.schedule(expr, () => createBackup().catch(() => {}));
  }
}

router.get('/list', requireAuth, requireRole('admin'), (req, res) => {
  const dir = getSetting('backup_dir') || BACKUP_DIR;
  const target = fs.existsSync(dir) ? dir : BACKUP_DIR;
  const items = fs.readdirSync(target)
    .filter(f => f.startsWith('cadbank-backup-') && f.endsWith('.zip'))
    .map(f => {
      const st = fs.statSync(path.join(target, f));
      return { name: f, size: st.size, created: st.mtime };
    }).sort((a, b) => b.name.localeCompare(a.name));
  res.json({ dir: target, items });
});

router.post('/create', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const p = await createBackup();
    res.json({ ok: true, file: path.basename(p) });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.get('/download/:name', requireAuth, requireRole('admin'), (req, res) => {
  if (!/^cadbank-backup-[\w\-]+\.zip$/.test(req.params.name)) return res.status(400).json({ error: 'Nome inválido' });
  const p = path.join(BACKUP_DIR, req.params.name);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'Backup não encontrado' });
  res.download(p);
});

router.post('/restore', requireAuth, requireRole('admin'), (req, res) => {
  const { name } = req.body || {};
  if (!name || !/^cadbank-backup-[\w\-]+\.zip$/.test(name)) return res.status(400).json({ error: 'Nome inválido' });
  const p = path.join(BACKUP_DIR, name);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'Backup não encontrado' });
  try {
    res.json({ ok: true, ...restoreZip(p) });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// restauração a partir de um arquivo .zip enviado pelo usuário
const multer = require('multer');
const uploadRestore = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, require('../config').TMP_DIR),
    filename: (req, file, cb) => cb(null, 'restore-' + Date.now() + '-' + file.originalname.replace(/[^\w.\-]/g, '_'))
  }),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }
});

router.post('/upload-restore', requireAuth, requireRole('admin'), uploadRestore.single('backup'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Envie o arquivo .zip do backup' });
  try {
    let zip;
    try {
      zip = new AdmZip(req.file.path);
    } catch {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'O arquivo enviado não é um .zip válido' });
    }
    if (!zip.getEntry('cadbank.db')) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'O arquivo enviado não é um backup do CadBank (sem cadbank.db)' });
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dest = path.join(BACKUP_DIR, `cadbank-backup-importado-${stamp}.zip`);
    fs.renameSync(req.file.path, dest);
    res.json({ ok: true, ...restoreZip(dest), file: path.basename(dest) });
  } catch (e) {
    try { fs.unlinkSync(req.file.path); } catch {}
    res.status(500).json({ error: String(e.message || e) });
  }
});

function restoreZip(p) {
  const zip = new AdmZip(p);
  const entry = zip.getEntry('cadbank.db');
  if (!entry) throw new Error('Backup sem banco de dados');
  // extrai arquivos
  const filesDir = path.join(DATA_DIR, 'files');
  zip.getEntries().forEach(e => {
    if (e.entryName.startsWith('files/')) {
      const dest = path.join(DATA_DIR, e.entryName);
      if (e.isDirectory) fs.mkdirSync(dest, { recursive: true });
      else { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, e.getData()); }
    }
  });
  const dbTarget = path.join(DATA_DIR, 'restore-pending.db');
  fs.writeFileSync(dbTarget, entry.getData());
  return { message: 'Backup extraído. O banco será restaurado ao reiniciar o servidor.' };
}

reloadCron();

module.exports = { router, createBackup, reloadCron };
