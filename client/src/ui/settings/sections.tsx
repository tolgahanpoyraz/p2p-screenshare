import { useEffect, useState } from 'preact/hooks';
import { playClip, playTestTone, recordClip } from '../../core/audio-test.ts';
import { canChooseSpeaker, type DeviceLists } from '../../core/devices.ts';
import type { VoiceProcessing } from '../../core/media.ts';
import type { VideoCodec } from '../../core/screen.ts';
import type { Session } from '../../core/session.ts';
import type { Settings, SettingsStore } from '../../core/settings.ts';
import { cx, Icon, Meter, Segments, Select, SliderField, Swatches, ToggleRow, Video } from '../controls.tsx';
import { useEscape, useLevel, useSubscribe } from '../hooks.ts';
import { people } from '../identity.ts';
import { deviceOptions, usePreviewCamera, usePreviewMic } from '../media-hooks.ts';
import { isPermissionError } from '../permission.tsx';
import { bindingFromEvent } from '../page-hotkey.ts';
import { presetOptions, presetValue } from '../presets.ts';
import { t } from '../i18n.ts';
import { toast } from '../toasts.tsx';
import { desktop } from '../../platform.ts';

interface SectionProps {
  store: SettingsStore;
  settings: Settings;
  devices: DeviceLists;
}

const processingRows = (): [keyof VoiceProcessing, string][] => [
  ['echoCancellation', t.echoCancellation],
  ['noiseSuppression', t.noiseSuppression],
  ['autoGainControl', t.autoGain],
];

export function MicSection({ store, settings, devices }: SectionProps) {
  const [testing, setTesting] = useState(false);
  const [clip, setClip] = useState<'recording' | 'playing' | null>(null);
  // A separate track, so the test works even while push-to-talk keeps the call's mic closed.
  const mic = usePreviewMic(testing, settings.microphoneId, settings.voiceProcessing);
  const level = useLevel(mic);

  const record = async () => {
    if (!mic || clip) return;
    try {
      setClip('recording');
      const blob = await recordClip(mic, 3000);
      setClip('playing');
      await playClip(blob, settings.speakerId);
    } catch {
      toast(t.recordFailed, 'mic_off');
    } finally {
      setClip(null);
    }
  };

  return (
    <>
      <Select
        large
        label={t.microphone}
        value={settings.microphoneId ?? ''}
        options={deviceOptions(devices.microphones, t.systemDefault)}
        onChange={(id) => store.update({ microphoneId: id || undefined })}
      />
      <div class="toggle-list">
        {processingRows().map(([key, label]) => (
          <ToggleRow
            key={key}
            on={settings.voiceProcessing[key]}
            onChange={(on) => store.update({ voiceProcessing: { [key]: on } })}
          >
            {label}
          </ToggleRow>
        ))}
      </div>
      <div class="card stack-12">
        <div class="row-wrap">
          <button class={cx('btn', testing ? 'btn-live' : 'btn-solid')} onClick={() => setTesting(!testing)}>
            <Icon name={testing ? 'stop' : 'graphic_eq'} />
            {testing ? t.stopTest : t.testMicrophone}
          </button>
          <button class="btn btn-outline surface" disabled={!mic || clip !== null} onClick={record}>
            <Icon
              name={clip === 'recording' ? 'fiber_manual_record' : clip === 'playing' ? 'play_arrow' : 'replay'}
              class={clip === 'recording' ? 'danger' : 'ink-2'}
            />
            {clip === 'recording' ? t.recording : clip === 'playing' ? t.playingBack : t.record}
          </button>
        </div>
        <Meter level={level} tall />
        <span class="hint">{t.recordHint}</span>
      </div>
    </>
  );
}

