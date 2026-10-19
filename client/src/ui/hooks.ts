import type { Ref } from 'preact';
import { useEffect, useReducer, useRef, useState } from 'preact/hooks';
import { LevelMeter } from '../core/audio-test.ts';
import { listDevices, watchDevices, type DeviceLists } from '../core/devices.ts';
import type { Settings, SettingsStore } from '../core/settings.ts';

/** Re-renders whenever `subscribe` notifies, and returns the current `get()`. */
export function useSubscribe<T>(get: () => T, subscribe: (notify: () => void) => () => void, deps: unknown[]): T {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => subscribe(() => force(0)), deps);
  return get();
}

export const useSettings = (store: SettingsStore): Settings =>
  useSubscribe(() => store.value, (notify) => store.on('change', notify), [store]);

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const list = matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);
  return matches;
}

export function useSize<T extends HTMLElement>(): [Ref<T>, { width: number; height: number }] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}

// One analyser per track, however many components show its level.
const meters = new Map<MediaStreamTrack, { meter: LevelMeter; users: number }>();

addEventListener('pointerdown', () => {
  for (const { meter } of meters.values()) meter.resume();
});

export function useLevel(track: MediaStreamTrack | null | undefined) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!track) {
      setLevel(0);
      return;
    }
    let entry = meters.get(track);
    if (!entry) meters.set(track, (entry = { meter: new LevelMeter(track), users: 0 }));
    entry.users++;

    let frame = 0;
    let smooth = 0;
    let shown = 0;
    const tick = () => {
      smooth = smooth * 0.4 + entry.meter.level() * 0.6;
      if (Math.abs(smooth - shown) > 0.02) setLevel((shown = smooth));
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(frame);
      if (--entry.users === 0) {
        entry.meter.close();
        meters.delete(track);
      }
    };
  }, [track]);
  return level;
}

const emptyDevices: DeviceLists = { microphones: [], cameras: [], speakers: [] };
const REFRESH_EVENT = 'screenshare:devices';

/** Device labels only appear once access is granted, which fires no devicechange; call this after opening one. */
export const refreshDevices = () => dispatchEvent(new Event(REFRESH_EVENT));

export function useDevices() {
  const [devices, setDevices] = useState(emptyDevices);
  useEffect(() => {
    const load = () => listDevices().then(setDevices, () => {});
    load();
    addEventListener(REFRESH_EVENT, load);
    const unwatch = watchDevices(load);
    return () => {
      removeEventListener(REFRESH_EVENT, load);
      unwatch();
    };
  }, []);
  return devices;
}

const escapeStack: (() => void)[] = [];

addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !escapeStack.length) return;
  event.preventDefault();
  escapeStack[escapeStack.length - 1]();
});

/** While active, Escape calls the handler; the most recently opened layer wins. */
export function useEscape(active: boolean, handler: () => void) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    if (!active) return;
    const entry = () => latest.current();
    escapeStack.push(entry);
    return () => {
      escapeStack.splice(escapeStack.indexOf(entry), 1);
    };
  }, [active]);
}

export function useInterval(callback: () => void, ms: number | null) {
  const latest = useRef(callback);
  latest.current = callback;
  useEffect(() => {
    if (ms === null) return;
    latest.current();
    const id = setInterval(() => latest.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}
