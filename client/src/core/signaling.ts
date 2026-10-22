import { CloseCode } from '../../../shared/protocol.ts';
import type { ErrorCode, PeerId, ServerMessage, SignalData, ClientMessage } from '../../../shared/protocol.ts';
import { Emitter } from './emitter.ts';

type SignalingEvents = {
  welcome: { peerId: PeerId; peers: PeerId[] };
  'peer-joined': PeerId;
  'peer-left': PeerId;
  signal: { from: PeerId; data: SignalData };
  error: { code: ErrorCode | 'connection'; message: string };
  reconnecting: void;
  closed: void;
};

const RETRY_MIN_MS = 500;
const RETRY_MAX_MS = 5000;

export class Signaling extends Emitter<SignalingEvents> {
  private url: string;
  private socket!: WebSocket;
  private joined = false;
  private stopped = false;
  private retryMs = RETRY_MIN_MS;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(url: string) {
    super();
    // Lets the server swap out our old socket on rejoin if it hasn't noticed it died yet.
    const withSession = new URL(url);
    withSession.searchParams.set('session', crypto.randomUUID());
    this.url = withSession.toString();
    this.connect();
  }

  private connect() {
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.onmessage = (event) => this.dispatch(JSON.parse(event.data));
    socket.onerror = () => {
      if (!this.joined) this.emit('error', { code: 'connection', message: 'Signaling connection failed' });
    };
    socket.onclose = ({ code }) => {
      const rejected = code === CloseCode.RoomFull || code === CloseCode.BadRoom;
      if (this.stopped || rejected || !this.joined) {
        this.stopped = true;
        this.emit('closed', undefined);
        return;
      }
      this.emit('reconnecting', undefined);
      this.retryTimer = setTimeout(() => this.connect(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, RETRY_MAX_MS);
    };
  }

  send(data: SignalData) {
    if (this.socket.readyState !== WebSocket.OPEN) return;
    const message: ClientMessage = { type: 'signal', data };
    this.socket.send(JSON.stringify(message));
  }

  close() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    this.socket.close();
  }

  private dispatch(message: ServerMessage) {
    switch (message.type) {
      case 'welcome':
        this.joined = true;
        this.retryMs = RETRY_MIN_MS;
        return this.emit('welcome', { peerId: message.peerId, peers: message.peers });
      case 'peer-joined':
        return this.emit('peer-joined', message.peerId);
      case 'peer-left':
        return this.emit('peer-left', message.peerId);
      case 'signal':
        return this.emit('signal', { from: message.from, data: message.data });
      case 'error':
        return this.emit('error', { code: message.code, message: message.message });
    }
  }
}
