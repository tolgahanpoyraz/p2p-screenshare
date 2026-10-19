import { Call, type Slot } from './core/call.ts';
import { Camera } from './core/camera.ts';
import { createRoomId, fetchConfig, openMicrophone, signalingUrl } from './core/media.ts';
import { ScreenShare, screenPresets, type ScreenQuality, type VideoCodec } from './core/screen.ts';
import { StatsSampler, type ConnectionStats } from './core/stats.ts';
import { desktop } from './platform.ts';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const log = (text: string) => {
  $('log').textContent += `${new Date().toLocaleTimeString()}  ${text}\n`;
};

$('env').textContent = desktop
  ? `Mac app (Electron ${desktop.versions.electron}, Chrome ${desktop.versions.chrome})`
  : 'browser';

const roomId = location.pathname.match(/^\/r\/([^/]+)$/)?.[1];

if (!roomId) {
  $('lobby').hidden = false;
  $('create').onclick = () => location.assign(`/r/${createRoomId()}`);
} else {
  $('room').hidden = false;
  $<HTMLAnchorElement>('link').href = location.href;
  $('link').textContent = location.href;
  $('copy').onclick = () => navigator.clipboard.writeText(location.href);
  $('join').onclick = () => join(roomId);
}

async function join(roomId: string) {
  $<HTMLButtonElement>('join').disabled = true;
  const base = location.origin;
  const [config, mic] = await Promise.all([fetchConfig(base), openMicrophone()]);
  log(`mic: ${mic.label}`);

  const call = new Call({ signalingUrl: signalingUrl(base, roomId), iceServers: config.iceServers });
  const screen = new ScreenShare(call);
  const camera = new Camera(call);
  Object.assign(window, { call, screenShare: screen, camera });
  await call.setTrack('mic', mic);

  call.on('state', (state) => {
    $('state').textContent = state;
    log(`state → ${state}`);
  });
  call.on('error', ({ code, message }) => log(`error [${code}] ${message}`));

  setupControls(call, mic);
  setupRemoteMedia(call);
  if (ScreenShare.supported) setupScreenShare(screen);
  setupCamera(camera);
  startStats(new StatsSampler(call));
}

function setupControls(call: Call, mic: MediaStreamTrack) {
  const mute = $<HTMLInputElement>('mute');
  const leave = $<HTMLButtonElement>('leave');
  mute.disabled = leave.disabled = false;
  mute.onchange = () => {
    mic.enabled = !mute.checked;
  };
  leave.onclick = () => {
    call.hangup();
    mic.stop();
    leave.disabled = mute.disabled = true;
  };
}

function setupRemoteMedia(call: Call) {
  $('remote').hidden = false;
  const video = $<HTMLVideoElement>('remote-screen');
  const cameraVideo = $<HTMLVideoElement>('remote-camera');
  const volumes: Partial<Record<Slot, HTMLInputElement>> = {
    mic: $('voice-volume'),
    screenAudio: $('show-volume'),
  };
  const players = new Map<Slot, HTMLAudioElement>();

  for (const [slot, input] of Object.entries(volumes)) {
    input.oninput = () => {
      const player = players.get(slot as Slot);
      if (player) player.volume = Number(input.value);
    };
  }

  call.on('remote-track', ({ slot, track }) => {
    if (slot === 'screen' || slot === 'camera') {
      (slot === 'screen' ? video : cameraVideo).srcObject = track && new MediaStream([track]);
      return;
    }
    const volume = volumes[slot];
    if (!volume) return;
    players.get(slot)?.remove();
    players.delete(slot);
    if (!track) return;
    // Chrome only pulls remote WebRTC audio when it's attached to a media element.
    const player = Object.assign(document.createElement('audio'), { autoplay: true });
    player.srcObject = new MediaStream([track]);
    player.volume = Number(volume.value);
    players.set(slot, document.body.appendChild(player));
  });

  call.on('remote-media', (active) => {
    video.hidden = !active.screen;
    cameraVideo.hidden = !active.camera;
    log(`remote media: ${Object.entries(active).filter(([, on]) => on).map(([slot]) => slot).join(', ') || 'none'}`);
  });
}

