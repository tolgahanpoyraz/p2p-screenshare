import { contextBridge } from 'electron';
import type { DesktopBridge } from '../shared/desktop.ts';

const bridge: DesktopBridge = {
  platform: process.platform,
  versions: { electron: process.versions.electron, chrome: process.versions.chrome },
};

contextBridge.exposeInMainWorld('desktop', bridge);
