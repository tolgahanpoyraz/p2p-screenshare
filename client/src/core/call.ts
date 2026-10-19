import type { SignalData } from '../../../shared/protocol.ts';
import { Emitter } from './emitter.ts';
import { tuneSdp } from './sdp.ts';
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
export type SlotFlags = Record<Slot, boolean>;
export type DegradationPreference = 'maintain-framerate' | 'maintain-resolution' | 'balanced';

export interface SenderOptions {
  maxBitrateKbps?: number;
  maxFramerate?: number;
  degradation?: DegradationPreference;
  /** A negotiated mimeType such as 'video/VP9'. Omit to let the browser choose. */
  codec?: string;
}

type ControlMessage = { type: 'media'; active: SlotFlags };

type CallEvents = {
  state: CallState;
  'remote-track': { slot: Slot; track: MediaStreamTrack | null };
  'remote-media': SlotFlags;
  error: { code: string; message: string };
};

type EncodingParameters = RTCRtpEncodingParameters & { codec?: RTCRtpCodec };
type SendParameters = RTCRtpSendParameters & { degradationPreference?: DegradationPreference };

const noSlots = (): SlotFlags => ({ mic: false, camera: false, screen: false, screenAudio: false });

export interface CallOptions {
  signalingUrl: string;
  iceServers: RTCIceServer[];
}

export class Call extends Emitter<CallEvents> {
  state: CallState = 'joining';
  remoteMedia = noSlots();
  private options: CallOptions;
  private signaling: Signaling;
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private initiator = false;
  private localTracks = new Map<Slot, MediaStreamTrack | null>();
  private senderOptions = new Map<Slot, SenderOptions>();
  private queue: Promise<void> = Promise.resolve();

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
    this.sendMediaState();
  }

  async configureSender(slot: Slot, options: SenderOptions) {
    this.senderOptions.set(slot, options);
    await this.applySenderOptions(slot);
  }

  slotForMid(mid: string): Slot | undefined {
    const transceiver = this.pc?.getTransceivers().find((t) => t.mid === mid);
    return transceiver && this.slotOf(transceiver);
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

    // Pre-agreed id on both sides, so neither has to wait for an ondatachannel announcement.
    const channel = pc.createDataChannel('control', { negotiated: true, id: 0 });
    channel.onopen = () => this.sendMediaState();
    channel.onmessage = (event) => this.handleControl(JSON.parse(event.data));

    this.pc = pc;
    this.channel = channel;
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
      await this.applyAllSenderOptions();
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
    await this.applyAllSenderOptions();
  }

  private async sendDescription() {
    const pc = this.pc;
    if (!pc) return;
    const description =
      pc.signalingState === 'have-remote-offer' ? await pc.createAnswer() : await pc.createOffer();
    description.sdp = tuneSdp(description.sdp ?? '');
    await pc.setLocalDescription(description);
    this.signaling.send({ kind: 'description', description: { type: description.type, sdp: description.sdp } });
  }

  private async applyAllSenderOptions() {
    for (const slot of this.senderOptions.keys()) await this.applySenderOptions(slot);
  }

  private async applySenderOptions(slot: Slot) {
    const sender = this.transceiverFor(slot)?.sender;
    const options = this.senderOptions.get(slot);
    if (!sender || !options || !this.pc?.remoteDescription || this.pc.signalingState !== 'stable') return;

    const params = sender.getParameters() as SendParameters;
    const encoding = params.encodings[0] as EncodingParameters | undefined;
    if (!encoding) return;

    if (options.maxBitrateKbps) encoding.maxBitrate = options.maxBitrateKbps * 1000;
    else delete encoding.maxBitrate;
    if (options.maxFramerate) encoding.maxFramerate = options.maxFramerate;
    else delete encoding.maxFramerate;

    const wanted = options.codec?.toLowerCase();
    const codec = wanted && params.codecs.find((c) => c.mimeType.toLowerCase() === wanted);
    if (wanted && !codec) {
      this.emit('error', { code: 'codec-unavailable', message: `${options.codec} was not negotiated` });
    }
    if (codec) encoding.codec = codec;
    else delete encoding.codec;

    if (options.degradation) params.degradationPreference = options.degradation;
    await sender.setParameters(params);
  }

  private sendMediaState() {
    if (this.channel?.readyState !== 'open') return;
    const active = noSlots();
    for (const [slot, track] of this.localTracks) active[slot] = track !== null;
    const message: ControlMessage = { type: 'media', active };
    this.channel.send(JSON.stringify(message));
  }

  private handleControl(message: ControlMessage) {
    if (message.type === 'media') {
      this.remoteMedia = { ...noSlots(), ...message.active };
      this.emit('remote-media', this.remoteMedia);
    }
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
    this.channel = null;
    this.remoteMedia = noSlots();
    this.emit('remote-media', this.remoteMedia);
    for (const [slot] of SLOTS) this.emit('remote-track', { slot, track: null });
  }
}