function setupScreenShare(screen: ScreenShare) {
  $('screen').hidden = false;
  const share = $<HTMLButtonElement>('share');
  const stop = $<HTMLButtonElement>('stop-share');
  const withAudio = $<HTMLInputElement>('share-audio');
  const sources = $('sources');

  share.onclick = async () => {
    if (!desktop) {
      await screen.start({ audio: withAudio.checked }).catch((error) => log(`share failed: ${error}`));
      return;
    }
    sources.replaceChildren();
    for (const source of await desktop.listScreenSources()) {
      const button = document.createElement('button');
      button.dataset.sourceId = source.id;
      button.innerHTML = `<img src="${source.thumbnail}" alt=""><span></span>`;
      button.querySelector('span')!.textContent = source.name;
      button.onclick = async () => {
        sources.replaceChildren();
        await screen
          .start({ sourceId: source.id, audio: withAudio.checked })
          .catch((error) => log(`share failed: ${error}`));
      };
      sources.append(button);
    }
  };
  stop.onclick = () => screen.stop();
  screen.on('change', ({ active, audio }) => {
    stop.disabled = !active;
    log(active ? `sharing screen${audio ? ' + system audio' : ''}` : 'stopped sharing');
  });

  const preset = $<HTMLSelectElement>('preset');
  const fields = {
    codec: $<HTMLSelectElement>('codec'),
    mode: $<HTMLSelectElement>('mode'),
    height: $<HTMLInputElement>('height'),
    fps: $<HTMLInputElement>('fps'),
    bitrate: $<HTMLInputElement>('bitrate'),
  };
  preset.append(...Object.keys(screenPresets).map((name) => new Option(name, name, false, name === '1080p30')));

  const show = (quality: ScreenQuality) => {
    fields.codec.value = quality.codec;
    fields.mode.value = quality.mode;
    fields.height.value = quality.height ? String(quality.height) : '';
    fields.fps.value = String(quality.frameRate);
    fields.bitrate.value = String(quality.maxBitrateKbps);
  };
  const read = (): ScreenQuality => ({
    codec: fields.codec.value as VideoCodec,
    mode: fields.mode.value as ScreenQuality['mode'],
    height: Number(fields.height.value) || undefined,
    frameRate: Number(fields.fps.value),
    maxBitrateKbps: Number(fields.bitrate.value),
  });
  const apply = () => screen.setQuality(read()).catch((error) => log(`quality: ${error}`));

  show(screen.quality);
  preset.onchange = () => {
    show(screenPresets[preset.value as keyof typeof screenPresets]);
    apply();
  };
  for (const field of Object.values(fields)) field.onchange = apply;
}

function setupCamera(camera: Camera) {
  $('camera').hidden = false;
  const toggle = $<HTMLButtonElement>('camera-toggle');
  const switcher = $<HTMLButtonElement>('camera-switch');
  const devices = $<HTMLSelectElement>('camera-device');
  const preview = $<HTMLVideoElement>('local-camera');

  const listDevices = async () => {
    const cameras = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    devices.replaceChildren(...cameras.map((c, i) => new Option(c.label || `Camera ${i + 1}`, c.deviceId)));
    devices.value = camera.track?.getSettings().deviceId ?? '';
  };

  toggle.onclick = () =>
    (camera.active ? camera.stop() : camera.start()).catch((error) => log(`camera: ${error}`));
  switcher.onclick = () => camera.switchCamera().catch((error) => log(`camera: ${error}`));
  devices.onchange = () => camera.start({ deviceId: devices.value }).catch((error) => log(`camera: ${error}`));

  camera.on('change', async ({ active }) => {
    toggle.textContent = active ? 'Camera off' : 'Camera on';
    switcher.disabled = !active;
    preview.hidden = !active;
    preview.srcObject = camera.track && new MediaStream([camera.track]);
    preview.classList.toggle('mirrored', camera.track?.getSettings().facingMode !== 'environment');
    await listDevices();
  });
  listDevices();
}

function startStats(sampler: StatsSampler) {
  setInterval(async () => {
    $('stats').textContent = format(await sampler.sample());
  }, 1000);
}

function format(stats: ConnectionStats | null) {
  if (!stats) return '';
  const lines = [`route ${stats.route ?? '?'}  rtt ${stats.rttMs ?? '?'}ms  available out ${stats.availableOutgoingKbps ?? '?'}kbps`];
  for (const s of stats.streams) {
    const parts = [`${s.direction === 'send' ? '↑' : '↓'} ${s.slot.padEnd(11)} ${s.codec ?? ''}`, `${s.kbps}kbps`];
    if (s.width) parts.push(`${s.width}x${s.height}@${s.fps ?? 0}`);
    if (s.implementation) parts.push(`${s.implementation}${s.hardware ? ' (hw)' : ''}`);
    if (s.limitation && s.limitation !== 'none') parts.push(`limited by ${s.limitation}`);
    if (s.packetsLost) parts.push(`lost ${s.packetsLost}`);
    if (s.jitterMs) parts.push(`jitter ${s.jitterMs}ms`);
    if (s.decodeMs) parts.push(`decode ${s.decodeMs}ms`);
    lines.push(parts.join('  '));
  }
  return lines.join('\n');
}
