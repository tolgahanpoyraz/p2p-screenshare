import { execSync, spawn } from 'node:child_process';
import electron from 'electron';
import { createSignalingServer } from '../../server/server.ts';

const tests = process.argv.slice(2).length ? process.argv.slice(2) : ['voice', 'desktop'];

execSync('vite build client --logLevel warn && node scripts/build-desktop.ts', { stdio: 'inherit' });

const server = createSignalingServer({ staticDir: 'client/dist' });
const port = await server.listen(0);
const env: NodeJS.ProcessEnv = { ...process.env, BASE_URL: `http://localhost:${port}` };
delete env.ELECTRON_RUN_AS_NODE;

let failed = 0;
for (const test of tests) {
  console.log(test);
  const code = await new Promise<number | null>((done) => {
    const child = spawn(electron as unknown as string, [`dist/e2e/${test}.mjs`], { env, stdio: ['ignore', 'inherit', 'pipe'] });
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      if (!text.includes('Electron Security Warning')) process.stderr.write(text);
    });
    child.on('exit', done);
  });
  if (code !== 0) failed++;
}

await server.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
