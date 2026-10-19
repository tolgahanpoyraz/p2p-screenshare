import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from './i18n.ts';
import { HUES, swatch, type Person } from './identity.ts';
import { desktop } from '../platform.ts';

export const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');

export function Icon({ name, size, class: className }: { name: string; size?: number; class?: string }) {
  return (
    <span class={cx('ms', className)} style={size ? { fontSize: `${size}px` } : undefined} aria-hidden="true">
      {name}
    </span>
  );
}

export function Switch({ on }: { on: boolean }) {
  return <span class={cx('switch', on && 'on')} />;
}

export function ToggleRow(props: { on: boolean; onChange(on: boolean): void; children: ComponentChildren }) {
  return (
    <button class="toggle-row" role="switch" aria-checked={props.on} onClick={() => props.onChange(!props.on)}>
      <span>{props.children}</span>
      <Switch on={props.on} />
    </button>
  );
}

interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  disabled?: boolean;
  onChange(value: number): void;
}

export function Slider({ value, min = 0, max = 1, step = 0.01, label, disabled, onChange }: SliderProps) {
  const ref = useRef<HTMLDivElement>(null);
  const snap = (v: number) => Math.min(max, Math.max(min, Math.round((v - min) / step) * step + min));
  const fromPointer = (event: PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    onChange(snap(min + ((event.clientX - rect.left) / rect.width) * (max - min)));
  };
  const pct = `${((value - min) / (max - min)) * 100}%`;
  return (
    <div
      ref={ref}
      class="slider"
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-disabled={disabled}
      onPointerDown={(event) => {
        event.stopPropagation();
        ref.current!.setPointerCapture(event.pointerId);
        fromPointer(event);
      }}
      onPointerMove={(event) => {
        if (ref.current!.hasPointerCapture(event.pointerId)) fromPointer(event);
      }}
      onKeyDown={(event) => {
        const delta = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step }[event.key];
        if (delta === undefined) return;
        event.preventDefault();
        onChange(snap(value + delta));
      }}
    >
      <span class="slider-track" />
      <span class="slider-fill" style={{ width: pct }} />
      <span class="slider-thumb" style={{ left: pct }} />
    </div>
  );
}

export function SliderField(props: SliderProps & { title: ComponentChildren; readout: string }) {
  return (
    <div class={cx('slider-field', props.disabled && 'disabled')}>
      <div class="field-head">
        <span class="field-title">{props.title}</span>
        <span class="readout">{props.readout}</span>
      </div>
      <Slider {...props} />
    </div>
  );
}

interface SegmentOption<T> {
  value: T;
  label: string;
  sub?: string;
}

export function Segments<T extends string>(props: {
  options: SegmentOption<T>[];
  value: T;
  onChange(value: T): void;
  compact?: boolean;
  label: string;
}) {
  return (
    <div class={cx('segments', props.compact && 'compact')} role="group" aria-label={props.label}>
      {props.options.map((option) => (
        <button
          key={option.value}
          aria-pressed={option.value === props.value}
          onClick={() => props.onChange(option.value)}
        >
          <span>{option.label}</span>
          {option.sub && <small>{option.sub}</small>}
        </button>
      ))}
    </div>
  );
}

export function Meter({ level, segments = 18, tall }: { level: number; segments?: number; tall?: boolean }) {
  return (
    <div class={cx('meter', tall && 'tall')} data-level={level.toFixed(2)} aria-hidden="true">
      {Array.from({ length: segments }, (_, i) => {
        const at = i / segments;
        return <span key={i} class={at < level ? (at > 0.82 ? 'hot' : 'on') : undefined} />;
      })}
    </div>
  );
}

export interface Option {
  value: string;
  label: string;
}

export function Select(props: {
  value: string;
  options: Option[];
  onChange(value: string): void;
  label: string;
  large?: boolean;
  class?: string;
}) {
  return (
    <label class={cx('select', props.large && 'large', props.class)}>
      <select
        aria-label={props.label}
        value={props.value}
        onChange={(event) => props.onChange((event.currentTarget as HTMLSelectElement).value)}
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Icon name="expand_more" />
    </label>
  );
}

export function Video(props: {
  track: MediaStreamTrack | null | undefined;
  mirrored?: boolean;
  class?: string;
  onResize?(size: { width: number; height: number }): void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const onResize = useRef(props.onResize);
  onResize.current = props.onResize;
  useEffect(() => {
    const video = ref.current!;
    video.srcObject = props.track ? new MediaStream([props.track]) : null;
    const report = () => {
      if (video.videoWidth) onResize.current?.({ width: video.videoWidth, height: video.videoHeight });
    };
    video.addEventListener('resize', report);
    video.addEventListener('loadedmetadata', report);
    return () => {
      video.removeEventListener('resize', report);
      video.removeEventListener('loadedmetadata', report);
    };
  }, [props.track]);
  return <video ref={ref} class={cx(props.class, props.mirrored && 'mirrored')} autoplay playsInline muted />;
}

export function InviteField({ onSurface }: { onSurface?: boolean }) {
  const [copied, setCopied] = useState(false);
  const url = location.href;
  const shown = location.host + location.pathname;
  const canShare = !desktop && typeof navigator.share === 'function';

  const copy = async () => {
    if (canShare) {
      await navigator.share({ url, title: 'screenshare' }).catch(() => {});
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div class={cx('invite', onSurface && 'on-surface')}>
      <Icon name="link" size={20} class="ink-3" />
      <span class="invite-url">{shown}</span>
      <button class="btn btn-solid" onClick={copy}>
        <Icon name={canShare ? 'share' : copied ? 'check' : 'content_copy'} />
        {canShare ? t.share : copied ? t.copied : t.copy}
      </button>
    </div>
  );
}

export function Swatches({ hue, onPick, label }: { hue: number; onPick(hue: number): void; label: string }) {
  return (
    <div class="swatches" role="radiogroup" aria-label={label}>
      {HUES.map((h) => (
        <button
          key={h}
          role="radio"
          aria-checked={h === hue}
          aria-label={`${t.colour} ${HUES.indexOf(h) + 1}`}
          class="swatch"
          style={{ background: swatch(h) }}
          onClick={() => onPick(h)}
        />
      ))}
    </div>
  );
}

export function Avatar({ person, size }: { person: Person; size: number }) {
  return (
    <span
      class="avatar"
      style={{ width: `${size}px`, height: `${size}px`, background: person.color, fontSize: `${Math.round(size * 0.4)}px` }}
    >
      {person.initial}
    </span>
  );
}
