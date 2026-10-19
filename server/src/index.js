const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { PORT, DATA_DIR } = require('./config');

// restauração pendente (backup restore) na inicialização
const pendingRestore = path.join(DATA_DIR, 'restore-pending.db');
const dbFile = path.join(DATA_DIR, 'cadbank.db');
if (fs.existsSync(pendingRestore)) {
  for (const f of [dbFile, dbFile + '-wal', dbFile + '-shm']) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  fs.renameSync(pendingRestore, dbFile);
  console.log('Banco de dados restaurado a partir do backup.');
}

const db = require('./db');
const authRoutes = require('./routes/auth');
const drawingRoutes = require('./routes/drawings');
const revisionRoutes = require('./routes/revisions');
const settingsRoutes = require('./routes/settings');
const batchRoutes = require('./routes/batch');
const logsRoutes = require('./routes/logs');
const { router: backupRouter } = require('./jobs/backup');
const logger = require('./jobs/logger');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/users', authRoutes); // rotas de usuários também em /auth
app.use('/api/drawings', drawingRoutes);
app.use('/api/drawings', revisionRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/batch', batchRoutes);
app.use('/api/backup', backupRouter);
app.use('/api/logs', logsRoutes);

app.use((err, req, res, next) => {
  logger.error('SERVER', `${req.method} ${req.url}: ${err.message}`, { stack: err.stack });
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// frontend build (produção)
const webDist = path.join(__dirname, '..', '..', 'web', 'dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`CadBank rodando em http://localhost:${PORT}`);
});
