'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const mock = require('../tests/firebase-mock.js');
(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  const output = path.resolve(__dirname, '../../qa-html-library');
  await fs.mkdir(output, { recursive: true });
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 821, hasTouch: width < 821 });
      await context.addInitScript({ content: `(${mock.toString()})();` });
      await context.route(/^https?:\/\//, route => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
      await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
      await page.fill('#login-email', 'vincenzo.brogna@students.pittstonarea.com');
      await page.click('#btn-go-login'); await page.fill('#login-code', 'TEST-USER'); await page.click('#btn-login');
      await page.waitForFunction(() => ChatApp.currentUser?.code === 'TEST-USER');
      await page.evaluate(() => { ChatApp.closeToast(); return ChatApp.openHtmlHubModal(); });
      await page.waitForSelector('#html-hub-search-input');
      await page.waitForTimeout(250);
      assert.equal(await page.locator('.html-hub-sidebar-title').count(), 0);
      const layout = await page.evaluate(() => {
        const title = document.querySelector('.html-hub-title-text').getBoundingClientRect();
        const field = document.querySelector('.html-hub-search-field').getBoundingClientRect();
        const nav = document.querySelector('.html-hub-nav-item'), style = getComputedStyle(nav);
        const modal = document.querySelector('.modal-card').getBoundingClientRect();
        return { gap: field.x - title.right, titleY: title.y, fieldY: field.y, border: style.borderTopWidth, radius: style.borderRadius, height: nav.getBoundingClientRect().height, overflow: modal.right > innerWidth + 1 || modal.left < 0 };
      });
      assert.equal(layout.border, '0px'); assert.equal(layout.radius, '8px'); assert.equal(layout.overflow, false);
      if (width > 820) { assert.ok(layout.gap >= 12 && layout.gap <= 16, JSON.stringify(layout)); assert.ok(layout.height >= 40); }
      await page.screenshot({ path: path.join(output, `html-library-${width}.png`) });
      await page.click('#html-hub-add-btn');
      await page.waitForSelector('#html-hub-title-input');
      assert.equal(await page.locator('.html-hub-sidebar-title').count(), 0);
      await page.click('#html-hub-back-btn'); await page.waitForSelector('#html-hub-search-input');
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('HTML library desktop/mobile navigation and title-adjacent search passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
