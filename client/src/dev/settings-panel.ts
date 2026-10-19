import { LevelMeter, playClip, playTestTone, recordClip } from '../core/audio-test.ts';
import { canChooseSpeaker, listDevices, watchDevices } from '../core/devices.ts';
import { openMicrophone } from '../core/media.ts';
import type { VoiceMode } from '../core/ptt.ts';
import type { SettingsStore } from '../core/settings.ts';
import { desktop } from '../platform.ts';
import { $, fillSelect, log } from './dom.ts';

export function setupSettingsPanel(settings: SettingsStore) {
  const refreshDevices = async () => {
    const { microphones, speakers, cameras } = await listDevices();
    const s = settings.value;
    fillSelect($('set-mic'), microphones, s.microphoneId, 'Microphone');
    fillSelect($('set-speaker'), speakers, s.speakerId, 'Speaker');
    fillSelect($('set-camera'), cameras, s.camera.deviceId, 'Camera');
  };
  watchDevices(refreshDevices);
  refreshDevices();

  setupMicrophone(settings, refreshDevices);
  setupSpeaker(settings);
  setupCamera(settings, refreshDevices);
  setupPushToTalk(settings);
}

function setupMicrophone(settings: SettingsStore, refreshDevices: () => void) {
  const select = $<HTMLSelectElement>('set-mic');
  const toggles = {
    echoCancellation: $<HTMLInputElement>('set-echo'),
    noiseSuppression: $<HTMLInputElement>('set-noise'),
    autoGainControl: $<HTMLInputElement>('set-gain'),
  };
  const testButton = $<HTMLButtonElement>('mic-test');
  const record = $<HTMLButtonElement>('mic-record');
  const meter = $<HTMLMeterElement>('mic-level');

  for (const [key, input] of Object.entries(toggles)) {
    input.checked = settings.value.voiceProcessing[key as keyof typeof toggles];
    input.onchange = () => settings.update({ voiceProcessing: { [key]: input.checked } });
  }
  select.onchange = () => settings.update({ microphoneId: select.value || undefined });

  let test: { track: MediaStreamTrack; meter: LevelMeter; frame: number } | null = null;
  const stopTest = () => {
    if (!test) return;
    cancelAnimationFrame(test.frame);
    test.meter.close();
    test.track.stop();
    test = null;
    meter.value = 0;
    testButton.textContent = 'Test microphone';
    record.disabled = true;
  };
  const startTest = async () => {
    const { microphoneId, voiceProcessing } = settings.value;
    const track = await openMicrophone(microphoneId, voiceProcessing);
    const levels = new LevelMeter(track);
    const draw = () => {
      meter.value = levels.level();
      if (test) test.frame = requestAnimationFrame(draw);
    };
    test = { track, meter: levels, frame: requestAnimationFrame(draw) };
    testButton.textContent = 'Stop test';
    record.disabled = false;
    refreshDevices();
  };

  testButton.onclick = () => (test ? stopTest() : startTest().catch((error) => log(`mic test: ${error}`)));
  settings.on('change', ({ changed }) => {
    if (test && (changed.includes('microphoneId') || changed.includes('voiceProcessing'))) {
      stopTest();
      startTest();
    }
  });

  record.onclick = async () => {
    if (!test) return;
    record.disabled = true;
    record.textContent = 'Recording…';
    const clip = await recordClip(test.track);
    record.textContent = 'Playing…';
    await playClip(clip, settings.value.speakerId);
    record.textContent = 'Record 3 s and play back';
    record.disabled = !test;
  };
}

function setupSpeaker(settings: SettingsStore) {
  const select = $<HTMLSelectElement>('set-speaker');
  select.disabled = !canChooseSpeaker;
  select.onchange = () => settings.update({ speakerId: select.value || undefined });
  $('speaker-test').onclick = () =>
    playTestTone(settings.value.speakerId).catch((error) => log(`speaker test: ${error}`));

  const voice = $<HTMLInputElement>('set-voice-volume');
  const show = $<HTMLInputElement>('set-show-volume');
  voice.value = String(settings.value.volumes.voice);
  show.value = String(settings.value.volumes.show);
  voice.oninput = () => settings.update({ volumes: { voice: Number(voice.value) } });
  show.oninput = () => settings.update({ volumes: { show: Number(show.value) } });
}

