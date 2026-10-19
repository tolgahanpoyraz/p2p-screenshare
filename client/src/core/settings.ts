import type { PushToTalkBinding } from '../../../shared/desktop.ts';
import { defaultCameraSettings, type CameraSettings } from './camera.ts';
import { Emitter } from './emitter.ts';
import { defaultVoiceProcessing, type VoiceProcessing } from './media.ts';
import { DEFAULT_RELEASE_DELAY_MS, type VoiceMode } from './ptt.ts';
import { screenPresets, type ScreenQuality } from './screen.ts';

export interface Settings {
  microphoneId?: string;
  speakerId?: string;
  voiceProcessing: VoiceProcessing;
  voiceMode: VoiceMode;
  releaseDelayMs: number;
  pushToTalkBinding: PushToTalkBinding | null;
  camera: CameraSettings;
  screen: ScreenQuality;
  shareSystemAudio: boolean;
  volumes: { voice: number; show: number };
}

export const defaultSettings: Settings = {
  // Listed explicitly (as undefined = system default) so merge() recognizes them as settings.
  microphoneId: undefined,
  speakerId: undefined,
  voiceProcessing: defaultVoiceProcessing,
  voiceMode: 'open',
  releaseDelayMs: DEFAULT_RELEASE_DELAY_MS,
  pushToTalkBinding: null,
  camera: defaultCameraSettings,
  screen: screenPresets['1080p30'],
  shareSystemAudio: true,
  volumes: { voice: 1, show: 1 },
};

export type SettingsPatch = {
  [K in keyof Settings]?: Settings[K] extends object | null ? Partial<NonNullable<Settings[K]>> | null : Settings[K];
};

const STORAGE_KEY = 'screenshare.settings';

type SettingsEvents = {
  change: { settings: Settings; changed: (keyof Settings)[] };
};

export class SettingsStore extends Emitter<SettingsEvents> {
  value: Settings;
  private storage: Storage | undefined;

  constructor(storage: Storage | undefined = globalThis.localStorage) {
    super();
    this.storage = storage;
    this.value = merge(defaultSettings, this.load());
  }

  update(patch: SettingsPatch) {
    const next = merge(this.value, patch);
    const changed = (Object.keys(patch) as (keyof Settings)[]).filter(
      (key) => JSON.stringify(next[key]) !== JSON.stringify(this.value[key]),
    );
    if (!changed.length) return;
    this.value = next;
    this.save();
    this.emit('change', { settings: next, changed });
  }

  private load(): SettingsPatch {
    try {
      const parsed = JSON.parse(this.storage?.getItem(STORAGE_KEY) ?? '{}');
      return typeof parsed === 'object' && parsed ? parsed : {};
    } catch {
      return {};
    }
  }

  private save() {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.value));
    } catch {}
  }
}

const isObject = (v: unknown): v is object => typeof v === 'object' && v !== null && !Array.isArray(v);

// Nested objects merge one level deep so a saved partial (or one from an older
// version) still picks up defaults for fields it doesn't mention.
function merge(base: Settings, patch: SettingsPatch): Settings {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in base)) continue;
    const current = base[key as keyof Settings];
    result[key] = isObject(current) && isObject(value) ? { ...current, ...value } : value;
  }
  return result as unknown as Settings;
}
