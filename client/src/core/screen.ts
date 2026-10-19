import type { Call } from './call.ts';
import { Emitter } from './emitter.ts';
import { desktop } from '../platform.ts';

export type VideoCodec = 'auto' | 'video/H264' | 'video/VP8' | 'video/VP9' | 'video/AV1';

export interface ScreenQuality {
  /** Undefined captures at the display's native resolution. */
  height?: number;
  frameRate: number;
  maxBitrateKbps: number;
  codec: VideoCodec;
  mode: 'detail' | 'motion';
}

export const screenPresets = {
  '720p30': { height: 720, frameRate: 30, maxBitrateKbps: 4_000, codec: 'video/H264', mode: 'detail' },
  '1080p30': { height: 1080, frameRate: 30, maxBitrateKbps: 8_000, codec: 'video/H264', mode: 'detail' },
  '1080p60': { height: 1080, frameRate: 60, maxBitrateKbps: 12_000, codec: 'video/H264', mode: 'motion' },
  '1440p60': { height: 1440, frameRate: 60, maxBitrateKbps: 20_000, codec: 'video/H264', mode: 'motion' },
  '4K30': { height: 2160, frameRate: 30, maxBitrateKbps: 30_000, codec: 'video/H264', mode: 'detail' },
  native: { frameRate: 30, maxBitrateKbps: 40_000, codec: 'video/H264', mode: 'detail' },
} satisfies Record<string, ScreenQuality>;

export const SHOW_AUDIO_KBPS = 256;

// Voice processing would mangle music and dialogue, and restrictOwnAudio keeps
// the other person's voice (played by this app) out of the capture.
const showAudioConstraints = {
  restrictOwnAudio: true,
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 2,
} as MediaTrackConstraints;

type ScreenShareEvents = {
  change: { active: boolean; audio: boolean };
};

export class ScreenShare extends Emitter<ScreenShareEvents> {
  video: MediaStreamTrack | null = null;
  audio: MediaStreamTrack | null = null;
  quality: ScreenQuality = screenPresets['1080p30'];
  private call: Call;
  private generation = 0;

  constructor(call: Call) {
    super();
    this.call = call;
  }

  get active() {
    return this.video !== null;
  }

  static get supported() {
    return Boolean(navigator.mediaDevices?.getDisplayMedia);
  }

  /** On the Mac app, pass a sourceId from desktop.listScreenSources(); browsers show their own picker. */
  async start({ sourceId, audio }: { sourceId?: string; audio: boolean }) {
    const generation = ++this.generation;
    await this.stop();
    if (desktop && sourceId) await desktop.selectScreenSource(sourceId, { audio });

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: captureConstraints(this.quality),
      audio: audio ? showAudioConstraints : false,
    });
    if (generation !== this.generation) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }
    const video = stream.getVideoTracks()[0];
    this.video = video;
    this.audio = stream.getAudioTracks()[0] ?? null;
    video.contentHint = this.quality.mode;
    if (this.audio) this.audio.contentHint = 'music';
    video.addEventListener('ended', () => {
      if (this.video === video) this.stop();
    });

    await this.call.setTrack('screen', this.video);
    await this.call.setTrack('screenAudio', this.audio);
    await this.call.configureSender('screen', senderOptions(this.quality));
    await this.call.configureSender('screenAudio', { maxBitrateKbps: SHOW_AUDIO_KBPS });
    this.emitChange();
  }

  async setQuality(quality: ScreenQuality) {
    this.quality = quality;
    if (!this.video) return;
    this.video.contentHint = quality.mode;
    await this.video.applyConstraints(captureConstraints(quality));
    await this.call.configureSender('screen', senderOptions(quality));
  }

  async stop() {
    if (!this.video) return;
    this.video.stop();
    this.audio?.stop();
    this.video = this.audio = null;
    await this.call.setTrack('screen', null);
    await this.call.setTrack('screenAudio', null);
    this.emitChange();
  }

  private emitChange() {
    this.emit('change', { active: this.active, audio: this.audio !== null });
  }
}

function captureConstraints({ height, frameRate }: ScreenQuality): MediaTrackConstraints {
  return {
    height: height ? { max: height } : undefined,
    frameRate: { ideal: frameRate, max: frameRate },
  };
}

function senderOptions(quality: ScreenQuality) {
  return {
    maxBitrateKbps: quality.maxBitrateKbps,
    maxFramerate: quality.frameRate,
    degradation: quality.mode === 'detail' ? 'maintain-resolution' : 'maintain-framerate',
    codec: quality.codec === 'auto' ? undefined : quality.codec,
  } as const;
}
