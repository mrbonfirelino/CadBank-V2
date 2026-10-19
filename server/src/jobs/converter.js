const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { TMP_DIR } = require('../config');
const logger = require('./logger');

let running = false;

function getSetting(key) {
  const r = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return r ? r.value : '';
}

function convertWithODA(dwgPath, rev) {
  return new Promise((resolve, reject) => {
    const odaPath = getSetting('oda_path');
    if (!odaPath || !fs.existsSync(odaPath)) {
      return reject(new Error('ODA File Converter não configurado (Configurações → Caminho do ODAFileConverter.exe)'));
    }
    const inDir = path.join(TMP_DIR, `job-${rev.id}-${Date.now()}`);
    const outDir = inDir + '-out';
    fs.mkdirSync(inDir, { recursive: true });
    fs.mkdirSync(outDir, { recursive: true });
    fs.copyFileSync(dwgPath, path.join(inDir, path.basename(dwgPath)));
    // ODAFileConverter <in> <out> version type recurse audit [filter]
    const proc = spawn(odaPath, [inDir, outDir, 'ACAD2018', 'DWG', '0', '1', '*.DWG'], {
      windowsHide: true
    });
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d; });
    proc.on('close', code => {
      const pdf = path.join(outDir, path.basename(dwgPath).replace(/\.[^.]+$/i, '.pdf'));
      if (fs.existsSync(pdf)) return resolve(pdf);
      reject(new Error(`ODA falhou (código ${code}). ${stderr.slice(0, 300)}`));
    });
    proc.on('error', err => reject(new Error('Falha ao executar ODA: ' + err.message)));
  });
}

async function processQueue() {
  if (running) return;
  running = true;
  try {
    while (true) {
      const job = db.prepare("SELECT * FROM jobs WHERE status='pending' ORDER BY id LIMIT 1").get();
      if (!job) break;
      db.prepare("UPDATE jobs SET status='running' WHERE id=?").run(job.id);
      const rev = db.prepare('SELECT * FROM revisions WHERE id=?').get(job.revision_id);
      try {
        if (!rev || !rev.dwg_path || !fs.existsSync(rev.dwg_path)) throw new Error('DWG da revisão não encontrado');
        const pdf = await convertWithODA(rev.dwg_path, rev);
        const dest = path.join(path.dirname(rev.dwg_path), 'drawing.pdf');
        fs.copyFileSync(pdf, dest);
        db.prepare('UPDATE revisions SET pdf_path=?, pdf_size=? WHERE id=?').run(dest, fs.statSync(dest).size, rev.id);
        db.prepare("UPDATE jobs SET status='done', finished_at=datetime('now'), error='' WHERE id=?").run(job.id);
      } catch (e) {
        logger.error('CONVERTER', `Falha na conversão DWG→PDF da revisão ${rev ? rev.id : job.revision_id}: ${e.message || e}`);
        db.prepare("UPDATE jobs SET status='error', finished_at=datetime('now'), error=? WHERE id=?").run(String(e.message || e), job.id);
      } finally {
        // limpeza temp
        const tmpIn = path.join(TMP_DIR, `job-${rev ? rev.id : 'x'}-`);
      }
    }
  } finally {
    running = false;
  }
}

function enqueue(revisionId, force = false) {
  if (force) {
    db.prepare("DELETE FROM jobs WHERE revision_id=? AND status IN ('pending','running','error')").run(revisionId);
  }
  const info = db.prepare("INSERT INTO jobs (revision_id) VALUES (?)").run(revisionId);
  setImmediate(processQueue);
  return info.lastInsertRowid;
}

setInterval(processQueue, 15000).unref();

module.exports = { enqueue, processQueue };
