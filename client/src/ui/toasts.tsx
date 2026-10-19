import { Icon } from './controls.tsx';
import { useSubscribe } from './hooks.ts';
import { t } from './i18n.ts';

interface Toast {
  id: number;
  text: string;
  icon: string;
}

let toasts: Toast[] = [];
let nextId = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export function toast(text: string, icon = 'info') {
  const id = ++nextId;
  toasts = [...toasts, { id, text, icon }].slice(-3);
  notify();
  setTimeout(() => dismiss(id), 4200);
}

function dismiss(id: number) {
  toasts = toasts.filter((item) => item.id !== id);
  notify();
}

export function Toasts({ placement }: { placement: 'home' | 'bar' | 'rail' | 'portrait' }) {
  const list = useSubscribe(
    () => toasts,
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    [],
  );
  return (
    <div class={`toasts toasts-${placement}`}>
      {list.map((item) => (
        <div key={item.id} class="toast" role="status">
          <Icon name={item.icon} size={20} />
          <span class="toast-text">{item.text}</span>
          <button class="toast-close ms" aria-label={t.dismiss} onClick={() => dismiss(item.id)}>
            close
          </button>
        </div>
      ))}
    </div>
  );
}
