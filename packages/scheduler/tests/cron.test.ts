import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCron,
  nextRunAfter,
  isDue,
  describeCron,
  CronParseError,
} from '../src/cron';

test('parseCron: */5 expands minute set', () => {
  const spec = parseCron('*/5 * * * *');
  assert.deepEqual(
    Array.from(spec.minute).sort((a, b) => a - b),
    [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55],
  );
  assert.equal(spec.hour.size, 24);
});

test('parseCron: ranges and lists', () => {
  const spec = parseCron('0 9-17 * * 1-5');
  assert.deepEqual(Array.from(spec.hour).sort((a, b) => a - b), [
    9, 10, 11, 12, 13, 14, 15, 16, 17,
  ]);
  assert.deepEqual(Array.from(spec.dayOfWeek).sort((a, b) => a - b), [
    1, 2, 3, 4, 5,
  ]);
});

test('parseCron: list with steps', () => {
  const spec = parseCron('1,2,3 * * * *');
  assert.deepEqual(Array.from(spec.minute).sort((a, b) => a - b), [1, 2, 3]);
});

test('parseCron: macros @hourly @daily @weekly', () => {
  assert.equal(parseCron('@hourly').expression, '0 * * * *');
  assert.equal(parseCron('@daily').expression, '0 0 * * *');
  assert.equal(parseCron('@weekly').expression, '0 0 * * 0');
});

test('parseCron: @every_15m macro', () => {
  const spec = parseCron('@every_15m');
  assert.equal(spec.expression, '*/15 * * * *');
  assert.deepEqual(Array.from(spec.minute).sort((a, b) => a - b), [
    0, 15, 30, 45,
  ]);
});

test('parseCron: @every_2h macro', () => {
  assert.equal(parseCron('@every_2h').expression, '0 */2 * * *');
});

test('parseCron: dow 7 normalised to 0', () => {
  const spec = parseCron('0 0 * * 7');
  assert.ok(spec.dayOfWeek.has(0));
});

test('parseCron: invalid expressions throw CronParseError', () => {
  assert.throws(() => parseCron('* * * *'), CronParseError); // 4 fields
  assert.throws(() => parseCron('60 * * * *'), CronParseError); // minute OOR
  assert.throws(() => parseCron('* 24 * * *'), CronParseError); // hour OOR
  assert.throws(() => parseCron('*/0 * * * *'), CronParseError); // bad step
  assert.throws(() => parseCron('@nope'), CronParseError); // bad macro
  assert.throws(() => parseCron(''), CronParseError); // empty
  assert.throws(() => parseCron('5-1 * * * *'), CronParseError); // reversed range
});

test('nextRunAfter: every 5 minutes', () => {
  const next = nextRunAfter('*/5 * * * *', '2026-06-06T10:02:30.000Z');
  assert.equal(next, '2026-06-06T10:05:00.000Z');
});

test('nextRunAfter: strictly after, skips current matching minute', () => {
  const next = nextRunAfter('*/5 * * * *', '2026-06-06T10:05:00.000Z');
  assert.equal(next, '2026-06-06T10:10:00.000Z');
});

test('nextRunAfter: daily rolls to next day', () => {
  const next = nextRunAfter('0 0 * * *', '2026-06-06T12:00:00.000Z');
  assert.equal(next, '2026-06-07T00:00:00.000Z');
});

test('nextRunAfter: weekday (Mon-Fri) skips weekend', () => {
  // 2026-06-06 is a Saturday; next 09:00 weekday run is Monday 2026-06-08.
  const next = nextRunAfter('0 9 * * 1-5', '2026-06-06T00:00:00.000Z');
  assert.equal(next, '2026-06-08T09:00:00.000Z');
});

test('isDue: true at matching minute', () => {
  assert.equal(isDue('*/5 * * * *', '2026-06-06T10:05:00.000Z'), true);
  assert.equal(isDue('*/5 * * * *', '2026-06-06T10:06:00.000Z'), false);
});

test('isDue: not due if already ran this minute', () => {
  assert.equal(
    isDue('*/5 * * * *', '2026-06-06T10:05:00.000Z', '2026-06-06T10:05:00.000Z'),
    false,
  );
  assert.equal(
    isDue('*/5 * * * *', '2026-06-06T10:05:00.000Z', '2026-06-06T10:00:00.000Z'),
    true,
  );
});

test('describeCron: produces a string', () => {
  assert.equal(typeof describeCron('*/5 * * * *'), 'string');
  assert.match(describeCron('0 0 * * *'), /minute 0/);
});
