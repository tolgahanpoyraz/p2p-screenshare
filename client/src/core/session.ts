import { Call } from './call.ts';
import { Camera } from './camera.ts';
import { Emitter } from './emitter.ts';
import { fetchConfig, openMicrophone, signalingUrl } from './media.ts';
import { Voice } from './ptt.ts';
import { RemoteAudio } from './remote-audio.ts';
import { ScreenShare } from './screen.ts';
import type { Settings, SettingsStore } from './settings.ts';
import { StatsSampler } from './stats.ts';
import { desktop } from '../platform.ts';

export interface JoinOptions {
  baseUrl: string;
  roomId: string;
  settings: SettingsStore;
}

type SessionEvents = {
  error: { code: string; message: string };
};

export class Session extends Emitter<SessionEvents> {
  readonly call: Call;
  readonly voice: Voice;
  readonly camera: Camera;
  readonly screen: ScreenShare;
  readonly audio: RemoteAudio;
  readonly stats: StatsSampler;
  mic: MediaStreamTrack | null = null;
  private settings: SettingsStore;
  private unsubscribe: () => void;

  static async join({ baseUrl, roomId, settings }: JoinOptions) {
    const config = await fetchConfig(baseUrl);
    const call = new Call({ signalingUrl: signalingUrl(baseUrl, roomId), iceServers: config.iceServers });
    const session = new Session(call, settings);
    await session.openMicrophone();
    return session;
  }

  private constructor(call: Call, settings: SettingsStore) {
    super();
    const s = settings.value;
    this.call = call;
    this.settings = settings;
    this.voice = new Voice(call);
    this.camera = new Camera(call);
    this.screen = new ScreenShare(call);
    this.audio = new RemoteAudio(call, s.volumes, s.speakerId);
    this.stats = new StatsSampler(call);

    this.voice.releaseDelayMs = s.releaseDelayMs;
    this.voice.setMode(s.voiceMode);
    this.camera.settings = { ...s.camera };
    this.screen.quality = s.screen;
    this.applyBinding(s);

    call.on('error', (error) => this.emit('error', error));
    this.unsubscribe = settings.on('change', ({ settings, changed }) => {
      this.apply(settings, changed).catch((error: Error) =>
        this.emit('error', { code: 'settings', message: error.message }),
      );
    });
  }

  async openMicrophone() {
    const { microphoneId, voiceProcessing } = this.settings.value;
    // A saved mic that's been unplugged fails an exact match; fall back to the default.
    const track = await openMicrophone(microphoneId, voiceProcessing).catch(() =>
      openMicrophone(undefined, voiceProcessing),
    );
    const previous = this.mic;
    this.mic = track;
    track.addEventListener('ended', () => {
      if (this.mic === track) this.openMicrophone().catch(() => {});
    });
    await this.call.setTrack('mic', track);
    this.voice.setMic(track);
    previous?.stop();
  }

  leave() {
    this.unsubscribe();
    this.call.hangup();
    this.camera.stop();
    this.screen.stop();
    this.audio.close();
    this.mic?.stop();
    this.mic = null;
  }

  private async apply(s: Settings, changed: (keyof Settings)[]) {
    for (const key of changed) {
      switch (key) {
        case 'microphoneId':
        case 'voiceProcessing':
          await this.openMicrophone();
          break;
        case 'speakerId':
          await this.audio.setSpeaker(s.speakerId);
          break;
        case 'volumes':
          this.audio.setVolumes(s.volumes);
          break;
        case 'voiceMode':
          this.voice.setMode(s.voiceMode);
          break;
        case 'releaseDelayMs':
          this.voice.releaseDelayMs = s.releaseDelayMs;
          break;
        case 'pushToTalkBinding':
          this.applyBinding(s);
          break;
        case 'camera':
          if (this.camera.active) await this.camera.start(s.camera);
          else this.camera.settings = { ...s.camera };
          break;
        case 'screen':
          await this.screen.setQuality(s.screen);
          break;
      }
    }
  }

  private applyBinding(s: Settings) {
    desktop?.pushToTalk.setBinding(s.pushToTalkBinding).catch((error: Error) => {
      this.emit('error', { code: 'push-to-talk', message: error.message });
    });
  }
}
