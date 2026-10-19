import { base, clickJoin, clickLabel, inboundAudio, openBrowserWindow, pageHasText, run, sleep, useFakeMedia, waitFor } from './helpers.ts';

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

  const extra = await join();
  await waitFor(extra, 'a third person sees the room is full', pageHasText('This room already has two people'));
  extra.destroy();
  await waitFor(a, 'A shows they are connected', pageHasText('Connected'));

  await clickLabel(a, 'Mute');
  await sleep(1500);
  await waitFor(b, 'B hears silence after A mutes', `${inboundAudio}.then((s) => s.level < 0.001)`);

  await waitFor(a, 'A shows muted', pageHasText('muted'));

  await clickLabel(b, 'Leave');
  await waitFor(b, 'B is back home after leaving', pageHasText('New room'));
  await waitFor(a, 'A back to waiting after B leaves', `window.call.state === 'waiting'`);
  await waitFor(a, 'A sees that they left', pageHasText('Them left'));

  const c = await join();
  await waitFor(a, 'A reconnects with C', `window.call.state === 'connected'`);
  await waitFor(c, 'C receives audio', `${inboundAudio}.then((s) => s.packets > 50)`);
});
