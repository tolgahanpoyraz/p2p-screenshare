import { BrowserWindow, desktopCapturer, ipcMain, webContents, type Session } from 'electron';
import type { ScreenSource } from '../shared/desktop.ts';
import { assertTrusted, originOf } from './origin.ts';

interface Selection {
  sourceId: string;
  audio: boolean;
}

const selections = new Map<number, Selection>();
let registered = false;

export function registerScreenCapture(session: Session, origin: string) {
  if (registered) return;
  registered = true;

  ipcMain.handle('screen:list', async (event): Promise<ScreenSource[]> => {
    assertTrusted(event, origin);
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 200 },
    });
    const own = new Set(BrowserWindow.getAllWindows().map((win) => win.getMediaSourceId()));
    return sources.filter((source) => !own.has(source.id)).map((source) => ({
      id: source.id,
      name: source.name,
      kind: source.id.startsWith('screen:') ? 'screen' : 'window',
      thumbnail: source.thumbnail.toDataURL(),
    }));
  });

  ipcMain.handle('screen:select', (event, sourceId: unknown, audio: unknown) => {
    assertTrusted(event, origin);
    selections.set(event.sender.id, { sourceId: String(sourceId), audio: audio === true });
  });

  session.setDisplayMediaRequestHandler(async (request, callback) => {
    const contents = request.frame && webContents.fromFrame(request.frame);
    const selection = contents && selections.get(contents.id);
    if (!contents || !selection || originOf(request.securityOrigin) !== origin) {
      callback(null);
      return;
    }
    selections.delete(contents.id);

    const sources = await desktopCapturer
      .getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } })
      .catch(() => []);
    const source = sources.find((s) => s.id === selection.sourceId);
    if (!source) {
      callback(null);
      return;
    }
    // Electron throws on an explicit `audio: undefined`, so the key is only added when wanted.
    callback(selection.audio && request.audioRequested ? { video: source, audio: 'loopback' } : { video: source });
  });
}
