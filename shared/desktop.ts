export interface ScreenSource {
  id: string;
  name: string;
  kind: 'screen' | 'window';
  thumbnail: string;
}

export interface DesktopBridge {
  platform: string;
  versions: { electron: string; chrome: string };
  listScreenSources(): Promise<ScreenSource[]>;
  selectScreenSource(id: string, options: { audio: boolean }): Promise<void>;
}
