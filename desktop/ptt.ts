import { app, ipcMain, systemPreferences, type WebContents } from 'electron';
import { EventType, uIOhook, UiohookKey, type UiohookKeyboardEvent, type UiohookMouseEvent } from 'uiohook-napi';
import type { PushToTalkBinding } from '../shared/desktop.ts';
import { assertTrusted } from './origin.ts';

export interface InputEvent {
  kind: 'key' | 'mouse';
  code: number;
  down: boolean;
}

const keyNames = new Map<number, string>(Object.entries(UiohookKey).map(([name, code]) => [code, name]));
const PRIMARY_MOUSE_BUTTONS = 2;

let binding: PushToTalkBinding | null = null;
let pressed = false;
let pendingCapture: ((binding: PushToTalkBinding | null) => void) | null = null;
let hookRunning = false;
const subscribers = new Set<WebContents>();
let registered = false;

export function registerPushToTalk(origin: string) {
  if (registered) return;
  registered = true;
  app.on('will-quit', stopPushToTalk);

  ipcMain.handle('ptt:has-permission', (event) => {
    assertTrusted(event, origin);
    return hasPermission();
  });

  ipcMain.handle('ptt:request-permission', (event) => {
    assertTrusted(event, origin);
    return process.platform !== 'darwin' || systemPreferences.isTrustedAccessibilityClient(true);
  });

  ipcMain.handle('ptt:capture', (event) => {
    assertTrusted(event, origin);
    ensureHook();
    pendingCapture?.(null);
    return new Promise<PushToTalkBinding | null>((resolve) => {
      pendingCapture = (result) => {
        pendingCapture = null;
        resolve(result);
        syncHook();
      };
    });
  });

  ipcMain.handle('ptt:set-binding', (event, next: PushToTalkBinding | null) => {
    assertTrusted(event, origin);
    subscribe(event.sender);
    setPressed(false);
    binding = next && { kind: next.kind === 'mouse' ? 'mouse' : 'key', code: Number(next.code), label: String(next.label) };
    if (binding) ensureHook();
    else syncHook();
  });
}

export function handleInput({ kind, code, down }: InputEvent) {
  if (pendingCapture) {
    if (!down || (kind === 'mouse' && code <= PRIMARY_MOUSE_BUTTONS)) return;
    pendingCapture(kind === 'key' && code === UiohookKey.Escape ? null : { kind, code, label: labelFor(kind, code) });
    return;
  }
  if (binding?.kind === kind && binding.code === code) setPressed(down);
}

function labelFor(kind: 'key' | 'mouse', code: number) {
  return kind === 'mouse' ? `Mouse ${code}` : (keyNames.get(code) ?? `Key ${code}`);
}

function setPressed(next: boolean) {
  if (next === pressed) return;
  pressed = next;
  for (const contents of subscribers) contents.send('ptt:change', pressed);
}

function subscribe(contents: WebContents) {
  if (subscribers.has(contents)) return;
  subscribers.add(contents);
  contents.once('destroyed', () => subscribers.delete(contents));
}

function hasPermission() {
  return process.platform !== 'darwin' || systemPreferences.isTrustedAccessibilityClient(false);
}

function ensureHook() {
  if (hookRunning) return;
  if (!hasPermission()) throw new Error('Push-to-talk needs Accessibility permission');
  uIOhook.on('keydown', onKey);
  uIOhook.on('keyup', onKey);
  uIOhook.on('mousedown', onMouse);
  uIOhook.on('mouseup', onMouse);
  uIOhook.start();
  hookRunning = true;
}

// An input event arriving while Electron tears down Node crashes uiohook, so stop it before quitting.
export function stopPushToTalk() {
  if (!hookRunning) return;
  uIOhook.stop();
  uIOhook.removeAllListeners();
  hookRunning = false;
}

function syncHook() {
  if (!binding && !pendingCapture) stopPushToTalk();
}

function onKey(event: UiohookKeyboardEvent) {
  handleInput({ kind: 'key', code: event.keycode, down: event.type === EventType.EVENT_KEY_PRESSED });
}

function onMouse(event: UiohookMouseEvent) {
  handleInput({ kind: 'mouse', code: Number(event.button), down: event.type === EventType.EVENT_MOUSE_PRESSED });
}
