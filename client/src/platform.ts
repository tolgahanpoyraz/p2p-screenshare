import type { DesktopBridge } from '../../shared/desktop.ts';

export const desktop = (globalThis as { desktop?: DesktopBridge }).desktop;
