'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const installFirebaseMock = require('../tests/firebase-mock.js');

async function exercise(browser, moderator, mobile) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 864 },
    isMobile: mobile, hasTouch: mobile
  });
  try {
    await context.addInitScript(installFirebaseMock);
    await context.route(/^https?:\/\//, route => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
    await page.evaluate(async moderator => {
      const username = moderator ? 'Vinny' : 'Tester';
      await __testDatabase.ref('users/TEST-USER').update({username, usernameLower: username.toLowerCase(), displayName: 'Vinny', displayNameLower: 'vinny'});
      await __testDatabase.ref('messages/test/peer').set({t:'text', userCode:'PEER', username:'Peer', text:'Before', createdAt:101, reactions:{heart:{PEER:true}}});
    }, moderator);
    await page.fill('#login-email','vincenzo.brogna@students.pittstonarea.com');
    await page.click('#btn-go-login');
    await page.fill('#login-code', 'TEST-USER');
    await page.click('#btn-login');
    await page.waitForFunction(() => ChatApp.currentUser?.code === 'TEST-USER');
    await page.evaluate(() => ChatApp.openRoom('test', {quiet:true}));
    const row = page.locator('.msg-row[data-msgkey="peer"]');
    await row.waitFor();
    await page.evaluate(() => { ChatApp.closeToast(); ChatApp.closeMobileDrawers(); });
    if (mobile) {
      const repeatedWrites = await page.evaluate(() => {
        ChatApp.syncMobileChrome();
        const observer = new MutationObserver(() => {});
        for (const drawer of document.querySelectorAll('.sidebar')) {
          observer.observe(drawer, {attributes:true,attributeFilter:['aria-hidden']});
        }
        for (let i=0; i<20; i++) ChatApp.syncMobileChrome();
        const count = observer.takeRecords().length;
        observer.disconnect();
        return count;
      });
      assert.equal(repeatedWrites,0,'steady mobile chrome does not retrigger drawer tooltip scans');
      await row.locator('.mobile-message-actions').tap();
    } else await row.locator('.bubble-top').click({button:'right'});
    const edit = page.locator('#msg-menu [data-act="edit"]');
    await page.locator('#msg-menu').waitFor();
    assert.equal(await edit.isVisible(), moderator);
    if (moderator) {
      await edit.click();
      assert.equal(await page.inputValue('#msg-input'), 'Before');
      await page.fill('#msg-input', 'Corrected by moderator');
      await page.click('#btn-send');
      await page.waitForFunction(() => __testDatabase.get('messages/test/peer')?.text === 'Corrected by moderator' && !ChatApp.editState);
      const saved = await page.evaluate(() => __testDatabase.get('messages/test/peer'));
      assert.equal(saved.userCode,'PEER');
      assert.equal(saved.username,'Peer');
      assert.equal(saved.createdAt,101);
      assert.deepEqual(saved.reactions,{heart:{PEER:true}});
      assert.equal(saved.editedPrevText,'Before');
      assert.equal(saved.editedBy,'TEST-USER');
      assert.ok(saved.editedAt > 101);
      if (!mobile) {
        await page.setViewportSize({width:390,height:844});
        await row.locator('.mobile-message-actions').waitFor();
        await page.setViewportSize({width:1366,height:864});
        await page.waitForFunction(() => document.body.dataset.mobileUi === '0');
        await page.setViewportSize({width:390,height:844});
        await page.waitForFunction(() => document.body.dataset.mobileUi === '1');
        assert.equal(await row.locator('.mobile-message-actions').count(),1);
      }
    } else {
      await page.evaluate(() => ChatApp.beginEditMessage(ChatApp.msgDataByKey.get('peer')));
      assert.equal(await page.evaluate(() => ChatApp.editState?.key || null), null);
    }
    assert.deepEqual(errors, []);
    console.log('PASS', mobile ? 'touch' : 'desktop', moderator ? 'moderator edit with original author and previous text' : 'ordinary member with Vinny display name');
  } finally { await context.close(); }
}

(async () => {
  const browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'chrome'});
  try {
    await exercise(browser, true, false);
    await exercise(browser, true, true);
    await exercise(browser, false, false);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
