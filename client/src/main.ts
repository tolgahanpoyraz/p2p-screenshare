import type { VoiceState } from './core/call.ts';
import { createRoomId } from './core/media.ts';
import { screenPresets, type ScreenQuality, type VideoCodec } from './core/screen.ts';
import { Session } from './core/session.ts';
import { SettingsStore } from './core/settings.ts';
import type { ConnectionStats } from './core/stats.ts';
import { $, log } from './dev/dom.ts';
import { setupSettingsPanel } from './dev/settings-panel.ts';
import { desktop } from './platform.ts';

const settings = new SettingsStore();
setupSettingsPanel(settings);

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
  $('join').onclick = () => join(roomId).catch((error) => log(`join failed: ${error}`));
}

async function join(roomId: string) {
  $<HTMLButtonElement>('join').disabled = true;
  const session = await Session.join({ baseUrl: location.origin, roomId, settings });
  Object.assign(window, {
    session,
    call: session.call,
    voice: session.voice,
    camera: session.camera,
    screenShare: session.screen,
  });
  log(`mic: ${session.mic?.label}`);

  session.call.on('state', (state) => {
    $('state').textContent = state;
    log(`state → ${state}`);
  });
  session.on('error', ({ code, message }) => log(`error [${code}] ${message}`));

  $('call').hidden = false;
  setupControls(session);
  setupVoice(session);
  setupRemoteVideo(session);
  setupScreenShare(session);
  setupCamera(session);
  setInterval(async () => {
    $('stats').textContent = format(await session.stats.sample());
  }, 1000);
}

function setupControls(session: Session) {
  const mute = $<HTMLInputElement>('mute');
  const leave = $<HTMLButtonElement>('leave');
  mute.disabled = leave.disabled = false;
  mute.onchange = () => session.voice.setMuted(mute.checked);
  leave.onclick = () => {
    session.leave();
    leave.disabled = mute.disabled = true;
    $('call').hidden = true;
  };
}

const describeVoice = (state: VoiceState | null) =>
  !state
    ? '–'
    : `${state.mode === 'open' ? 'open mic' : 'push-to-talk'}, ${state.transmitting ? 'transmitting' : 'silent'}`;

function setupVoice({ voice, call }: Session) {
  const hold = $<HTMLButtonElement>('ptt-hold');
  const showHold = () => (hold.hidden = voice.mode !== 'push-to-talk');
  showHold();

  hold.onpointerdown = (event) => {
    hold.setPointerCapture(event.pointerId);
    hold.classList.add('held');
    voice.press();
  };
  const release = () => {
    hold.classList.remove('held');
    voice.release();
  };
  hold.onpointerup = release;
  hold.onpointercancel = release;

  $('voice-local').textContent = describeVoice({ mode: voice.mode, transmitting: voice.transmitting });
  voice.on('change', (state) => {
    $('voice-local').textContent = describeVoice(state);
    showHold();
  });
  call.on('remote-voice', (state) => ($('voice-remote').textContent = describeVoice(state)));
}

function setupRemoteVideo({ call }: Session) {
  const screen = $<HTMLVideoElement>('remote-screen');
  const camera = $<HTMLVideoElement>('remote-camera');
  call.on('remote-track', ({ slot, track }) => {
    if (slot === 'screen') screen.srcObject = track && new MediaStream([track]);
    if (slot === 'camera') camera.srcObject = track && new MediaStream([track]);
  });
  call.on('remote-media', (active) => {
    screen.hidden = !active.screen;
    camera.hidden = !active.camera;
  });
}

function setupScreenShare({ screen }: Session) {
  const share = $<HTMLButtonElement>('share');
  const stop = $<HTMLButtonElement>('stop-share');
  const withAudio = $<HTMLInputElement>('share-audio');
  const sources = $('sources');
  share.disabled = !navigator.mediaDevices.getDisplayMedia;

  withAudio.checked = settings.value.shareSystemAudio;
  withAudio.onchange = () => settings.update({ shareSystemAudio: withAudio.checked });

  const start = (sourceId?: string) =>
    screen.start({ sourceId, audio: withAudio.checked }).catch((error) => log(`share failed: ${error}`));

  share.onclick = async () => {
    if (!desktop) return start();
    sources.replaceChildren();
    for (const source of await desktop.listScreenSources()) {
      const button = document.createElement('button');
      button.innerHTML = `<img src="${source.thumbnail}" alt=""><span></span>`;
      button.querySelector('span')!.textContent = source.name;
      button.onclick = () => {
        sources.replaceChildren();
        start(source.id);
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
  preset.append(new Option('custom', ''), ...Object.keys(screenPresets).map((name) => new Option(name, name)));

  const show = (quality: ScreenQuality) => {
    fields.codec.value = quality.codec;
    fields.mode.value = quality.mode;
    fields.height.value = quality.height ? String(quality.height) : '';
    fields.fps.value = String(quality.frameRate);
    fields.bitrate.value = String(quality.maxBitrateKbps);
    const match = Object.entries(screenPresets).find(([, p]) => JSON.stringify(p) === JSON.stringify(quality));
    preset.value = match?.[0] ?? '';
  };
  const read = (): ScreenQuality => ({
    codec: fields.codec.value as VideoCodec,
    mode: fields.mode.value as ScreenQuality['mode'],
    height: Number(fields.height.value) || undefined,
    frameRate: Number(fields.fps.value),
    maxBitrateKbps: Number(fields.bitrate.value),
  });

  show(settings.value.screen);
  preset.onchange = () => {
    const chosen = screenPresets[preset.value as keyof typeof screenPresets];
    if (chosen) settings.update({ screen: chosen });
  };
  for (const field of Object.values(fields)) field.onchange = () => settings.update({ screen: read() });
  settings.on('change', ({ changed }) => {
    if (changed.includes('screen')) show(settings.value.screen);
  });
}

function setupCamera({ camera }: Session) {
  const toggle = $<HTMLButtonElement>('camera-toggle');
  const switcher = $<HTMLButtonElement>('camera-switch');
  const preview = $<HTMLVideoElement>('local-camera');
  toggle.onclick = () => (camera.active ? camera.stop() : camera.start()).catch((error) => log(`camera: ${error}`));
  switcher.onclick = () => camera.switchCamera().catch((error) => log(`camera: ${error}`));
  camera.on('change', ({ active }) => {
    toggle.textContent = active ? 'Camera off' : 'Camera on';
    switcher.disabled = !active;
    preview.hidden = !active;
    preview.srcObject = camera.track && new MediaStream([camera.track]);
    preview.classList.toggle('mirrored', camera.track?.getSettings().facingMode !== 'environment');
  });
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
