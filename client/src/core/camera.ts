import type { Call } from './call.ts';
import { Emitter } from './emitter.ts';

export interface CameraSettings {
  deviceId?: string;
  facingMode?: 'user' | 'environment';
  height: number;
  frameRate: number;
  maxBitrateKbps: number;
}

export const defaultCameraSettings: CameraSettings = {
  facingMode: 'user',
  height: 720,
  frameRate: 30,
  maxBitrateKbps: 2_500,
};

type CameraEvents = {
  change: { active: boolean };
  /** Fires for every new track, including switches that keep the camera on. */
  track: MediaStreamTrack | null;
};

export class Camera extends Emitter<CameraEvents> {
  track: MediaStreamTrack | null = null;
  settings: CameraSettings = defaultCameraSettings;
  private call: Call;
  private generation = 0;
  private announced = false;

  constructor(call: Call) {
    super();
    this.call = call;
  }

  get active() {
    return this.track !== null;
  }

  async start(settings: Partial<CameraSettings> = {}) {
    const generation = ++this.generation;
    this.settings = { ...this.settings, ...settings };
    // Most phones can't open a second camera while one is in use.
    this.release();

    let track: MediaStreamTrack;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: constraints(this.settings) });
      track = stream.getVideoTracks()[0];
    } catch (error) {
      if (generation === this.generation) await this.stop();
      throw error;
    }
    if (generation !== this.generation) {
      track.stop();
      return;
    }

    track.contentHint = 'motion';
    track.addEventListener('ended', () => {
      if (this.track === track) this.stop();
    });
    this.track = track;
    this.emit('track', track);
    await this.call.setTrack('camera', track);
    if (generation !== this.generation) return;
    await this.call.configureSender('camera', {
      maxBitrateKbps: this.settings.maxBitrateKbps,
      maxFramerate: this.settings.frameRate,
      degradation: 'balanced',
      priority: 'low',
    });
    if (generation === this.generation) this.notify();
  }

  /** Flips front/back where the camera reports a facing mode, otherwise cycles through cameras. */
  async switchCamera() {
    if (!this.track) return;
    const current = this.track.getSettings();
    if (current?.facingMode) {
      const facingMode = current.facingMode === 'user' ? 'environment' : 'user';
      return this.start({ deviceId: undefined, facingMode });
    }
    const cameras = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    if (cameras.length < 2) return;
    const index = cameras.findIndex((camera) => camera.deviceId === current.deviceId);
    return this.start({ deviceId: cameras[(index + 1) % cameras.length].deviceId, facingMode: undefined });
  }

  async stop() {
    const generation = ++this.generation;
    const hadTrack = this.active;
    this.release();
    if (hadTrack) this.emit('track', null);
    await this.call.setTrack('camera', null);
    if (generation === this.generation) this.notify();
  }

  private notify() {
    if (this.active === this.announced) return;
    this.announced = this.active;
    this.emit('change', { active: this.active });
  }

  private release() {
    this.track?.stop();
    this.track = null;
  }
}

export function constraints({ deviceId, facingMode, height, frameRate }: CameraSettings): MediaTrackConstraints {
  return {
    ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: facingMode } }),
    height: { ideal: height },
    frameRate: { ideal: frameRate },
  };
}
