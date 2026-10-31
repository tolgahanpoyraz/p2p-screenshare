import { DurableObject } from 'cloudflare:workers';
import {
  CloseCode,
  parseClientMessage,
  PING,
  PING_INTERVAL_MS,
  PONG,
  ROOM_CAPACITY,
  ROOM_ID_PATTERN,
  type ClientConfig,
  type ErrorCode,
  type IceServer,
  type PeerId,
  type ServerMessage,
} from '../shared/protocol.ts';

interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
}

interface Peer {
  id: PeerId;
  session: string;
  joinedAt: number;
  gone?: boolean;
}

const STUN: IceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'stun:stun.l.google.com:19302' }];
const TURN_TTL_S = 24 * 60 * 60;
const STALE_MS = 3 * PING_INTERVAL_MS;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/healthz') return new Response('ok');
    if (url.pathname === '/api/config') {
      const body: ClientConfig = { iceServers: await iceServers(env) };
      return Response.json(body, { headers: { 'cache-control': 'no-store' } });
    }
    if (url.pathname === '/ws') {
      if (request.headers.get('upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
      const roomId = url.searchParams.get('room') ?? '';
      if (!ROOM_ID_PATTERN.test(roomId)) return reject('bad-room', 'Invalid room id', CloseCode.BadRoom);
      return env.ROOMS.getByName(roomId).fetch(request);
    }
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;

export class Room extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
  }

  async fetch(request: Request) {
    const session = new URL(request.url).searchParams.get('session') ?? '';
    // A reconnecting client may beat us to noticing its old socket is dead.
    const stale = session && this.peers().find((p) => p.peer.session === session);
    if (stale) this.drop(stale.socket, false);
    const others = this.peers();
    if (others.length >= ROOM_CAPACITY) return reject('room-full', 'Room is full', CloseCode.RoomFull);

    const { 0: client, 1: socket } = new WebSocketPair();
    this.ctx.acceptWebSocket(socket);
    const peer: Peer = { id: crypto.randomUUID(), session, joinedAt: Date.now() };
    socket.serializeAttachment(peer);

    send(socket, { type: 'welcome', peerId: peer.id, peers: others.map((o) => o.peer.id) });
    for (const other of others) send(other.socket, { type: 'peer-joined', peerId: peer.id });
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + PING_INTERVAL_MS);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer) {
    const from = peerOf(socket);
    if (!from || from.gone) return;
    const message = typeof raw === 'string' ? parseClientMessage(raw) : null;
    if (!message) {
      send(socket, { type: 'error', code: 'bad-message', message: 'Malformed message' });
      return;
    }
    for (const other of this.peers()) {
      if (other.socket !== socket) send(other.socket, { type: 'signal', from: from.id, data: message.data });
    }
  }

  webSocketClose(socket: WebSocket) {
    this.drop(socket, true);
  }

  webSocketError(socket: WebSocket) {
    this.drop(socket, true);
  }

  // Phones on flaky networks often vanish without a TCP close; missing pings free their slot.
  async alarm() {
    const now = Date.now();
    for (const { socket, peer } of this.peers()) {
      const lastPing = this.ctx.getWebSocketAutoResponseTimestamp(socket)?.getTime() ?? 0;
      if (now - Math.max(lastPing, peer.joinedAt) > STALE_MS) this.drop(socket, true);
    }
    if (this.peers().length) await this.ctx.storage.setAlarm(now + PING_INTERVAL_MS);
  }

  private peers() {
    return this.ctx
      .getWebSockets()
      .map((socket) => ({ socket, peer: peerOf(socket) }))
      .filter((p): p is { socket: WebSocket; peer: Peer } => p.peer !== null && !p.peer.gone);
  }

  private drop(socket: WebSocket, announce: boolean) {
    const peer = peerOf(socket);
    if (!peer || peer.gone) return;
    socket.serializeAttachment({ ...peer, gone: true });
    try {
      socket.close(1000, 'Gone');
    } catch {}
    if (!announce) return;
    for (const other of this.peers()) send(other.socket, { type: 'peer-left', peerId: peer.id });
  }
}

function peerOf(socket: WebSocket) {
  return socket.deserializeAttachment() as Peer | null;
}

function send(socket: WebSocket, message: ServerMessage) {
  try {
    socket.send(JSON.stringify(message));
  } catch {}
}

function reject(code: ErrorCode, message: string, closeCode: number) {
  const { 0: client, 1: socket } = new WebSocketPair();
  socket.accept();
  send(socket, { type: 'error', code, message });
  socket.close(closeCode, message);
  return new Response(null, { status: 101, webSocket: client });
}

async function iceServers(env: Env): Promise<IceServer[]> {
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return STUN;
  const response = await fetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ttl: TURN_TTL_S }),
    },
  ).catch(() => null);
  if (!response?.ok) return STUN;
  const body = (await response.json()) as { iceServers: IceServer | IceServer[] };
  // Browsers time out on port 53, which only slows down connecting.
  return [body.iceServers].flat().map((server) => ({
    ...server,
    urls: [server.urls].flat().filter((url) => !/:53(\?|$)/.test(url)),
  }));
}
