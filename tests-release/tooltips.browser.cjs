'use strict';
// Offline behavior checks: the real app, dynamic controls, keyboard and mobile.
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
const mock = require('../tests/firebase-mock.js');
(async () => {
  const browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'chrome', headless:true});
  try {
    for (const mobile of [false, true]) {
      const context = await browser.newContext({viewport:mobile ? {width:390,height:844} : {width:1440,height:900}, isMobile:mobile, hasTouch:mobile});
      await context.addInitScript({content:`(${mock.toString()})();`});
      await context.route(/^https?:\/\//, route => route.fulfill({status:200,body:'null',contentType:'application/json'}));
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
      await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
      assert.equal(await page.locator('#sidebar-tooltip').count(),1,'one shared control tooltip');
      await page.fill('#login-email', 'vincenzo.brogna@students.pittstonarea.com');
      await page.click('#btn-go-login'); await page.fill('#login-code','TEST-USER'); await page.click('#btn-login');
      await page.waitForFunction(() => ChatApp.currentUser?.code === 'TEST-USER');
      await page.evaluate(() => ChatApp.openRoom('test',{quiet:true}));
      await page.waitForSelector('#btn-upload');
      await page.evaluate(() => ChatApp.closeToast());
      await page.locator('#btn-upload').hover();
      await page.waitForFunction(() => document.getElementById('sidebar-tooltip').classList.contains('is-visible'));
      assert.equal(await page.locator('#sidebar-tooltip').textContent(),'Upload File');
      assert.equal(await page.locator('#btn-upload').getAttribute('title'),null);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#sidebar-tooltip').evaluate(el => el.classList.contains('is-visible')),false);

      // A new feature does not need its own tooltip event listeners or styles.
      await page.evaluate(() => {
        const fixture = document.createElement('section'); fixture.id = 'tooltip-test-controls';
        fixture.style.cssText = 'position:fixed;left:8px;top:8px;z-index:100300;display:flex;gap:8px;background:#18232d;padding:8px;max-width:calc(100vw - 16px);flex-wrap:wrap';
        fixture.innerHTML = '<button id="tip-icon" aria-label="Room list" title="Room list" aria-describedby="tip-description"><svg width="16" height="16" viewBox="0 0 24 24"><path d="M3 3h18v18H3z"/></svg></button><button id="tip-text" title="Download" aria-label="Download File">Download</button><button id="tip-hidden-label" aria-label="More options"><span style="display:none">More Options</span><svg width="16" height="16"></svg></button><button id="tip-letter" aria-label="Bold">B</button><button id="tip-disabled" aria-label="Previous month" disabled>‹</button><button id="tip-dynamic" aria-label="Mute"><svg width="16" height="16"></svg></button><button id="tip-user" data-tooltip-preserve-case aria-label="Open mY song by jane"><svg width="16" height="16"></svg></button><button id="tip-file" class="file-remove" aria-label="Remove myFile_NAME.pdf"><svg width="16" height="16"></svg></button><button id="tip-avatar" data-avatar-usercode="TEST-USER" aria-label="Open mYname&#39;s Profile"><svg width="16" height="16"></svg></button><span id="tip-status" title="Listening to mY song by jane">Status</span><span id="tip-description" hidden>Existing accessible help</span>';
        document.body.append(fixture);
      });
      await page.waitForFunction(() => document.getElementById('tip-icon').dataset.tooltip === 'Room List');
      assert.equal(await page.locator('#tip-text').getAttribute('title'),null);
      assert.equal(await page.locator('#tip-text').getAttribute('data-tooltip'),null);
      assert.equal(await page.locator('#tip-text').getAttribute('aria-label'),'Download File','removing a tooltip preserves the accessible name');
      assert.equal(await page.locator('#tip-hidden-label').getAttribute('data-tooltip'),'More Options','CSS-hidden text remains an icon-only button');
      assert.equal(await page.locator('#tip-letter').getAttribute('data-tooltip'),'Bold','single-letter tool glyph is not an explanatory text label');
      assert.equal(await page.locator('#tip-user').getAttribute('data-tooltip'),'Open mY song by jane','mixed user content retains exact casing');
      assert.equal(await page.locator('#tip-file').getAttribute('data-tooltip'),null,'X removal controls do not show tooltips');
      assert.equal(await page.locator('#tip-avatar').getAttribute('data-tooltip'),"Open mYname's Profile",'profile names retain exact casing');
      assert.equal(await page.locator('#tip-status').getAttribute('data-tooltip'),'Listening to mY song by jane','status prose retains exact casing');
      assert.equal(await page.evaluate(() => ChatApp.uiTitleCase('The Santino Of City')),'The Santino of City');
      assert.equal(await page.evaluate(() => ChatApp.uiTitleCase('Copy PFP Address')),'Copy PFP Address');

      await page.locator('#tip-icon').hover();
      assert.equal(await page.locator('#sidebar-tooltip').textContent(),'Room List');
      assert.match(await page.locator('#tip-icon').getAttribute('aria-describedby'),/tip-description.*sidebar-tooltip/);
      await page.evaluate(() => document.getElementById('tip-icon').setAttribute('aria-label','Room options'));
      await page.waitForFunction(() => document.getElementById('sidebar-tooltip').textContent === 'Room Options');
      await page.locator('#tip-text').hover();
      assert.equal(await page.locator('#sidebar-tooltip').evaluate(el => el.classList.contains('is-visible')),false,'text buttons never show redundant custom help');
      assert.equal(await page.locator('#tip-icon').getAttribute('aria-describedby'),'tip-description','dismissal preserves other help associations');
      await page.locator('#tip-disabled').hover();
      assert.equal(await page.locator('#sidebar-tooltip').textContent(),'Previous Month','disabled icon still explains its action on hover');
      assert.equal(await page.locator('#sidebar-tooltip').evaluate(el => el.classList.contains('is-visible')),true);
      await page.locator('#tip-dynamic').hover();
      await page.evaluate(() => document.getElementById('tip-dynamic').setAttribute('aria-label','Unmute'));
      await page.waitForFunction(() => document.getElementById('sidebar-tooltip').textContent === 'Unmute');
      await page.evaluate(() => {
        const button = document.getElementById('tip-dynamic');
        button.dataset.tooltip = 'Turn off camera';
      });
      await page.waitForFunction(() => document.getElementById('sidebar-tooltip').textContent === 'Turn Off Camera');
      await page.evaluate(() => document.getElementById('tip-dynamic').textContent = 'Turn Off Camera');
      await page.waitForFunction(() => !document.getElementById('sidebar-tooltip').classList.contains('is-visible'));
      assert.equal(await page.locator('#tip-dynamic').getAttribute('data-tooltip'),null,'a control becoming text-labeled loses its redundant tooltip');
      await page.locator('#tip-status').hover();
      assert.equal(await page.locator('#sidebar-tooltip').textContent(),'Listening to mY song by jane');
      const bounds = await page.locator('#sidebar-tooltip').boundingBox();
      assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= (mobile ? 390 : 1440),'tooltip clamps to the viewport');

      await page.locator('#tip-text').click();
      await page.keyboard.press('Tab');
      await page.waitForFunction(() => document.getElementById('sidebar-tooltip').classList.contains('is-visible'));
      assert.equal(await page.locator('#sidebar-tooltip').textContent(),'More Options','keyboard focus shows shared tooltip');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#sidebar-tooltip').evaluate(el => el.classList.contains('is-visible')),false);
      if (mobile) {
        await page.locator('#tip-icon').tap();
        assert.equal(await page.locator('#sidebar-tooltip').evaluate(el => el.classList.contains('is-visible')),false,'touch activation does not leave a hover tooltip over the UI');
      }
      await page.evaluate(() => document.getElementById('tooltip-test-controls').remove());
      await page.waitForTimeout(60);
      assert.deepEqual(errors,[]);
      await context.close();
    }
    console.log('PASS shared tooltips: real composer, dynamic controls, redundant text removal, disabled icons, keyboard/touch, state updates, protected user text, title case and viewport bounds.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
