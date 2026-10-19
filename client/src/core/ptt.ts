import type { Call, VoiceState } from './call.ts';
import { Emitter } from './emitter.ts';
import { desktop } from '../platform.ts';

export type VoiceMode = VoiceState['mode'];

// Keeps the mic open briefly after release so the end of the last word isn't clipped.
export const DEFAULT_RELEASE_DELAY_MS = 200;

type VoiceEvents = {
  change: VoiceState;
};

export class Voice extends Emitter<VoiceEvents> {
  mode: VoiceMode = 'open';
  muted = false;
  releaseDelayMs = DEFAULT_RELEASE_DELAY_MS;
  transmitting = true;
  private announced: VoiceState | null = null;
  private call: Call;
  private mic: MediaStreamTrack | null = null;
  private held = false;
  private releaseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(call: Call) {
    super();
    this.call = call;
    desktop?.pushToTalk.onChange((pressed) => (pressed ? this.press() : this.release()));
  }

  setMic(track: MediaStreamTrack | null) {
    this.mic = track;
    this.update();
  }

  setMode(mode: VoiceMode) {
    this.mode = mode;
    this.held = false;
    this.clearReleaseTimer();
    this.update();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.update();
  }

  press() {
    if (this.mode !== 'push-to-talk') return;
    this.held = true;
    this.clearReleaseTimer();
    this.update();
  }

  release() {
    if (!this.held) return;
    this.held = false;
    this.releaseTimer = setTimeout(() => {
      this.releaseTimer = null;
      this.update();
    }, this.releaseDelayMs);
  }

  private update() {
    this.transmitting = this.mode === 'open' ? !this.muted : this.held || this.releaseTimer !== null;
    if (this.mic) this.mic.enabled = this.transmitting;

    const state: VoiceState = { mode: this.mode, transmitting: this.transmitting };
    if (this.announced?.mode === state.mode && this.announced.transmitting === state.transmitting) return;
    this.announced = state;
    this.call.setVoiceState(state);
    this.emit('change', state);
  }

  private clearReleaseTimer() {
    if (this.releaseTimer) clearTimeout(this.releaseTimer);
    this.releaseTimer = null;
  }
}
