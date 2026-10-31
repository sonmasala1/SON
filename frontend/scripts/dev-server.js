const net = require('net');
const { execFileSync, spawn } = require('child_process');
const path = require('path');

const port = 3000;

function canListen() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', error => resolve({ available: false, error }));
    server.once('listening', () => server.close(() => resolve({ available: true })));
    server.listen(port, '::');
  });
}

function findOwningPid() {
  if (process.platform === 'win32') {
    try {
      const output = execFileSync('netstat.exe', ['-ano', '-p', 'tcp'], { encoding: 'utf8' });
      const row = output.split(/\r?\n/)
        .find(line => /\sLISTENING\s+\d+\s*$/.test(line) && line.includes(`:${port}`));
      return row ? Number(row.trim().split(/\s+/).pop()) || null : null;
    } catch {}
  }
  return null;
}

canListen().then(({ available }) => {
  if (!available) {
    const pid = findOwningPid();
    console.error(`Port 3000 is already in use${pid ? ` (PID ${pid})` : ''}.`);
    console.error('Stop that process before running npm run dev. SON MASALA does not start on another port.');
    process.exit(1);
  }

  const nextCli = path.resolve(__dirname, '..', 'node_modules', 'next', 'dist', 'bin', 'next');
  const child = spawn(process.execPath, [nextCli, 'dev', '-p', String(port)], {
    cwd: path.resolve(__dirname, '..'),
    env: process.env,
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
});
