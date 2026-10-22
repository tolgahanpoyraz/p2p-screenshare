import { useEffect, useRef, useState } from 'preact/hooks';
import type { ScreenSource } from '../../../../shared/desktop.ts';
import type { Session } from '../../core/session.ts';
import type { SettingsStore } from '../../core/settings.ts';
import { Icon } from '../controls.tsx';
import { useEscape, useFullscreen, useSettings, useSize, useSubscribe } from '../hooks.ts';
import { people } from '../identity.ts';
import { isPermissionError, PermissionCard, type BlockedDevice } from '../permission.tsx';
import { t } from '../i18n.ts';
import { toast } from '../toasts.tsx';
import { desktop } from '../../platform.ts';
import { Controls, VolumePopover, type ControlsModel } from './controls.tsx';
import { contain, insets, pipRects, type Corner, type Layout } from './geometry.ts';
import { useStageGestures } from './gestures.ts';
import { SelfPip, SharingBanner, StatusRow, TheirPip } from './overlays.tsx';
import { SourcePicker } from './picker.tsx';
import { CameraStage, ConnectingStage, LostStage, ScreenStage, VoiceStage, WaitingStage } from './stage.tsx';
import { StatsOverlay } from './stats.tsx';

const HIDE_AFTER_MS = desktop ? 2800 : 4000;
const PINCH_HINT_KEY = 'screenshare.pinchHintSeen';

interface RoomProps {
  session: Session;
  store: SettingsStore;
  roomId: string;
  layout: Layout;
  settingsOpen: boolean;
  onOpenSettings(): void;
  onLeave(): void;
}

