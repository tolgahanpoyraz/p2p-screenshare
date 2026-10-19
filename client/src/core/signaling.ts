import type { ErrorCode, PeerId, ServerMessage, SignalData, ClientMessage } from '../../../shared/protocol.ts';
import { Emitter } from './emitter.ts';

type SignalingEvents = {
  welcome: { peerId: PeerId; peers: PeerId[] };
  'peer-joined': PeerId;
  'peer-left': PeerId;
  signal: { from: PeerId; data: SignalData };
  error: { code: ErrorCode | 'connection'; message: string };
  closed: void;
};

export class Signaling extends Emitter<SignalingEvents> {
  private socket: WebSocket;

  constructor(url: string) {
    super();
    this.socket = new WebSocket(url);
    this.socket.onmessage = (event) => this.dispatch(JSON.parse(event.data));
    this.socket.onerror = () =>
      this.emit('error', { code: 'connection', message: 'Signaling connection failed' });
    this.socket.onclose = () => this.emit('closed', undefined);
  }

  send(data: SignalData) {
    if (this.socket.readyState !== WebSocket.OPEN) return;
    const message: ClientMessage = { type: 'signal', data };
    this.socket.send(JSON.stringify(message));
  }

  close() {
    this.socket.close();
  }

  private dispatch(message: ServerMessage) {
    switch (message.type) {
      case 'welcome':
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
