const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.CADBANK_DATA_DIR || path.join(ROOT, 'data');
const FILES_DIR = path.join(DATA_DIR, 'files');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const TMP_DIR = path.join(DATA_DIR, 'tmp');

for (const d of [DATA_DIR, FILES_DIR, BACKUP_DIR, TMP_DIR]) {
  fs.mkdirSync(d, { recursive: true });
}

const JWT_SECRET = process.env.CADBANK_JWT_SECRET || crypto.randomBytes(32).toString('hex');
const PORT = parseInt(process.env.CADBANK_PORT || '3000', 10);

module.exports = { ROOT, DATA_DIR, FILES_DIR, BACKUP_DIR, TMP_DIR, JWT_SECRET, PORT };
