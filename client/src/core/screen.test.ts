import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScreenShare } from './screen.ts';
import type { Call } from './call.ts';

class FakeTrack {
  readyState = 'live';
  contentHint = '';
  addEventListener() {}
  stop() {
    this.readyState = 'ended';
  }
}

let resolveCapture!: (tracks: FakeTrack[]) => void;
Object.defineProperty(globalThis.navigator, 'mediaDevices', {
  configurable: true,
  value: {
    getDisplayMedia: () =>
      new Promise((resolve) => {
        resolveCapture = (tracks) => resolve({ getVideoTracks: () => tracks.slice(0, 1), getAudioTracks: () => tracks.slice(1), getTracks: () => tracks });
      }),
  },
});

const sent: unknown[] = [];
const call = {
  async setTrack(_slot: string, track: unknown) {
    sent.push(track);
  },
  async configureSender() {},
} as unknown as Call;

test('stopping while the capture prompt is open cancels the share', async () => {
  const share = new ScreenShare(call);
  const started = share.start({ audio: true });
  await new Promise((r) => setTimeout(r, 0));
  await share.stop();

  const video = new FakeTrack();
  const audio = new FakeTrack();
  resolveCapture([video, audio]);
  await started;

  assert.equal(share.active, false);
  assert.equal(video.readyState, 'ended');
  assert.equal(audio.readyState, 'ended');
  assert.deepEqual(sent, []);
});
