import { desktopCapturer, ipcMain, webContents, type IpcMainInvokeEvent, type Session } from 'electron';
import type { ScreenSource } from '../shared/desktop.ts';
import { originOf } from './origin.ts';

interface Selection {
  sourceId: string;
  audio: boolean;
}

const selections = new Map<number, Selection>();
let registered = false;

export function registerScreenCapture(session: Session, origin: string) {
  if (registered) return;
  registered = true;

  const assertTrusted = (event: IpcMainInvokeEvent) => {
    if (originOf(event.senderFrame?.url) !== origin) throw new Error('Untrusted sender');
  };

  ipcMain.handle('screen:list', async (event): Promise<ScreenSource[]> => {
    assertTrusted(event);
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 200 },
    });
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      kind: source.id.startsWith('screen:') ? 'screen' : 'window',
      thumbnail: source.thumbnail.toDataURL(),
    }));
  });

  ipcMain.handle('screen:select', (event, sourceId: unknown, audio: unknown) => {
    assertTrusted(event);
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
