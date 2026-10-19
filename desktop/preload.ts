import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopBridge } from '../shared/desktop.ts';

const bridge: DesktopBridge = {
  platform: process.platform,
  versions: { electron: process.versions.electron, chrome: process.versions.chrome },
  listScreenSources: () => ipcRenderer.invoke('screen:list'),
  selectScreenSource: (id, { audio }) => ipcRenderer.invoke('screen:select', id, audio),
};

contextBridge.exposeInMainWorld('desktop', bridge);
