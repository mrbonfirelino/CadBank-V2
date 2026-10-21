const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const archiver = require('archiver');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { revDir } = require('../storage');
const { TMP_DIR } = require('../config');
const { enqueue } = require('../jobs/converter');

const router = express.Router();

const upload = multer({
  dest: TMP_DIR,
  limits: { fileSize: 2 * 1024 * 1024 * 1024, files: 200 }
});

// ===== Exportar em lote =====
router.post('/export', requireAuth, (req, res) => {
  const { ids = [], format = 'dwg' } = req.body || {};
  if (!ids.length) return res.status(400).json({ error: 'Selecione pelo menos um desenho' });
  const placeholders = ids.map(() => '?').join(',');
  const revs = db.prepare(`
    SELECT r.*, d.codigo, d.nome FROM revisions r
    JOIN drawings d ON d.id = r.drawing_id
    WHERE r.drawing_id IN (${placeholders})
    AND r.id = (
      SELECT r2.id FROM revisions r2 WHERE r2.drawing_id = r.drawing_id
      ORDER BY r2.revisao DESC, r2.subrev DESC LIMIT 1)
  `).all(...ids);

  const zipPath = path.join(TMP_DIR, `export-${Date.now()}.zip`);
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 6 } });
  output.on('close', () => {
    res.download(zipPath, 'cadbank-export.zip', () => fs.unlink(zipPath, () => {}));
  });
  archive.on('error', () => res.status(500).json({ error: 'Falha ao gerar zip' }));
  archive.pipe(output);
  let count = 0;
  for (const r of revs) {
    const src = format === 'pdf' ? r.pdf_path : r.dwg_path;
    if (src && fs.existsSync(src)) {
      const ext = format === 'pdf' ? '.pdf' : path.extname(src);
      const label = r.subrev > 0 ? `R${r.revisao}.${r.subrev}` : `R${r.revisao}`;
      archive.file(src, { name: `${r.codigo} - ${r.nome} (${label})${ext}` });
      count++;
    }
  }
  if (!count) return res.status(404).json({ error: 'Nenhum arquivo encontrado no formato solicitado' });
  archive.finalize();
});

// ===== Importar em lote (zip com DWGs + meta.csv opcional) =====
// meta.csv (separador ;): codigo;nome;descricao;desenhista;projetista;empresa;planta;os;anotacoes
router.post('/import', requireAuth, requireRole('admin', 'editor'), upload.single('zip'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Envie um arquivo .zip' });
  const results = { imported: [], skipped: [], errors: [] };
  try {
    const zip = new AdmZip(req.file.path);
    // CSV
    const meta = {};
    const csvEntry = zip.getEntries().find(e => /^(meta|metadados)\.csv$/i.test(e.entryName));
    if (csvEntry) {
      const lines = csvEntry.getData().toString('utf8').split(/\r?\n/).filter(l => l.trim());
      for (const line of lines) {
        const cols = line.split(';');
        if (!cols[0] || /^codigo$/i.test(cols[0].trim())) continue;
        meta[cols[0].trim()] = {
          nome: cols[1] || '',
          descricao: cols[2] || '',
          desenhista: cols[3] || '',
          projetista: cols[4] || '',
          empresa: cols[5] || '',
          planta: cols[6] || '',
          formato_folha: cols[7] || '',
          tag: cols[8] || '',
          os: cols[9] || '',
          anotacoes: cols[10] || ''
        };
      }
    }
    const insertDrawing = db.prepare(`INSERT INTO drawings (codigo, nome, descricao, desenhista, projetista, empresa, planta, formato_folha, tag, os, anotacoes, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insertRev = db.prepare(`INSERT INTO revisions (drawing_id, revisao, original_name, dwg_path, dwg_size, uploaded_by)
      VALUES (?,?,?,?,?,?)`);
    const updDrawing = db.prepare("UPDATE drawings SET updated_at=datetime('now') WHERE id=?");

    const cadEntries = zip.getEntries().filter(e =>
      !e.isDirectory && /\.(dwg|dxf)$/i.test(e.entryName) && !/^meta/i.test(path.basename(e.entryName)));

    for (const e of cadEntries) {
      const base = path.basename(e.entryName);
      const codigo = path.basename(base, path.extname(base)).trim();
      if (!codigo) { results.errors.push(`${base}: nome inválido`); continue; }
      const exists = db.prepare('SELECT id FROM drawings WHERE codigo=?').get(codigo);
      if (exists) { results.skipped.push(codigo); continue; }
      const m = meta[codigo] || {};
      try {
        const info = insertDrawing.run(codigo, m.nome || codigo, m.descricao || '', m.desenhista || '',
          m.projetista || '', m.empresa || '', m.planta || '', m.formato_folha || '', m.tag || '', m.os || '', m.anotacoes || '', req.user.id);
        const drawingId = info.lastInsertRowid;
        const revId = insertRev.run(drawingId, 1, base, '', 0, req.user.id).lastInsertRowid;
        const dir = revDir(drawingId, revId);
        const dest = path.join(dir, 'drawing' + path.extname(base).toLowerCase());
        fs.writeFileSync(dest, e.getData());
        db.prepare('UPDATE revisions SET dwg_path=?, dwg_size=? WHERE id=?').run(dest, fs.statSync(dest).size, revId);
        updDrawing.run(drawingId);
        if (/\.dwg$/i.test(dest)) enqueue(revId);
        results.imported.push(codigo);
      } catch (err) {
        results.errors.push(`${codigo}: ${err.message}`);
      }
    }
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

// template CSV
router.get('/import/template', requireAuth, (req, res) => {
  res.type('text/csv; charset=utf-8');
  res.send('codigo;nome;descricao;desenhista;projetista;empresa;planta;formato_folha;tag;os;anotacoes\nEX-001;Exemplo;Descricao;Joao;Maria;Cliente X;Planta 1;A3;W1A53;OS 123;obs');
});

module.exports = router;
