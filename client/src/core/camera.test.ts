import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Camera } from './camera.ts';
import type { Call } from './call.ts';

class FakeTrack {
  readyState = 'live';
  contentHint = '';
  private listeners: (() => void)[] = [];
  deviceId: string;
  facingMode?: string;
  constructor(deviceId: string, facingMode?: string) {
    this.deviceId = deviceId;
    this.facingMode = facingMode;
  }
  getSettings() {
    return { deviceId: this.deviceId, facingMode: this.facingMode };
  }
  addEventListener(_: 'ended', listener: () => void) {
    this.listeners.push(listener);
  }
  stop() {
    this.readyState = 'ended';
  }
  end() {
    this.stop();
    for (const listener of this.listeners) listener();
  }
}

interface PendingOpen {
  constraints: MediaTrackConstraints;
  resolve: (track: FakeTrack) => void;
  reject: (error: Error) => void;
}

let opens: PendingOpen[] = [];
let tracks: FakeTrack[] = [];
let sent: (FakeTrack | null)[] = [];
let holdSetTrack: Promise<void> | null = null;

Object.defineProperty(globalThis.navigator, 'mediaDevices', {
  configurable: true,
  value: {
    getUserMedia: ({ video }: { video: MediaTrackConstraints }) =>
      new Promise((resolve, reject) =>
        opens.push({ constraints: video, reject, resolve: (track) => resolve({ getVideoTracks: () => [track] }) }),
      ),
    enumerateDevices: async () => [
      { kind: 'videoinput', deviceId: 'a' },
      { kind: 'audioinput', deviceId: 'mic' },
      { kind: 'videoinput', deviceId: 'b' },
    ],
  },
});

const call = {
  async setTrack(_slot: string, track: FakeTrack | null) {
    sent.push(track);
    await holdSetTrack;
  },
  async configureSender() {},
} as unknown as Call;

const flush = () => new Promise((r) => setTimeout(r, 0));

async function open(camera: Camera, deviceId: string, facingMode?: string) {
  const started = camera.start();
  await flush();
  const track = new FakeTrack(deviceId, facingMode);
  tracks.push(track);
  opens.at(-1)!.resolve(track);
  await started;
  return track;
}

function watch(camera: Camera) {
  const events: boolean[] = [];
  camera.on('change', ({ active }) => events.push(active));
  return events;
}

beforeEach(() => {
  opens = [];
  tracks = [];
  sent = [];
  holdSetTrack = null;
});

test('flips facing mode when the camera reports one', async () => {
  const camera = new Camera(call);
  const front = await open(camera, 'front', 'user');
  const switched = camera.switchCamera();
  await flush();
  assert.deepEqual(opens.at(-1)!.constraints.facingMode, { ideal: 'environment' });
  assert.equal(front.readyState, 'ended');
  opens.at(-1)!.resolve(new FakeTrack('back', 'environment'));
  await switched;
});

test('cycles to the next camera when there is no facing mode', async () => {
  const camera = new Camera(call);
  await open(camera, 'b');
  const switched = camera.switchCamera();
  await flush();
  await flush();
  assert.deepEqual(opens.at(-1)!.constraints.deviceId, { exact: 'a' });
  opens.at(-1)!.resolve(new FakeTrack('a'));
  await switched;
});

test('switching while off does nothing', async () => {
  const camera = new Camera(call);
  await camera.switchCamera();
  assert.equal(opens.length, 0);
});

test('a switch that fails to open announces the camera as off', async () => {
  const camera = new Camera(call);
  const events = watch(camera);
  await open(camera, 'a');
  const switched = camera.switchCamera();
  await flush();
  await flush();
  opens.at(-1)!.reject(new Error('NotReadableError'));
  await assert.rejects(switched);
  assert.deepEqual(events, [true, false]);
  assert.equal(sent.at(-1), null);
});

test('stop during a pending switch announces off and drops the late camera', async () => {
  const camera = new Camera(call);
  const events = watch(camera);
  await open(camera, 'a');
  const switched = camera.switchCamera();
  await flush();
  await flush();
  await camera.stop();
  const late = new FakeTrack('b');
  opens.at(-1)!.resolve(late);
  await switched;
  assert.deepEqual(events, [true, false]);
  assert.equal(late.readyState, 'ended');
  assert.equal(camera.active, false);
});

test('stop while start is still attaching ends up off', async () => {
  const camera = new Camera(call);
  const events = watch(camera);
  let release!: () => void;
  holdSetTrack = new Promise((r) => (release = r));
  const started = camera.start();
  await flush();
  const track = new FakeTrack('a');
  opens[0].resolve(track);
  await flush();
  const stopped = camera.stop();
  release();
  await Promise.all([started, stopped]);
  assert.deepEqual(events, []);
  assert.equal(track.readyState, 'ended');
  assert.equal(sent.at(-1), null);
});

test('the OS ending the current track turns the camera off, but an old track ending does not', async () => {
  const camera = new Camera(call);
  const events = watch(camera);
  const first = await open(camera, 'a');
  const second = await open(camera, 'b');
  first.end();
  await flush();
  assert.equal(camera.active, true);
  second.end();
  await flush();
  assert.deepEqual(events, [true, false]);
});
