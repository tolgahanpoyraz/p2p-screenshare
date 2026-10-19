import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tuneSdp } from './sdp.ts';

const audioSection = (mid: number, fmtp = true) =>
  [
    'm=audio 9 UDP/TLS/RTP/SAVPF 111 63',
    `a=mid:${mid}`,
    'a=rtpmap:111 opus/48000/2',
    ...(fmtp ? ['a=fmtp:111 minptime=10;useinbandfec=1;usedtx=1'] : []),
    'a=rtpmap:63 red/48000/2',
    'a=fmtp:63 111/111',
    '',
  ].join('\r\n');

const videoSection = (mid: number) =>
  [
    'm=video 9 UDP/TLS/RTP/SAVPF 96 97 98',
    `a=mid:${mid}`,
    'a=rtpmap:96 VP8/90000',
    'a=rtpmap:97 rtx/90000',
    'a=fmtp:97 apt=96',
    'a=rtpmap:98 H264/90000',
    'a=fmtp:98 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f',
    '',
  ].join('\r\n');

const header = ['v=0', 'o=- 1 2 IN IP4 127.0.0.1', 's=-', 't=0 0', ''].join('\r\n');
const sdp = header + audioSection(0) + videoSection(1) + videoSection(2) + audioSection(3);
const fmtp = (s: string, payloadType: number) => s.match(new RegExp(`^a=fmtp:${payloadType} .*$`, 'gm'));

test('gives every opus m-line identical stereo parameters', () => {
  assert.deepEqual(fmtp(tuneSdp(sdp), 111), [
    'a=fmtp:111 minptime=10;useinbandfec=1;usedtx=0;stereo=1;sprop-stereo=1',
    'a=fmtp:111 minptime=10;useinbandfec=1;usedtx=0;stereo=1;sprop-stereo=1',
  ]);
});

test('sets the start bitrate on video codecs, adding fmtp lines where missing', () => {
  const result = tuneSdp(sdp, 5000);
  assert.deepEqual(fmtp(result, 96), ['a=fmtp:96 x-google-start-bitrate=5000', 'a=fmtp:96 x-google-start-bitrate=5000']);
  assert.deepEqual(fmtp(result, 98), [
    'a=fmtp:98 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f;x-google-start-bitrate=5000',
    'a=fmtp:98 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f;x-google-start-bitrate=5000',
  ]);
});

test('leaves retransmission and redundancy codecs alone', () => {
  const result = tuneSdp(sdp);
  assert.deepEqual(fmtp(result, 97), ['a=fmtp:97 apt=96', 'a=fmtp:97 apt=96']);
  assert.deepEqual(fmtp(result, 63), ['a=fmtp:63 111/111', 'a=fmtp:63 111/111']);
});

test('only adds lines and keeps CRLF endings', () => {
  const result = tuneSdp(sdp);
  const stripTuned = (s: string) => s.replace(/^a=fmtp:(111|96|98) .*\r\n/gm, '');
  assert.equal(stripTuned(result), stripTuned(sdp));
  assert.ok(!/[^\r]\n/.test(result));
});

test('adds an opus fmtp line when there is none', () => {
  assert.match(
    tuneSdp(header + audioSection(0, false)),
    /a=rtpmap:111 opus\/48000\/2\r\na=fmtp:111 stereo=1;sprop-stereo=1;usedtx=0\r\n/,
  );
});

test('preserves values containing "=" and dedupes keys with surrounding spaces', () => {
  const section = [
    'm=video 9 UDP/TLS/RTP/SAVPF 98',
    'a=rtpmap:98 H264/90000',
    'a=fmtp:98 packetization-mode=1; sprop-parameter-sets=Z0IACpZTBYmI,aMljiA==; x-google-start-bitrate=100',
    '',
  ].join('\r\n');
  assert.deepEqual(fmtp(tuneSdp(header + section, 6000), 98), [
    'a=fmtp:98 packetization-mode=1;sprop-parameter-sets=Z0IACpZTBYmI,aMljiA==;x-google-start-bitrate=6000',
  ]);
});
