import { spawn, type ChildProcess } from 'node:child_process';

const children: ChildProcess[] = [];

function start(name: string, command: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = `[${name}] `;
  const forward = (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n')) {
      if (line.trim() && !line.includes('Electron Security Warning')) console.log(prefix + line);
    }
  };
  child.stdout?.on('data', forward);
  child.stderr?.on('data', forward);
  children.push(child);
  return child;
}

async function waitForHttp(url: string) {
  for (;;) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}

function shutdown() {
  for (const child of children) child.kill();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start('server', 'node', ['--watch', 'server/main.ts']);
start('vite', 'npx', ['vite', 'client', '--port', '5173', '--strictPort']);
await waitForHttp('http://localhost:5173');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
start('build', 'node', ['scripts/build-desktop.ts']).on('exit', () => {
  start('app', 'npx', ['electron', 'dist/desktop/main.mjs'], env).on('exit', shutdown);
});
