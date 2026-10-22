import { useRef, useState } from 'preact/hooks';
import type { Rect } from './geometry.ts';

export interface Zoom {
  s: number;
  x: number;
  y: number;
}

export const NO_ZOOM: Zoom = { s: 1, x: 0, y: 0 };
const MAX_ZOOM = 4;
const DOUBLE_TAP_ZOOM = 2.5;
const TAP_MS = 300;
const DOUBLE_TAP_MS = 320;
// How long a single tap waits to be sure it isn't the first half of a double-tap.
const SINGLE_TAP_DELAY_MS = 260;

interface Options {
  /** Touch gestures (tablet). Without it, any click on the stage is a tap. */
  touch: boolean;
  zoomable: boolean;
  frame: Rect;
  onTap(): void;
  onFirstZoom(): void;
  /** Mouse double-clicks only; a double-tap with a finger zooms instead. */
  onDoubleClick(): void;
}

export function useStageGestures({ touch, zoomable, frame, onTap, onFirstZoom, onDoubleClick }: Options) {
  const [zoom, setZoomState] = useState(NO_ZOOM);
  const current = useRef(zoom);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; s: number } | null>(null);
  const tap = useRef<{ t: number; x: number; y: number; moved: boolean } | null>(null);
  const lastTap = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mouse = useRef(false);

  // The pan is clamped so the picture's edges never come inside the frame.
  const setZoom = (z: Zoom) => {
    const mx = (frame.w * (z.s - 1)) / 2;
    const my = (frame.h * (z.s - 1)) / 2;
    const next = { s: z.s, x: Math.max(-mx, Math.min(mx, z.x)), y: Math.max(-my, Math.min(my, z.y)) };
    current.current = next;
    setZoomState(next);
  };

  const onPointerDown = (event: PointerEvent) => {
    mouse.current = event.pointerType === 'mouse';
    if (!touch) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) tap.current = { t: Date.now(), x: event.clientX, y: event.clientY, moved: false };
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), s: current.current.s };
      if (tap.current) tap.current.moved = true;
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);
    if (tap.current && Math.hypot(point.x - tap.current.x, point.y - tap.current.y) > 8) tap.current.moved = true;
    if (!zoomable) return;

    const z = current.current;
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const s = Math.max(1, Math.min(MAX_ZOOM, (pinch.current.s * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.distance));
      setZoom({ ...z, s });
      onFirstZoom();
    } else if (pointers.current.size === 1 && z.s > 1) {
      setZoom({ ...z, x: z.x + point.x - previous.x, y: z.y + point.y - previous.y });
    }
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!pointers.current.delete(event.pointerId)) return;
    if (pointers.current.size < 2) pinch.current = null;
    const t = tap.current;
    if (pointers.current.size || !t || t.moved || Date.now() - t.t > TAP_MS) return;

    const now = Date.now();
    clearTimeout(tapTimer.current);
    if (zoomable && !mouse.current && now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      setZoom(current.current.s > 1 ? NO_ZOOM : { s: DOUBLE_TAP_ZOOM, x: 0, y: 0 });
      onFirstZoom();
      return;
    }
    lastTap.current = now;
    tapTimer.current = setTimeout(onTap, SINGLE_TAP_DELAY_MS);
  };

  const onClick = () => {
    if (!touch) onTap();
  };

  const onDblClick = () => {
    if (!touch || mouse.current) onDoubleClick();
  };

  return {
    zoom,
    resetZoom: () => setZoom(NO_ZOOM),
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onClick, onDblClick },
  };
}
