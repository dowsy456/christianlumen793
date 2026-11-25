'use strict';
// Remote requests are blocked; the saved session and URLs are local fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const mock = require('../tests/firebase-mock.js');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(mock);
    await context.addInitScript(() => {
      const url = `https://${'long-hostname'.repeat(4)}.example.test/${'unbroken-path-segment'.repeat(21)}?token=keep-the-entire-link#section`;
      window.__longHomeURL = url;
      __testDatabase.ref('messages/test/link-fixture').set({ t: 'text', text: url, createdAt: Date.now(), userCode: 'TEST-USER' });
    });
    await context.route(/^https?:\/\//, route => route.fulfill({ status: 200, body: 'null', contentType: 'application/json' }));
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
    // Exercise Home in an authenticated fixture without coupling this regression
    // to the separate public sign-in screen's navigation or email gate.
    await page.evaluate(async () => {
      ChatApp.currentUser = await ChatApp.loginWithCode('TEST-USER');
      ChatApp.setStoredAccountCode('TEST-USER');
      ChatApp.applyResolvedSettings(ChatApp.currentUser.settings);
      ChatApp.setMeHeader(); ChatApp.showView('chat');
      ChatApp.startCalendarSession(); ChatApp.attachMemberships();
      ChatApp.showLoggedInHome();
    });
    await page.waitForFunction(() => !!document.querySelector('.home-link-row'));
    await page.evaluate(() => { ChatApp.closeToast(); ChatApp.closeMobileDrawers(); });

    for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 600 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 740, height: 390 }, { width: 390, height: 320 }]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(100);
      if (await page.locator('[data-home-tab="links"]').isVisible()) await page.click('[data-home-tab="links"]');
      const fit = await page.locator('.home-link-row').evaluate(row => {
        const list = row.parentElement, text = row.querySelector('a'), strong = text.querySelector('strong'), small = text.querySelector('small'), copy = row.querySelector('button');
        const bounds = row.getBoundingClientRect(), textBounds = text.getBoundingClientRect(), copyBounds = copy.getBoundingClientRect();
        return {
          rowOverflow: row.scrollWidth - row.clientWidth, rowVerticalOverflow: row.scrollHeight - row.clientHeight,
          listOverflow: list.scrollWidth - list.clientWidth, pageOverflow: document.documentElement.scrollWidth - innerWidth,
          textInside: textBounds.left >= bounds.left && textBounds.right <= bounds.right && textBounds.bottom <= bounds.bottom,
          copyInside: copyBounds.left >= bounds.left && copyBounds.right <= bounds.right,
          strongClipped: strong.scrollHeight > strong.clientHeight, smallClipped: small.scrollHeight > small.clientHeight,
          pathWrapped: small.getBoundingClientRect().height > parseFloat(getComputedStyle(small).lineHeight) * 2,
          href: text.href, expectedHref: window.__longHomeURL,
          copyValue: copy.dataset.homeCopy, path: small.textContent,
          expectedPath: new URL(window.__longHomeURL).pathname
        };
      });
      assert(fit.rowOverflow <= 1 && fit.rowVerticalOverflow <= 1 && fit.listOverflow <= 1 && fit.pageOverflow <= 1, JSON.stringify({ viewport, fit }));
      assert(fit.textInside && fit.copyInside && !fit.strongClipped && !fit.smallClipped && fit.pathWrapped, JSON.stringify({ viewport, fit }));
      assert.equal(fit.href, fit.expectedHref); assert.equal(fit.copyValue, fit.expectedHref); assert(fit.path.endsWith(fit.expectedPath));
      if (viewport.width === 390 && viewport.height === 844) {
        const capture = path.resolve(__dirname, '../../home-links-review'); fs.mkdirSync(capture, { recursive: true });
        await page.screenshot({ path: path.join(capture, 'recent-links-mobile.png') });
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => {
      ChatApp.copyTextToClipboard = async value => { window.__copiedHomeURL = value; };
    });
    await page.click('.home-link-copy');
    assert.equal(await page.evaluate(() => __copiedHomeURL), await page.evaluate(() => __longHomeURL));

    const openRoomMenu = () => page.evaluate(() => ChatApp.openMsgMenuFor(document.querySelector('#home-search'), { menu: 'roomButton', roomId: 'test', username: 'Test Room', pointerX: 500, pointerY: 300 }));
    await openRoomMenu();
    for (const [selector, label] of [['[data-act="pinRoom"]', 'Pin'], ['[data-act="leaveRoom"]', 'Leave'], ['[data-menu-group="room"]', 'Edit']]) {
      assert.equal(await page.locator(`${selector} .msg-menu-label`).textContent(), label);
    }
    await page.click('[data-menu-group="room"]');
    assert.equal(await page.locator('[data-act="editRoomName"] .msg-menu-label').textContent(), 'Name');
    assert.equal(await page.locator('[data-act="editRoomIcon"] .msg-menu-label').textContent(), 'Icon');
    await page.click('[data-act="pinRoom"]');
    await page.waitForFunction(() => ChatApp.getPinnedRoomSet().has('test'));
    await openRoomMenu();
    assert.equal(await page.locator('[data-act="pinRoom"] .msg-menu-label').textContent(), 'Unpin');

    await page.evaluate(() => {
      ChatApp.closeMsgMenu(true);
      ChatApp.openMsgMenuFor(document.querySelector('#home-search'), { key: 'message-fixture', roomId: 'test', username: 'Tester', message: { pinned: false }, canReply: true, canEdit: true, pointerX: 500, pointerY: 300 });
    });
    assert.equal(await page.locator('[data-act="pinMessage"] .msg-menu-label').textContent(), 'Pin');
    assert.equal(await page.locator('[data-act="copy"] .msg-menu-label').textContent(), 'Copy');
    await page.evaluate(() => ChatApp.syncMessagePinMenu({ _key: 'message-fixture', pinned: true }));
    assert.equal(await page.locator('[data-act="pinMessage"] .msg-menu-label').textContent(), 'Unpin');
    await page.evaluate(() => ChatApp.syncMessagePinMenu({ _key: 'message-fixture', pinned: false }));
    assert.equal(await page.locator('[data-act="pinMessage"] .msg-menu-label').textContent(), 'Pin');
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS Recent Links wrap without clipping across 6 viewports; copy retains full URL; concise room/message menus and live pin labels');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
