import { app, BrowserWindow } from 'electron';
import { join, resolve } from 'node:path';
import { roomPathFromDeepLink, SCHEME } from './deeplink.ts';
import { createMainWindow } from './window.ts';

app.setName('screenshare');

const url = process.env.APP_URL ?? 'https://p2p-screenshare.onrender.com';
const preload = join(import.meta.dirname, 'preload.cjs');

if (!app.requestSingleInstanceLock()) app.exit();

if (process.defaultApp) app.setAsDefaultProtocolClient(SCHEME, process.execPath, [resolve(process.argv[1])]);
else app.setAsDefaultProtocolClient(SCHEME);

let win: BrowserWindow | null = null;
let pending = findDeepLink(process.argv);

app.on('open-url', (event, link) => {
  event.preventDefault();
  openDeepLink(link);
});
app.on('second-instance', (_event, argv) => {
  const link = findDeepLink(argv);
  if (link) openDeepLink(link);
  else focus();
});

app.whenReady().then(() => {
  showWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) showWindow();
  });
});

app.on('window-all-closed', () => app.quit());

function showWindow() {
  const path = pending && roomPathFromDeepLink(pending);
  pending = undefined;
  win = createMainWindow({ url: path ? new URL(path, url).href : url, preload });
  win.on('closed', () => (win = null));
}

function openDeepLink(link: string) {
  if (!app.isReady() || !win) {
    pending = link;
    if (app.isReady()) showWindow();
    return;
  }
  const path = roomPathFromDeepLink(link);
  if (path) win.loadURL(new URL(path, url).href);
  focus();
}

function focus() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function findDeepLink(argv: string[]) {
  return argv.find((arg) => arg.startsWith(`${SCHEME}://`));
}
