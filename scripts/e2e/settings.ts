import { base, check, clickJoin, evaluate, inboundAudio, openBrowserWindow, run, sleep, useFakeMedia, waitFor } from './helpers.ts';

useFakeMedia();

const click = (id: string) => `document.getElementById('${id}').click()`;
const logHas = (text: string) => `document.getElementById('log').textContent.includes(${JSON.stringify(text)})`;
const micTrack = `call.peerConnection.getTransceivers()[0].sender.track`;

run(async () => {
  const lobby = await openBrowserWindow(`${base}/`);
  await evaluate(lobby, click('mic-test'), true);
  await waitFor(lobby, 'mic test meter moves', `document.getElementById('mic-level').value > 0.1`);
  await waitFor(lobby, 'microphones are listed with labels', `[...document.getElementById('set-mic').options].filter((o) => o.value && o.text.includes('Fake')).length >= 2`);

  await evaluate(lobby, click('mic-record'));
  await waitFor(lobby, 'record and playback runs', `document.getElementById('mic-record').textContent === 'Playing…'`, 6000);
  await waitFor(lobby, 'and finishes', `document.getElementById('mic-record').textContent.startsWith('Record')`, 8000);

  await evaluate(lobby, click('speaker-test'));
  await sleep(1500);
  await check(lobby, 'test tone plays without errors', `!${logHas('speaker test')}`);

  await evaluate(lobby, click('camera-test'));
  await waitFor(lobby, 'camera preview shows frames', `document.getElementById('camera-preview').videoWidth > 0`);
  await evaluate(lobby, click('camera-test'));

  await evaluate(lobby, `document.querySelector('input[value="push-to-talk"]').click(); const r = document.getElementById('set-release'); r.value = '350'; r.dispatchEvent(new Event('change'))`);
  lobby.webContents.reload();
  await new Promise<void>((done) => lobby.webContents.once('did-finish-load', () => done()));
  await check(lobby, 'settings survive a reload', `document.querySelector('input[value="push-to-talk"]').checked && document.getElementById('set-release').value === '350'`);
  await evaluate(lobby, `localStorage.clear()`);
  lobby.destroy();

  const room = `${base}/r/settings-${Date.now()}`;
  const a = await openBrowserWindow(room);
  const b = await openBrowserWindow(room);
  await clickJoin(a);
  await clickJoin(b);
  await waitFor(a, 'connected', `window.call?.state === 'connected'`);
  await waitFor(b, 'B hears A', `${inboundAudio}.then((s) => s.level > 0.01)`);

  const firstLabel = await evaluate(a, `${micTrack}.label`);
  await evaluate(a, `const s = document.getElementById('set-mic'); s.value = [...s.options].find((o) => o.value && o.text !== ${JSON.stringify(firstLabel)}).value; s.dispatchEvent(new Event('change'))`);
  await waitFor(a, 'switching microphone swaps the sent track', `${micTrack}.label !== ${JSON.stringify(firstLabel)} && ${micTrack}.readyState === 'live'`);
  await waitFor(b, 'B still hears A on the new mic', `${inboundAudio}.then((s) => s.level > 0.01)`);

  await evaluate(a, `document.getElementById('set-echo').click()`);
  await waitFor(a, 'toggling echo cancellation reopens the mic without it', `${micTrack}.getSettings().echoCancellation === false`);

  await evaluate(b, `const v = document.getElementById('set-voice-volume'); v.value = '0.3'; v.dispatchEvent(new Event('input'))`);
  await check(b, 'voice volume applies to the remote voice', `[...document.querySelectorAll('audio')].some((el) => el.volume === 0.3)`);

  const before = await evaluate(a, `${micTrack}.id`);
  await evaluate(a, `session.mic.dispatchEvent(new Event('ended'))`);
  await waitFor(a, 'an unplugged mic is reopened automatically', `${micTrack}.id !== ${JSON.stringify(before)} && ${micTrack}.readyState === 'live'`);
  await waitFor(b, 'B hears A again', `${inboundAudio}.then((s) => s.level > 0.01)`);
});
