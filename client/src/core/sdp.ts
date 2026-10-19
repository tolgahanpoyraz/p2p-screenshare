export const VIDEO_START_KBPS = 6_000;

// BUNDLE requires a payload type to carry identical parameters on every m-line,
// so tuning is applied per codec across all sections; per-sender limits go through setParameters.
export function tuneSdp(sdp: string, videoStartKbps = VIDEO_START_KBPS) {
  const stereo = setCodecParams(sdp, /^opus\/48000\/2$/i, { stereo: '1', 'sprop-stereo': '1', usedtx: '0' });
  return setCodecParams(stereo, /^(H264|H265|VP8|VP9|AV1)\/90000$/i, {
    'x-google-start-bitrate': String(videoStartKbps),
  });
}

export function setCodecParams(sdp: string, codec: RegExp, params: Record<string, string>) {
  return sdp
    .split(/(?=^m=)/m)
    .map((section) => {
      const payloadTypes = [...section.matchAll(/^a=rtpmap:(\d+) ([^\r\n]+)/gm)]
        .filter(([, , name]) => codec.test(name))
        .map(([, payloadType]) => payloadType);
      return payloadTypes.reduce((result, payloadType) => upsertFmtp(result, payloadType, params), section);
    })
    .join('');
}

function upsertFmtp(section: string, payloadType: string, params: Record<string, string>) {
  const fmtp = new RegExp(`^a=fmtp:${payloadType} ([^\\r\\n]*)`, 'm');
  if (fmtp.test(section)) {
    return section.replace(fmtp, (_, existing: string) => `a=fmtp:${payloadType} ${mergeParams(existing, params)}`);
  }
  return section.replace(
    new RegExp(`^(a=rtpmap:${payloadType} [^\\r\\n]*)(\\r?\\n)`, 'm'),
    `$1$2a=fmtp:${payloadType} ${mergeParams('', params)}$2`,
  );
}

function mergeParams(existing: string, overrides: Record<string, string>) {
  const merged = new Map(
    existing
      .split(';')
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const split = pair.indexOf('=');
        return split < 0 ? [pair, ''] : [pair.slice(0, split), pair.slice(split + 1)];
      }),
  );
  for (const [key, value] of Object.entries(overrides)) merged.set(key, value);
  return [...merged].map(([key, value]) => (value ? `${key}=${value}` : key)).join(';');
}
