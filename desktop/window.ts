import {
  app,
  BrowserWindow,
  shell,
  systemPreferences,
  type MediaAccessPermissionRequest,
  type Session,
} from 'electron';

const ALLOWED_PERMISSIONS = new Set([
  'media',
  'display-capture',
  'clipboard-sanitized-write',
  'screen-wake-lock',
  'speaker-selection',
]);

export interface MainWindowOptions {
  url: string;
  preload: string;
  show?: boolean;
}

export function createMainWindow({ url, preload, show = true }: MainWindowOptions) {
  const origin = new URL(url).origin;
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    show,
    title: 'screenshare',
    webPreferences: { preload, contextIsolation: true, sandbox: true, nodeIntegration: false },
  });

  restrictPermissions(win.webContents.session, origin);

  win.webContents.on('will-navigate', (event, target) => {
    if (originOf(target) !== origin) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith('https://')) shell.openExternal(target);
    return { action: 'deny' };
  });

  win.loadURL(url);
  return win;
}

function restrictPermissions(session: Session, origin: string) {
  session.setPermissionCheckHandler(
    (_contents, permission, requestingOrigin) =>
      originOf(requestingOrigin) === origin && ALLOWED_PERMISSIONS.has(permission),
  );
  session.setPermissionRequestHandler((_contents, permission, callback, details) => {
    if (originOf(details.requestingUrl) !== origin || !ALLOWED_PERMISSIONS.has(permission)) {
      callback(false);
      return;
    }
    if (permission === 'media') {
      const types = (details as MediaAccessPermissionRequest).mediaTypes ?? [];
      ensureSystemMediaAccess(types).then(callback);
      return;
    }
    callback(true);
  });
}

async function ensureSystemMediaAccess(types: ('audio' | 'video')[]) {
  if (process.platform !== 'darwin' || app.commandLine.hasSwitch('use-fake-device-for-media-stream')) {
    return true;
  }
  for (const type of types) {
    const device = type === 'audio' ? 'microphone' : 'camera';
    if (systemPreferences.getMediaAccessStatus(device) === 'granted') continue;
    if (!(await systemPreferences.askForMediaAccess(device))) return false;
  }
  return true;
}

function originOf(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
