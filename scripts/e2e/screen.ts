import { join } from 'node:path';
import { createMainWindow } from '../../desktop/window.ts';
import { base, check, clickJoin, evaluate, openBrowserWindow, rtp, run, useFakeMedia, waitFor } from './helpers.ts';

useFakeMedia({ fakeUi: false });

run(async () => {
  const room = `${base}/r/screen-${Date.now()}`;
  const mac = createMainWindow({ url: room, preload: join(import.meta.dirname, '../desktop/preload.cjs'), show: false });
  await new Promise<void>((done) => mac.webContents.once('did-finish-load', () => done()));
  const tablet = await openBrowserWindow(room);

  await clickJoin(mac);
  await clickJoin(tablet);
  await waitFor(mac, 'connected', `window.call?.state === 'connected'`);

  const sources = await evaluate(mac, `desktop.listScreenSources()`);
  const display = sources.find((s: { kind: string }) => s.kind === 'screen');
  if (!display?.thumbnail.startsWith('data:image/png')) throw new Error('no screen source with a thumbnail');
  console.log(`  ✔ lists ${sources.length} sources (screen: "${display.name}")`);

  const tryCapture = `navigator.mediaDevices.getDisplayMedia({ video: true }).then((s) => (s.getTracks().forEach((t) => t.stop()), 'granted'), () => 'rejected')`;
  if ((await evaluate(mac, tryCapture, true)) !== 'rejected') throw new Error('capture without a selection should be rejected');
  console.log('  ✔ capture without a selected source is rejected');

  await evaluate(mac, `screenShare.start({ sourceId: ${JSON.stringify(display.id)}, audio: true })`, true);
  if ((await evaluate(mac, tryCapture, true)) !== 'rejected') throw new Error('a selection should be single-use');
  console.log('  ✔ a selection is single-use');
  await waitFor(tablet, 'receiver is told the screen is on', `call.remoteMedia.screen && call.remoteMedia.screenAudio`);
  // Screen capture only emits frames when something changes, so an idle screen may yield just one.
  await waitFor(tablet, 'receiver decodes screen video', `${rtp('inbound-rtp', 'screen')}.then((r) => r?.keyFramesDecoded >= 1)`);
  await check(mac, 'screen has high bandwidth priority', `call.peerConnection.getTransceivers()[2].sender.getParameters().encodings[0].priority === 'high'`);
  await check(tablet, 'video starts at 6 Mbps', `${rtp('inbound-rtp', 'screen')}.then((r) => r.fmtp.includes('x-google-start-bitrate=6000'))`);
  await waitFor(tablet, 'receiver gets show audio', `${rtp('inbound-rtp', 'screenAudio')}.then((r) => r?.packetsReceived > 50)`);
  await check(tablet, 'show audio negotiated as stereo opus', `${rtp('inbound-rtp', 'screenAudio')}.then((r) => r.fmtp.includes('stereo=1') && r.channels === 2)`);
  await check(mac, 'show audio targets 256 kbps', `${rtp('outbound-rtp', 'screenAudio')}.then((r) => r.targetBitrate >= 250_000)`);

  await evaluate(mac, `screenShare.setQuality({ ...screenShare.quality, height: 720 })`);
  await waitFor(
    mac,
    '720p capture keeps the display aspect ratio',
    `(() => {
      const { width, height } = screenShare.video.getSettings();
      return height <= 720 && height > 700 && Math.abs(width / height - screen.width / screen.height) < 0.01;
    })()`,
  );

  for (const codec of ['video/VP9', 'video/AV1', 'video/H264']) {
    await evaluate(mac, `screenShare.setQuality({ ...screenShare.quality, codec: '${codec}' })`);
    await waitFor(mac, `switches to ${codec}`, `${rtp('outbound-rtp', 'screen')}.then((r) => r?.codec === '${codec}')`);
    const before = (await evaluate(tablet, rtp('inbound-rtp', 'screen'))).framesDecoded;
    await waitFor(tablet, `  receiver keeps decoding ${codec}`, `${rtp('inbound-rtp', 'screen')}.then((r) => r.codec === '${codec}' && r.framesDecoded > ${before})`);
    const out = await evaluate(mac, rtp('outbound-rtp', 'screen'));
    const inbound = await evaluate(tablet, rtp('inbound-rtp', 'screen'));
    console.log(`    encoder ${out.encoderImplementation} (power efficient: ${out.powerEfficientEncoder}), decoder ${inbound.decoderImplementation}, ${out.frameWidth}x${out.frameHeight}`);
  }

  await evaluate(mac, `screenShare.stop()`);
  await waitFor(tablet, 'receiver is told the screen is off', `!call.remoteMedia.screen && !call.remoteMedia.screenAudio`);
});
