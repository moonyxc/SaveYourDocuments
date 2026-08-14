const { spawn } = require('child_process');
const net = require('net');

function waitForPort(port, host = '127.0.0.1', timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tryConnect = () => {
      const socket = new net.Socket();
      socket.setTimeout(1000);
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Zeitüberschreitung beim Warten auf Port ${port}`));
        } else {
          setTimeout(tryConnect, 250);
        }
      });
      socket.once('timeout', () => {
        socket.destroy();
        setTimeout(tryConnect, 250);
      });
      socket.connect(port, host);
    };
    tryConnect();
  });
}

const children = new Set();

function spawnProcess(command, args, env) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, ...env },
  });
  children.add(child);
  child.on('close', () => children.delete(child));
  return child;
}

function killAll() {
  for (const child of children) {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', shell: false });
      } else {
        child.kill('SIGTERM');
      }
    } catch {
      // Prozess bereits beendet
    }
  }
}

async function main() {
  const vite = spawnProcess('npx', ['vite']);

  try {
    await waitForPort(5173);
  } catch (error) {
    console.error(error.message);
    killAll();
    process.exit(1);
  }

  const electron = spawnProcess('npx', ['electron', '.'], { NODE_ENV: 'development' });

  electron.on('close', () => {
    killAll();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    killAll();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    killAll();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error(error);
  killAll();
  process.exit(1);
});