export function SpeakerSection({ store, settings, devices }: SectionProps) {
  const [tone, setTone] = useState(false);
  const play = () => {
    setTone(true);
    playTestTone(settings.speakerId)
      .catch(() => toast(t.speakerFailed, 'volume_off'))
      .finally(() => setTone(false));
  };
  return (
    <>
      {canChooseSpeaker ? (
        <div class="row-10">
          <Select
            large
            class="grow"
            label={t.speaker}
            value={settings.speakerId ?? ''}
            options={deviceOptions(devices.speakers, t.systemDefault)}
            onChange={(id) => store.update({ speakerId: id || undefined })}
          />
          <button class="btn btn-outline square tall" onClick={play} disabled={tone}>
            <Icon name="music_note" />
            {tone ? t.playing : t.testTone}
          </button>
        </div>
      ) : (
        <p class="ink-2 text-14">{t.speakerNote}</p>
      )}
      <div class="card stack-16">
        <SliderField
          title={
            <>
              {t.voice} <span class="ink-3">· {t.theOtherPerson}</span>
            </>
          }
          label={t.voiceVolume}
          readout={String(Math.round(settings.volumes.voice * 100))}
          value={settings.volumes.voice}
          onChange={(voice) => store.update({ volumes: { voice } })}
        />
        <SliderField
          title={
            <>
              {t.show} <span class="ink-3">· {t.theirScreensSound}</span>
            </>
          }
          label={t.showVolume}
          readout={String(Math.round(settings.volumes.show * 100))}
          value={settings.volumes.show}
          onChange={(show) => store.update({ volumes: { show } })}
        />
      </div>
    </>
  );
}

const numberOptions = (values: number[]) => values.map((v) => ({ value: String(v), label: String(v) }));

export function CameraSection({ store, settings, devices, session }: SectionProps & { session: Session | null }) {
  const [preview, setPreview] = useState(false);
  const callCamera = useSubscribe(
    () => session?.camera.track ?? null,
    (n) => session?.camera.on('track', n) ?? (() => {}),
    [session],
  );
  // Reuse the call's camera when it's on; phones can't open it twice.
  const own = usePreviewCamera(preview && !callCamera, settings.camera, (error) => {
    setPreview(false);
    toast(isPermissionError(error) ? t.cameraAccessBlocked : t.cameraDidntStart, 'videocam_off');
  });
  const track = preview ? (callCamera ?? own) : null;
  const camera = settings.camera;

  return (
    <>
      <Select
        large
        label={t.camera}
        value={camera.deviceId ?? ''}
        options={deviceOptions(devices.cameras, t.defaultCamera)}
        onChange={(id) => store.update({ camera: { deviceId: id || undefined } })}
      />
      <div class="field-grid">
        <div class="field">
          {t.resolution}
          <Select
            label={t.resolution}
            value={String(camera.height)}
            options={numberOptions([360, 540, 720, 1080])}
            onChange={(v) => store.update({ camera: { height: Number(v) } })}
          />
        </div>
        <div class="field">
          {t.frameRate}
          <Select
            label={t.frameRate}
            value={String(camera.frameRate)}
            options={numberOptions([15, 24, 30])}
            onChange={(v) => store.update({ camera: { frameRate: Number(v) } })}
          />
        </div>
        <div class="field">
          {t.maxBitrate}
          <Select
            label={t.maxBitrate}
            value={String(camera.maxBitrateKbps)}
            options={numberOptions([500, 1000, 1500, 2500, 4000])}
            onChange={(v) => store.update({ camera: { maxBitrateKbps: Number(v) } })}
          />
        </div>
      </div>
      <div class="toggle-list">
        <ToggleRow on={preview} onChange={setPreview}>
          {t.previewCamera}
        </ToggleRow>
      </div>
      {track && (
        <div class="camera-preview">
          <Video track={track} class="fill cover" mirrored={track.getSettings().facingMode !== 'environment'} />
        </div>
      )}
    </>
  );
}

export function PushToTalkSection({ store, settings }: SectionProps) {
  const ptt = settings.voiceMode === 'push-to-talk';
  return (
    <>
      <Segments
        label={t.voiceMode}
        value={settings.voiceMode}
        options={[
          { value: 'open', label: t.openMic },
          { value: 'push-to-talk', label: t.pushToTalk },
        ]}
        onChange={(voiceMode) => store.update({ voiceMode })}
      />
      <SliderField
        title={
          <>
            {t.releaseDelay} <span class="ink-3">· {t.releaseDelayNote}</span>
          </>
        }
        label={t.releaseDelay}
        readout={`${settings.releaseDelayMs} ms`}
        value={settings.releaseDelayMs}
        min={0}
        max={1000}
        step={50}
        onChange={(releaseDelayMs) => store.update({ releaseDelayMs })}
      />
      {desktop ? <TalkKey store={store} settings={settings} /> : <PageTalkKey store={store} settings={settings} />}
      {!desktop && !ptt && <p class="hint">{t.tabletPttNote}</p>}
    </>
  );
}

