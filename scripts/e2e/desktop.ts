import { join } from 'node:path';
import { createMainWindow } from '../../desktop/window.ts';
import { base, check, clickJoin, evaluate, inboundAudio, openBrowserWindow, run, sleep, useFakeMedia, waitFor } from './helpers.ts';

useFakeMedia();

run(async () => {
  const room = `${base}/r/desktop-${Date.now()}`;
  const preload = join(import.meta.dirname, '../desktop/preload.cjs');

  const mac = createMainWindow({ url: base, preload, show: false });
  await new Promise<void>((done) => mac.webContents.once('did-finish-load', () => done()));
  const tablet = await openBrowserWindow(room);

  await check(mac, 'app window exposes the desktop bridge', `window.desktop?.platform === '${process.platform}'`);
  await check(mac, 'page has no Node access', `typeof require === 'undefined' && typeof process === 'undefined'`);
  await check(mac, 'notifications are allowed', `Notification.permission === 'granted'`);
  await check(mac, 'dock attention bridge responds', `window.desktop.requestAttention().then(() => true)`);
  await check(tablet, 'browser window has no bridge', `window.desktop === undefined`);

  await evaluate(
    mac,
    `const input = document.querySelector('.join-link input');
    input.value = ${JSON.stringify(room)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    true`,
  );
  await evaluate(mac, `document.querySelector('.join-link').requestSubmit(); true`);
  await waitFor(mac, 'pasting an invite link opens the room', `location.href === ${JSON.stringify(room)}`);

  await clickJoin(mac);
  await clickJoin(tablet);
  await waitFor(mac, 'app connects to browser peer', `window.call?.state === 'connected'`);
  await waitFor(mac, 'app receives audio (mic permission granted)', `${inboundAudio}.then((s) => s.packets > 50)`);
  await waitFor(tablet, 'browser receives audio from app', `${inboundAudio}.then((s) => s.packets > 50)`);

  await evaluate(mac, `location.href = 'https://example.com'`);
  await sleep(500);
  await check(mac, 'navigation to another origin is blocked', `location.origin === '${new URL(base).origin}'`);

  const blocked = await evaluate(
    mac,
    `navigator.permissions.query({ name: 'geolocation' }).then((p) => p.state)`,
  );
  if (blocked !== 'denied') throw new Error(`geolocation should be denied, got ${blocked}`);
  console.log('  ✔ permissions outside the allow-list are denied');
});
