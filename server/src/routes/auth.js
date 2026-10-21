const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { sign, requireAuth, requireRole } = require('../auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Informe usuário e senha' });
  const user = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if (!user || !user.active || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Usuário ou senha inválidos' });
  }
  res.json({ token: sign(user), user: { id: user.id, username: user.username, role: user.role, full_name: user.full_name } });
});

router.get('/me', requireAuth, (req, res) => res.json(req.user));

router.put('/me/password', requireAuth, (req, res) => {
  const { current, next } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!bcrypt.compareSync(current || '', u.password_hash)) return res.status(400).json({ error: 'Senha atual incorreta' });
  if (!next || next.length < 4) return res.status(400).json({ error: 'Nova senha muito curta' });
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(next, 10), req.user.id);
  res.json({ ok: true });
});

// ---- users (admin) ----
router.get('/users', requireAuth, requireRole('admin'), (req, res) => {
  res.json(db.prepare('SELECT id, username, full_name, role, active, created_at FROM users ORDER BY username').all());
});

router.post('/users', requireAuth, requireRole('admin'), (req, res) => {
  const { username, password, full_name, role } = req.body || {};
  if (!username || !password || !['admin', 'editor', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'Dados inválidos' });
  }
  try {
    const info = db.prepare('INSERT INTO users (username, password_hash, full_name, role) VALUES (?,?,?,?)')
      .run(username, bcrypt.hashSync(password, 10), full_name || '', role);
    res.json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: 'Usuário já existe' });
  }
});

router.put('/users/:id', requireAuth, requireRole('admin'), (req, res) => {
  const { full_name, role, active, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });
  if (u.username === 'admin' && (role === 'viewer' || role === 'editor' || active === 0)) {
    return res.status(400).json({ error: 'Não é possível rebaixar/desativar o admin padrão' });
  }
  db.prepare('UPDATE users SET full_name=?, role=?, active=? WHERE id=?')
    .run(full_name ?? u.full_name, role ?? u.role, active ?? u.active, u.id);
  if (password) db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(password, 10), u.id);
  res.json({ ok: true });
});

router.delete('/users/:id', requireAuth, requireRole('admin'), (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Não encontrado' });
  if (u.username === 'admin') return res.status(400).json({ error: 'Não é possível excluir o admin padrão' });
  if (req.user.id === u.id) return res.status(400).json({ error: 'Não é possível excluir o seu próprio usuário' });
  db.transaction(() => {
    db.prepare('UPDATE comments SET user_id=NULL WHERE user_id=?').run(u.id);
    db.prepare('UPDATE revisions SET uploaded_by=NULL WHERE uploaded_by=?').run(u.id);
    db.prepare('UPDATE drawings SET created_by=NULL WHERE created_by=?').run(u.id);
    db.prepare('DELETE FROM users WHERE id=?').run(u.id);
  })();
  res.json({ ok: true });
});

module.exports = router;
