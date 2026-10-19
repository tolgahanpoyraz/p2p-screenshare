import type { SignalData } from '../../../shared/protocol.ts';
import { Emitter } from './emitter.ts';
import { Signaling } from './signaling.ts';

export type Slot = 'mic' | 'camera' | 'screen' | 'screenAudio';

// Both peers rely on this order to tell which incoming track is which.
const SLOTS = [
  ['mic', 'audio'],
  ['camera', 'video'],
  ['screen', 'video'],
  ['screenAudio', 'audio'],
] as const satisfies readonly (readonly [Slot, 'audio' | 'video'])[];

export type CallState = 'joining' | 'waiting' | 'connecting' | 'connected' | 'reconnecting' | 'closed';

type CallEvents = {
  state: CallState;
  'remote-track': { slot: Slot; track: MediaStreamTrack | null };
  error: { code: string; message: string };
};

export interface CallOptions {
  signalingUrl: string;
  iceServers: RTCIceServer[];
}

export class Call extends Emitter<CallEvents> {
  state: CallState = 'joining';
  private signaling: Signaling;
  private pc: RTCPeerConnection | null = null;
  private initiator = false;
  private localTracks = new Map<Slot, MediaStreamTrack | null>();
  private queue: Promise<void> = Promise.resolve();
  private options: CallOptions;

  constructor(options: CallOptions) {
    super();
    this.options = options;
    this.signaling = new Signaling(options.signalingUrl);
    this.signaling.on('welcome', ({ peers }) => this.setState(peers.length ? 'connecting' : 'waiting'));
    this.signaling.on('peer-joined', () => this.enqueue(() => this.startAsInitiator()));
    this.signaling.on('peer-left', () => {
      this.teardown();
      this.setState('waiting');
    });
    this.signaling.on('signal', ({ data }) => this.enqueue(() => this.handleSignal(data)));
    this.signaling.on('error', (error) => this.emit('error', error));
    this.signaling.on('closed', () => {
      if (!this.pc) this.setState('closed');
    });
  }

  get peerConnection() {
    return this.pc;
  }

  async setTrack(slot: Slot, track: MediaStreamTrack | null) {
    this.localTracks.set(slot, track);
    await this.transceiverFor(slot)?.sender.replaceTrack(track);
  }

  hangup() {
    this.signaling.close();
    this.teardown();
    this.setState('closed');
  }

  private setState(state: CallState) {
    if (this.state === state) return;
    this.state = state;
    this.emit('state', state);
  }

  private enqueue(task: () => Promise<void>) {
    this.queue = this.queue.then(task).catch((error: Error) => {
      this.emit('error', { code: 'negotiation', message: error.message });
    });
  }

  private createPeerConnection() {
    const pc = new RTCPeerConnection({ iceServers: this.options.iceServers });

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.signaling.send({ kind: 'candidate', candidate: candidate.toJSON() });
    };
    pc.ontrack = ({ transceiver, track }) => {
      const slot = this.slotOf(transceiver);
      if (slot) this.emit('remote-track', { slot, track });
    };
    pc.onnegotiationneeded = () => {
      if (this.initiator) this.enqueue(() => this.sendDescription());
    };
    pc.onconnectionstatechange = () => {
      switch (pc.connectionState) {
        case 'connected':
          return this.setState('connected');
        case 'disconnected':
          return this.setState('reconnecting');
        case 'failed':
          this.setState('reconnecting');
          if (this.initiator) pc.restartIce();
      }
    };

    this.pc = pc;
    return pc;
  }

  private async startAsInitiator() {
    this.teardown();
    this.initiator = true;
    this.setState('connecting');
    const pc = this.createPeerConnection();
    for (const [slot, kind] of SLOTS) {
      const transceiver = pc.addTransceiver(kind, { direction: 'sendrecv' });
      await transceiver.sender.replaceTrack(this.localTracks.get(slot) ?? null);
    }
  }

  private async handleSignal(data: SignalData) {
    if (data.kind === 'candidate') {
      // Candidates from a torn-down connection can still be in flight; they're safe to drop.
      await this.pc?.addIceCandidate(data.candidate).catch(() => {});
      return;
    }

    const { description } = data;
    if (description.type === 'answer') {
      await this.pc?.setRemoteDescription(description);
      return;
    }
    if (description.type !== 'offer') return;

    if (!this.pc || this.initiator) {
      this.teardown();
      this.initiator = false;
      this.createPeerConnection();
    }
    const pc = this.pc!;
    await pc.setRemoteDescription(description);
    for (const transceiver of pc.getTransceivers()) {
      transceiver.direction = 'sendrecv';
      const slot = this.slotOf(transceiver);
      if (slot) await transceiver.sender.replaceTrack(this.localTracks.get(slot) ?? null);
    }
    await this.sendDescription();
  }

  private async sendDescription() {
    const pc = this.pc;
    if (!pc) return;
    await pc.setLocalDescription();
    const { type, sdp } = pc.localDescription!;
    this.signaling.send({ kind: 'description', description: { type, sdp } });
  }

  private transceiverFor(slot: Slot) {
    const index = SLOTS.findIndex(([name]) => name === slot);
    return this.pc?.getTransceivers()[index];
  }

  private slotOf(transceiver: RTCRtpTransceiver): Slot | undefined {
    const index = this.pc?.getTransceivers().indexOf(transceiver) ?? -1;
    return SLOTS[index]?.[0];
  }

  private teardown() {
    if (!this.pc) return;
    this.pc.close();
    this.pc = null;
    for (const [slot] of SLOTS) this.emit('remote-track', { slot, track: null });
  }
}
