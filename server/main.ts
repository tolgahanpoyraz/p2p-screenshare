import { resolve } from 'node:path';
import { createSignalingServer } from './server.ts';
import type { IceServer } from '../shared/protocol.ts';

const iceServers: IceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
if (process.env.TURN_URLS) {
  iceServers.push({
    urls: process.env.TURN_URLS.split(','),
    username: process.env.TURN_USERNAME,
    credential: process.env.TURN_CREDENTIAL,
  });
}

const server = createSignalingServer({
  staticDir: resolve(import.meta.dirname, '../client/dist'),
  iceServers,
});

const port = await server.listen(Number(process.env.PORT ?? 8787));
console.log(`signaling server on http://localhost:${port}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close().then(() => process.exit(0)));
}
