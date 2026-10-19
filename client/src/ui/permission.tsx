import type { PrivacyPane } from '../../../shared/desktop.ts';
import { Icon } from './controls.tsx';
import { t } from './i18n.ts';
import { desktop } from '../platform.ts';

export type BlockedDevice = 'microphone' | 'camera' | 'screen';

export const isPermissionError = (error: unknown) =>
  error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError');

function copy(device: BlockedDevice) {
  switch (device) {
    case 'microphone':
      return { icon: 'mic_off', title: t.micBlocked, mac: t.micBlockedMac, browser: t.micBlockedBrowser, setting: t.privacyMicrophone };
    case 'camera':
      return { icon: 'videocam_off', title: t.cameraBlocked, mac: t.cameraBlockedMac, browser: t.cameraBlockedBrowser, setting: t.privacyCamera };
    case 'screen':
      return { icon: 'stop_screen_share', title: t.screenBlocked, mac: t.screenBlockedMac, browser: t.screenBlockedBrowser, setting: t.privacyScreen };
  }
}

function steps(device: BlockedDevice) {
  const { setting } = copy(device);
  if (!desktop) return [t.stepBrowserIcon, t.stepBrowserAllow(setting), t.stepBrowserRetry];
  return [t.stepMacOpen(setting), t.stepMacTurnOn, device === 'screen' ? t.stepMacRelaunch : t.stepMacRetry];
}

export function PermissionCard({ device, onRetry }: { device: BlockedDevice; onRetry?(): void }) {
  const text = copy(device);
  return (
    <div class="perm" role="alert">
      <div class="perm-title">
        <Icon name={text.icon} size={24} class="danger" />
        {text.title}
      </div>
      <p>{desktop ? text.mac : text.browser}</p>
      <ol>
        {steps(device).map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <div class="row-wrap">
        {desktop && (
          <button class="btn btn-solid" onClick={() => desktop!.openPrivacySettings(device as PrivacyPane)}>
            {t.openSystemSettings}
          </button>
        )}
        {onRetry && (
          <button class="btn btn-outline" onClick={onRetry}>
            {t.tryAgain}
          </button>
        )}
      </div>
    </div>
  );
}
