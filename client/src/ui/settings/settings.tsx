import type { Session } from '../../core/session.ts';
import type { SettingsStore } from '../../core/settings.ts';
import { cx, Icon } from '../controls.tsx';
import { useDevices, useEscape, useSettings } from '../hooks.ts';
import { t } from '../i18n.ts';
import { desktop } from '../../platform.ts';
import { CameraSection, LanguageSection, MicSection, ProfileSection, PushToTalkSection, ScreenSection, SpeakerSection } from './sections.tsx';

export type SectionId = 'mic' | 'speaker' | 'camera' | 'ptt' | 'screen' | 'profile' | 'language';

const sections = (): { id: SectionId; label: string; icon: string; macOnly?: boolean }[] => [
  { id: 'mic', label: t.microphone, icon: 'mic' },
  { id: 'speaker', label: t.speaker, icon: 'volume_up' },
  { id: 'camera', label: t.camera, icon: 'videocam' },
  { id: 'ptt', label: t.pushToTalk, icon: 'touch_app' },
  { id: 'screen', label: t.sectionScreen, icon: 'screen_share', macOnly: true },
  { id: 'profile', label: t.sectionProfile, icon: 'favorite' },
  { id: 'language', label: t.sectionLanguage, icon: 'translate' },
];

interface SettingsProps {
  store: SettingsStore;
  session: Session | null;
  section: SectionId;
  stacked: boolean;
  onSection(section: SectionId): void;
  onClose(): void;
}

export function SettingsModal({ store, session, section, stacked, onSection, onClose }: SettingsProps) {
  const settings = useSettings(store);
  const devices = useDevices();
  useEscape(true, onClose);
  const visible = sections().filter((s) => !s.macOnly || desktop);
  const current = visible.find((s) => s.id === section) ?? visible[0];
  const props = { store, settings, devices };

  return (
    <div class="scrim" onClick={onClose}>
      <div
        class={cx('modal settings', stacked && 'stacked')}
        role="dialog"
        aria-label={t.settings}
        onClick={(e) => e.stopPropagation()}
      >
        <nav class="settings-nav">
          <div class="settings-title">{t.settings}</div>
          {visible.map((s) => (
            <button key={s.id} aria-current={s.id === current.id} onClick={() => onSection(s.id)}>
              <Icon name={s.icon} size={20} class="ink-2" />
              {s.label}
            </button>
          ))}
        </nav>
        <div class="settings-main">
          <div class="modal-head">
            <h3>{current.label}</h3>
            <div class="row-10">
              <span class="hint">{t.changesApply}</span>
              <button class="icon-btn ms" aria-label={t.closeSettings} onClick={onClose}>
                close
              </button>
            </div>
          </div>
          <div class="settings-body">
            {current.id === 'mic' && <MicSection {...props} />}
            {current.id === 'speaker' && <SpeakerSection {...props} />}
            {current.id === 'camera' && <CameraSection {...props} session={session} />}
            {current.id === 'ptt' && <PushToTalkSection {...props} />}
            {current.id === 'screen' && <ScreenSection {...props} />}
            {current.id === 'profile' && <ProfileSection {...props} />}
            {current.id === 'language' && <LanguageSection {...props} />}
          </div>
        </div>
      </div>
    </div>
  );
}
