const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const targets = ['dist', 'release', 'out'];

for (const target of targets) {
  const p = path.join(root, target);
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
    console.log(`[clean] geloescht: ${target}`);
  }
}
console.log('[clean] fertig');
