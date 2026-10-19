import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopBridge } from '../shared/desktop.ts';

const bridge: DesktopBridge = {
  platform: process.platform,
  versions: { electron: process.versions.electron, chrome: process.versions.chrome },
  listScreenSources: () => ipcRenderer.invoke('screen:list'),
  selectScreenSource: (id, { audio }) => ipcRenderer.invoke('screen:select', id, audio),
  pushToTalk: {
    hasPermission: () => ipcRenderer.invoke('ptt:has-permission'),
    requestPermission: () => ipcRenderer.invoke('ptt:request-permission'),
    captureBinding: () => ipcRenderer.invoke('ptt:capture'),
    setBinding: (binding) => ipcRenderer.invoke('ptt:set-binding', binding),
    onChange: (listener) => {
      const handler = (_event: unknown, pressed: boolean) => listener(pressed);
      ipcRenderer.on('ptt:change', handler);
      return () => ipcRenderer.off('ptt:change', handler);
    },
  },
};

contextBridge.exposeInMainWorld('desktop', bridge);
