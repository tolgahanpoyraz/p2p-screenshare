import { join } from 'node:path';
import { UiohookKey } from 'uiohook-napi';
import { createMainWindow } from '../../desktop/window.ts';
import { handleInput } from '../../desktop/ptt.ts';
import { base, check, clickJoin, evaluate, inboundAudio, openBrowserWindow, run, sleep, useFakeMedia, waitFor } from './helpers.ts';

useFakeMedia();

const F13 = UiohookKey.F13;
const key = (code: number, down: boolean) => handleInput({ kind: 'key', code, down });
const hears = `${inboundAudio}.then((s) => s.level > 0.01)`;
const silent = `${inboundAudio}.then((s) => s.level < 0.001)`;

run(async () => {
  const room = `${base}/r/ptt-${Date.now()}`;
  const mac = createMainWindow({ url: room, preload: join(import.meta.dirname, '../desktop/preload.cjs'), show: false });
  await new Promise<void>((done) => mac.webContents.once('did-finish-load', () => done()));
  const tablet = await openBrowserWindow(room);
  await clickJoin(mac);
  await clickJoin(tablet);
  await waitFor(mac, 'connected', `window.call?.state === 'connected'`);
  await waitFor(tablet, 'tablet hears open mic', hears);

  await evaluate(mac, `voice.setMode('push-to-talk'); desktop.pushToTalk.setBinding({ kind: 'key', code: ${F13}, label: 'F13' })`);
  await waitFor(tablet, 'tablet sees mac in push-to-talk, silent', `call.remoteVoice?.mode === 'push-to-talk' && !call.remoteVoice.transmitting`);
  await waitFor(tablet, 'tablet hears silence before the key is pressed', silent);

  key(UiohookKey.V, true);
  key(UiohookKey.V, false);
  await sleep(300);
  await check(mac, 'unrelated keys do nothing', `!voice.transmitting`);

  key(F13, true);
  await waitFor(mac, 'pressing the bound key transmits', `voice.transmitting && call.peerConnection.getTransceivers()[0].sender.track.enabled`);
  await waitFor(tablet, 'tablet is told mac is transmitting', `call.remoteVoice.transmitting`);
  await waitFor(tablet, 'tablet hears mac while the key is held', hears);
  await evaluate(mac, `window.changes = 0; voice.on('change', () => window.changes++); true`);
  key(F13, true);
  key(F13, true);
  await check(mac, 'key repeat does not re-announce', `window.changes === 0`);

  key(F13, false);
  await check(mac, 'still transmitting during the release tail', `voice.transmitting`);
  await waitFor(mac, 'stops after the release tail', `!voice.transmitting`);
  await waitFor(tablet, 'tablet hears silence after release', silent);

  const capture = evaluate(mac, `desktop.pushToTalk.captureBinding()`);
  await sleep(100);
  handleInput({ kind: 'mouse', code: 1, down: true });
  handleInput({ kind: 'mouse', code: 4, down: true });
  const captured = await capture;
  if (captured?.kind !== 'mouse' || captured.code !== 4) throw new Error(`captured ${JSON.stringify(captured)}`);
  console.log(`  ✔ capture ignores left click and binds ${captured.label}`);
  const cancelled = evaluate(mac, `desktop.pushToTalk.captureBinding()`);
  await sleep(100);
  key(UiohookKey.Escape, true);
  if ((await cancelled) !== null) throw new Error('Escape should cancel capture');
  console.log('  ✔ Escape cancels capture');

  await evaluate(tablet, `voice.setMode('push-to-talk')`);
  await waitFor(mac, 'mac sees tablet in push-to-talk', `call.remoteVoice?.mode === 'push-to-talk' && !call.remoteVoice.transmitting`);
  await evaluate(tablet, `voice.press()`);
  await waitFor(mac, 'tablet hold-to-talk reaches the mac', `call.remoteVoice.transmitting`);
  await evaluate(tablet, `voice.release()`);
  await waitFor(mac, 'and stops after release', `!call.remoteVoice.transmitting`);

  const shift = (type: string) => `window.dispatchEvent(new KeyboardEvent('${type}', { code: 'ShiftLeft', key: 'Shift' })); true`;
  await evaluate(tablet, `settings.update({ voiceMode: 'push-to-talk' }); true`);
  await evaluate(tablet, shift('keydown'));
  await waitFor(mac, 'Shift in the web app talks while the tab is focused', `call.remoteVoice.transmitting`);
  await evaluate(tablet, shift('keyup'));
  await waitFor(mac, 'and letting go of Shift stops', `!call.remoteVoice.transmitting`);
});
