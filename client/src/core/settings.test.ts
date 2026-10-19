import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, SettingsStore } from './settings.ts';

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

const storage = (initial?: string) => {
  const s = new MemoryStorage();
  if (initial !== undefined) s.setItem('screenshare.settings', initial);
  return s as unknown as Storage;
};

test('starts from defaults', () => {
  assert.deepEqual(new SettingsStore(storage()).value, defaultSettings);
});

test('persists updates and reloads them', () => {
  const backing = storage();
  new SettingsStore(backing).update({ voiceMode: 'push-to-talk', volumes: { show: 0.5 } });
  const reloaded = new SettingsStore(backing).value;
  assert.equal(reloaded.voiceMode, 'push-to-talk');
  assert.deepEqual(reloaded.volumes, { voice: 1, show: 0.5 });
});

test('fills in defaults missing from older saved data', () => {
  const value = new SettingsStore(storage(JSON.stringify({ camera: { height: 1080 } }))).value;
  assert.equal(value.camera.height, 1080);
  assert.equal(value.camera.frameRate, defaultSettings.camera.frameRate);
  assert.equal(value.voiceMode, 'open');
});

test('survives corrupted storage, unknown keys, and storage that throws', () => {
  assert.deepEqual(new SettingsStore(storage('{not json')).value, defaultSettings);
  assert.deepEqual(new SettingsStore(storage('{"bogus": 1}')).value, defaultSettings);
  const throwing = {
    getItem() {
      throw new Error('denied');
    },
    setItem() {
      throw new Error('denied');
    },
  } as unknown as Storage;
  const store = new SettingsStore(throwing);
  store.update({ voiceMode: 'push-to-talk' });
  assert.equal(store.value.voiceMode, 'push-to-talk');
});

test('reports only keys that actually changed', () => {
  const store = new SettingsStore(storage());
  const changes: string[][] = [];
  store.on('change', ({ changed }) => changes.push(changed));
  store.update({ voiceMode: 'open', releaseDelayMs: 300 });
  store.update({ releaseDelayMs: 300 });
  assert.deepEqual(changes, [['releaseDelayMs']]);
});

test('a binding can be set and cleared', () => {
  const store = new SettingsStore(storage());
  store.update({ pushToTalkBinding: { kind: 'key', code: 91, label: 'F13' } });
  assert.equal(store.value.pushToTalkBinding?.label, 'F13');
  store.update({ pushToTalkBinding: null });
  assert.equal(store.value.pushToTalkBinding, null);
});

test('device choices persist and can be reset to the system default', () => {
  const backing = storage();
  const store = new SettingsStore(backing);
  store.update({ microphoneId: 'usb-mic', speakerId: 'headphones' });
  assert.equal(new SettingsStore(backing).value.microphoneId, 'usb-mic');
  store.update({ microphoneId: undefined });
  assert.equal(store.value.microphoneId, undefined);
  assert.equal(new SettingsStore(backing).value.microphoneId, undefined);
  assert.equal(new SettingsStore(backing).value.speakerId, 'headphones');
});
