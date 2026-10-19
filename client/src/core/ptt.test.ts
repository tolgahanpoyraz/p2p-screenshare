import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Voice } from './ptt.ts';
import type { Call, VoiceState } from './call.ts';

let sent: VoiceState[] = [];
const call = { setVoiceState: (state: VoiceState) => sent.push(state) } as unknown as Call;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function setup() {
  const voice = new Voice(call);
  const mic = { enabled: true } as MediaStreamTrack;
  voice.setMic(mic);
  voice.releaseDelayMs = 30;
  return { voice, mic };
}

beforeEach(() => {
  sent = [];
});

test('open mic transmits unless muted', () => {
  const { voice, mic } = setup();
  assert.equal(mic.enabled, true);
  voice.setMuted(true);
  assert.equal(mic.enabled, false);
  voice.press();
  assert.equal(mic.enabled, false, 'push-to-talk presses are ignored in open mode');
});

test('push-to-talk transmits only while held, with a release tail', async () => {
  const { voice, mic } = setup();
  voice.setMode('push-to-talk');
  assert.equal(mic.enabled, false);
  voice.press();
  assert.equal(mic.enabled, true);
  voice.release();
  assert.equal(mic.enabled, true, 'still open during the release tail');
  await sleep(50);
  assert.equal(mic.enabled, false);
});

test('pressing again during the tail keeps transmitting without a gap', async () => {
  const { voice, mic } = setup();
  voice.setMode('push-to-talk');
  voice.press();
  voice.release();
  await sleep(10);
  voice.press();
  await sleep(50);
  assert.equal(mic.enabled, true);
  assert.deepEqual(
    sent.map((s) => s.transmitting),
    [true, false, true],
    'one continuous transmission after the initial open-mic state',
  );
});

test('the remote is told about mode changes even when transmitting stays the same', () => {
  const { voice } = setup();
  voice.setMuted(true);
  voice.setMode('push-to-talk');
  assert.deepEqual(sent.at(-1), { mode: 'push-to-talk', transmitting: false });
});

test('key repeat does not re-announce', () => {
  const { voice } = setup();
  voice.setMode('push-to-talk');
  const before = sent.length;
  voice.press();
  voice.press();
  voice.press();
  assert.equal(sent.length, before + 1);
});

test('switching back to open mic cancels a pending release', async () => {
  const { voice, mic } = setup();
  voice.setMode('push-to-talk');
  voice.press();
  voice.release();
  voice.setMode('open');
  await sleep(50);
  assert.equal(mic.enabled, true);
});
