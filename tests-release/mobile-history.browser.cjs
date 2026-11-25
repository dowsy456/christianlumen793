'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const fixture = require('../tests/room-loading-fixture.cjs');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await context.addInitScript(fixture, { count: 650, latencyMs: 25 });
    await context.route(/^https?:\/\//, route => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
    await page.evaluate(() => {
      for (const [i, msg] of Object.values(__roomLoadFixture.values.messages.test).entries()) {
        if (i % 7 === 0) msg.text += '\nVariable-height text'.repeat(6);
      }
    });
    await page.fill('#login-email', 'vincenzo.brogna@students.pittstonarea.com');
    await page.click('#btn-go-login'); await page.fill('#login-code', 'TEST-USER'); await page.click('#btn-login');
    await page.waitForFunction(() => ChatApp.currentUser?.code === 'TEST-USER');
    await page.evaluate(() => ChatApp.openRoom('test', { quiet: true }));
    await page.waitForFunction(() => ChatApp.currentRoomId === 'test' && !ChatApp.bulkLoading && !ChatApp.roomEntryScroll);
    await page.evaluate(() => { ChatApp.closeToast(); ChatApp.closeMobileDrawers(); });
    const cdp = await context.newCDPSession(page);
    const bounds = await page.locator('#messages').boundingBox();
    const x = Math.floor(bounds.x + bounds.width * .60), middle = Math.floor(bounds.y + bounds.height * .45);
    const finger = (type, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: y === undefined ? [] : [{ x, y }] });
    const top = () => page.evaluate(() => ChatApp.messagesEl.scrollTop);
    await finger('touchStart', middle);
    const tail = await top();
    for (let i = 1; i <= 5; i++) await finger('touchMove', middle + 18 * i);
    await page.waitForTimeout(160);
    await finger('touchEnd');
    assert.ok(await top() < tail - 50, 'an upward read immediately leaves the newest row');
    await page.waitForTimeout(1450);

    // Scrolling can continue after the last touchmove (momentum, accessibility
    // scrolling, or a hardware key). No stale touch timestamp owns the offset.
    const resting = await top();
    await page.evaluate(() => { ChatApp.messagesEl.tabIndex = 0; ChatApp.messagesEl.focus({ preventScroll: true }); });
    await page.keyboard.down('ArrowUp');
    for (let i = 0; i < 7; i++) { await page.waitForTimeout(32); await page.keyboard.down('ArrowUp'); }
    await page.keyboard.up('ArrowUp');
    await page.waitForTimeout(260);
    const viaKey = await top();
    assert.ok(viaKey < resting - 100, `held Up moved from ${resting} to ${viaKey}`);

    // Start near a page boundary. Pause row preparation after the first
    // offscreen batch, then reverse direction with the same finger still down.
    await page.evaluate(() => {
      ChatApp.messagesEl.scrollTop = Math.min(440, Math.ceil(ChatApp.messagesEl.clientHeight * .55)) + 60;
      const paint = ChatApp.nextPaint;
      ChatApp.nextPaint = () => {
        if (!ChatApp.msgLoadingOlder) return paint();
        ChatApp.nextPaint = paint;
        return new Promise(resolve => { window.releaseOlderPaint = resolve; });
      };
    });
    await page.waitForTimeout(90);
    const anchor = () => page.evaluate(() => {
      const found = ChatApp.getMessageWindowAnchor();
      return { key: found.row.dataset.msgkey, offset: found.offset };
    });
    await finger('touchStart', middle);
    for (let i = 1; i <= 6; i++) await finger('touchMove', middle + 20 * i);
    await page.waitForFunction(() => !!window.releaseOlderPaint, null, { timeout: 4000 });
    const cursorBefore = await page.evaluate(() => __roomLoadFixture.traces.findLast(t => t.kind === 'once' && t.path === 'messages/test' && t.query.endAt)?.query.endAt);
    for (let i = 1; i <= 6; i++) await finger('touchMove', middle + 120 - 22 * i);
    await page.waitForTimeout(150);
    const before = await anchor();
    await page.evaluate(() => window.releaseOlderPaint());
    await page.waitForFunction(() => !ChatApp.msgLoadingOlder);
    await page.waitForTimeout(130);
    const after = await anchor();
    assert.equal(after.key, before.key, 'adding a page keeps the current row under the finger');
    assert.ok(Math.abs(after.offset - before.offset) <= 2, 'pagination retains the current in-row offset');
    await finger('touchMove', middle + 55);
    await finger('touchMove', middle + 80);
    await page.waitForTimeout(120);
    const afterMove = await anchor();
    assert.ok(afterMove.key !== after.key || Math.abs(afterMove.offset - after.offset) > 45, 'the held finger can continue scrolling after the page commits');
    await finger('touchEnd');
    // Native momentum can carry the viewport to the new edge after insertion.
    // A second page belongs to the next gesture, even if another scroll fires.
    const atEdge = await page.evaluate(() => {
      const host = ChatApp.messagesEl;
      host.scrollTop = 0;
      host.dispatchEvent(new Event('scroll'));
      return ChatApp.msgOldestKey;
    });
    assert.equal(Number(cursorBefore.slice(1)) - Number(atEdge.slice(1)), 50);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => ChatApp.msgOldestKey), atEdge);
    assert.equal(await page.evaluate(cursor => __roomLoadFixture.traces.filter(t =>
      t.kind === 'once' && t.path === 'messages/test' && t.query.endAt === cursor).length, atEdge), 0);
    await finger('touchStart', middle);
    await finger('touchMove', middle + 70);
    await finger('touchEnd');
    await page.waitForFunction(old => !ChatApp.msgLoadingOlder && ChatApp.msgOldestKey < old, atEdge);
    assert.equal(await page.evaluate(old => Number(old.slice(1)) - Number(ChatApp.msgOldestKey.slice(1)), atEdge), 50);
    assert.deepEqual(errors, []);
    console.log('PASS mobile native touch, held Up, reversing during asynchronous history rendering, continued motion, and in-row anchor preservation.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
