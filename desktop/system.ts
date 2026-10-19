import { ipcMain, shell } from 'electron';
import type { PrivacyPane } from '../shared/desktop.ts';
import { assertTrusted } from './origin.ts';

const panes: Record<PrivacyPane, string> = {
  microphone: 'Privacy_Microphone',
  camera: 'Privacy_Camera',
  screen: 'Privacy_ScreenCapture',
  accessibility: 'Privacy_Accessibility',
};

let registered = false;

export function registerSystemSettings(origin: string) {
  if (registered) return;
  registered = true;
  ipcMain.handle('system:open-privacy', (event, pane: unknown) => {
    assertTrusted(event, origin);
    if (process.platform !== 'darwin' || typeof pane !== 'string' || !Object.hasOwn(panes, pane)) return;
    return shell.openExternal(
      `x-apple.systempreferences:com.apple.preference.security?${panes[pane as PrivacyPane]}`,
    );
  });
}