function setupCamera(settings: SettingsStore, refreshDevices: () => void) {
  const select = $<HTMLSelectElement>('set-camera');
  const height = $<HTMLInputElement>('set-camera-height');
  const fps = $<HTMLInputElement>('set-camera-fps');
  const bitrate = $<HTMLInputElement>('set-camera-bitrate');
  const button = $<HTMLButtonElement>('camera-test');
  const preview = $<HTMLVideoElement>('camera-preview');

  const s = settings.value.camera;
  height.value = String(s.height);
  fps.value = String(s.frameRate);
  bitrate.value = String(s.maxBitrateKbps);
  select.onchange = () => settings.update({ camera: { deviceId: select.value || undefined } });
  height.onchange = () => settings.update({ camera: { height: Number(height.value) } });
  fps.onchange = () => settings.update({ camera: { frameRate: Number(fps.value) } });
  bitrate.onchange = () => settings.update({ camera: { maxBitrateKbps: Number(bitrate.value) } });

  let track: MediaStreamTrack | null = null;
  const stop = () => {
    track?.stop();
    track = null;
    preview.hidden = true;
    button.textContent = 'Preview camera';
  };
  const start = async () => {
    const { deviceId, height, frameRate } = settings.value.camera;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), height: { ideal: height }, frameRate: { ideal: frameRate } },
    });
    track = stream.getVideoTracks()[0];
    preview.srcObject = stream;
    preview.hidden = false;
    button.textContent = 'Stop preview';
    refreshDevices();
  };
  button.onclick = () => (track ? stop() : start().catch((error) => log(`camera preview: ${error}`)));
  settings.on('change', ({ changed }) => {
    if (track && changed.includes('camera')) {
      stop();
      start().catch((error) => log(`camera preview: ${error}`));
    }
  });
}

function setupPushToTalk(settings: SettingsStore) {
  const radios = document.querySelectorAll<HTMLInputElement>('input[name="voice-mode"]');
  for (const radio of radios) {
    radio.checked = radio.value === settings.value.voiceMode;
    radio.onchange = () => settings.update({ voiceMode: radio.value as VoiceMode });
  }
  const release = $<HTMLInputElement>('set-release');
  release.value = String(settings.value.releaseDelayMs);
  release.onchange = () => settings.update({ releaseDelayMs: Number(release.value) });

  if (!desktop) return;
  const ptt = desktop.pushToTalk;
  $('ptt-desktop').hidden = false;
  const label = $('ptt-key');
  const bind = $<HTMLButtonElement>('ptt-bind');
  const permission = $<HTMLButtonElement>('ptt-permission');
  const indicator = $('ptt-indicator');

  const apply = async () => {
    const binding = settings.value.pushToTalkBinding;
    label.textContent = binding?.label ?? 'none';
    try {
      await ptt.setBinding(binding);
      permission.hidden = true;
    } catch (error) {
      log(`push-to-talk: ${error}`);
      permission.hidden = await ptt.hasPermission();
    }
  };
  apply();
  settings.on('change', ({ changed }) => {
    if (changed.includes('pushToTalkBinding')) apply();
  });

  ptt.onChange((pressed) => {
    indicator.textContent = pressed ? 'pressed' : 'released';
    indicator.classList.toggle('on', pressed);
  });

  permission.onclick = async () => {
    permission.hidden = await ptt.requestPermission();
    if (permission.hidden) apply();
    else log('grant access in System Settings, then try again (restart the app if it still fails)');
  };
  $('ptt-clear').onclick = () => settings.update({ pushToTalkBinding: null });
  bind.onclick = async () => {
    if (!(await ptt.hasPermission())) {
      permission.hidden = false;
      return;
    }
    bind.textContent = 'Press a key or mouse button… (Esc to cancel)';
    const binding = await ptt.captureBinding().catch(() => null);
    bind.textContent = 'Set key…';
    if (binding) settings.update({ pushToTalkBinding: binding });
  };
}
