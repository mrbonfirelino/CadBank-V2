const express = require('express');
const fs = require('fs');
const path = require('path');
const { requireAuth, requireRole } = require('../auth');
const logger = require('../jobs/logger');

const router = express.Router();

// log enviado pelo frontend (erros do viewer, etc.)
router.post('/client', requireAuth, (req, res) => {
  const { message, stack, context } = req.body || {};
  logger.error('CLIENT', message || 'Erro desconhecido no cliente', { stack, ...(context ? { context } : {}) });
  res.json({ ok: true });
});

router.get('/', requireAuth, requireRole('admin'), (req, res) => {
  const files = fs.readdirSync(logger.LOGS_DIR)
    .filter(f => f.startsWith('app-') && f.endsWith('.log'))
    .sort()
    .reverse()
    .map(f => {
      const st = fs.statSync(path.join(logger.LOGS_DIR, f));
      return { name: f, date: f.replace('app-', '').replace('.log', ''), size: st.size };
    });
  res.json({ files });
});

router.get('/:date', requireAuth, requireRole('admin'), (req, res) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date)) return res.status(400).json({ error: 'Data inválida' });
  const p = path.join(logger.LOGS_DIR, `app-${req.params.date}.log`);
  if (!fs.existsSync(p)) return res.json({ lines: [] });
  const raw = fs.readFileSync(p, 'utf8');
  const lines = [];
  for (const block of raw.split(/\n(?=\[\d{4}-)/)) {
    const seg = block.split('\n');
    const first = seg[0];
    const m = first.match(/^\[([^\]]+)\] \[([^\]]+)\] \[([^\]]+)\] (.*)$/s);
    if (!m) continue;
    lines.push({
      ts: m[1],
      level: m[2],
      source: m[3],
      message: m[4],
      detail: seg.slice(1).join('\n') || ''
    });
  }
  res.json({ lines: lines.reverse() });
});

router.get('/:date/download', requireAuth, requireRole('admin'), (req, res) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date)) return res.status(400).json({ error: 'Data inválida' });
  const p = path.join(logger.LOGS_DIR, `app-${req.params.date}.log`);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'Log não encontrado' });
  res.download(p, `cadbank-log-${req.params.date}.log`);
});

router.delete('/:date', requireAuth, requireRole('admin'), (req, res) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date)) return res.status(400).json({ error: 'Data inválida' });
  const p = path.join(logger.LOGS_DIR, `app-${req.params.date}.log`);
  if (fs.existsSync(p)) fs.unlinkSync(p);
  res.json({ ok: true });
});

module.exports = router;
