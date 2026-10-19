import type { IpcMainInvokeEvent } from 'electron';

export function originOf(url: string | undefined) {
  try {
    return new URL(url ?? '').origin;
  } catch {
    return null;
  }
}

export function assertTrusted(event: IpcMainInvokeEvent, origin: string) {
  if (originOf(event.senderFrame?.url) !== origin) throw new Error('Untrusted sender');
}
