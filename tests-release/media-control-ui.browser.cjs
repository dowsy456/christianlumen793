'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { bootstrap } = require('../tests/screen-focus.browser.cjs');
const capture = process.argv[2];
(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome' });
  try {
    if (capture) await fs.mkdir(capture, { recursive: true });
    for (const width of [1280, 390, 320]) {
      const mobile = width < 600;
      const { page, context, errors } = await bootstrap(browser, { width, height: mobile ? 812 : 900 }, mobile);
      try {
        if (mobile) {
          await page.evaluate(() => { ChatApp.callToggleShareFocus('ALICE'); ChatApp.callFocusedControlsVisible = true; ChatApp.callSyncFocusedControls('ALICE'); });
          const roster = page.locator('#call-in-call');
          await roster.tap();
          const tooltip = page.locator('.call-viewers-floating.is-visible');
          await tooltip.locator('.call-viewers-label').waitFor();
          assert.equal(await tooltip.locator('.call-viewers-label').innerText(), 'In Call With');
          assert.equal(await tooltip.locator('.call-viewer-avatar').count(), 3);
          const row = await roster.evaluate(el => {
            const bounds = el.getBoundingClientRect(), control = document.getElementById('btn-call-leave').getBoundingClientRect(), icon = el.querySelector('svg').getBoundingClientRect();
            return { offset: (bounds.y + bounds.height / 2) - (control.y + control.height / 2), iconOffset: (icon.x + icon.width / 2) - (bounds.x + bounds.width / 2), right: bounds.right, left: bounds.left };
          });
          assert.ok(Math.abs(row.offset) < 1 && Math.abs(row.iconOffset) < 1 && row.left >= 0 && row.right <= width + 1, JSON.stringify(row));
          await page.evaluate(() => ChatApp.renderCallMenu());
          await tooltip.waitFor();
          if (capture) await page.screenshot({ path: path.join(capture, 'roster-' + width + '.png') });
          await roster.tap();
          await tooltip.waitFor({ state:'hidden' });
          await roster.tap();
          const eye = page.locator(".call-view-tile.is-focused .call-viewers-eye");
          await eye.tap();
          await tooltip.locator(".call-viewers-label").waitFor({ state: "visible" });
          assert.equal(await tooltip.locator(".call-viewers-label").textContent(), "Viewers");
          await eye.tap();
          await tooltip.waitFor({ state: "hidden" });
          await roster.tap();
          await page.touchscreen.tap(2, 2);
          await tooltip.waitFor({ state:'hidden' });
        }
        // One second of synthetic color bars, with no camera or network access.
        const bytes = await fs.readFile(path.join(__dirname, 'fixtures/video-controls.webm'));
        await page.evaluate(dataURL => {
          ChatApp.closeCallMenu();
          ChatApp.openMediaModal('video', dataURL, { fileName:'A-very-long-video-filename-for-testing.webm', mimeType:'video/webm' });
        }, 'data:video/webm;base64,' + bytes.toString('base64'));
        const viewer = page.locator('.vpu'), menu = viewer.locator('.vpu-menu'), pop = viewer.locator('.vpu-pop');
        await page.waitForFunction(() => document.querySelector('.vpu video')?.readyState >= 2);
        await menu.click();
        assert.equal(await pop.locator('h3').innerText(), 'Playback speed');
        assert.equal(await pop.locator('button[data-rate]').count(), 8);
        await pop.locator('[data-rate="1.5"]').click();
        await page.waitForFunction(() => document.querySelector('.vpu video').playbackRate === 1.5);
        const custom = pop.locator('input');
        assert.equal(await custom.getAttribute('type'), 'text');
        await custom.fill('1.35'); await custom.press('Enter');
        assert.ok(Math.abs(await viewer.locator('video').evaluate(el => el.playbackRate) - 1.35) < .00001);
        await custom.fill('22'); await custom.press('Enter');
        assert.equal(await custom.evaluate(el => el.validity.valid), false);
        await custom.fill('1.35'); await custom.press('Enter');
        if (capture) await page.screenshot({ path:path.join(capture,'speed-' + width + '.png') });
        const bounds = await pop.boundingBox();
        assert.ok(bounds.width <= width && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1);
        await custom.press('Escape');
        await pop.waitFor({ state:'hidden' });
        const range = viewer.locator('.media-volume input'), button = viewer.locator('.media-volume button');
        await range.focus(); await range.press('End');
        assert.equal(await viewer.locator('.media-volume span').innerText(), '200%');
        await button.click(); assert.equal(await range.inputValue(), '0');
        await button.click(); assert.equal(await range.inputValue(), '200');
        await button.click(); await range.focus(); await range.press('ArrowRight');
        assert.equal(await button.getAttribute('aria-label'), 'Mute Video');
        assert.equal(await range.inputValue(), '5');
        const call = await page.evaluate(() => {
          const a = ChatApp, session = a.callSessionId;
          a.closeModal();
          a.openCallMenu();
          a.showSchedulesPage(); a.showLoggedInHome(); a.showCalendarPage();
          return { sameSession: !!session && session === a.callSessionId, room: a.currentCallRoomId,
            menuHidden: a.$("call-menu").hidden, dockVisible: !a.$("sidebar-call").hidden };
        });
        assert.deepEqual(call, { sameSession: true, room: "test", menuHidden: true, dockVisible: true });
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
    console.log('Desktop and touch video speed, typed custom rates, 0–200% volume, and mobile focused roster geometry and tap dismissal passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
