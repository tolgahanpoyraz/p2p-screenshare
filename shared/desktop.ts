export interface ScreenSource {
  id: string;
  name: string;
  kind: 'screen' | 'window';
  thumbnail: string;
}

export interface PushToTalkBinding {
  kind: 'key' | 'mouse';
  code: number;
  label: string;
}

export type PrivacyPane = 'microphone' | 'camera' | 'screen' | 'accessibility';

export interface DesktopBridge {
  platform: string;
  versions: { electron: string; chrome: string };
  listScreenSources(): Promise<ScreenSource[]>;
  selectScreenSource(id: string, options: { audio: boolean }): Promise<void>;
  openPrivacySettings(pane: PrivacyPane): Promise<void>;
  /** Bounces the dock icon once. */
  requestAttention(): Promise<void>;
  focusWindow(): Promise<void>;
  /** Room id of an invite link to this app's server on the clipboard, or null. */
  readInviteFromClipboard(): Promise<string | null>;
  pushToTalk: {
    hasPermission(): Promise<boolean>;
    /** Shows the macOS Accessibility prompt; resolves with the current state (the user may grant it later). */
    requestPermission(): Promise<boolean>;
    /** Resolves with the next key or extra mouse button pressed anywhere, or null on Escape. */
    captureBinding(): Promise<PushToTalkBinding | null>;
    setBinding(binding: PushToTalkBinding | null): Promise<void>;
    onChange(listener: (pressed: boolean) => void): () => void;
  };
}
