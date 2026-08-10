// Fuehrt Electron-postinstall aus, da npm allowScripts blockiert.
// Fallback: laedt die ZIP direkt von GitHub, wenn install.js nichts tut.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

const electronDir = path.join(__dirname, '..', 'node_modules', 'electron');
const distDir = path.join(electronDir, 'dist');
const pathTxt = path.join(electronDir, 'path.txt');
const installScript = path.join(electronDir, 'install.js');

function installed() {
  return fs.existsSync(pathTxt) && fs.existsSync(distDir) && fs.readdirSync(distDir).length > 0;
}

function runInstallJs() {
  if (!fs.existsSync(installScript)) return;
  try {
    execSync('node install.js', { cwd: electronDir, stdio: 'inherit' });
  } catch (err) {
    console.warn('[postinstall] install.js fehlgeschlagen:', err.message);
  }
}

function platformZipName(version) {
  const plat = process.platform;
  const arch = process.arch;
  const map = {
    win32: `electron-v${version}-win32-${arch}.zip`,
    linux: `electron-v${version}-linux-${arch}.zip`,
    darwin: `electron-v${version}-darwin-${arch}.zip`
  };
  return map[plat];
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close();
        return resolve(download(res.headers.location, dest));
      }
      if (res.statusCode !== 200) {
        file.close();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
  });
}

async function manualDownload() {
  const pkg = JSON.parse(fs.readFileSync(path.join(electronDir, 'package.json'), 'utf-8'));
  const version = pkg.version;
  const zipName = platformZipName(version);
  if (!zipName) {
    console.warn('[postinstall] Unbekannte Plattform fuer manuellen Download');
    return;
  }
  const url = `https://github.com/electron/electron/releases/download/v${version}/${zipName}`;
  const tmpZip = path.join(os.tmpdir(), zipName);
  console.log('[postinstall] Lade Electron manuell:', url);
  try {
    await download(url, tmpZip);
    fs.mkdirSync(distDir, { recursive: true });
    // Entpacken via PowerShell (Windows) oder unzip
    if (process.platform === 'win32') {
      execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${tmpZip}' -DestinationPath '${distDir}' -Force"`, { stdio: 'inherit' });
    } else {
      execSync(`unzip -o '${tmpZip}' -d '${distDir}'`, { stdio: 'inherit' });
    }
    // path.txt enthaelt den Pfad relativ zu node_modules/electron/ (nicht zu dist/)
    const exeName = process.platform === 'win32' ? 'electron.exe' : process.platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron' : 'electron';
    fs.writeFileSync(pathTxt, exeName);
    fs.rmSync(tmpZip, { force: true });
    console.log('[postinstall] Electron installiert.');
  } catch (err) {
    console.warn('[postinstall] Manueller Download fehlgeschlagen:', err.message);
  }
}

(async () => {
  if (installed()) {
    console.log('[postinstall] Electron bereits installiert.');
    return;
  }
  console.log('[postinstall] Installiere Electron...');
  runInstallJs();
  if (!installed()) {
    await manualDownload();
  }
  if (installed()) {
    console.log('[postinstall] OK');
  } else {
    console.warn('[postinstall] Electron konnte nicht installiert werden.');
  }
})();
