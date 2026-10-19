const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  res.json(out);
});

router.put('/', requireAuth, requireRole('admin'), (req, res) => {
  const allowed = ['oda_path', 'backup_cron', 'backup_dir', 'auto_convert'];
  for (const [k, v] of Object.entries(req.body || {})) {
    if (!allowed.includes(k)) continue;
    db.prepare('UPDATE settings SET value=? WHERE key=?').run(String(v ?? ''), k);
  }
  // recarregar cron de backup
  require('../jobs/backup').reloadCron();
  res.json({ ok: true });
});

module.exports = router;
