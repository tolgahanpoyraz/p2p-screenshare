import { useEffect, useState } from 'preact/hooks';
import type { PushToTalkBinding } from '../../../shared/desktop.ts';
import type { Voice } from '../core/ptt.ts';

const modifiers: Record<string, string> = {
  ShiftLeft: 'Shift',
  ShiftRight: 'ShiftRight',
  ControlLeft: 'Ctrl',
  ControlRight: 'CtrlRight',
  AltLeft: 'Alt',
  AltRight: 'AltRight',
  MetaLeft: 'Meta',
  MetaRight: 'MetaRight',
};

/** Names keys the way the Mac app's hook does, so a binding reads the same everywhere. */
export function keyLabel(code: string) {
  return modifiers[code] ?? code.match(/^(?:Key|Digit)(.)$/)?.[1] ?? code;
}

const mouseLabel = (button: number) => `Mouse ${button + 1}`;

/** Browsers can't hear keys outside the page, so the web app only gets the talk key while it's focused. */
export function bindingFromEvent(event: KeyboardEvent | MouseEvent): PushToTalkBinding | null {
  if (event instanceof KeyboardEvent) return { kind: 'key', code: -1, label: keyLabel(event.code) };
  return event.button > 2 ? { kind: 'mouse', code: event.button + 1, label: mouseLabel(event.button) } : null;
}

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

export function usePageHotkey(voice: Voice, binding: PushToTalkBinding | null, enabled: boolean) {
  const [held, setHeld] = useState(false);
  const label = binding?.label;
  useEffect(() => {
    if (!enabled || !binding) return;
    const matches = (event: KeyboardEvent | MouseEvent) =>
      event instanceof KeyboardEvent
        ? binding.kind === 'key' && keyLabel(event.code) === binding.label
        : binding.kind === 'mouse' && mouseLabel(event.button) === binding.label;

    let down = false;
    const press = (event: KeyboardEvent | MouseEvent) => {
      if (down || !matches(event) || typing(event.target)) return;
      down = true;
      setHeld(true);
      voice.press();
    };
    const release = (event?: KeyboardEvent | MouseEvent) => {
      if (!down || (event && !matches(event))) return;
      down = false;
      setHeld(false);
      voice.release();
    };
    const lost = () => release();

    addEventListener('keydown', press);
    addEventListener('keyup', release);
    addEventListener('mousedown', press);
    addEventListener('mouseup', release);
    // A key held while switching tabs never sends its keyup here.
    addEventListener('blur', lost);
    return () => {
      release();
      removeEventListener('keydown', press);
      removeEventListener('keyup', release);
      removeEventListener('mousedown', press);
      removeEventListener('mouseup', release);
      removeEventListener('blur', lost);
    };
  }, [voice, enabled, binding?.kind, label]);
  return held;
}
