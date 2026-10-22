const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { revDir } = require('../storage');
const { enqueue } = require('../jobs/converter');
const logger = require('../jobs/logger');

const router = express.Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(require('../config').TMP_DIR)),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^\w.\-]/g, '_'))
  }),
  limits: { fileSize: 512 * 1024 * 1024 }
});

router.get('/:id/revisions', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT r.id, r.revisao, r.subrev, r.descricao, r.original_name, r.dwg_size, r.pdf_size, r.created_at,
           u.username AS uploaded_by_name, j.status AS pdf_status
    FROM revisions r
    LEFT JOIN users u ON u.id = r.uploaded_by
    LEFT JOIN jobs j ON j.revision_id = r.id AND j.id = (
      SELECT MAX(j2.id) FROM jobs j2 WHERE j2.revision_id = r.id)
    WHERE r.drawing_id = ? ORDER BY r.revisao DESC, r.subrev DESC
  `).all(req.params.id);
  res.json(rows.map(r => ({ ...r, label: r.subrev > 0 ? `${r.revisao}.${r.subrev}` : String(r.revisao) })));
});

router.post('/:id/revisions', requireAuth, requireRole('admin', 'editor'), upload.single('dwg'), (req, res) => {
  const d = db.prepare('SELECT * FROM drawings WHERE id=?').get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Desenho não encontrado' });
  if (!req.file) return res.status(400).json({ error: 'Arquivo DWG obrigatório' });
  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!['.dwg', '.dxf'].includes(ext)) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Envie um arquivo .dwg ou .dxf' });
  }

  // validar assinatura: DWG real começa com AC10xx/AC1.x; DXF é texto com seções
  const fd = fs.openSync(req.file.path, 'r');
  const buf = Buffer.alloc(16);
  fs.readSync(fd, buf, 0, 16, 0);
  fs.closeSync(fd);
  const sig = buf.toString('latin1', 0, 6);
  if (ext === '.dwg' && !/^AC\d{4}/.test(sig) && !/^AC1\.[0-9]/.test(sig)) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: `O arquivo não parece ser um DWG válido (assinatura "${sig.replace(/[^\x20-\x7e]/g, '?')}"). Verifique se é realmente um desenho DWG.` });
  }

  // determinar revisão base e sub-revisão
  let revisao = parseInt(req.body.revisao, 10);
  let subrev = 0;
  let subrevision = false;
  const existing = db.prepare('SELECT * FROM revisions WHERE drawing_id=?').all(d.id);
  const last = existing.reduce((m, r) => (r.revisao > m ? r.revisao : m), -1);

  if (!Number.isInteger(revisao) || revisao < 0) {
    revisao = last + 1;
  } else if (existing.some(r => r.revisao === revisao)) {
    subrev = existing.filter(r => r.revisao === revisao).reduce((m, r) => (r.subrev > m ? r.subrev : m), 0) + 1;
    subrevision = true;
  }

  const info = db.prepare(`INSERT INTO revisions (drawing_id, revisao, subrev, descricao, uploaded_by, original_name, dwg_size)
    VALUES (?,?,?,?,?,?,?)`).run(d.id, revisao, subrev, (req.body.descricao || '').trim(), req.user.id, req.file.originalname, req.file.size);
  const revId = info.lastInsertRowid;
  const dir = revDir(d.id, revId);
  const dest = path.join(dir, 'drawing' + ext);
  fs.renameSync(req.file.path, dest);
  db.prepare('UPDATE revisions SET dwg_path=? WHERE id=?').run(dest, revId);
  db.prepare("UPDATE drawings SET updated_at=datetime('now') WHERE id=?").run(d.id);

  const auto = db.prepare("SELECT value FROM settings WHERE key='auto_convert'").get();
  if (auto && auto.value === '1' && ext === '.dwg') enqueue(revId);

  const label = subrev > 0 ? `${revisao}.${subrev}` : String(revisao);
  logger.info('REVISIONS', `Revisão R${label} enviada para desenho ${d.codigo}`, { subrevision, user: req.user.username });
  res.json({ id: revId, revisao, subrev, label, subrevision });
});

function downloadRev(req, res, format) {
  const rev = db.prepare('SELECT * FROM revisions WHERE id=? AND drawing_id=?').get(req.params.rid, req.params.id);
  if (!rev) return res.status(404).json({ error: 'Revisão não encontrada' });
  const p = format === 'pdf' ? rev.pdf_path : rev.dwg_path;
  if (!p || !fs.existsSync(p)) return res.status(404).json({ error: `Arquivo ${format.toUpperCase()} não disponível` });
  const base = `${rev.original_name.replace(/\.[^.]+$/, '')}-R${rev.subrev > 0 ? rev.revisao + '.' + rev.subrev : rev.revisao}`;
  res.download(p, base + (format === 'pdf' ? '.pdf' : path.extname(p)));
}

router.get('/:id/revisions/:rid/download/:format', requireAuth, (req, res) => {
  downloadRev(req, res, req.params.format);
});

// visualização inline (viewer usa token por query)
router.get('/:id/revisions/:rid/raw/:format', requireAuth, (req, res) => {
  const rev = db.prepare('SELECT * FROM revisions WHERE id=? AND drawing_id=?').get(req.params.rid, req.params.id);
  if (!rev) return res.status(404).json({ error: 'Revisão não encontrada' });
  const p = req.params.format === 'pdf' ? rev.pdf_path : rev.dwg_path;
  if (!p || !fs.existsSync(p)) return res.status(404).json({ error: 'Arquivo não disponível' });
  res.sendFile(path.resolve(p));
});

// plotar PDF manualmente
router.post('/:id/revisions/:rid/plot', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  const rev = db.prepare('SELECT * FROM revisions WHERE id=? AND drawing_id=?').get(req.params.rid, req.params.id);
  if (!rev) return res.status(404).json({ error: 'Revisão não encontrada' });
  if (!rev.dwg_path || !rev.dwg_path.toLowerCase().endsWith('.dwg')) {
    return res.status(400).json({ error: 'Conversão a PDF disponível apenas para DWG' });
  }
  const jobId = enqueue(rev.id, true);
  res.json({ jobId });
});

router.delete('/:id/revisions/:rid', requireAuth, requireRole('admin'), (req, res) => {
  const rev = db.prepare('SELECT * FROM revisions WHERE id=? AND drawing_id=?').get(req.params.rid, req.params.id);
  if (!rev) return res.status(404).json({ error: 'Revisão não encontrada' });
  db.prepare('DELETE FROM revisions WHERE id=?').run(rev.id);
  res.json({ ok: true });
});

module.exports = router;
