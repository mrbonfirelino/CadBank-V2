const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config');

const LOGS_DIR = path.join(DATA_DIR, 'logs');
fs.mkdirSync(LOGS_DIR, { recursive: true });

const RETENTION_DAYS = 30;

function logFile(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return path.join(LOGS_DIR, `app-${y}-${m}-${d}.log`);
}

function write(level, source, message, extra) {
  try {
    const ts = new Date().toISOString();
    let line = `[${ts}] [${level}] [${source}] ${message}`;
    if (extra) {
      if (extra.stack) line += `\n${extra.stack}`;
      else if (typeof extra === 'object') {
        try { line += ` | ${JSON.stringify(extra).slice(0, 2000)}`; } catch {}
      } else line += ` | ${String(extra).slice(0, 2000)}`;
    }
    fs.appendFileSync(logFile(), line + '\n');
  } catch { /* nunca quebrar por log */ }
}

function error(source, message, extra) { write('ERROR', source, message, extra); }
function warn(source, message, extra) { write('WARN', source, message, extra); }
function info(source, message, extra) { write('INFO', source, message, extra); }

function cleanupOldLogs() {
  try {
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    for (const f of fs.readdirSync(LOGS_DIR)) {
      const p = path.join(LOGS_DIR, f);
      if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p);
    }
  } catch { /* ignore */ }
}

cleanupOldLogs();
setInterval(cleanupOldLogs, 24 * 60 * 60 * 1000).unref();

module.exports = { error, warn, info, LOGS_DIR, cleanupOldLogs };
