import { base, clickJoin, evaluate, inboundAudio, openBrowserWindow, run, sleep, useFakeMedia, waitFor } from './helpers.ts';

useFakeMedia();

run(async () => {
  const room = `${base}/r/voice-${Date.now()}`;
  const join = async () => {
    const win = await openBrowserWindow(room);
    await clickJoin(win);
    return win;
  };

  const a = await join();
  await waitFor(a, 'A waiting alone', `window.call?.state === 'waiting'`);

  const b = await join();
  await waitFor(a, 'A connected', `window.call.state === 'connected'`);
  await waitFor(b, 'B connected', `window.call.state === 'connected'`);

  await waitFor(a, 'A receives audio', `${inboundAudio}.then((s) => s.packets > 50)`);
  await waitFor(b, 'B receives audio', `${inboundAudio}.then((s) => s.packets > 50)`);
  await waitFor(b, 'B hears A', `${inboundAudio}.then((s) => s.level > 0.01)`);

  await evaluate(a, `document.getElementById('mute').click()`);
  await sleep(1500);
  await waitFor(b, 'B hears silence after A mutes', `${inboundAudio}.then((s) => s.level < 0.001)`);

  await evaluate(b, `document.getElementById('leave').click()`);
  await waitFor(a, 'A back to waiting after B leaves', `window.call.state === 'waiting'`);

  const c = await join();
  await waitFor(a, 'A reconnects with C', `window.call.state === 'connected'`);
  await waitFor(c, 'C receives audio', `${inboundAudio}.then((s) => s.packets > 50)`);
});
