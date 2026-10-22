import type { ClientConfig } from '../../../shared/protocol.ts';

export interface VoiceProcessing {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

export const defaultVoiceProcessing: VoiceProcessing = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

export async function openMicrophone(deviceId?: string, processing = defaultVoiceProcessing) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      channelCount: 1,
      ...processing,
    },
  });
  return stream.getAudioTracks()[0];
}

export async function fetchConfig(baseUrl: string): Promise<ClientConfig> {
  const response = await fetch(new URL('/api/config', baseUrl)).catch(() => null);
  if (!response?.ok) throw new Error('server-unreachable');
  return response.json();
}

export function signalingUrl(baseUrl: string, roomId: string) {
  const url = new URL('/ws', baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('room', roomId);
  return url.toString();
}

export function createRoomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_');
}
