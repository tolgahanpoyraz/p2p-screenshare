import { Call, type Slot } from './core/call.ts';
import { createRoomId, fetchConfig, openMicrophone, signalingUrl } from './core/media.ts';
import { desktop } from './platform.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
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

const remoteAudio = new Map<Slot, HTMLAudioElement>();

async function join(roomId: string) {
  $<HTMLButtonElement>('join').disabled = true;
  const base = location.origin;
  const [config, mic] = await Promise.all([fetchConfig(base), openMicrophone()]);
  log(`mic: ${mic.label}`);

  const call = new Call({ signalingUrl: signalingUrl(base, roomId), iceServers: config.iceServers });
  Object.assign(window, { call });
  await call.setTrack('mic', mic);

  call.on('state', (state) => {
    $('state').textContent = state;
    log(`state → ${state}`);
  });
  call.on('error', ({ code, message }) => log(`error [${code}] ${message}`));
  call.on('remote-track', ({ slot, track }) => {
    if (track?.kind !== 'audio' && track !== null) return;
    let audio = remoteAudio.get(slot);
    if (!track) {
      audio?.remove();
      remoteAudio.delete(slot);
      return;
    }
    // Chrome only pulls remote WebRTC audio when it's attached to a media element.
    audio ??= document.body.appendChild(Object.assign(document.createElement('audio'), { autoplay: true }));
    audio.srcObject = new MediaStream([track]);
    remoteAudio.set(slot, audio);
    log(`remote ${slot} track`);
  });

  const mute = $<HTMLInputElement>('mute');
  mute.disabled = false;
  mute.onchange = () => {
    mic.enabled = !mute.checked;
  };

  const leave = $<HTMLButtonElement>('leave');
  leave.disabled = false;
  leave.onclick = () => {
    call.hangup();
    mic.stop();
    leave.disabled = mute.disabled = true;
  };
}