// Keys you also hit while typing elsewhere, so they'd open the mic by accident.
const TYPING_KEY = /^([A-Z0-9]|Shift|ShiftRight|Ctrl|CtrlRight|Alt|AltRight|Meta|MetaRight|Space|Tab|Enter|Backspace)$/;

function TalkKey({ store, settings }: { store: SettingsStore; settings: Settings }) {
  const bridge = desktop!.pushToTalk;
  const [allowed, setAllowed] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [pressed, setPressed] = useState(false);
  const binding = settings.pushToTalkBinding;
  // Escape cancels the capture in the main process; keep it from also closing this dialog.
  useEscape(capturing, () => {});

  useEffect(() => {
    const check = () => bridge.hasPermission().then(setAllowed, () => {});
    check();
    addEventListener('focus', check);
    const off = bridge.onChange(setPressed);
    return () => {
      removeEventListener('focus', check);
      off();
    };
  }, []);

  const grant = async () => {
    if (await bridge.requestPermission()) {
      setAllowed(true);
      toast(t.accessGranted, 'check_circle');
      bridge.setBinding(binding).catch(() => {});
    }
  };

  const capture = async () => {
    if (!(await bridge.hasPermission())) {
      setAllowed(false);
      return;
    }
    setCapturing(true);
    const next = await bridge.captureBinding().catch(() => null);
    setCapturing(false);
    if (next) store.update({ pushToTalkBinding: next });
  };

  return (
    <>
      {!allowed && (
        <div class="card card-warn stack-10">
          <div class="row-8 strong">
            <Icon name="accessibility_new" size={20} class="warn" />
            {t.allowBackground}
          </div>
          <p class="ink-2 text-14">{t.allowBackgroundBody}</p>
          <div class="row-wrap">
            <button class="btn btn-solid" onClick={grant}>
              {t.grantAccess}
            </button>
            <button class="btn btn-outline" onClick={() => desktop!.openPrivacySettings('accessibility')}>
              {t.openSystemSettings}
            </button>
          </div>
        </div>
      )}
      <div class="card card-outline stack-12">
        <div class="row-wrap center">
          <span class="grow text-14">{t.talkKey}</span>
          <span class={cx('keycap', capturing && 'capturing', !binding && 'empty')}>
            {capturing ? '…' : (binding?.label ?? t.none)}
          </span>
          <button class="btn square outline-2" onClick={capture} disabled={capturing}>
            {t.setKey}
          </button>
          <button class="btn square btn-ghost" onClick={() => store.update({ pushToTalkBinding: null })}>
            {t.clear}
          </button>
        </div>
        {capturing && <span class="hint breathe">{t.pressAKey}</span>}
        {!capturing && binding && TYPING_KEY.test(binding.label) && <span class="ink-2 text-13">{t.keyWarning(binding.label)}</span>}
        <div class="row-8 text-13 ink-2">
          <span class={cx('dot big', pressed ? 'bg-live' : 'bg-surface-3')} />
          {pressed ? t.pressed : t.released} <span class="ink-3">{t.tryItNow}</span>
        </div>
      </div>
    </>
  );
}

function PageTalkKey({ store, settings }: { store: SettingsStore; settings: Settings }) {
  const [capturing, setCapturing] = useState(false);
  const binding = settings.pushToTalkBinding;
  useEscape(capturing, () => setCapturing(false));

  useEffect(() => {
    if (!capturing) return;
    const take = (event: KeyboardEvent | MouseEvent) => {
      if (event instanceof KeyboardEvent && event.key === 'Escape') return;
      const next = bindingFromEvent(event);
      if (!next) return;
      event.preventDefault();
      event.stopPropagation();
      store.update({ pushToTalkBinding: next });
      setCapturing(false);
    };
    // Wait a tick so the click that started capture isn't captured itself.
    const timer = setTimeout(() => {
      addEventListener('keydown', take, true);
      addEventListener('mousedown', take, true);
    });
    return () => {
      clearTimeout(timer);
      removeEventListener('keydown', take, true);
      removeEventListener('mousedown', take, true);
    };
  }, [capturing]);

  return (
    <div class="card card-outline stack-12">
      <div class="row-wrap center">
        <span class="grow text-14">{t.talkKey}</span>
        <span class={cx('keycap', capturing && 'capturing', !binding && 'empty')}>
          {capturing ? '…' : (binding?.label ?? t.none)}
        </span>
        <button class="btn square outline-2" onClick={() => setCapturing(true)} disabled={capturing}>
          {t.setKey}
        </button>
        <button class="btn square btn-ghost" onClick={() => store.update({ pushToTalkBinding: null })}>
          {t.clear}
        </button>
      </div>
      {capturing && <span class="hint breathe">{t.pressAKey}</span>}
      <span class="hint">{t.pageKeyNote}</span>
    </div>
  );
}

