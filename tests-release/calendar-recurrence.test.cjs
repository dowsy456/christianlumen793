'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { materialize, normalize, today } = require('../backend/functions/calendar-recurrence');
const series = overrides => ({ text: 'Weekly', enabled: true, startDate: '2026-11-10', enabledFrom: '2026-11-10', weekday: 2, timeZone: 'America/New_York', authorCode: 'uid_AUTHOR', ...overrides });
test('recurrence respects its saved timezone, current month, Unicode spacing and date exclusions', () => {
  assert.equal(normalize('  Ｂｉｏｌｏｇｙ\u00a0\n HOMEWORK '), 'biology homework');
  const root = { activeYear: 2026, repeating: { x: series({ excluded: { '2026-11-17': true } }) }, years: { 2026: { '2026-11-24': { ordinary: { text: ' WEEKLY ' } } } } };
  const before = JSON.stringify(root), now = Date.parse('2026-12-01T02:00:00Z');
  assert.equal(today(now, 'America/New_York'), '2026-11-30');
  const next = materialize(root, now);
  assert.equal(JSON.stringify(root), before, 'transaction input is immutable');
  assert.deepEqual(Object.keys(next.years[2026]).sort(), ['2026-11-10', '2026-11-24']);
  assert.equal(next.years[2026]['2026-11-10'].repeat_x.authorCode, 'uid_AUTHOR');
  assert.equal(materialize(next, now), undefined, 'no write for an already generated month');
  const december = materialize(next, Date.parse('2026-12-01T05:00:00Z'));
  assert.equal(Object.keys(december.years[2026]).filter(day => day.startsWith('2026-12')).length, 5);
});
test('recurrence handles leap days, year rollover, paused series and stale years', () => {
  const root = { activeYear: 2028, repeating: { x: series({ weekday: 2, startDate: '2026-11-10' }) }, years: {} };
  const next = materialize(root, Date.parse('2028-02-01T12:00:00Z'));
  assert.ok(next.years[2028]['2028-02-29']);
  assert.equal(Object.keys(next.years).length, 1);
  assert.equal(materialize({ ...root, repeating: { x: series({ enabled: false }) } }, Date.parse('2028-02-01')), undefined);
  assert.equal(materialize({ ...root, activeYear: 2029 }, Date.parse('2028-02-01')), undefined);
  assert.equal(materialize(null, Date.now()), null, 'cold Firebase transaction requests a server retry');
});
test('scheduled recurrence runs without a connected browser and retries an empty cache', async () => {
  let calendar = { activeYear: 2026, repeating: { x: series() }, years: {} };
  class Clock extends Date { static now() { return Date.parse('2026-12-01T12:00:00Z'); } }
  const context = { exports: {}, Date: Clock, require(name) {
    if (name === 'firebase-admin/app') return { initializeApp() {} };
    if (name === 'firebase-admin/database') return { getDatabase: () => ({ ref: key => { assert.equal(key, 'calendar'); return { transaction: async callback => { assert.equal(callback(null), null); calendar = callback(calendar); } }; } }) };
    if (name === 'firebase-functions/v2/scheduler') return { onSchedule: (_options, callback) => callback };
    if (name === 'firebase-functions/v2/database') return { onValueWritten: (_options, callback) => callback };
    if (name === './cleanup') return require('../backend/functions/cleanup');
    if (name === './calendar-recurrence') return { materialize };
    throw new Error(name);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../backend/functions/index.js'), 'utf8'), context);
  await context.exports.materializeRepeatingCalendar();
  assert.equal(Object.keys(calendar.years[2026]).filter(date => date.startsWith('2026-12')).length, 5);
});