export function Room({ session, store, roomId, layout, settingsOpen, onOpenSettings, onLeave }: RoomProps) {
  const settings = useSettings(store);
  const { call, voice, camera, screen } = session;
  const state = useSubscribe(() => call.state, (n) => call.on('state', n), [call]);
  const remoteMedia = useSubscribe(() => call.remoteMedia, (n) => call.on('remote-media', n), [call]);
  const remoteVoice = useSubscribe(() => call.remoteVoice, (n) => call.on('remote-voice', n), [call]);
  const remoteProfile = useSubscribe(() => call.remoteProfile, (n) => call.on('remote-profile', n), [call]);
  const remoteTracks = useSubscribe(() => call.remoteTracks, (n) => call.on('remote-track', n), [call]);
  useSubscribe(() => null, (n) => voice.on('change', n), [voice]);
  const cameraTrack = useSubscribe(() => camera.track, (n) => camera.on('track', n), [camera]);
  const sharing = useSubscribe(() => screen.active, (n) => screen.on('change', n), [screen]);

  const [popover, setPopover] = useState<'volume' | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [blocked, setBlocked] = useState<BlockedDevice | null>(null);
  const [shareSource, setShareSource] = useState('');
  const [corner, setCorner] = useState<Corner>('tr');
  const [videoSize, setVideoSize] = useState({ width: 16, height: 9 });
  const [pinchHint, setPinchHint] = useState(() => !desktop && !storageFlag(PINCH_HINT_KEY));
  const [stageRef, stage] = useSize<HTMLDivElement>();

  const connected = state === 'connected' || state === 'reconnecting';
  const { you, them } = people(settings, remoteProfile);
  const theyLeft = useTheyLeft(state);

  const stageMode = !connected ? null : remoteMedia.screen ? 'screen' : remoteMedia.camera ? 'camera' : 'voice';
  const autoHide = stageMode === 'screen' || stageMode === 'camera';
  const busy = Boolean(popover || pickerOpen || settingsOpen || blocked);
  const [shown, setShown] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const poke = () => {
    setShown(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShown(false), HIDE_AFTER_MS);
  };
  const controlsVisible = shown || !autoHide || busy;
  useEffect(() => {
    if (!busy) poke();
  }, [busy, autoHide]);
  useEffect(() => () => clearTimeout(hideTimer.current), []);

  const binding = settings.pushToTalkBinding;
  const fKeyIsPtt = Boolean(desktop) && binding?.kind === 'key' && binding.label.toUpperCase() === 'F';
  const fullscreen = useFullscreen(!busy && !fKeyIsPtt);

  const frame = contain(stage, videoSize);
  const gestures = useStageGestures({
    touch: !desktop,
    zoomable: stageMode === 'screen' && !desktop,
    frame,
    onTap: () => {
      if (popover) setPopover(null);
      else if (desktop) poke();
      else if (controlsVisible && autoHide) setShown(false);
      else poke();
    },
    onFirstZoom: () => {
      if (!pinchHint) return;
      setPinchHint(false);
      storageFlag(PINCH_HINT_KEY, true);
    },
    onDoubleClick: fullscreen.toggle,
  });
  useEffect(() => {
    if (stageMode !== 'screen') gestures.resetZoom();
  }, [stageMode]);

  useEscape(popover !== null, () => setPopover(null));
  useWakeLock(connected);
  useEffect(() => {
    document.title = connected ? `screenshare — ${them.name}` : `screenshare — ${t.windowRoom(roomId)}`;
    return () => {
      document.title = 'screenshare';
    };
  }, [connected, them.name, roomId]);

  const userStoppedCamera = useRef(false);
  useEffect(
    () =>
      camera.on('change', ({ active }) => {
        if (!active && !userStoppedCamera.current) {
          toast(t.cameraStopped, 'videocam_off');
        }
        userStoppedCamera.current = false;
      }),
    [camera],
  );

  const cameraFailed = (error: unknown) => {
    if (isPermissionError(error)) setBlocked('camera');
    else toast(t.cameraDidntStart, 'videocam_off');
  };

  const toggleCamera = () => {
    if (camera.active) {
      userStoppedCamera.current = true;
      camera.stop();
    } else {
      camera.start().catch(cameraFailed);
    }
  };

  const switchCamera = async () => {
    await camera.switchCamera().catch(cameraFailed);
    const track = camera.track;
    if (!track) return;
    const facing = track.getSettings().facingMode;
    toast(facing ? (facing === 'user' ? t.frontCamera : t.backCamera) : t.switchedTo(track.label), 'cameraswitch');
  };

  const startShare = async (source: ScreenSource) => {
    setPickerOpen(false);
    setShareSource(source.name);
    const audio = settings.shareSystemAudio;
    try {
      await screen.start({ sourceId: source.id, audio });
      toast(audio ? t.sharingWithSound : t.sharingWithoutSound, 'screen_share');
    } catch (error) {
      if (isPermissionError(error)) setBlocked('screen');
      else toast(t.shareFailed((error as Error).message), 'error');
    }
  };

  const model: ControlsModel = {
    layout,
    visible: controlsVisible,
    voice,
    mode: voice.mode,
    transmitting: voice.transmitting,
    muted: voice.muted,
    mic: session.mic,
    bindingLabel: settings.pushToTalkBinding?.label ?? null,
    cameraOn: cameraTrack !== null,
    sharing,
    canShare: Boolean(desktop),
    volumeOpen: popover === 'volume',
    statsOpen,
    fullscreen: fullscreen.supported ? fullscreen.active : null,
    onToggleMute: () => voice.setMuted(!voice.muted),
    onToggleCamera: toggleCamera,
    onSwitchCamera: switchCamera,
    onShare: () => {
      if (screen.active) screen.stop();
      else {
        setPopover(null);
        setPickerOpen(true);
      }
    },
    onToggleVolume: () => setPopover(popover === 'volume' ? null : 'volume'),
    onToggleStats: () => setStatsOpen(!statsOpen),
    onToggleFullscreen: fullscreen.toggle,
    onSettings: () => {
      setPopover(null);
      onOpenSettings();
    },
    onLeave,
    onInteract: poke,
  };

  const inset = insets(layout, controlsVisible);
  const showTheirPip = stageMode === 'screen' && remoteMedia.camera;
  const pips = pipRects(stage, layout, controlsVisible, corner, showTheirPip);
  const zoomed = stageMode === 'screen' && gestures.zoom.s > 1.01;
  const bannerTop = sharing ? 64 : 16;

  return (
    <div class="room" onMouseMove={desktop ? poke : undefined}>
      <div ref={stageRef} class="stage" {...gestures.handlers}>
        {stageMode === 'screen' && (
          <ScreenStage track={remoteTracks.get('screen')} frame={frame} zoom={gestures.zoom} onVideoSize={setVideoSize} />
        )}
        {stageMode === 'camera' && <CameraStage track={remoteTracks.get('camera')} />}
        {stageMode === 'voice' && <VoiceStage them={them} voice={remoteVoice} mic={remoteTracks.get('mic')} />}
        {state === 'waiting' && (
          <WaitingStage you={you} them={them} theyLeft={theyLeft} layout={layout} />
        )}
        {state === 'closed' && <LostStage />}
        {(state === 'joining' || state === 'connecting') && (
          <ConnectingStage line={state === 'joining' ? t.joiningRoom : t.connectingTo(them.name)} />
        )}
      </div>

      {showTheirPip && (
        <TheirPip
          track={remoteTracks.get('camera')}
          mic={remoteTracks.get('mic')}
          voice={remoteVoice}
          them={them}
          rect={pips.their}
          stage={stage}
          onCorner={setCorner}
        />
      )}
      {cameraTrack && !settingsOpen && (
        <SelfPip track={cameraTrack} mic={session.mic} transmitting={voice.transmitting} rect={pips.self} />
      )}

      <StatusRow
        state={state}
        them={them}
        remoteVoice={remoteVoice}
        theirMic={remoteTracks.get('mic')}
        voice={{ mode: voice.mode, transmitting: voice.transmitting }}
        holdHint={desktop ? t.holdKey(settings.pushToTalkBinding?.label ?? t.aKey) : t.holdToTalkHint}
        maxWidth={stage.width - inset.right - 32}
      />

      {sharing && <SharingBanner source={shareSource || t.yourScreen} withSound={screen.audio !== null} onStop={() => screen.stop()} />}
      {state === 'reconnecting' && (
        <div class="banner" style={{ top: `${bannerTop + 46}px` }} role="status">
          <span class="dot bg-warn breathe" />
          {t.reconnectingBanner}
        </div>
      )}
      {zoomed && (
        <button class="banner" style={{ top: `${bannerTop + 46}px` }} onClick={gestures.resetZoom}>
          <Icon name="zoom_in" size={18} />
          {gestures.zoom.s.toFixed(1)}× · {t.tapToReset}
        </button>
      )}
      {pinchHint && stageMode === 'screen' && !zoomed && (
        <div class={`pinch-hint pinch-${layout}`} style={{ opacity: controlsVisible || layout === 'rail' ? 1 : 0 }}>
          <Icon name="pinch_zoom_in" size={18} />
          {t.pinchHint}
        </div>
      )}

      {statsOpen && (
        <StatsOverlay
          sampler={session.stats}
          right={layout === 'rail' && controlsVisible ? 128 : 16}
          onClose={() => setStatsOpen(false)}
        />
      )}

      <Controls model={model} />

      {popover === 'volume' && (
        <VolumePopover
          layout={layout}
          themName={them.name}
          volumes={settings.volumes}
          showAvailable={remoteMedia.screenAudio}
          onChange={(volumes) => store.update({ volumes })}
        />
      )}

      {pickerOpen && (
        <SourcePicker
          store={store}
          onPick={startShare}
          onClose={() => setPickerOpen(false)}
          onError={() => {
            setPickerOpen(false);
            setBlocked('screen');
          }}
        />
      )}

      {blocked && <BlockedModal device={blocked} onClose={() => setBlocked(null)} />}
    </div>
  );
}

