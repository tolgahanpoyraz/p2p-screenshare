import type { VoiceState } from '../../core/call.ts';
import { Avatar, InviteField, Video } from '../controls.tsx';
import { useLevel } from '../hooks.ts';
import { t } from '../i18n.ts';
import type { Person } from '../identity.ts';
import type { Rect } from './geometry.ts';
import type { Zoom } from './gestures.ts';

export const SPEAKING = 0.18;

export function ScreenStage(props: {
  track: MediaStreamTrack | undefined;
  frame: Rect;
  zoom: Zoom;
  onVideoSize(size: { width: number; height: number }): void;
}) {
  const { frame, zoom } = props;
  return (
    <div
      class="share-frame"
      style={{
        left: `${frame.x}px`,
        top: `${frame.y}px`,
        width: `${frame.w}px`,
        height: `${frame.h}px`,
        transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})`,
      }}
    >
      <Video track={props.track} class="fill contain" onResize={props.onVideoSize} />
    </div>
  );
}

export function CameraStage({ track }: { track: MediaStreamTrack | undefined }) {
  return <Video track={track} class="stage-camera" />;
}

export function voiceLine(voice: VoiceState | null, speaking: boolean) {
  if (!voice) return '';
  if (voice.mode === 'open') return speaking ? t.voiceTalkingOpen : t.voiceOpen;
  return voice.transmitting ? t.voiceTalkingPtt : t.voicePttSilent;
}

export function VoiceStage(props: { them: Person; voice: VoiceState | null; mic: MediaStreamTrack | undefined }) {
  const level = useLevel(props.mic);
  const speaking = Boolean(props.voice?.transmitting) && level > SPEAKING;
  return (
    <div class="voice-view">
      <div class="voice-avatar">
        <span
          class="voice-halo"
          style={{ opacity: speaking ? 0.28 : 0, transform: `scale(${1 + (speaking ? level * 0.45 : 0)})` }}
        />
        <Avatar person={props.them} size={150} />
      </div>
      <div class="voice-name">
        <span class="voice-title">{props.them.name}</span>
        <span class="ink-2">{voiceLine(props.voice, speaking)}</span>
      </div>
    </div>
  );
}

export function WaitingStage(props: { you: Person; them: Person; theyLeft: boolean; layout: string }) {
  const { you, them, theyLeft } = props;
  return (
    <div class={`waiting waiting-${props.layout}`}>
      <div class="waiting-card">
        <div class="waiting-graphic" aria-hidden="true">
          <Avatar person={you} size={84} />
          <span class="waiting-empty" />
          <span class="waiting-ring" />
        </div>
        <div class="stack-6">
          <h2 class="title-28">{theyLeft ? t.theyLeft(them.name) : t.waitingFor(them.named ? them.name : null)}</h2>
          <p class="ink-2">{theyLeft ? t.theyLeftBody : t.waitingBody}</p>
        </div>
        <InviteField onSurface />
      </div>
    </div>
  );
}

export function ConnectingStage({ line }: { line: string }) {
  return (
    <div class="connecting">
      <div class="connecting-graphic" aria-hidden="true">
        <span class="connecting-you" />
        <span class="connecting-track">
          <span />
        </span>
        <span class="connecting-them" />
      </div>
      <span class="connecting-line">{line}</span>
    </div>
  );
}

export function LostStage() {
  return (
    <div class="connecting">
      <h2 class="title-28">{t.connectionLost}</h2>
      <p class="ink-2">{t.connectionLostBody}</p>
      <button class="btn btn-primary btn-md" onClick={() => location.reload()}>
        {t.rejoin}
      </button>
    </div>
  );
}
