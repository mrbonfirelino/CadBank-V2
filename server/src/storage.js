const path = require('path');
const fs = require('fs');
const { FILES_DIR } = require('./config');

function revDir(drawingId, revId) {
  const d = path.join(FILES_DIR, String(drawingId), String(revId));
  fs.mkdirSync(d, { recursive: true });
  return d;
}

module.exports = { revDir };
