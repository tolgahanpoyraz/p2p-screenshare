import { useRef, useState } from 'preact/hooks';
import type { CallState, VoiceState } from '../../core/call.ts';
import { cx, Icon, Video } from '../controls.tsx';
import { useLevel } from '../hooks.ts';
import { t } from '../i18n.ts';
import type { Person } from '../identity.ts';
import { nearestCorner, type Corner, type Rect, type Size } from './geometry.ts';
import { SPEAKING } from './stage.tsx';

const connection = (): Record<CallState, { label: string; dot: string; breathe?: boolean }> => ({
  joining: { label: t.joiningState, dot: 'ink-3', breathe: true },
  waiting: { label: t.inRoom, dot: 'ink-3' },
  connecting: { label: t.connectingState, dot: 'ink-3', breathe: true },
  connected: { label: t.connected, dot: 'live' },
  reconnecting: { label: t.reconnectingState, dot: 'warn', breathe: true },
  closed: { label: t.disconnected, dot: 'danger' },
});

interface StatusProps {
  state: CallState;
  them: Person;
  remoteVoice: VoiceState | null;
  theirMic: MediaStreamTrack | undefined;
  voice: { mode: VoiceState['mode']; transmitting: boolean };
  holdHint: string;
  maxWidth: number;
}

export function StatusRow(props: StatusProps) {
  const conn = connection()[props.state];
  const connected = props.state === 'connected' || props.state === 'reconnecting';
  const { voice } = props;
  const tone = voice.transmitting ? 'live' : voice.mode === 'open' ? 'danger' : null;
  return (
    <div class="status-row" style={{ maxWidth: `${props.maxWidth}px` }}>
      <div class="chip">
        <span class={cx('dot', `bg-${conn.dot}`, conn.breathe && 'breathe')} />
        {conn.label}
      </div>
      {connected && <ThemChip them={props.them} voice={props.remoteVoice} mic={props.theirMic} />}
      <div class={cx('chip you-chip', tone && `chip-${tone}`)}>
        <Icon name={voice.transmitting ? 'mic' : 'mic_off'} size={17} />
        <strong>{t.you}</strong>
        <span>{voice.transmitting ? t.onAir : voice.mode === 'open' ? t.muted : props.holdHint}</span>
      </div>
    </div>
  );
}

function ThemChip({ them, voice, mic }: { them: Person; voice: VoiceState | null; mic: MediaStreamTrack | undefined }) {
  const level = useLevel(mic);
  const speaking = Boolean(voice?.transmitting) && level > SPEAKING;
  const bar = (k: number) => (speaking ? Math.round(4 + Math.min(1, level * (1 + k * 0.4)) * 10) : 4);
  return (
    <div class="chip them-chip">
      <span class="avatar" style={{ width: '22px', height: '22px', background: them.color, fontSize: '11px' }}>
        {them.initial}
      </span>
      <strong>{them.name}</strong>
      <span class={cx('bars', speaking && 'speaking')} aria-hidden="true">
        <span style={{ height: `${bar(0)}px` }} />
        <span style={{ height: `${bar(2)}px` }} />
        <span style={{ height: `${bar(1)}px` }} />
      </span>
      <span class="ink-2">
        {voice?.mode === 'push-to-talk' ? (voice.transmitting ? t.talking : t.pushToTalkLower) : t.openMicLower}
      </span>
    </div>
  );
}

export function TheirPip(props: {
  track: MediaStreamTrack | undefined;
  mic: MediaStreamTrack | undefined;
  voice: VoiceState | null;
  them: Person;
  rect: Rect;
  stage: Size;
  onCorner(corner: Corner): void;
}) {
  const level = useLevel(props.mic);
  const speaking = Boolean(props.voice?.transmitting) && level > SPEAKING;
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const start = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const rect = drag ? { ...props.rect, ...drag } : props.rect;

  return (
    <div
      class={cx('pip', speaking && 'speaking', drag && 'dragging')}
      style={{ left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` }}
      onPointerDown={(event) => {
        event.stopPropagation();
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        start.current = { px: event.clientX, py: event.clientY, x: props.rect.x, y: props.rect.y };
        setDrag({ x: props.rect.x, y: props.rect.y });
      }}
      onPointerMove={(event) => {
        const s = start.current;
        if (s) setDrag({ x: s.x + event.clientX - s.px, y: s.y + event.clientY - s.py });
      }}
      onPointerUp={() => {
        if (!start.current) return;
        start.current = null;
        if (drag) props.onCorner(nearestCorner(props.stage, { ...props.rect, ...drag }));
        setDrag(null);
      }}
      onPointerCancel={() => {
        start.current = null;
        setDrag(null);
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <Video track={props.track} class="fill cover" />
      <span class="name-chip">
        <span class="dot" style={{ background: props.them.color, width: '7px', height: '7px' }} />
        {props.them.name}
      </span>
    </div>
  );
}

export function SelfPip(props: { track: MediaStreamTrack; mic: MediaStreamTrack | null; transmitting: boolean; rect: Rect }) {
  const level = useLevel(props.transmitting ? props.mic : null);
  const facing = props.track.getSettings().facingMode;
  const { rect } = props;
  return (
    <div
      class={cx('pip self-pip', props.transmitting && level > 0.2 && 'speaking')}
      style={{ left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` }}
    >
      <Video track={props.track} class="fill cover" mirrored={facing !== 'environment'} />
    </div>
  );
}

export function SharingBanner(props: { source: string; withSound: boolean; onStop(): void }) {
  return (
    <div class="sharing-banner" role="status">
      <Icon name="screen_share" size={18} />
      <span class="ellipsis">{t.youreSharing(props.source)}</span>
      <span class="sharing-sound">{props.withSound ? t.withSound : t.noSound}</span>
      <button onClick={props.onStop}>{t.stop}</button>
    </div>
  );
}
