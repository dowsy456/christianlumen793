'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { bootstrap } = require('../tests/screen-focus.browser.cjs');

async function check(browser, viewport, mobile) {
  const { page, context, errors } = await bootstrap(browser, viewport, mobile);
  try {
    const panel = page.locator('#call-menu');
    for (const expanded of [false, true]) {
      await page.evaluate(expanded => ChatApp.setCallMenuExpanded(expanded), expanded);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      assert.equal(await panel.isVisible(), true);
      assert.equal(await page.evaluate(() => ChatApp.callMenuExpanded), expanded);
      assert.equal(await page.evaluate(() => ChatApp.currentCallRoomId), 'test');
    }
    await page.evaluate(() => {
      ChatApp.closeCallMenu();
      ChatApp.currentCallRoomId = null;
      ChatApp.callActive = true;
      ChatApp.observedCallRoomId = ChatApp.currentRoomId;
      ChatApp.syncCallButton();
    });
    const preview = page.locator('#call-menu.is-preview');
    await preview.waitFor({state: 'visible'});
    await page.keyboard.press('Escape');
    await page.evaluate(() => ChatApp.syncCallButton());
    assert.equal(await preview.isVisible(), true);
    assert.deepEqual(errors, []);
    console.log('Escape retained joined, expanded and preview call panels at', viewport.width);
  } finally { await context.close(); }
}
(async () => {
  const browser = await chromium.launch({channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true});
  try {
    await check(browser, {width: 1440, height: 900}, false);
    await check(browser, {width: 390, height: 844}, true);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
