import { useEffect, useState } from 'preact/hooks';
import type { ScreenSource } from '../../../../shared/desktop.ts';
import type { SettingsStore } from '../../core/settings.ts';
import { Icon, Select, Switch } from '../controls.tsx';
import { useEscape, useSettings } from '../hooks.ts';
import { t } from '../i18n.ts';
import { desktop } from '../../platform.ts';
import { presetOptions, presetValue } from '../presets.ts';

export function SourcePicker(props: {
  store: SettingsStore;
  onPick(source: ScreenSource): void;
  onClose(): void;
  onError(error: unknown): void;
}) {
  const settings = useSettings(props.store);
  const [sources, setSources] = useState<ScreenSource[] | null>(null);
  useEscape(true, props.onClose);

  const refresh = () => desktop!.listScreenSources().then(setSources, props.onError);
  useEffect(() => void refresh(), []);

  const section = (kind: ScreenSource['kind'], title: string, icon: string) => {
    const list = sources?.filter((s) => s.kind === kind) ?? [];
    if (!list.length) return null;
    return (
      <>
        <div class="section-label">{title}</div>
        <div class="source-grid">
          {list.map((source) => (
            <button key={source.id} class="source" onClick={() => props.onPick(source)}>
              <img src={source.thumbnail} alt="" />
              <span class="source-name">
                <Icon name={icon} size={16} class="ink-3" />
                <span class="ellipsis">{source.name}</span>
              </span>
            </button>
          ))}
        </div>
      </>
    );
  };

  return (
    <div class="scrim" onClick={props.onClose}>
      <div class="modal picker" role="dialog" aria-label={t.shareYourScreen} onClick={(e) => e.stopPropagation()}>
        <div class="modal-head">
          <h3>{t.shareYourScreen}</h3>
          <span class="spacer" />
          <button class="icon-btn ms" aria-label={t.refreshSources} title={t.refreshSources} onClick={refresh}>
            refresh
          </button>
          <button class="icon-btn ms" aria-label={t.close} onClick={props.onClose}>
            close
          </button>
        </div>
        <div class="picker-body">
          {!sources && <span class="ink-3">{t.lookingForSources}</span>}
          {section('screen', t.screens, 'desktop_windows')}
          {section('window', t.windows, 'web_asset')}
          {sources && <span class="ink-3 picker-hint">{t.fullScreenHint}</span>}
        </div>
        <div class="picker-foot">
          <button
            class="switch-label"
            role="switch"
            aria-checked={settings.shareSystemAudio}
            onClick={() => props.store.update({ shareSystemAudio: !settings.shareSystemAudio })}
          >
            <Switch on={settings.shareSystemAudio} />
            {t.includeSystemAudio} <span class="ink-3">{t.soTheyHear}</span>
          </button>
          <span class="spacer" />
          <div class="inline-field">
            {t.quality}
            <Select
              label={t.quality}
              value={presetValue(settings.screen)}
              options={presetValue(settings.screen) === 'custom' ? [{ value: 'custom', label: t.custom }, ...presetOptions()] : presetOptions()}
              onChange={(name) => {
                const preset = presetOptions().find((o) => o.value === name);
                if (preset) props.store.update({ screen: preset.quality });
              }}
            />
          </div>
          <button class="btn btn-outline" onClick={props.onClose}>
            {t.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
