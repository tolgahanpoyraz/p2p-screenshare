import { join } from 'node:path';
import { createMainWindow } from '../../desktop/window.ts';
import { base, check, clickJoin, evaluate, openBrowserWindow, rtp, run, useFakeMedia, waitFor } from './helpers.ts';

useFakeMedia({ cameras: 2 });

const decodingCamera = (min: number) => `${rtp('inbound-rtp', 'camera')}.then((r) => r?.framesDecoded > ${min})`;

run(async () => {
  const room = `${base}/r/camera-${Date.now()}`;
  const mac = createMainWindow({ url: room, preload: join(import.meta.dirname, '../desktop/preload.cjs'), show: false });
  await new Promise<void>((done) => mac.webContents.once('did-finish-load', () => done()));
  const tablet = await openBrowserWindow(room);

  await clickJoin(mac);
  await clickJoin(tablet);
  await waitFor(mac, 'connected', `window.call?.state === 'connected'`);

  await evaluate(tablet, `camera.start()`);
  await waitFor(mac, 'mac is told the tablet camera is on', `call.remoteMedia.camera`);
  await waitFor(mac, 'mac decodes the tablet camera', decodingCamera(20));

  await evaluate(mac, `camera.start()`);
  await waitFor(tablet, 'tablet decodes the mac camera', decodingCamera(20));

  const firstDevice = await evaluate(tablet, `camera.track.getSettings().deviceId`);
  await evaluate(tablet, `window.sawCameraOff = false; camera.on('change', ({ active }) => { if (!active) window.sawCameraOff = true; }); true`);
  await evaluate(mac, `window.sawRemoteOff = false; call.on('remote-media', (m) => { if (!m.camera) window.sawRemoteOff = true; }); true`);
  const before = (await evaluate(mac, rtp('inbound-rtp', 'camera'))).framesDecoded;
  await evaluate(tablet, `camera.switchCamera()`);
  await check(tablet, 'switch picks the other camera', `camera.track.getSettings().deviceId !== ${JSON.stringify(firstDevice)}`);
  await waitFor(mac, 'mac keeps decoding after the switch', decodingCamera(before + 20));
  await check(mac, 'switching never told the mac the camera was off', `!window.sawRemoteOff`);
  await check(tablet, 'switching never reported the camera as stopped', `!window.sawCameraOff`);

  await evaluate(tablet, `window.oldCamera = camera.track; camera.stop().then(() => true)`);
  await check(tablet, 'stopping releases the camera', `window.oldCamera.readyState === 'ended' && camera.track === null`);
  await waitFor(mac, 'mac is told the camera is off', `!call.remoteMedia.camera`);

  await evaluate(tablet, `camera.start()`);
  await waitFor(mac, 'camera can be turned back on', `call.remoteMedia.camera`);

  const cameraCap = `call.peerConnection?.getTransceivers()[1]?.sender.getParameters().encodings[0]?.maxBitrate === 2_500_000`;
  await check(mac, 'mac camera has its 2.5 Mbps cap', cameraCap);
  tablet.destroy();
  await waitFor(mac, 'mac back to waiting when the tablet leaves', `call.state === 'waiting'`);
  const rejoined = await openBrowserWindow(room);
  await clickJoin(rejoined);
  await waitFor(mac, 'reconnects to a new tablet', `call.state === 'connected'`);
  await waitFor(mac, 'camera cap is re-applied on the new connection', cameraCap);
  await waitFor(rejoined, 'new tablet decodes the mac camera', decodingCamera(20));
});
