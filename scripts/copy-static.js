const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src', 'renderer');
const outDir = path.join(__dirname, '..', 'dist', 'renderer', 'renderer');

fs.mkdirSync(outDir, { recursive: true });

for (const file of ['index.html', 'styles.css']) {
  fs.copyFileSync(path.join(srcDir, file), path.join(outDir, file));
}

console.log('[copy-static] index.html + styles.css kopiert nach dist/renderer/renderer');
