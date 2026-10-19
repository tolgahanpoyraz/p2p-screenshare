import { app, BrowserWindow } from 'electron';

const base = process.env.BASE_URL ?? 'http://localhost:5173';
const room = `e2e-${Date.now()}`;

app.commandLine.appendSwitch('use-fake-device-for-media-stream');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const evaluate = (win: BrowserWindow, code: string) => win.webContents.executeJavaScript(code);

async function waitFor(win: BrowserWindow, label: string, code: string, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(win, code)) return console.log(`  ✔ ${label}`);
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`timed out: ${label}`);
}

async function joinWindow() {
  const win = new BrowserWindow({ show: false });
  await win.loadURL(`${base}/r/${room}`);
  await evaluate(win, `document.getElementById('join').click()`);
  return win;
}

const inboundAudio = `(async () => {
  const stats = await window.call.peerConnection?.getStats();
  let packets = 0, level = 0;
  stats?.forEach((r) => {
    if (r.type === 'inbound-rtp' && r.kind === 'audio' && r.packetsReceived) {
      packets += r.packetsReceived;
      level = Math.max(level, r.audioLevel ?? 0);
    }
  });
  return { packets, level };
})()`;

async function main() {
  console.log(`room ${room}`);
  const a = await joinWindow();
  await waitFor(a, 'A waiting alone', `window.call?.state === 'waiting'`);

  const b = await joinWindow();
  await waitFor(a, 'A connected', `window.call.state === 'connected'`);
  await waitFor(b, 'B connected', `window.call.state === 'connected'`);

  await waitFor(a, 'A receives audio', `${inboundAudio}.then((s) => s.packets > 50)`);
  await waitFor(b, 'B receives audio', `${inboundAudio}.then((s) => s.packets > 50)`);
  await waitFor(b, 'B hears A', `${inboundAudio}.then((s) => s.level > 0.01)`);

  await evaluate(a, `document.getElementById('mute').click()`);
  await new Promise((r) => setTimeout(r, 1500));
  await waitFor(b, 'B hears silence after A mutes', `${inboundAudio}.then((s) => s.level < 0.001)`);

  await evaluate(b, `document.getElementById('leave').click()`);
  await waitFor(a, 'A back to waiting after B leaves', `window.call.state === 'waiting'`);

  const c = await joinWindow();
  await waitFor(a, 'A reconnects with C', `window.call.state === 'connected'`);
  await waitFor(c, 'C receives audio', `${inboundAudio}.then((s) => s.packets > 50)`);

  console.log('PASS');
}

app.whenReady().then(() =>
  main().then(
    () => app.exit(0),
    (error) => {
      console.error(`FAIL: ${error.message}`);
      app.exit(1);
    },
  ),
);
