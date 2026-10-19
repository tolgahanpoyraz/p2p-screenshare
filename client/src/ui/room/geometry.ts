export type Layout = 'bar' | 'rail' | 'portrait';
export type Corner = 'tl' | 'tr' | 'bl' | 'br';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Where a video of `content` size lands inside `box` with object-fit: contain. */
export function contain(box: Size, content: Size): Rect {
  const ratio = content.width / content.height || 16 / 9;
  let w = box.width;
  let h = w / ratio;
  if (h > box.height) {
    h = box.height;
    w = h * ratio;
  }
  return { x: (box.width - w) / 2, y: (box.height - h) / 2, w, h };
}

const MARGIN = 16;
const TOP_INSET = 64;

export function insets(layout: Layout, controlsVisible: boolean) {
  return {
    right: layout === 'rail' && controlsVisible ? 112 : 0,
    bottom: layout === 'bar' ? (controlsVisible ? 112 : 16) : layout === 'portrait' ? (controlsVisible ? 156 : 16) : 0,
  };
}

export function pipSizes(layout: Layout) {
  const portrait = layout === 'portrait';
  const their = portrait ? 200 : 240;
  const self = portrait ? 132 : 160;
  return {
    their: { width: their, height: Math.round((their * 9) / 16) },
    self: { width: self, height: Math.round((self * 9) / 16) },
  };
}

function anchor(stage: Size, size: Size, corner: Corner, inset: { right: number; bottom: number }) {
  const left = corner[1] === 'l';
  const top = corner[0] === 't';
  return {
    x: left ? MARGIN : stage.width - MARGIN - size.width - inset.right,
    y: top ? TOP_INSET : stage.height - inset.bottom - MARGIN - size.height,
  };
}

/** Their camera sits in `corner`; your self-view stacks beside it, or takes the corner alone. */
export function pipRects(stage: Size, layout: Layout, controlsVisible: boolean, corner: Corner, withTheirs: boolean) {
  const inset = insets(layout, controlsVisible);
  const sizes = pipSizes(layout);
  const theirAt = anchor(stage, sizes.their, corner, inset);
  const their: Rect = { ...theirAt, w: sizes.their.width, h: sizes.their.height };
  let self: Rect;
  if (withTheirs) {
    const left = corner[1] === 'l';
    const top = corner[0] === 't';
    self = {
      x: left ? their.x : their.x + their.w - sizes.self.width,
      y: top ? their.y + their.h + 10 : their.y - sizes.self.height - 10,
      w: sizes.self.width,
      h: sizes.self.height,
    };
  } else {
    self = { ...anchor(stage, sizes.self, corner, inset), w: sizes.self.width, h: sizes.self.height };
  }
  return { their, self };
}

export function nearestCorner(stage: Size, rect: Rect): Corner {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  return `${cy < stage.height / 2 ? 't' : 'b'}${cx < stage.width / 2 ? 'l' : 'r'}` as Corner;
}
