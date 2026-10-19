import { screenPresets, type ScreenQuality } from '../core/screen.ts';
import { t } from './i18n.ts';

const labels = (): Record<keyof typeof screenPresets, { label: string; sub: string }> => ({
  '720p30': { label: '720p30', sub: t.presetLight },
  '1080p30': { label: '1080p30', sub: t.presetDefault },
  '1080p60': { label: '1080p60', sub: t.presetSmooth },
  '1440p60': { label: '1440p60', sub: t.presetSharp },
  '4K30': { label: '4K30', sub: t.presetMax },
  native: { label: t.native, sub: t.presetNative },
});

export const presetOptions = () =>
  Object.entries(screenPresets).map(([value, quality]) => ({
    value,
    quality: quality as ScreenQuality,
    ...labels()[value as keyof typeof screenPresets],
  }));

const same = (a: ScreenQuality, b: ScreenQuality) =>
  a.height === b.height && a.frameRate === b.frameRate && a.maxBitrateKbps === b.maxBitrateKbps && a.codec === b.codec && a.mode === b.mode;

/** The preset matching these settings, or "custom" once Advanced has changed something. */
export function presetValue(quality: ScreenQuality) {
  return presetOptions().find((o) => same(o.quality, quality))?.value ?? 'custom';
}