function BlockedModal({ device, onClose }: { device: BlockedDevice; onClose(): void }) {
  useEscape(true, onClose);
  return (
    <div class="scrim" onClick={onClose}>
      <div class="modal blocked" role="dialog" onClick={(e) => e.stopPropagation()}>
        <PermissionCard device={device} onRetry={device === 'screen' ? undefined : onClose} />
        <button class="btn btn-ghost" onClick={onClose}>
          {t.close}
        </button>
      </div>
    </div>
  );
}

function useTheyLeft(state: string) {
  const [theyLeft, setTheyLeft] = useState(false);
  const previous = useRef(state);
  useEffect(() => {
    const was = previous.current;
    previous.current = state;
    if (state === 'connected') setTheyLeft(false);
    else if (state === 'waiting' && (was === 'connected' || was === 'reconnecting')) setTheyLeft(true);
  }, [state]);
  return theyLeft;
}

// Keeps the tablet's screen on during a show; the Mac app benefits too.
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let released = false;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen').then(
        (sentinel) => {
          if (released) sentinel.release();
          else lock = sentinel;
        },
        () => {},
      );
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      released = true;
      document.removeEventListener('visibilitychange', acquire);
      lock?.release();
    };
  }, [active]);
}

function storageFlag(key: string, value?: boolean) {
  try {
    if (value) localStorage.setItem(key, '1');
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
