const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function fixture(files = []) {
  const timers = [], writes = [], callbacks = new Map();
  const App = { register() {}, currentUser: { code: 'me' }, currentRoomId: 'room', ROOM_IDLE_MS: 300000,
    lastAppInputAt: Date.now(), sanitizeRoomCode: String, restoreDone: true,
    roomsMetaCache: new Map([['room', { messageCount: 999, messagesClearedAt: 1000, retainedMessageCount: 2 }]]),
    membershipMap: new Map([['room', { joinedAt: 1, lastSeenCount: 0 }]]), notificationRoomTails: new Map(),
    appPresenceCache: new Map(), appPresenceConnections: {}, renderOnlineIndicator() {},
    updateRoomListItem() {}, firebase: { database: { ServerValue: { TIMESTAMP: 2000 } } },
    db: { ref(p) { let start = ''; const ref = { orderByKey() { return ref; }, startAt(key) { start = key; return ref; },
      on(event, cb) { callbacks.set(p, cb); }, off() { callbacks.delete(p); }, set: async value => writes.push(value), update: async value => writes.push(value) }; return ref; } } };
  const context = { ChatApp: App, console, Date, document: { hidden: false, hasFocus: () => true }, window: {},
    requestAnimationFrame() { return 1; }, setTimeout(fn, ms) { const timer = { fn, ms }; timers.push(timer); return timer; }, clearTimeout(timer) { if (timer) timer.cancelled = true; }, setInterval() {}, clearInterval() {} };
  vm.createContext(context);
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  return { App, context, timers, writes, callbacks };
}
test('retained pins and corrupted counters never become unread, including before the room is opened', () => {
  const { App } = fixture(['js/rooms/collections.js']);
  App.notificationRoomTails.set('room', new Map([['old-a', { userCode: 'peer', pinned: true, createdAt: 500 }], ['old-b', { userCode: 'peer', pinned: true, createdAt: 900 }]]));
  assert.equal(App.getRoomMissedCount('room'), 0);
  App.notificationRoomTails.get('room').set('new', { userCode: 'peer', createdAt: 1500 });
  assert.equal(App.getRoomMissedCount('room'), 1);
  App.notificationRoomTails.get('room').set('own', { userCode: 'me', createdAt: 1600 });
  assert.equal(App.getRoomMissedCount('room'), 1);
  App.notificationRoomTails.get('room').delete('new');
  assert.equal(App.getRoomMissedCount('room'), 0);
});
test('long unread gaps use authoritative existing messages and detach when the read watermark catches up', () => {
  const { App, callbacks } = fixture(['js/rooms/collections.js']);
  const all = Array.from({ length: 85 }, (_, i) => ['z' + String(i).padStart(3, '0'), { userCode: i % 5 ? 'peer' : 'me', createdAt: 2000 + i }]);
  App.notificationRoomTails.set('room', new Map(all.slice(-50)));
  App.syncUnreadRoomSubscriptions();
  assert.equal(App.getRoomMissedCount('room'), 0, 'Do not publish a guessed count before the initial snapshot');
  callbacks.get('messages/room')({ forEach(fn) { for (const [key, value] of all) fn({ key, val: () => value }); } });
  assert.equal(App.getRoomMissedCount('room'), 68);
  callbacks.get('messages/room')({ forEach(fn) { for (const [key, value] of all.slice(0, -1)) fn({ key, val: () => value }); } });
  assert.equal(App.getRoomMissedCount('room'), 67, 'Deleting an unseen message immediately changes the count');
  App.membershipMap.set('room', { joinedAt: 1, lastSeenEpoch: 1000, lastSeenMessageKey: 'z084', lastSeenCount: 999 });
  App.syncUnreadRoomSubscriptions();
  assert.equal(App.unreadRoomSubscriptions.size, 0);
  assert.equal(App.getRoomMissedCount('room'), 0);
});
test('idle and newly reactivated sessions cannot write seen until Online is acknowledged', async () => {
  const { App, writes } = fixture(['js/chat/app-presence.js', 'js/chat/read-receipts.js']);
  App.appPresenceSession = { code: 'me', connected: true, ready: true, generation: 1, lastPublishedIdle: true, lastWriteAt: Date.now(), ref: App.db.ref('presence') };
  App.myRoomIdle = true;
  assert.equal(App.hasLiveReceiptConnection(), false);
  App.myRoomIdle = false;
  assert.equal(App.hasLiveReceiptConnection(), false, 'Input alone cannot claim an acknowledged online reader');
  await App.writeAppPresence();
  assert.equal(writes[0].idle, false);
  assert.equal(App.hasLiveReceiptConnection(), true);
  App.lastAppInputAt = Date.now() - App.ROOM_IDLE_MS - 1;
  assert.equal(App.hasLiveReceiptConnection(), false, 'Idle deadline is checked even before the idle timer runs');
});
test('DND is attached to fresh desktop sessions, expires, and cannot survive in a web-only session', () => {
  const { App } = fixture(['js/chat/app-presence.js']);
  const now = Date.now();
  const desktop = { v: 2, idle: true, updatedAt: now, platform: 'desktop', notificationStatus: 'dnd', notificationStatusExpiresAt: now + 1000 };
  assert.equal(App.getAppPresenceStatus({ desktop }, now), 'dnd');
  assert.equal(App.getAppPresenceStatus({ desktop }, now + 1001), 'idle');
  assert.equal(App.getAppPresenceStatus({ desktop }, now + App.APP_PRESENCE_TTL_MS), 'offline');
  assert.equal(App.getAppPresenceStatus({ web: { ...desktop, idle: false, platform: 'web' } }, now), 'online');
  assert.equal(App.getAppPresenceStatus({ stale: { ...desktop, updatedAt: now - 60000 }, phone: { idle: false, updatedAt: now } }, now), 'online');
});
test('presence schedules expiry at the lease deadline without waiting for another heartbeat', () => {
  const { App, timers } = fixture(['js/chat/app-presence.js']);
  App.appPresenceConnections.peer = { tab: { idle: true, updatedAt: Date.now() - App.APP_PRESENCE_TTL_MS + 200 } };
  App.refreshAppPresenceStatuses();
  assert.equal(App.appPresenceCache.get('peer'), 'idle');
  assert.ok(timers.at(-1).ms <= 201);
  App.appPresenceConnections.peer.tab.updatedAt -= 300;
  timers.at(-1).fn();
  assert.equal(App.appPresenceCache.get('peer'), 'offline');
});
test('a remote desktop DND change and expiry rerender without a profile metadata event', () => {
  const { App } = fixture(['js/chat/app-presence.js']);
  let now = Date.now(), renders = 0;
  App.appPresenceNow = () => now;
  App.renderOnlineIndicator = () => renders++;
  const record = { v: 2, platform: 'desktop', idle: false, updatedAt: now, notificationStatus: 'online' };
  App.appPresenceConnections.peer = { desktop: record };
  App.refreshAppPresenceStatuses(); assert.equal(App.appPresenceCache.get('peer'), 'online');
  record.notificationStatus = 'dnd'; record.notificationStatusExpiresAt = now + 1000;
  App.refreshAppPresenceStatuses(); assert.equal(App.appPresenceCache.get('peer'), 'dnd');
  now += 1001;
  App.refreshAppPresenceStatuses(); assert.equal(App.appPresenceCache.get('peer'), 'online');
  assert.equal(renders, 3);
});
test('background web and legacy leases tolerate one-minute throttling; native/active sessions expire sooner', () => {
  const { App } = fixture(['js/chat/app-presence.js']);
  const now = Date.now(), updatedAt = now - 61000;
  assert.equal(App.getAppPresenceStatus({ tab: { v: 2, idle: true, platform: 'web', updatedAt } }, now), 'idle');
  assert.equal(App.getAppPresenceStatus({ legacy: { idle: false, updatedAt } }, now), 'online');
  assert.equal(App.getAppPresenceStatus({ desktop: { v: 2, idle: true, platform: 'desktop', updatedAt } }, now), 'offline');
  assert.equal(App.getAppPresenceStatus({ active: { v: 2, idle: false, platform: 'web', updatedAt } }, now), 'offline');
});
