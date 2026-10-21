const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();

const SEARCHABLE = {
  codigo: 'd.codigo',
  nome: 'd.nome',
  descricao: 'd.descricao',
  desenhista: 'd.desenhista',
  projetista: 'd.projetista',
  empresa: 'd.empresa',
  planta: 'd.planta',
  formato_folha: 'd.formato_folha',
  tag: 'd.tag',
  os: 'd.os',
  anotacoes: 'd.anotacoes'
};

function buildAdvancedQuery(criterias, hasAttachment, simple) {
  let where = ['1=1'];
  const params = [];
  if (simple && simple.trim()) {
    const like = `%${simple.trim()}%`;
    where.push(`(${Object.values(SEARCHABLE).map(c => `${c} LIKE ?`).join(' OR ')})`);
    params.push(...Object.values(SEARCHABLE).map(() => like));
  }
  for (const c of criterias || []) {
    const col = SEARCHABLE[c.field];
    if (!col) continue;
    const op = (c.op || 'contains').toLowerCase();
    if (op === 'contains') { where.push(`${col} LIKE ?`); params.push(`%${c.value}%`); }
    else if (op === 'equals') { where.push(`${col} = ?`); params.push(c.value); }
    else if (op === 'starts') { where.push(`${col} LIKE ?`); params.push(`${c.value}%`); }
    else if (op === 'empty') { where.push(`(${col} IS NULL OR ${col} = '')`); }
    else if (op === 'notempty') { where.push(`(${col} IS NOT NULL AND ${col} != '')`); }
  }
  if (hasAttachment === true) {
    where.push('EXISTS (SELECT 1 FROM revisions r WHERE r.drawing_id = d.id AND r.dwg_path IS NOT NULL)');
  } else if (hasAttachment === false) {
    where.push('NOT EXISTS (SELECT 1 FROM revisions r WHERE r.drawing_id = d.id AND r.dwg_path IS NOT NULL)');
  }
  return { whereSql: where.join(' AND '), params };
}

router.get('/', requireAuth, (req, res) => {
  const { simple, sort = 'updated_at', dir = 'desc', page = 1, pageSize = 25 } = req.query;
  let criterias = null;
  let hasAttachment = undefined;
  try {
    if (req.query.criterias) criterias = JSON.parse(req.query.criterias);
    if (req.query.hasAttachment !== undefined && req.query.hasAttachment !== '') hasAttachment = req.query.hasAttachment === 'true';
  } catch { /* ignore */ }

  const { whereSql, params } = buildAdvancedQuery(criterias, hasAttachment, simple || '');
  const sortCol = { updated_at: 'd.updated_at', created_at: 'd.created_at', codigo: 'd.codigo', nome: 'd.nome' }[sort] || 'd.updated_at';
  const sortDir = String(dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const limit = Math.min(parseInt(pageSize, 10) || 25, 200);
  const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limit;

  const base = `FROM drawings d WHERE ${whereSql}`;
  const total = db.prepare(`SELECT COUNT(*) c ${base}`).get(...params).c;
  const items = db.prepare(`
    SELECT d.*,
      EXISTS (SELECT 1 FROM revisions r WHERE r.drawing_id = d.id AND r.dwg_path IS NOT NULL) AS has_attachment,
      (SELECT CASE WHEN r2.subrev > 0 THEN printf('%d.%d', r2.revisao, r2.subrev) ELSE printf('%d', r2.revisao) END
         FROM revisions r2 WHERE r2.drawing_id = d.id
         ORDER BY r2.revisao DESC, r2.subrev DESC LIMIT 1) AS ultima_revisao,
      (SELECT COUNT(*) FROM revisions r WHERE r.drawing_id = d.id) AS total_revisoes,
      (SELECT r2.pdf_path IS NOT NULL FROM revisions r2 WHERE r2.drawing_id = d.id
         ORDER BY r2.revisao DESC, r2.subrev DESC LIMIT 1) AS has_pdf
    ${base} ORDER BY ${sortCol} ${sortDir} LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  res.json({ total, page: parseInt(page, 10) || 1, pageSize: limit, items });
});

router.get('/:id', requireAuth, (req, res) => {
  const d = db.prepare('SELECT * FROM drawings WHERE id=?').get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Desenho não encontrado' });
  res.json(d);
});

function cleanFields(body) {
  const f = {};
  for (const k of ['codigo', 'nome', 'descricao', 'desenhista', 'projetista', 'empresa', 'planta', 'formato_folha', 'tag', 'os', 'anotacoes']) {
    f[k] = typeof body[k] === 'string' ? body[k].trim() : '';
  }
  return f;
}

router.post('/', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  const f = cleanFields(req.body || {});
  if (!f.codigo || !f.nome) return res.status(400).json({ error: 'Código e Nome são obrigatórios' });
  try {
    const info = db.prepare(`INSERT INTO drawings (codigo, nome, descricao, desenhista, projetista, empresa, planta, formato_folha, tag, os, anotacoes, created_by)
      VALUES (@codigo, @nome, @descricao, @desenhista, @projetista, @empresa, @planta, @formato_folha, @tag, @os, @anotacoes, @created_by)`)
      .run({ ...f, created_by: req.user.id });
    res.json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: 'Código de desenho já existe' });
  }
});

router.put('/:id', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  const d = db.prepare('SELECT * FROM drawings WHERE id=?').get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Desenho não encontrado' });
  const f = cleanFields(req.body || {});
  if (!f.codigo || !f.nome) return res.status(400).json({ error: 'Código e Nome são obrigatórios' });
  try {
    db.prepare(`UPDATE drawings SET codigo=@codigo, nome=@nome, descricao=@descricao, desenhista=@desenhista,
      projetista=@projetista, empresa=@empresa, planta=@planta, formato_folha=@formato_folha, tag=@tag, os=@os, anotacoes=@anotacoes,
      updated_at=datetime('now') WHERE id=@id`).run({ ...f, id: d.id });
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: 'Código de desenho já existe' });
  }
});

router.delete('/:id', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  const d = db.prepare('SELECT * FROM drawings WHERE id=?').get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Desenho não encontrado' });
  db.prepare('DELETE FROM drawings WHERE id=?').run(d.id);
  res.json({ ok: true });
});

router.get('/:id/comments', requireAuth, (req, res) => {
  res.json(db.prepare(`
    SELECT c.id, c.texto, c.created_at, u.username, u.full_name
    FROM comments c LEFT JOIN users u ON u.id = c.user_id
    WHERE c.drawing_id = ? ORDER BY c.created_at DESC
  `).all(req.params.id));
});

router.post('/:id/comments', requireAuth, (req, res) => {
  const { texto } = req.body || {};
  if (!texto || !texto.trim()) return res.status(400).json({ error: 'Comentário vazio' });
  const info = db.prepare('INSERT INTO comments (drawing_id, user_id, texto) VALUES (?,?,?)')
    .run(req.params.id, req.user.id, texto.trim());
  res.json({ id: info.lastInsertRowid });
});

router.delete('/:id/comments/:cid', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  db.prepare('DELETE FROM comments WHERE id=? AND drawing_id=?').run(req.params.cid, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
