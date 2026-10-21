const fs = require('fs');
const lines = fs.readFileSync(require('path').join(__dirname, '..', 'data', 'import-v1', 'cadbank2025.sql'), 'utf8').split(/\r?\n/);
const s = lines.findIndex(l => l.startsWith('COPY public.usuarios '));
console.log(lines[s]);
for (let i = s + 1; i < lines.length && lines[i] !== '\\.'; i++) console.log(lines[i]);
