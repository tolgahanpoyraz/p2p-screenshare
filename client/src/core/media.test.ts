import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoomId, parseRoomLink } from './media.ts';

test('parseRoomLink accepts a full invite link', () => {
  assert.equal(parseRoomLink('https://example.com/r/abcDEF12_-'), 'abcDEF12_-');
  assert.equal(parseRoomLink('  https://example.com/r/abcDEF12/  '), 'abcDEF12');
});

test('parseRoomLink accepts a bare room id', () => {
  const id = createRoomId();
  assert.equal(parseRoomLink(id), id);
});

test('parseRoomLink rejects anything else', () => {
  assert.equal(parseRoomLink(''), null);
  assert.equal(parseRoomLink('short'), null);
  assert.equal(parseRoomLink('https://example.com/'), null);
  assert.equal(parseRoomLink('https://example.com/r/short'), null);
  assert.equal(parseRoomLink('https://example.com/x/abcDEF12'), null);
});
