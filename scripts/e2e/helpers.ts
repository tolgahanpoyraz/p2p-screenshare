import { app, BrowserWindow } from 'electron';

export const base = process.env.BASE_URL ?? 'http://localhost:5173';

// fakeUi auto-accepts capture prompts, which also bypasses the app's display-media handler.
export function useFakeMedia({ fakeUi = true, cameras = 1 } = {}) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream', `device-count=${cameras}`);
  if (fakeUi) app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
}

export const evaluate = (win: BrowserWindow, code: string, userGesture = false) =>
  win.webContents.executeJavaScript(code, userGesture);

export async function waitFor(win: BrowserWindow, label: string, code: string, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(win, code)) return console.log(`  ✔ ${label}`);
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`timed out: ${label}`);
}

export async function check(win: BrowserWindow, label: string, code: string) {
  if (!(await evaluate(win, code))) throw new Error(`failed: ${label}`);
  console.log(`  ✔ ${label}`);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function openBrowserWindow(url: string) {
  const win = new BrowserWindow({ show: false });
  await win.loadURL(url);
  return win;
}

export const clickJoin = (win: BrowserWindow) => evaluate(win, `document.getElementById('join').click()`);

export const inboundAudio = `(async () => {
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

export const rtp = (type: 'inbound-rtp' | 'outbound-rtp', slot: string) => `(async () => {
  const reports = [];
  (await window.call.peerConnection?.getStats())?.forEach((r) => reports.push(r));
  const rtp = reports.find((r) => r.type === '${type}' && r.mid !== undefined && window.call.slotForMid(r.mid) === '${slot}');
  const codec = rtp && reports.find((r) => r.id === rtp.codecId);
  return rtp ? { ...rtp, codec: codec?.mimeType, fmtp: codec?.sdpFmtpLine, channels: codec?.channels } : null;
})()`;

export function run(main: () => Promise<void>) {
  app.whenReady().then(() =>
    main().then(
      () => app.exit(0),
      (error) => {
        console.error(`  ✘ ${error.message}`);
        app.exit(1);
      },
    ),
  );
}
