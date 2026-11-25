const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const mock = require('../tests/firebase-mock.js');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 600, hasTouch: width < 600 });
      await context.addInitScript(mock);
      await context.addInitScript(() => { window.__badges = []; window.chatDesktopNotifications = { setUnreadCount: n => __badges.push(n) }; });
      await context.route(/^https?:\/\//, route => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
      await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
      await page.fill('#login-email', 'vincenzo.brogna@students.pittstonarea.com');
      await page.click('#btn-go-login'); await page.fill('#login-code', 'TEST-USER'); await page.click('#btn-login');
      await page.waitForFunction(() => ChatApp.currentUser && ChatApp.membershipMap.has('test'));
      await page.evaluate(async () => {
        window.__clearEpoch = Date.now() - 10000;
        await __testDatabase.ref('memberships/TEST-USER/test').set({ joinedAt: 1, lastSeenCount: 0 });
        await __testDatabase.ref('rooms/test').update({ messagesClearedAt: __clearEpoch, messageCount: 9, retainedMessageCount: 1 });
        await __testDatabase.ref('messages/test').set({ 'a-pin': { userCode: 'PEER', username: 'Peer', text: 'A retained pin', createdAt: __clearEpoch - 1000, pinned: true } });
        ChatApp.closeToast(); await ChatApp.openRoom('test', { quiet: true }); ChatApp.closeMobileDrawers();
      });
      await page.waitForSelector('.retained-pins-divider');
      assert.equal(await page.evaluate(() => ChatApp.getRoomMissedCount('test')), 0, 'Retained pins never become unread even with a corrupted count');
      assert.equal(await page.evaluate(() => ChatApp.syncUnreadTaskbarBadge()), 0);
      assert.equal(await page.locator('.retained-pins-divider.is-only-pins').count(), 1);
      await page.evaluate(async () => {
        await __testDatabase.ref('messages/test/z-new-pin').set({ userCode: 'PEER', username: 'Peer', text: 'A new pin stays in the conversation', createdAt: Date.now(), pinned: true });
      });
      await page.waitForFunction(() => ChatApp.messagesListEl.querySelector('.retained-pins-divider')?.nextElementSibling?.dataset.msgkey === 'z-new-pin');
      const geometry = await page.evaluate(() => {
        const old = ChatApp.msgElByKey.get('a-pin').getBoundingClientRect();
        const divider = document.querySelector('.retained-pins-divider').getBoundingClientRect();
        const current = ChatApp.msgElByKey.get('z-new-pin').getBoundingClientRect();
        return { oldBottom: old.bottom, dividerTop: divider.top, dividerBottom: divider.bottom, currentTop: current.top };
      });
      assert.ok(geometry.oldBottom <= geometry.dividerTop && geometry.dividerBottom <= geometry.currentTop);
      await page.evaluate(() => __testDatabase.ref('messages/test/a-pin/pinned').set(false));
      await page.waitForFunction(() => !document.querySelector('.retained-pins-divider'));
      await page.evaluate(async () => {
        await __testDatabase.ref('messages/test/a-pin').remove();
        await __testDatabase.ref('rooms/test/messagesClearedAt').set(Date.now() + 1);
      });
      await page.waitForSelector('.retained-pins-divider.is-only-pins');
      assert.equal(await page.evaluate(() => ChatApp.getRoomMissedCount('test')), 0);
      await page.evaluate(() => __testDatabase.ref('messages/test/z-new-pin').remove());
      await page.waitForFunction(() => !document.querySelector('.retained-pins-divider'));
      await page.waitForFunction(() => !document.getElementById('room-empty-state').hidden);
      await page.evaluate(async () => {
        ChatApp.lastAppInputAt = Date.now() - ChatApp.ROOM_IDLE_MS - 100;
        ChatApp.syncAppIdle();
        await __testDatabase.ref('messages/test/zz-idle').set({ userCode: 'PEER', username: 'Peer', text: 'Do not read this while idle', createdAt: Math.max(Date.now(), ChatApp.roomsMetaCache.get('test').messagesClearedAt + 1) });
      });
      await page.waitForTimeout(700);
      assert.equal(await page.evaluate(() => ChatApp.myRoomIdle), true);
      assert.equal(await page.evaluate(() => __testDatabase.values.readReceipts?.test?.['zz-idle']?.['TEST-USER']), undefined);
      assert.equal(await page.evaluate(() => ChatApp.getRoomMissedCount('test')), 1);
      await page.click('#msg-input');
      await page.waitForFunction(() => !!__testDatabase.values.readReceipts?.test?.['zz-idle']?.['TEST-USER']);
      assert.equal(await page.evaluate(() => ChatApp.getRoomMissedCount('test')), 0);
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}: retained pin boundaries, new pin position, unpin/removal, empty state, idle receipt gate, read-on-return, source count and taskbar agree`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
