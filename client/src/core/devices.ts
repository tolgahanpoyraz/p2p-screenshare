export interface DeviceLists {
  microphones: MediaDeviceInfo[];
  cameras: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
}

/** Labels stay empty until the page has been granted mic or camera access at least once. */
export async function listDevices(): Promise<DeviceLists> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return {
    microphones: devices.filter((d) => d.kind === 'audioinput'),
    cameras: devices.filter((d) => d.kind === 'videoinput'),
    speakers: devices.filter((d) => d.kind === 'audiooutput'),
  };
}

export function watchDevices(listener: () => void) {
  navigator.mediaDevices.addEventListener('devicechange', listener);
  return () => navigator.mediaDevices.removeEventListener('devicechange', listener);
}

export const canChooseSpeaker = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

export async function routeToSpeaker(element: HTMLMediaElement, speakerId: string | undefined) {
  if (!canChooseSpeaker) return;
  await (element as HTMLMediaElement & { setSinkId(id: string): Promise<void> }).setSinkId(speakerId ?? '');
}
