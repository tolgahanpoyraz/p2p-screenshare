import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createSignalingServer } from './server.ts';
import { CloseCode, type ServerMessage } from '../shared/protocol.ts';

const server = createSignalingServer({ heartbeatMs: 100 });
let base = '';

before(async () => {
  const port = await server.listen(0);
  base = `127.0.0.1:${port}`;
});
after(() => server.close());

class Client {
  socket: WebSocket;
  private inbox: ServerMessage[] = [];
  private waiters: ((m: ServerMessage) => void)[] = [];
  closed: Promise<number>;

  constructor(room: string, options: { autoPong?: boolean } = {}) {
    this.socket = new WebSocket(`ws://${base}/ws?room=${room}`, options);
    this.socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      const waiter = this.waiters.shift();
      if (waiter) waiter(message);
      else this.inbox.push(message);
    });
    this.closed = new Promise((done) => this.socket.on('close', (code) => done(code)));
  }

  next(): Promise<ServerMessage> {
    const queued = this.inbox.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((done) => this.waiters.push(done));
  }

  send(data: unknown) {
    this.socket.send(JSON.stringify(data));
  }
}

test('pairs two peers and relays signals', async () => {
  const alice = new Client('room-relay-1');
  const aliceWelcome = await alice.next();
  assert.equal(aliceWelcome.type, 'welcome');
  assert.deepEqual(aliceWelcome.type === 'welcome' && aliceWelcome.peers, []);

  const bob = new Client('room-relay-1');
  const bobWelcome = await bob.next();
  assert.ok(bobWelcome.type === 'welcome' && aliceWelcome.type === 'welcome');
  assert.deepEqual(bobWelcome.peers, [aliceWelcome.peerId]);
  assert.deepEqual(await alice.next(), { type: 'peer-joined', peerId: bobWelcome.peerId });

  const offer = { kind: 'description', description: { type: 'offer', sdp: 'v=0' } };
  bob.send({ type: 'signal', data: offer });
  assert.deepEqual(await alice.next(), { type: 'signal', from: bobWelcome.peerId, data: offer });

  bob.socket.close();
  assert.deepEqual(await alice.next(), { type: 'peer-left', peerId: bobWelcome.peerId });
  alice.socket.close();
});

test('rejects a third peer', async () => {
  const a = new Client('room-full-1');
  const b = new Client('room-full-1');
  await a.next();
  await b.next();

  const c = new Client('room-full-1');
  assert.equal((await c.next()).type, 'error');
  assert.equal(await c.closed, CloseCode.RoomFull);
  a.socket.close();
  b.socket.close();
});

test('rejects malformed room ids', async () => {
  const client = new Client('x');
  const message = await client.next();
  assert.ok(message.type === 'error' && message.code === 'bad-room');
  assert.equal(await client.closed, CloseCode.BadRoom);
});

test('reports malformed messages without relaying them', async () => {
  const a = new Client('room-bad-msg');
  const b = new Client('room-bad-msg');
  await a.next();
  await b.next();
  await a.next();

  b.send({ type: 'signal', data: { kind: 'nope' } });
  const reply = await b.next();
  assert.ok(reply.type === 'error' && reply.code === 'bad-message');
  a.socket.close();
  b.socket.close();
});

test('frees the slot when a peer stops answering pings', async () => {
  const a = new Client('room-heartbeat', { autoPong: false });
  await a.next();

  const b = new Client('room-heartbeat');
  await b.next();
  await a.closed;
  const c = new Client('room-heartbeat');
  assert.equal((await c.next()).type, 'welcome');
  b.socket.close();
  c.socket.close();
});

test('serves ICE config', async () => {
  const res = await fetch(`http://${base}/api/config`);
  assert.deepEqual(await res.json(), { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
});
