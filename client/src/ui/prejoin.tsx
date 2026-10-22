import { useState } from 'preact/hooks';
import { playTestTone } from '../core/audio-test.ts';
import { canChooseSpeaker } from '../core/devices.ts';
import { Session } from '../core/session.ts';
import type { SettingsStore } from '../core/settings.ts';
import { Icon, InviteField, Meter, Select, Swatches, Video } from './controls.tsx';
import { refreshDevices, useDevices, useLevel, useSettings } from './hooks.ts';
import { people } from './identity.ts';
import { deviceOptions, usePreviewCamera, usePreviewMic } from './media-hooks.ts';
import { isPermissionError, PermissionCard, type BlockedDevice } from './permission.tsx';
import { t } from './i18n.ts';
import { toast } from './toasts.tsx';
import { desktop, isMacBrowser } from '../platform.ts';

interface PrejoinProps {
  roomId: string;
  store: SettingsStore;
  onJoined(session: Session): void;
}

export function Prejoin({ roomId, store, onJoined }: PrejoinProps) {
  const settings = useSettings(store);
  const [cameraOn, setCameraOn] = useState(false);
  const [blocked, setBlocked] = useState<BlockedDevice | null>(null);
  const [joining, setJoining] = useState(false);
  const [tone, setTone] = useState(false);

  const camera = usePreviewCamera(cameraOn, settings.camera, (error) => {
    setCameraOn(false);
    if (isPermissionError(error)) setBlocked('camera');
    else toast(t.cameraStopped, 'videocam_off');
  });
  const mic = usePreviewMic(true, settings.microphoneId, settings.voiceProcessing, { whenGranted: true });
  const level = useLevel(mic);
  const devices = useDevices();
  const { you } = people(settings, null);

  const join = async () => {
    setJoining(true);
    setBlocked(null);
    try {
      const session = await Session.join({ baseUrl: location.origin, roomId, settings: store });
      if (cameraOn) {
        // Phones can't open the camera twice, so the preview has to let go first.
        camera?.stop();
        session.camera.start().catch(() => toast(t.cameraDidntStart, 'videocam_off'));
      }
      refreshDevices();
      onJoined(session);
    } catch (error) {
      if (isPermissionError(error)) setBlocked('microphone');
      else toast(joinError(error), 'error');
      setJoining(false);
    }
  };

  const testTone = () => {
    setTone(true);
    playTestTone(settings.speakerId)
      .catch(() => toast(t.speakerFailed, 'volume_off'))
      .finally(() => setTone(false));
  };

  return (
    <main class="prejoin">
      <div class="prejoin-grid">
        <section class="selfcheck" aria-label={t.setUp}>
          <div class="preview">
            {camera ? (
              <>
                <Video track={camera} mirrored class="fill" />
                <button class="btn glass-btn preview-off" onClick={() => setCameraOn(false)}>
                  <Icon name="videocam_off" />
                  {t.turnOff}
                </button>
              </>
            ) : (
              <div class="preview-empty">
                <Icon name="videocam_off" size={36} class="ink-3" />
                <span>{t.cameraOffOptional}</span>
                <button class="btn btn-outline surface" onClick={() => setCameraOn(true)} disabled={cameraOn}>
                  {t.previewCamera}
                </button>
              </div>
            )}
          </div>
          <div class="device-rows">
            <div class="device-row">
              <Icon name="mic" size={22} class="ink-2" />
              <div class="stack-8">
                <Select
                  label={t.microphone}
                  value={settings.microphoneId ?? ''}
                  options={deviceOptions(devices.microphones, t.systemDefault)}
                  onChange={(id) => store.update({ microphoneId: id || undefined })}
                />
                <Meter level={level} />
              </div>
            </div>
            <div class="device-row">
              <Icon name="videocam" size={22} class="ink-2" />
              <Select
                label={t.camera}
                value={settings.camera.deviceId ?? ''}
                options={deviceOptions(devices.cameras, t.defaultCamera)}
                onChange={(id) => store.update({ camera: { deviceId: id || undefined } })}
              />
            </div>
            {canChooseSpeaker && (
              <div class="device-row with-action">
                <Icon name="volume_up" size={22} class="ink-2" />
                <Select
                  label={t.speaker}
                  value={settings.speakerId ?? ''}
                  options={deviceOptions(devices.speakers, t.systemDefault)}
                  onChange={(id) => store.update({ speakerId: id || undefined })}
                />
                <button class="btn btn-outline square" onClick={testTone} disabled={tone}>
                  {tone ? t.playing : t.testTone}
                </button>
              </div>
            )}
          </div>
        </section>

        <section class="prejoin-side">
          {blocked && <PermissionCard device={blocked} onRetry={blocked === 'microphone' ? join : () => setBlocked(null)} />}
          <div class="stack-8">
            <h2 class="title-30">{t.roomReady}</h2>
            <p class="ink-2">{t.roomReadyBody}</p>
          </div>
          <InviteField />
          <div class="stack-10">
            <div class="label-row">
              {t.howTheySeeYou} <span class="tag">{t.optional}</span>
            </div>
            <div class="identity-row">
              <input
                class="input"
                placeholder={t.yourName}
                aria-label={t.yourName}
                maxLength={40}
                value={settings.you.name}
                onInput={(event) => store.update({ you: { name: (event.currentTarget as HTMLInputElement).value } })}
              />
              <Swatches label={t.yourColour} hue={you.hue} onPick={(hue) => store.update({ you: { hue } })} />
            </div>
          </div>
          <div class="stack-8">
            <button class="btn btn-primary btn-xl" onClick={join} disabled={joining}>
              <Icon name="call" size={24} />
              {joining ? t.joining : t.joinRoom}
            </button>
            <span class="join-note">
              {desktop ? t.joinNoteMac : t.joinNoteTablet}
            </span>
            {isMacBrowser && (
              <a class="open-in-app" href={`screenshare://r/${roomId}`}>
                {t.openInMacApp}
              </a>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function joinError(error: unknown) {
  const { name, message } = error as Error;
  if (message === 'server-unreachable') return t.serverUnreachable;
  if (name === 'NotFoundError') return t.noMicrophone;
  return t.joinFailed(message);
}
