import type { Call, Slot } from './call.ts';
import { routeToSpeaker } from './devices.ts';

const volumeKeys = { mic: 'voice', screenAudio: 'show' } as const;
type AudioSlot = keyof typeof volumeKeys;
export type Volumes = Record<(typeof volumeKeys)[AudioSlot], number>;

const isAudioSlot = (slot: Slot): slot is AudioSlot => slot in volumeKeys;

// Chrome only plays remote WebRTC audio that's attached to a media element,
// so each incoming audio track gets a hidden <audio>.
export class RemoteAudio {
  private players = new Map<AudioSlot, HTMLAudioElement>();
  private volumes: Volumes;
  private speakerId: string | undefined;
  private unsubscribe: () => void;

  constructor(call: Call, volumes: Volumes, speakerId?: string) {
    this.volumes = { ...volumes };
    this.speakerId = speakerId;
    this.unsubscribe = call.on('remote-track', ({ slot, track }) => {
      if (isAudioSlot(slot)) this.attach(slot, track);
    });
  }

  setVolumes(volumes: Volumes) {
    this.volumes = { ...volumes };
    for (const [slot, player] of this.players) player.volume = this.volumes[volumeKeys[slot]];
  }

  async setSpeaker(speakerId: string | undefined) {
    this.speakerId = speakerId;
    await Promise.all([...this.players.values()].map((player) => routeToSpeaker(player, speakerId)));
  }

  close() {
    this.unsubscribe();
    for (const player of this.players.values()) player.remove();
    this.players.clear();
  }

  private attach(slot: AudioSlot, track: MediaStreamTrack | null) {
    this.players.get(slot)?.remove();
    this.players.delete(slot);
    if (!track) return;
    const player = document.createElement('audio');
    player.autoplay = true;
    player.srcObject = new MediaStream([track]);
    player.volume = this.volumes[volumeKeys[slot]];
    routeToSpeaker(player, this.speakerId).catch(() => {});
    this.players.set(slot, document.body.appendChild(player));
  }
}
