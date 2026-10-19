import { useEffect, useRef, useState } from 'preact/hooks';
import type { Voice } from '../../core/ptt.ts';
import { cx, Icon, SliderField } from '../controls.tsx';
import { useLevel } from '../hooks.ts';
import { t } from '../i18n.ts';
import type { Layout } from './geometry.ts';

export interface ControlsModel {
  layout: Layout;
  visible: boolean;
  voice: Voice;
  mode: 'open' | 'push-to-talk';
  transmitting: boolean;
  muted: boolean;
  mic: MediaStreamTrack | null;
  bindingLabel: string | null;
  cameraOn: boolean;
  sharing: boolean;
  canShare: boolean;
  volumeOpen: boolean;
  statsOpen: boolean;
  onToggleMute(): void;
  onToggleCamera(): void;
  onSwitchCamera(): void;
  onShare(): void;
  onToggleVolume(): void;
  onToggleStats(): void;
  onSettings(): void;
  onLeave(): void;
  onInteract(): void;
}

type Tone = 'active' | 'live' | 'danger';

function Tile(props: {
  icon: string;
  label: string;
  tone?: Tone | false;
  showLabel?: boolean;
  size?: 'mute' | 'leave';
  disabled?: boolean;
  onClick(): void;
}) {
  return (
    <button
      class={cx('tile', props.tone && `tone-${props.tone}`, props.size && `tile-${props.size}`, props.showLabel && 'labelled')}
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <span class="tile-face ms" aria-hidden="true">
        {props.icon}
      </span>
      <span class="tile-label">{props.label}</span>
    </button>
  );
}

