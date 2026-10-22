import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roomPathFromDeepLink } from './deeplink.ts';

test('maps room links to the room path', () => {
  assert.equal(roomPathFromDeepLink('screenshare://r/abcd1234'), '/r/abcd1234');
  assert.equal(roomPathFromDeepLink('screenshare://join/abc-_1234/'), '/r/abc-_1234');
  assert.equal(roomPathFromDeepLink('screenshare://r/abcd1234?x=1#y'), '/r/abcd1234');
});

test('rejects anything else', () => {
  for (const link of [
    'screenshare://r/short',
    'screenshare://r/abcd1234/extra',
    'screenshare://r/abcd%2F1234',
    'screenshare://r/..%2F..%2Fevil',
    'screenshare://evil.com/abcd1234',
    'screenshare://r',
    'https://r/abcd1234',
    'javascript:alert(1)',
    'not a url',
    '',
  ]) {
    assert.equal(roomPathFromDeepLink(link), null, link);
  }
});
