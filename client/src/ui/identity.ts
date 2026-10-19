import type { Profile } from '../core/call.ts';
import type { Settings } from '../core/settings.ts';
import { t } from './i18n.ts';

export const HUES = [55, 250, 10, 300, 95];
const DEFAULT_HUE = { you: 55, them: 250 };

export const swatch = (hue: number) => `oklch(0.76 0.11 ${hue})`;

export interface Person {
  name: string;
  /** False while showing the "You"/"Them" placeholder. */
  named: boolean;
  initial: string;
  hue: number;
  color: string;
}

function person(name: string, hue: number, fallback: string): Person {
  const trimmed = name.trim();
  return {
    name: trimmed || fallback,
    named: Boolean(trimmed),
    initial: (trimmed || fallback)[0].toLocaleUpperCase(document.documentElement.lang || undefined),
    hue,
    color: swatch(hue),
  };
}

/** The other person always appears the way they set themselves up. */
export function people(settings: Settings, remote: Profile | null) {
  const remoteHue = remote?.hue !== undefined && HUES.includes(remote.hue) ? remote.hue : undefined;
  return {
    you: person(settings.you.name, settings.you.hue ?? DEFAULT_HUE.you, t.you),
    them: person(remote?.name ?? '', remoteHue ?? DEFAULT_HUE.them, t.them),
  };
}
