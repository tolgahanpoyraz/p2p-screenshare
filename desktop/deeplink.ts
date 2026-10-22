import { ROOM_ID_PATTERN } from '../shared/protocol.ts';

export const SCHEME = 'screenshare';

export function roomPathFromDeepLink(link: string) {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== `${SCHEME}:` || (url.hostname !== 'r' && url.hostname !== 'join')) return null;
  const roomId = /^\/([^/]+)\/?$/.exec(url.pathname)?.[1];
  return roomId && ROOM_ID_PATTERN.test(roomId) ? `/r/${roomId}` : null;
}