const codecs: { value: VideoCodec; label: string }[] = [
  { value: 'video/H264', label: 'H.264' },
  { value: 'video/VP8', label: 'VP8' },
  { value: 'video/VP9', label: 'VP9' },
  { value: 'video/AV1', label: 'AV1' },
];

export function ScreenSection({ store, settings }: SectionProps) {
  const [advanced, setAdvanced] = useState(false);
  const quality = settings.screen;
  const current = presetValue(quality);
  const numberField = (label: string, value: number | undefined, apply: (v: number | undefined) => void, placeholder?: string) => (
    <label class="field">
      {label}
      <input
        class="input small mono"
        type="number"
        inputMode="numeric"
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(event) => {
          const v = Number((event.currentTarget as HTMLInputElement).value);
          apply(v > 0 ? v : undefined);
        }}
      />
    </label>
  );

  return (
    <>
      <div class="preset-grid" role="radiogroup" aria-label={t.quality}>
        {presetOptions().map((preset) => (
          <button
            key={preset.value}
            role="radio"
            aria-checked={preset.value === current}
            class="preset"
            onClick={() => store.update({ screen: preset.quality })}
          >
            {preset.label}
            <small>{preset.sub}</small>
          </button>
        ))}
      </div>
      <button class="disclosure" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}>
        <Icon name={advanced ? 'expand_less' : 'expand_more'} size={20} />
        {t.advanced}
      </button>
      {advanced && (
        <div class="card stack-14">
          <div class="stack-6">
            <span class="hint">{t.codec}</span>
            <Segments
              compact
              label={t.codec}
              value={quality.codec}
              options={codecs}
              onChange={(codec) => store.update({ screen: { codec } })}
            />
          </div>
          <div class="stack-6">
            <span class="hint">{t.optimiseFor}</span>
            <Segments
              compact
              label={t.optimiseFor}
              value={quality.mode}
              options={[
                { value: 'detail', label: t.detail, sub: t.sharpText },
                { value: 'motion', label: t.motion, sub: t.smoothVideo },
              ]}
              onChange={(mode) => store.update({ screen: { mode } })}
            />
          </div>
          <div class="field-grid three">
            {numberField(t.height, quality.height, (height) => store.update({ screen: { ...quality, height } }), t.nativePlaceholder)}
            {numberField(t.fps, quality.frameRate, (frameRate) => frameRate && store.update({ screen: { frameRate } }))}
            {numberField(t.maxKbps, quality.maxBitrateKbps, (maxBitrateKbps) => maxBitrateKbps && store.update({ screen: { maxBitrateKbps } }))}
          </div>
        </div>
      )}
    </>
  );
}

export function ProfileSection({ store, settings }: SectionProps) {
  const { you } = people(settings, null);
  return (
    <>
      <p class="ink-2 text-14">{t.profileIntro}</p>
      <div class="identity-row">
        <span class="avatar" style={{ width: '44px', height: '44px', background: you.color, fontSize: '18px' }}>
          {you.initial}
        </span>
        <input
          class="input on-surface-2"
          maxLength={40}
          aria-label={t.yourName}
          placeholder={t.yourName}
          value={settings.you.name}
          onInput={(event) => store.update({ you: { name: (event.currentTarget as HTMLInputElement).value } })}
        />
        <Swatches label={t.yourColour} hue={you.hue} onPick={(hue) => store.update({ you: { hue } })} />
      </div>
      <p class="hint">{t.profileThemNote}</p>
    </>
  );
}

export function LanguageSection({ store, settings }: SectionProps) {
  return (
    <Segments
      label={t.sectionLanguage}
      value={settings.language}
      options={[
        { value: 'auto', label: t.languageAuto },
        { value: 'en', label: 'English' },
        { value: 'tr', label: 'Türkçe' },
      ]}
      onChange={(language) => store.update({ language })}
    />
  );
}
