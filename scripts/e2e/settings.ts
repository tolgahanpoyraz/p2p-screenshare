import type { BrowserWindow } from 'electron';
import {
  base,
  buttonWithText,
  check,
  clickButton,
  clickJoin,
  clickLabel,
  evaluate,
  inboundAudio,
  openBrowserWindow,
  pageHasText,
  run,
  sleep,
  useFakeMedia,
  waitFor,
} from './helpers.ts';

useFakeMedia();

const micTrack = `call.peerConnection.getTransceivers()[0].sender.track`;
const section = (win: BrowserWindow, name: string) =>
  evaluate(win, `[...document.querySelectorAll('.settings-nav button')].find((b) => b.textContent.includes('${name}')).click(); true`, true);
const press = (win: BrowserWindow, label: string, key: string) =>
  evaluate(win, `document.querySelector('[aria-label="${label}"]').dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', bubbles: true })); true`);
const selectOption = (win: BrowserWindow, label: string, pick: string) =>
  evaluate(win, `(() => {
    const select = document.querySelector('select[aria-label="${label}"]');
    select.value = [...select.options].find(${pick}).value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);

run(async () => {
  const lobby = await openBrowserWindow(`${base}/`);
  await clickButton(lobby, 'Set up mic and camera');
  await clickButton(lobby, 'Test microphone');
  await waitFor(lobby, 'mic test meter moves', `Number(document.querySelector('.settings .meter').dataset.level) > 0.1`);
  await waitFor(lobby, 'microphones are listed with labels', `[...document.querySelector('select[aria-label="Microphone"]').options].filter((o) => o.text.includes('Fake')).length >= 2`);

  await clickButton(lobby, 'Record 3 s');
  await waitFor(lobby, 'record and playback runs', `!!${buttonWithText('Playing back…')}`, 6000);
  await waitFor(lobby, 'and finishes', `!!${buttonWithText('Record 3 s')} && !${buttonWithText('Record 3 s')}.disabled`, 8000);

  await section(lobby, 'Speaker');
  await clickButton(lobby, 'Test tone');
  await sleep(1500);
  await check(lobby, 'test tone plays without errors', `!${pageHasText("Couldn't play")}`);

  await section(lobby, 'Camera');
  await clickButton(lobby, 'Preview camera');
  await waitFor(lobby, 'camera preview shows frames', `document.querySelector('.camera-preview video')?.videoWidth > 0`);
  await clickButton(lobby, 'Preview camera');

  await section(lobby, 'Push-to-talk');
  await evaluate(lobby, `[...document.querySelectorAll('.segments button')].find((b) => b.textContent === 'Push-to-talk').click(); true`, true);
  for (let i = 0; i < 3; i++) await press(lobby, 'Release delay', 'ArrowRight');
  lobby.webContents.reload();
  await new Promise<void>((done) => lobby.webContents.once('did-finish-load', () => done()));
  await clickButton(lobby, 'Set up mic and camera');
  await section(lobby, 'Push-to-talk');
  await check(
    lobby,
    'settings survive a reload',
    `document.querySelector('.segments [aria-pressed="true"]').textContent === 'Push-to-talk' && document.querySelector('[aria-label="Release delay"]').getAttribute('aria-valuenow') === '350'`,
  );
  await evaluate(lobby, `localStorage.clear()`);
  lobby.destroy();

  const room = `${base}/r/settings-${Date.now()}`;
  const a = await openBrowserWindow(room);
  const b = await openBrowserWindow(room);
  await clickJoin(a);
  await clickJoin(b);
  await waitFor(a, 'connected', `window.call?.state === 'connected'`);
  await waitFor(b, 'B hears A', `${inboundAudio}.then((s) => s.level > 0.01)`);

  await clickLabel(a, 'Settings');
  await waitFor(a, 'settings open on the microphone list', `[...document.querySelector('select[aria-label="Microphone"]')?.options ?? []].filter((o) => o.value).length >= 2`);
  const firstLabel = await evaluate(a, `${micTrack}.label`);
  await selectOption(a, 'Microphone', `(o) => o.value && o.text !== ${JSON.stringify(firstLabel)}`);
  await waitFor(a, 'switching microphone swaps the sent track', `${micTrack}.label !== ${JSON.stringify(firstLabel)} && ${micTrack}.readyState === 'live'`);
  await waitFor(b, 'B still hears A on the new mic', `${inboundAudio}.then((s) => s.level > 0.01)`);

  await clickButton(a, 'Echo cancellation');
  await waitFor(a, 'toggling echo cancellation reopens the mic without it', `${micTrack}.getSettings().echoCancellation === false`);
  await clickLabel(a, 'Close settings');

  await clickLabel(b, 'Volume');
  await press(b, 'Voice volume', 'ArrowLeft');
  await waitFor(b, 'voice volume slider applies to the remote voice', `[...document.querySelectorAll('audio')].some((el) => Math.abs(el.volume - 0.99) < 0.001)`);

  await evaluate(a, `settings.update({ you: { name: 'Mac person', hue: 300 } }); true`);
  await waitFor(b, 'names travel to the other side', pageHasText('Mac person'));

  const before = await evaluate(a, `${micTrack}.id`);
  await evaluate(a, `session.mic.dispatchEvent(new Event('ended'))`);
  await waitFor(a, 'an unplugged mic is reopened automatically', `${micTrack}.id !== ${JSON.stringify(before)} && ${micTrack}.readyState === 'live'`);
  await waitFor(b, 'B hears A again', `${inboundAudio}.then((s) => s.level > 0.01)`);
});
