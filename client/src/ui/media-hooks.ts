import { useEffect, useRef, useState } from 'preact/hooks';
import { constraints, type CameraSettings } from '../core/camera.ts';
import { openMicrophone, type VoiceProcessing } from '../core/media.ts';
import type { Option } from './controls.tsx';
import { refreshDevices } from './hooks.ts';

/** Real devices only; Chrome's "default"/"communications" aliases are covered by our own default entry. */
export function deviceOptions(devices: MediaDeviceInfo[], defaultLabel: string): Option[] {
  const real = devices.filter((d) => d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications');
  return [{ value: '', label: defaultLabel }, ...real.map((d, i) => ({ value: d.deviceId, label: d.label || `Device ${i + 1}` }))];
}

/** A camera track outside any call, for previews. */
export function usePreviewCamera(on: boolean, settings: CameraSettings, onError: (error: unknown) => void) {
  const [track, setTrack] = useState<MediaStreamTrack | null>(null);
  const latestError = useRef(onError);
  latestError.current = onError;
  const key = JSON.stringify(settings);
  useEffect(() => {
    if (!on) return;
    let cancelled = false;
    let opened: MediaStreamTrack | null = null;
    navigator.mediaDevices.getUserMedia({ video: constraints(settings) }).then(
      (stream) => {
        opened = stream.getVideoTracks()[0];
        refreshDevices();
        if (cancelled) opened.stop();
        else setTrack(opened);
      },
      (error) => !cancelled && latestError.current(error),
    );
    return () => {
      cancelled = true;
      opened?.stop();
      setTrack(null);
    };
  }, [on, key]);
  return track;
}

/** A mic track outside any call. `whenGranted` skips it until the page already has mic permission. */
export function usePreviewMic(
  on: boolean,
  deviceId: string | undefined,
  processing: VoiceProcessing,
  { whenGranted = false } = {},
) {
  const [track, setTrack] = useState<MediaStreamTrack | null>(null);
  const key = JSON.stringify(processing);
  useEffect(() => {
    if (!on) return;
    let cancelled = false;
    let opened: MediaStreamTrack | null = null;
    const allowed = whenGranted
      ? navigator.permissions
          ?.query({ name: 'microphone' as PermissionName })
          .then((status) => status.state === 'granted', () => false) ?? Promise.resolve(false)
      : Promise.resolve(true);
    allowed
      .then((ok) => (ok ? openMicrophone(deviceId, processing).catch(() => openMicrophone(undefined, processing)) : null))
      .then(
        (mic) => {
          opened = mic;
          if (mic) refreshDevices();
          if (cancelled) mic?.stop();
          else setTrack(mic);
        },
        () => {},
      );
    return () => {
      cancelled = true;
      opened?.stop();
      setTrack(null);
    };
  }, [on, deviceId, key]);
  return track;
}
