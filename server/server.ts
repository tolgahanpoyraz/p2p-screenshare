import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  CloseCode,
  ROOM_CAPACITY,
  ROOM_ID_PATTERN,
  type ClientConfig,
  type ClientMessage,
  type IceServer,
  type PeerId,
  type ServerMessage,
} from '../shared/protocol.ts';

interface Peer {
  id: PeerId;
  socket: WebSocket;
  alive: boolean;
}

export interface ServerOptions {
  staticDir?: string;
  iceServers?: IceServer[];
  heartbeatMs?: number;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export function createSignalingServer(options: ServerOptions = {}) {
  const staticDir = options.staticDir && resolve(options.staticDir);
  const iceServers = options.iceServers ?? [{ urls: 'stun:stun.l.google.com:19302' }];
  const rooms = new Map<string, Map<PeerId, Peer>>();

  const http = createServer((req, res) => {
    handleHttp(req, res).catch(() => {
      res.writeHead(500).end();
    });
  });

  async function handleHttp(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      return;
    }
    if (url.pathname === '/api/config') {
      const body: ClientConfig = { iceServers };
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
      return;
    }
    if (!staticDir || req.method !== 'GET') {
      res.writeHead(404).end();
      return;
    }

    const file = resolve(staticDir, '.' + decodeURIComponent(url.pathname));
    if (file !== staticDir && !file.startsWith(staticDir + sep)) {
      res.writeHead(403).end();
      return;
    }
    // Unknown paths like /r/<roomId> fall back to the single-page app.
    const served =
      (await tryRead(file)) ?? (await tryRead(resolve(staticDir, 'index.html')));
    if (!served) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(served.path)] ?? 'application/octet-stream' });
    res.end(served.data);
  }

  const wss = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024 });

  http.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => join(ws, url.searchParams.get('room') ?? ''));
  });

  function send(ws: WebSocket, message: ServerMessage) {
    ws.send(JSON.stringify(message));
  }

  function join(socket: WebSocket, roomId: string) {
    if (!ROOM_ID_PATTERN.test(roomId)) {
      send(socket, { type: 'error', code: 'bad-room', message: 'Invalid room id' });
      socket.close(CloseCode.BadRoom);
      return;
    }

    const room = rooms.get(roomId) ?? new Map<PeerId, Peer>();
    if (room.size >= ROOM_CAPACITY) {
      send(socket, { type: 'error', code: 'room-full', message: 'Room is full' });
      socket.close(CloseCode.RoomFull);
      return;
    }
    rooms.set(roomId, room);

    const peer: Peer = { id: randomUUID(), socket, alive: true };
    const others = [...room.values()];
    room.set(peer.id, peer);

    send(socket, { type: 'welcome', peerId: peer.id, peers: others.map((p) => p.id) });
    for (const other of others) send(other.socket, { type: 'peer-joined', peerId: peer.id });

    socket.on('pong', () => {
      peer.alive = true;
    });

    socket.on('message', (raw) => {
      const message = parse(raw.toString());
      if (!message) {
        send(socket, { type: 'error', code: 'bad-message', message: 'Malformed message' });
        return;
      }
      for (const other of room.values()) {
        if (other !== peer) send(other.socket, { type: 'signal', from: peer.id, data: message.data });
      }
    });

    socket.on('close', () => {
      room.delete(peer.id);
      if (room.size === 0) rooms.delete(roomId);
      for (const other of room.values()) send(other.socket, { type: 'peer-left', peerId: peer.id });
    });
  }

  // Phones on flaky networks often vanish without a TCP close; pings let us notice and free the slot.
  const heartbeat = setInterval(() => {
    for (const room of rooms.values()) {
      for (const peer of room.values()) {
        if (!peer.alive) {
          peer.socket.terminate();
          continue;
        }
        peer.alive = false;
        peer.socket.ping();
      }
    }
  }, options.heartbeatMs ?? 25_000);

  return {
    listen(port: number): Promise<number> {
      return new Promise((done) => {
        http.listen(port, () => {
          const address = http.address();
          done(typeof address === 'object' && address ? address.port : port);
        });
      });
    },
    close(): Promise<void> {
      clearInterval(heartbeat);
      for (const client of wss.clients) client.terminate();
      return new Promise((done) => http.close(() => done()));
    },
  };
}

function parse(raw: string): ClientMessage | null {
  try {
    const message = JSON.parse(raw);
    const kind = message?.data?.kind;
    if (message?.type === 'signal' && (kind === 'description' || kind === 'candidate')) {
      return message;
    }
  } catch {}
  return null;
}

async function tryRead(path: string) {
  try {
    return { path, data: await readFile(path) };
  } catch {
    return null;
  }
}
