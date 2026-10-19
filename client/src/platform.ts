import type { DesktopBridge } from '../../shared/desktop.ts';

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
}

export const desktop = window.desktop;
