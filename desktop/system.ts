import { app, BrowserWindow, clipboard, ipcMain, shell } from 'electron';
import type { PrivacyPane } from '../shared/desktop.ts';
import { parseRoomLink } from '../shared/protocol.ts';
import { assertTrusted, originOf } from './origin.ts';

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
  ipcMain.handle('system:attention', (event) => {
    assertTrusted(event, origin);
    app.dock?.bounce('informational');
  });
  ipcMain.handle('system:focus', (event) => {
    assertTrusted(event, origin);
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    app.focus({ steal: true });
  });
  // Only full invite links to our own server count, so other clipboard contents never reach the page.
  ipcMain.handle('system:clipboard-invite', async (event) => {
    assertTrusted(event, origin);
    const text = await clipboard.readText();
    if (text.length > 2048 || originOf(text.trim()) !== origin) return null;
    return parseRoomLink(text);
  });
}
