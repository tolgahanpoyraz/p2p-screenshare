export type PeerId = string;

export const ROOM_CAPACITY = 2;
export const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** Accepts a full invite link or just the room id; returns null if neither. */
export function parseRoomLink(text: string) {
  const trimmed = text.trim();
  let candidate = trimmed;
  try {
    const match = new URL(trimmed).pathname.match(/^\/r\/([^/]+)\/?$/);
    if (!match) return null;
    candidate = decodeURIComponent(match[1]);
  } catch {}
  return ROOM_ID_PATTERN.test(candidate) ? candidate : null;
}

// Mirrors RTCSessionDescriptionInit / RTCIceCandidateInit so the server doesn't need DOM types.
export interface SessionDescription {
  type: 'offer' | 'answer' | 'pranswer' | 'rollback';
  sdp?: string;
}

export interface IceCandidate {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export type SignalData =
  | { kind: 'description'; description: SessionDescription }
  | { kind: 'candidate'; candidate: IceCandidate };

export type ClientMessage = { type: 'signal'; data: SignalData };

export type ErrorCode = 'room-full' | 'bad-room' | 'bad-message';

export type ServerMessage =
  | { type: 'welcome'; peerId: PeerId; peers: PeerId[] }
  | { type: 'peer-joined'; peerId: PeerId }
  | { type: 'peer-left'; peerId: PeerId }
  | { type: 'signal'; from: PeerId; data: SignalData }
  | { type: 'error'; code: ErrorCode; message: string };

/** Plain-text keepalive, so the Cloudflare room can answer it without waking up. */
export const PING = 'ping';
export const PONG = 'pong';
export const PING_INTERVAL_MS = 20_000;

export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const message = JSON.parse(raw);
    const kind = message?.data?.kind;
    if (message?.type === 'signal' && (kind === 'description' || kind === 'candidate')) {
      return message;
    }
  } catch {}
  return null;
}

export const CloseCode = {
  RoomFull: 4001,
  BadRoom: 4002,
} as const;

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface ClientConfig {
  iceServers: IceServer[];
}
