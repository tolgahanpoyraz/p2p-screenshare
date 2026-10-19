import { build, type BuildOptions } from 'esbuild';

const shared: BuildOptions = {
  bundle: true,
  platform: 'node',
  external: ['electron'],
  logLevel: 'warning',
};

await Promise.all([
  build({ ...shared, entryPoints: ['desktop/main.ts'], format: 'esm', outfile: 'dist/desktop/main.mjs' }),
  build({ ...shared, entryPoints: ['desktop/preload.ts'], format: 'cjs', outfile: 'dist/desktop/preload.cjs' }),
  build({
    ...shared,
    entryPoints: ['scripts/e2e/voice.ts', 'scripts/e2e/desktop.ts', 'scripts/e2e/screen.ts', 'scripts/e2e/camera.ts'],
    format: 'esm',
    outdir: 'dist/e2e',
    outExtension: { '.js': '.mjs' },
  }),
]);
