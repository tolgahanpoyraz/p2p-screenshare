import type { DesktopBridge } from '../../shared/desktop.ts';

export const desktop = (globalThis as { desktop?: DesktopBridge }).desktop;

// iPads report a Mac platform too, so touch support tells them apart.
export const isMacBrowser = !desktop && /Mac/.test(navigator.platform) && navigator.maxTouchPoints < 2;
