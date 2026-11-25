'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const { createSharedFirebaseBackend } = require('../tests/shared-firebase-backend.cjs');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const backend = createSharedFirebaseBackend(1);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  const errors = [];
  try {
    await backend.bind(context);
    await context.route(/^https?:\/\//, r => r.fulfill({ status: 200, body: 'null', contentType: 'application/json' }));
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
    await page.fill('#login-email', 'vincenzo.brogna@students.pittstonarea.com');
    await page.click('#btn-go-login');
    await page.fill('#login-code', 'P1');
    await page.click('#btn-login');
    await page.waitForFunction(() => ChatApp.accountSettingsSync?.code === 'P1');
    await page.evaluate(() => ChatApp.closeToast());
    await page.click('#btn-side-settings');
    await page.click('#settings-tab-appearance');
    assert.deepEqual(await page.locator('#settings-bg-controls label').allTextContents(),
      ['Zoom', 'Blur Intensity', 'Dimming', 'Image Saturation', 'Accent Strength', 'Panel Opacity']);
    assert.equal(await page.locator('#settings-bg-hint').count(), 0);
    assert.deepEqual(await page.locator('#settings-pane-appearance button').allTextContents(),
      ['Upload', 'Download', 'Copy Address', 'Remove', 'Center', 'Reset']);
    const upload = async color => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="900"><rect width="1440" height="900" fill="${color}"/></svg>`;
      await page.locator('#settings-bg-file').setInputFiles({ name: 'sample.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });
    };
    const originalChrome = await page.locator('meta[name=theme-color]').getAttribute('content');
    await upload('#e38119');
    await page.waitForFunction(() => {
      const hue = parseFloat(document.documentElement.style.getPropertyValue('--wallpaper-hue'));
      return hue >= 20 && hue <= 40 && !!document.querySelector('.app-wallpaper img').style.width;
    });
    const initial = await page.evaluate(() => {
      const old = ChatApp.currentSettings.background;
      const legacy = ChatApp.normalizeSettings({ bgImage: old.dataURL, bgBlur: 3.4, bgZoom: 1.45 }).background;
      return { legacy, actual: old, visible: document.documentElement.dataset.hasBg };
    });
    assert.equal(initial.visible, '1');
    assert.notEqual(await page.locator('meta[name=theme-color]').getAttribute('content'), originalChrome);
    assert.equal(initial.legacy.blur, 3.4);
    assert.equal(initial.legacy.zoom, 1.45);
    assert.equal(initial.legacy.x, 50);
    assert.equal(initial.legacy.panels, initial.actual.panels);

    await page.evaluate(() => {
      window.wallWork = { saves: 0, imageWrites: 0, samples: 0, paletteEvents: 0, srcMutations: 0 };
      const update = ChatApp.updateSettingsState;
      ChatApp.updateSettingsState = function (...args) { if (args[0].background) wallWork.saves++; return update(...args); };
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === ChatApp.LS.BG_IMAGE) wallWork.imageWrites++;
        return setItem.call(this, key, value);
      };
      const getPixels = CanvasRenderingContext2D.prototype.getImageData;
      CanvasRenderingContext2D.prototype.getImageData = function (...args) { wallWork.samples++; return getPixels.apply(this, args); };
      addEventListener('chatapp:wallpaper-palette', () => wallWork.paletteEvents++);
      for (const img of [document.querySelector('.app-wallpaper img'), document.querySelector('#settings-bg-preview-layer')]) {
        new MutationObserver(events => { wallWork.srcMutations += events.length; }).observe(img, { attributes: true, attributeFilter: ['src'] });
      }
      const blur = document.querySelector('#settings-bg-blur');
      for (let i = 0; i <= 120; i++) {
        blur.value = String(i / 10);
        blur.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await page.waitForFunction(() => document.querySelector('.app-wallpaper img').style.filter.includes('blur(12px)'));
    assert.deepEqual(await page.evaluate(() => ({ ...wallWork })), { saves: 0, imageWrites: 0, samples: 0, paletteEvents: 0, srcMutations: 0 });
    await page.locator('#settings-bg-blur').dispatchEvent('change');
    assert.equal(await page.evaluate(() => ChatApp.currentSettings.background.blur), 12);
    await page.locator('#settings-bg-blur').focus();
    const beforeHeldKey = await page.evaluate(() => wallWork.saves);
    for (let i = 0; i < 4; i++) await page.keyboard.down('ArrowRight');
    assert.equal(await page.evaluate(() => wallWork.saves), beforeHeldKey);
    await page.keyboard.up('ArrowRight');
    assert.equal(await page.evaluate(() => wallWork.saves), beforeHeldKey + 1);
    const setSlider = async (key, value) => {
      await page.locator(`#settings-bg-${key}`).evaluate((input, value) => {
        input.value = value;
        for (const type of ['input', 'change']) input.dispatchEvent(new Event(type, { bubbles: true }));
      }, String(value));
    };
    await setSlider('zoom', 2);
    const box = page.locator('#settings-bg-preview');
    await box.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => parseFloat(document.querySelector('#settings-bg-preview-layer').style.width) > 0);
    const rect = await box.boundingBox();
    const cx = Math.round(rect.x + rect.width / 2), cy = Math.round(rect.y + rect.height / 2);
    const imageStart = await page.locator('#settings-bg-preview-layer').boundingBox();
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 30, cy + 18, { steps: 5 });
    await page.mouse.up();
    const imageEnd = await page.locator('#settings-bg-preview-layer').boundingBox();
    assert.ok(Math.abs((imageEnd.x - imageStart.x) - 30) < 1 && Math.abs((imageEnd.y - imageStart.y) - 18) < 1, 'crop follows the pointer in preview pixels');
    const afterPan = await page.evaluate(() => ChatApp.currentSettings.background);
    assert.ok(afterPan.x < 50 && afterPan.y < 50);
    await box.press('ArrowRight');
    assert.ok((await page.evaluate(() => ChatApp.currentSettings.background.x)) < afterPan.x);
    await setSlider('panels', 90);
    await setSlider('saturation', 65);
    await setSlider('dim', 55);
    await setSlider('accent', 75);
    const snapshot = await page.evaluate(() => ({ active: ChatApp.currentSettings.background, cached: ChatApp.readCachedSettings().background, counts: { ...wallWork } }));
    assert.deepEqual(snapshot.active, snapshot.cached);
    assert.equal(snapshot.counts.imageWrites, 0);
    assert.equal(snapshot.counts.samples, 0);
    assert.equal(snapshot.counts.srcMutations, 0);
    await page.evaluate(() => ChatApp.flushCurrentSettingsSave('P1'));
    assert.equal(backend.get('users/P1/settings/background/x'), snapshot.active.x);
    assert.equal(backend.get('users/P1/settings/background/dim'), 55);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => document.querySelector('#settings-bg-preview').clientWidth < 170);
    const mobile = await box.boundingBox();
    assert.ok(Math.abs(mobile.width / mobile.height - 390 / 844) < .01);
    // Dispatch through Chromium's touch input pipeline so pointer capture,
    // touch-action and compatibility events all execute as on a touch screen.
    const cdp = await context.newCDPSession(page);
    await box.scrollIntoViewIfNeeded();
    const touchRect = await box.boundingBox();
    const tx = Math.round(touchRect.x + touchRect.width / 2), ty = Math.round(touchRect.y + touchRect.height / 2);
    await box.evaluate(node => node.addEventListener('pointerdown', event => { window.wallPointer = event.pointerType; }, { once: true }));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tx, y: ty }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tx - 20, y: ty - 12 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForFunction(x => ChatApp.currentSettings.background.x > x, snapshot.active.x);
    assert.equal(await page.evaluate(() => window.wallPointer), 'touch');
    const assertCropMatches = async () => {
      const distance = await page.evaluate(() => {
        const center = box => {
          const image = box.querySelector('img').getBoundingClientRect(), bounds = box.getBoundingClientRect();
          return [(bounds.left + box.clientLeft + box.clientWidth / 2 - image.left) / image.width,
                  (bounds.top + box.clientTop + box.clientHeight / 2 - image.top) / image.height];
        };
        const big = center(document.querySelector('.app-wallpaper')), small = center(document.querySelector('#settings-bg-preview'));
        return Math.max(Math.abs(big[0] - small[0]), Math.abs(big[1] - small[1]));
      });
      assert.ok(distance < .006, `relative centers match in preview and screen (difference ${distance})`);
    };
    await assertCropMatches();
    const position = await page.evaluate(() => [ChatApp.currentSettings.background.x, ChatApp.currentSettings.background.y]);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForFunction(() => document.querySelector('#settings-bg-preview').getBoundingClientRect().width / document.querySelector('#settings-bg-preview').getBoundingClientRect().height > 2);
    await assertCropMatches();
    assert.deepEqual(await page.evaluate(() => [ChatApp.currentSettings.background.x, ChatApp.currentSettings.background.y]), position);
    await page.click('#btn-bg-center');
    assert.equal(await page.evaluate(() => ChatApp.currentSettings.background.x), 50);
    await page.click('#btn-bg-reset');
    assert.equal(await page.evaluate(() => ChatApp.currentSettings.background.blur), 0);
    assert.equal(await page.evaluate(() => ChatApp.currentSettings.background.zoom), 1);
    await upload('#888888');
    await page.waitForFunction(() => document.documentElement.style.getPropertyValue('--wallpaper-chroma') === '0%' && wallWork.samples > 0);
    await page.click('#btn-bg-remove');
    assert.equal(await page.locator('.app-wallpaper').count(), 0);
    assert.equal(await page.locator('meta[name=theme-color]').getAttribute('content'), originalChrome);
    assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-has-bg')), false);
    assert.equal(await page.evaluate(() => localStorage.getItem(ChatApp.LS.BG_IMAGE)), null);
    // An old account can have several historical aliases behind the same field.
    // Ordinary changes leave them alone; changing that field retires all its aliases.
    await page.evaluate(async url => {
      await ChatApp.flushCurrentSettingsSave("P1");
      await ChatApp.db.ref("users/P1/settings").set({
        bgImage: url, backgroundImage: url, bgZoom: 1.5, backgroundZoom: 3, backgroundBlur: 6
      });
    }, initial.actual.dataURL);
    await page.waitForFunction(() => ChatApp.currentSettings.background.zoom === 1.5 && ChatApp.currentSettings.background.blur === 6);
    await page.evaluate(async () => {
      ChatApp.updateSettingsState({ autoScroll: false });
      await ChatApp.flushCurrentSettingsSave("P1");
    });
    assert.equal(backend.get('users/P1/settings/bgZoom'), 1.5);
    assert.equal(backend.get('users/P1/settings/bgImage'), initial.actual.dataURL);
    await page.click('#btn-bg-reset');
    await page.evaluate(() => ChatApp.flushCurrentSettingsSave("P1"));
    assert.equal(backend.get('users/P1/settings/backgroundZoom'), null);
    assert.equal(backend.get('users/P1/settings/backgroundBlur'), null);
    assert.equal(backend.get('users/P1/settings/bgZoom'), null);
    assert.equal(backend.get('users/P1/settings/bgImage'), initial.actual.dataURL);
    await page.click('#btn-bg-remove');
    await page.evaluate(() => ChatApp.flushCurrentSettingsSave("P1"));
    assert.equal(backend.get('users/P1/settings/bgImage'), null);
    assert.equal(backend.get('users/P1/settings/backgroundImage'), null);
    const reloaded = await page.evaluate(async () => (await ChatApp.loadSettingsForUser("P1")).background);
    assert.equal(reloaded.dataURL, null);
    assert.equal(reloaded.zoom, 1);
    assert.equal(reloaded.blur, 0);
    assert.deepEqual(errors, []);
    console.log('PASS wallpaper upload, color extraction, legacy settings, coalesced input, no storage/source reassignment while editing, mouse and touch crop precision, rotation, keyboard, cache, sync and removal.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
