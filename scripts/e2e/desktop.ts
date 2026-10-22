import { join } from 'node:path';
import { clipboard } from 'electron';
import { createMainWindow } from '../../desktop/window.ts';
import {
  base,
  check,
  clickJoin,
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

run(async () => {
  const room = `${base}/r/desktop-${Date.now()}`;
  const preload = join(import.meta.dirname, '../desktop/preload.cjs');

  const savedClipboard = await clipboard.readText();
  await clipboard.writeText('hunter2hunter2');

  const mac = createMainWindow({ url: base, preload, show: false });
  await new Promise<void>((done) => mac.webContents.once('did-finish-load', () => done()));
  const tablet = await openBrowserWindow(room);

  await check(mac, 'app window exposes the desktop bridge', `window.desktop?.platform === '${process.platform}'`);
  await check(mac, 'page has no Node access', `typeof require === 'undefined' && typeof process === 'undefined'`);
  await check(tablet, 'browser window has no bridge', `window.desktop === undefined`);

  const input = `document.querySelector('.join-link input')`;
  const refocus = `window.dispatchEvent(new Event('focus')); true`;
  await sleep(300);
  await check(mac, 'clipboard text that is not an invite link stays private', `${input}.value === ''`);
  await clipboard.writeText('https://example.com/r/abcDEF12345');
  await evaluate(mac, refocus);
  await sleep(300);
  await check(mac, 'invite links to other servers are ignored', `${input}.value === ''`);

  await clipboard.writeText(`  ${room}\n`);
  await evaluate(mac, refocus);
  await waitFor(mac, 'focusing the window pre-fills an invite link from the clipboard', `${input}.value === ${JSON.stringify(room)}`);
  await check(mac, 'pre-filled link is labelled and Join is focused', `${pageHasText('Invite link from your clipboard')} && document.activeElement?.type === 'submit'`);
  await check(mac, 'pre-filled link does not auto-join', `location.href === ${JSON.stringify(base + '/')}`);

  await evaluate(
    mac,
    `${input}.value = 'typed by me';
    ${input}.dispatchEvent(new Event('input', { bubbles: true }));
    true`,
  );
  await clipboard.writeText(`${base}/r/another-room-1`);
  await evaluate(mac, refocus);
  await sleep(300);
  await check(mac, 'clipboard does not overwrite typed text', `${input}.value === 'typed by me' && !${pageHasText('Invite link from your clipboard')}`);
  await clipboard.writeText(savedClipboard);

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