function HoldToTalk({ voice, transmitting, mic }: { voice: Voice; transmitting: boolean; mic: MediaStreamTrack | null }) {
  const [held, setHeld] = useState(false);
  const pointer = useRef<number | null>(null);
  const level = useLevel(held ? mic : null);

  useEffect(
    () => () => {
      if (pointer.current !== null) voice.release();
    },
    [voice],
  );

  const end = (event: PointerEvent) => {
    // A second finger lifting must not end the first finger's hold.
    if (event.pointerId !== pointer.current) return;
    pointer.current = null;
    setHeld(false);
    voice.release();
  };

  return (
    <div
      class={cx('hold', held && 'held')}
      role="button"
      aria-label={t.holdToTalk}
      aria-pressed={held}
      onPointerDown={(event) => {
        if (pointer.current !== null) return;
        event.preventDefault();
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        pointer.current = event.pointerId;
        setHeld(true);
        voice.press();
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span class="hold-halo" style={{ transform: `scale(${held ? 1 + level * 0.25 : 0.9})` }} />
      <span class="hold-face">
        <Icon name="mic" />
        <span>{held ? t.talkingTitle : transmitting ? '…' : t.hold}</span>
      </span>
    </div>
  );
}

function MicControl({ model, showLabel }: { model: ControlsModel; showLabel?: boolean }) {
  if (model.mode === 'push-to-talk') return <HoldToTalk voice={model.voice} transmitting={model.transmitting} mic={model.mic} />;
  return (
    <Tile
      icon={model.muted ? 'mic_off' : 'mic'}
      label={model.muted ? t.unmute : t.mute}
      tone={model.muted && 'danger'}
      size="mute"
      showLabel={showLabel}
      onClick={model.onToggleMute}
    />
  );
}

function CameraTiles({ model }: { model: ControlsModel }) {
  return (
    <>
      <Tile
        icon={model.cameraOn ? 'videocam' : 'videocam_off'}
        label={t.camera}
        tone={model.cameraOn && 'active'}
        onClick={model.onToggleCamera}
      />
      <Tile
        icon="cameraswitch"
        label={model.layout === 'bar' ? t.nextCamera : t.switchCamera}
        disabled={!model.cameraOn}
        onClick={model.onSwitchCamera}
      />
    </>
  );
}

const volumeTile = (model: ControlsModel) => (
  <Tile icon="tune" label={t.volume} tone={model.volumeOpen && 'active'} onClick={model.onToggleVolume} />
);
const statsTile = (model: ControlsModel) => (
  <Tile icon="monitoring" label={t.stats} tone={model.statsOpen && 'active'} onClick={model.onToggleStats} />
);
const settingsTile = (model: ControlsModel) => <Tile icon="settings" label={t.settings} onClick={model.onSettings} />;
const leaveTile = (model: ControlsModel, showLabel?: boolean) => (
  <Tile icon="call_end" label={t.leave} tone="danger" size="leave" showLabel={showLabel} onClick={model.onLeave} />
);

export function Controls({ model }: { model: ControlsModel }) {
  const shell = cx('controls', `controls-${model.layout}`, !model.visible && 'hidden');
  const common = { class: shell, onPointerDown: model.onInteract, onMouseMove: model.onInteract };

  if (model.layout === 'bar') {
    return (
      <div {...common} role="toolbar" aria-label={t.callControls}>
        {model.mode === 'push-to-talk' ? (
          <div class="ptt-indicator-wrap">
            <div class={cx('ptt-indicator', model.transmitting && 'on')}>
              <Icon name={model.transmitting ? 'mic' : 'mic_none'} size={22} />
              {model.transmitting ? t.onAirTitle : model.bindingLabel ? t.holdKeyTitle(model.bindingLabel) : t.noKeySet}
            </div>
            <span class="tile-label">{t.pushToTalk}</span>
          </div>
        ) : (
          <MicControl model={model} />
        )}
        <CameraTiles model={model} />
        {model.canShare && (
          <Tile
            icon={model.sharing ? 'stop_screen_share' : 'screen_share'}
            label={model.sharing ? t.stopSharing : t.shareScreen}
            tone={model.sharing && 'live'}
            onClick={model.onShare}
          />
        )}
        <span class="divider" />
        {volumeTile(model)}
        {statsTile(model)}
        {settingsTile(model)}
        <span class="divider" />
        {leaveTile(model)}
      </div>
    );
  }

  if (model.layout === 'rail') {
    return (
      <div {...common} role="toolbar" aria-label={t.callControls} aria-orientation="vertical">
        {leaveTile(model, true)}
        <span class="spacer" />
        {settingsTile(model)}
        {statsTile(model)}
        {volumeTile(model)}
        <Tile icon="cameraswitch" label={t.switchCamera} disabled={!model.cameraOn} onClick={model.onSwitchCamera} />
        <Tile
          icon={model.cameraOn ? 'videocam' : 'videocam_off'}
          label={t.camera}
          tone={model.cameraOn && 'active'}
          onClick={model.onToggleCamera}
        />
        <MicControl model={model} showLabel />
      </div>
    );
  }

  return (
    <div {...common} role="toolbar" aria-label={t.callControls}>
      {leaveTile(model)}
      <CameraTiles model={model} />
      <MicControl model={model} />
      {volumeTile(model)}
      {statsTile(model)}
      {settingsTile(model)}
    </div>
  );
}

export function VolumePopover(props: {
  layout: Layout;
  themName: string;
  volumes: { voice: number; show: number };
  showAvailable: boolean;
  onChange(volumes: Partial<{ voice: number; show: number }>): void;
}) {
  const { volumes } = props;
  return (
    <div class={`popover volume-${props.layout}`} role="dialog" aria-label={t.volume} onPointerDown={(e) => e.stopPropagation()}>
      <SliderField
        title={
          <>
            <Icon name="record_voice_over" size={18} class="ink-2" />
            {t.voice} <span class="ink-3">· {props.themName}</span>
          </>
        }
        label={t.voiceVolume}
        readout={String(Math.round(volumes.voice * 100))}
        value={volumes.voice}
        onChange={(voice) => props.onChange({ voice })}
      />
      <SliderField
        title={
          <>
            <Icon name="movie" size={18} class="ink-2" />
            {t.show} <span class="ink-3">· {props.showAvailable ? t.theirScreen : t.notSharingSound}</span>
          </>
        }
        label={t.showVolume}
        readout={String(Math.round(volumes.show * 100))}
        value={volumes.show}
        disabled={!props.showAvailable}
        onChange={(show) => props.onChange({ show })}
      />
    </div>
  );
}
