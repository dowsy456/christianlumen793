'use strict';
// Real editor controls and PNG output, with local Firebase and white image
// fixtures. No external accounts, upload endpoints, or OS dialogs are used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const firebaseMock = require('../tests/firebase-mock.js');
const report = path.resolve(__dirname, '../../revision4-editor-report');

async function ready(page) {
  await page.waitForFunction(() => document.getElementById('attachment-image-editor')?.dataset.ready === '1');
  await page.waitForFunction(() => ChatApp.modalEl.classList.contains('is-open'));
}
async function choose(page, tool) {
  await page.locator(`[data-image-tool="${tool}"]`).click();
  await page.waitForFunction(tool => document.querySelector('.image-editor-viewport')?.dataset.tool === tool, tool);
}
async function imagePoint(page, x, y) {
  return page.locator('.image-editor-canvas').evaluate((canvas, point) => {
    const r = canvas.getBoundingClientRect();
    return { x: r.x + r.width * point.x / canvas.width, y: r.y + r.height * point.y / canvas.height };
  }, { x, y });
}
async function clickImage(page, x, y) {
  const p = await imagePoint(page, x, y); await page.mouse.click(p.x, p.y);
}
async function stroke(page, tool, ax, ay, bx, by) {
  await choose(page, tool); const a = await imagePoint(page, ax, ay), b = await imagePoint(page, bx, by);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up();
}
async function color(page, channel, hex) {
  await page.locator(`[data-image-color="${channel}"]`).click();
  const input = page.locator('input[data-color-hex]'); await input.waitFor({ state: 'visible' });
  await input.fill(hex); await input.press('Enter');
  // The picker may remain open for palette exploration; the tool's button is
  // the normal app control for closing it before placing an annotation.
  if (await input.isVisible()) await page.locator(`[data-image-color="${channel}"]`).click();
}
async function save(page) {
  await page.locator('#btn-image-editor-save').click();
  await page.waitForFunction(() => document.querySelector('.image-editor-status')?.textContent.startsWith('Saved'));
}
async function close(page) {
  await page.locator('#btn-modal-close').click(); await page.waitForFunction(() => ChatApp.modalEl.hidden);
}
async function reopen(page) {
  await page.evaluate(() => ChatApp.openPendingImageEditor(ChatApp.pendingFiles[0])); await ready(page);
}
async function freshImage(page, width = 800, height = 600) {
  await page.evaluate(async ({ width, height }) => {
    ChatApp.clearPendingFiles(); ChatApp.closeToast();
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve));
    await ChatApp.addPendingFile(new File([blob], 'Editor fixture.png', { type: 'image/png' }));
    window.__originalAttachment = ChatApp.pendingFiles[0]; window.__paintOperations = [];
    await ChatApp.openPendingImageEditor(ChatApp.pendingFiles[0]);
  }, { width, height });
  await ready(page);
}
async function savedPixels(page, regions) {
  return page.evaluate(async regions => {
    const bitmap = await createImageBitmap(ChatApp.pendingFiles[0].fileObject), canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0); bitmap.close();
    const colors = {};
    for (const [name, r] of Object.entries(regions)) {
      const pixels = ctx.getImageData(r[0], r[1], r[2], r[3]).data;
      const counts = { red: 0, green: 0, blue: 0, purple: 0, magenta: 0, black: 0, nonwhite: 0, opaque: 0 };
      for (let i = 0; i < pixels.length; i += 4) {
        const [red, green, blue, alpha] = pixels.slice(i, i + 4);
        if (alpha === 255) counts.opaque++;
        if (red < 245 || green < 245 || blue < 245) counts.nonwhite++;
        if (red > 150 && green < 100 && blue < 100) counts.red++;
        if (green > 110 && red < 80 && blue < 150) counts.green++;
        if (blue > 180 && red < 100 && green < 160) counts.blue++;
        if (red > 70 && red < 200 && green < 100 && blue > 100) counts.purple++;
        if (red > 190 && green < 80 && blue > 110) counts.magenta++;
        if (red < 60 && green < 60 && blue < 60) counts.black++;
      }
      colors[name] = counts;
    }
    return { width: canvas.width, height: canvas.height, changed: ChatApp.pendingFiles[0] !== __originalAttachment, colors };
  }, regions);
}

(async () => {
  fs.mkdirSync(report, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  try {
    for (const width of [1440, 390, 320]) {
      const mobile = width < 500;
      const context = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile });
      await context.addInitScript(firebaseMock);
      await context.route(/^https?:\/\//, route => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
      const page = await context.newPage(), errors = [], dialogs = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', async dialog => { dialogs.push(dialog.type()); await dialog.dismiss(); });
      await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
      await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
      await page.fill('#login-email', 'vincenzo.brogna@students.pittstonarea.com');
      await page.click('#btn-go-login'); await page.fill('#login-code', 'TEST-USER'); await page.click('#btn-login');
      await page.waitForFunction(() => ChatApp.currentUser?.code === 'TEST-USER');
      await page.evaluate(async () => {
        await ChatApp.openRoom('test', { quiet: true });
        const paint = ChatApp.paintImageEdit;
        ChatApp.paintImageEdit = function (ctx, operation, ...rest) {
          __paintOperations.push(JSON.parse(JSON.stringify(operation))); return paint.call(this, ctx, operation, ...rest);
        };
      });
      await freshImage(page); await choose(page, 'text');
      const size = page.locator('[data-image-size]');
      assert.equal(await size.inputValue(), '32', 'text starts at a readable fitted-image size');
      assert.equal(await size.getAttribute('type'), 'text', 'numeric text control has no native spinner UI');
      assert.equal(await page.locator('#attachment-image-editor input[type="color"]').count(), 0, 'all colors use the app picker');
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.image-editor-options')).opacity === '1');
      const geometry = await page.evaluate(() => {
        const panel = document.querySelector('.image-editor-options').getBoundingClientRect();
        const toolbar = document.querySelector('.image-editor-toolbar').getBoundingClientRect();
        const save = document.getElementById('btn-image-editor-save').getBoundingClientRect();
        const close = document.getElementById('btn-modal-close').getBoundingClientRect();
        const overlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        const controls = [...document.querySelectorAll('.image-editor-toolbar button')].map(b => b.getBoundingClientRect());
        return { panelFits: panel.left >= 0 && panel.right <= innerWidth && panel.bottom <= innerHeight, toolbarFits: toolbar.left >= 0 && toolbar.right <= innerWidth,
          controlsFit: controls.every(r => r.left >= toolbar.left && r.right <= toolbar.right && r.top >= toolbar.top && r.bottom <= toolbar.bottom),
          clearHeader: !overlap(panel, save) && !overlap(panel, close) && !overlap(toolbar, save) && !overlap(toolbar, close),
          panelRight: panel.right, toolbarBottom: toolbar.bottom, panelTop: panel.top };
      });
      assert(geometry.panelFits && geometry.toolbarFits && geometry.controlsFit && geometry.clearHeader, `${width}px chrome fits without covering Save/X: ${JSON.stringify(geometry)}`);
      await size.fill('999'); await size.press('Tab'); assert.equal(await size.inputValue(), '200');
      await size.fill('0'); await size.press('Tab'); assert.equal(await size.inputValue(), '8');
      await size.fill('32'); await size.press('Tab');
      await page.screenshot({ path: path.join(report, `initial-${width}.png`) });
      await page.locator('[data-image-color="color"]').click();
      const picker = page.locator('.image-editor-color-picker'); await picker.waitFor({ state: 'visible' });
      const pickerBox = await picker.boundingBox(); assert(pickerBox.x >= 0 && pickerBox.x + pickerBox.width <= width && pickerBox.y + pickerBox.height <= (mobile ? 844 : 900), 'expanded custom picker fits');
      assert.equal(await picker.locator('[data-color-spectrum]').getAttribute('role'), 'slider');
      assert.equal(await picker.locator('input[data-color-hue]').getAttribute('type'), 'range');
      assert(await picker.locator('[data-color-swatch]').count() >= 6, 'color palette supplies quick selections');
      // Browser pseudo-style introspection can report the input's background
      // instead of its range track. Verify rendered pixels so global slider
      // rules cannot silently replace the rainbow with a plain app slider.
      const huePng = await picker.locator('input[data-color-hue]').screenshot();
      const rainbow = await page.evaluate(async data => {
        const image = await createImageBitmap(await (await fetch(data)).blob()), c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
        const ctx = c.getContext('2d'); ctx.drawImage(image, 0, 0); image.close(); const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
        const colors = { red: 0, green: 0, blue: 0 };
        for (let i = 0; i < pixels.length; i += 4) { const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2]; if (r > 160 && g < 100 && b < 100) colors.red++; if (g > 160 && r < 100 && b < 100) colors.green++; if (b > 160 && r < 100 && g < 100) colors.blue++; }
        return colors;
      }, 'data:image/png;base64,' + huePng.toString('base64'));
      assert(rainbow.red > 10 && rainbow.green > 10 && rainbow.blue > 10, `hue track visibly contains a rainbow: ${JSON.stringify(rainbow)}`);
      const hexBefore = await picker.locator('[data-color-hex]').inputValue();
      await picker.locator('[data-color-spectrum]').focus(); await picker.locator('[data-color-spectrum]').press('ArrowLeft');
      assert.notEqual(await picker.locator('[data-color-hex]').inputValue(), hexBefore, 'custom spectrum is keyboard operable');
      await picker.locator('[data-color-hex]').fill('#ef3737'); await picker.locator('[data-color-hex]').press('Enter');
      await page.screenshot({ path: path.join(report, `options-${width}.png`) });
      await page.locator('[data-image-color="color"]').click();

      if (!mobile) {
        await clickImage(page, 80, 100);
        const entry = page.locator('.image-editor-text-entry'); await entry.fill('DEFAULT');
        await entry.press('Control+Enter'); await entry.waitFor({ state: 'detached' });
        await size.fill('20'); await size.press('Tab');
        await color(page, 'color', '#18b64a'); await color(page, 'strokeColor', '#9933cc');
        await clickImage(page, 100, 250); await entry.fill('COLOR'); await entry.press('Control+Enter');
        await color(page, 'color', '#ff8800'); // prior operations must keep their own colors
        await choose(page, 'arrow'); await color(page, 'color', '#3366ff'); await color(page, 'strokeColor', '#000000');
        await stroke(page, 'arrow', 420, 100, 650, 180);
        await choose(page, 'pen'); await color(page, 'color', '#ff00aa');
        await stroke(page, 'pen', 430, 330, 650, 400);
        await page.locator('[data-image-action="undo"]').click();
        await page.locator('[data-image-action="redo"]').click();
        const ops = await page.evaluate(() => __paintOperations);
        assert(ops.some(op => op.tool === 'text' && op.text === 'DEFAULT' && op.style.size === 32), 'default text operation retains its size');
        assert(ops.some(op => op.tool === 'text' && op.text === 'COLOR' && op.style.color.toLowerCase() === '#18b64a' && op.style.strokeColor.toLowerCase() === '#9933cc'), 'text operation stores its chosen colors');
        await page.screenshot({ path: path.join(report, 'annotations-desktop.png') });
        await save(page);
        const saved = await savedPixels(page, { defaultText: [60, 80, 180, 80], coloredText: [80, 230, 230, 90], arrow: [400, 80, 280, 130], pen: [410, 310, 270, 120] });
        assert.equal(saved.changed, true); assert.equal(saved.width, 800); assert.equal(saved.height, 600);
        assert(saved.colors.defaultText.red > 15 && saved.colors.defaultText.black > 5, 'default text has real red fill and dark outline pixels');
        assert(saved.colors.coloredText.green > 50 && saved.colors.coloredText.purple > 15, 'text has saved custom fill and outline');
        assert(saved.colors.arrow.blue > 50 && saved.colors.arrow.black > 30, 'arrow has saved custom color and black outline');
        assert(saved.colors.pen.magenta > 50, 'freehand uses its chosen color');
        await close(page); await freshImage(page);

        // Crop changes the output origin. Zoom changes the display transform,
        // but the text anchor must remain in the original image coordinates.
        await stroke(page, 'crop', 100, 100, 700, 500);
        const cropped = await page.locator('.image-editor-canvas').evaluate(c => ({ w: c.width, h: c.height }));
        assert(Math.abs(cropped.w - 600) <= 2 && Math.abs(cropped.h - 400) <= 2);
        await choose(page, 'text');
        const zoomAt = await imagePoint(page, 150, 150); await page.mouse.move(zoomAt.x, zoomAt.y); await page.mouse.wheel(0, -300);
        await page.waitForFunction(() => parseInt(document.querySelector('[data-media-zoom="percent"]').textContent) > 140);
        await clickImage(page, 150, 150); await page.locator('.image-editor-text-entry').fill('PENDING');
        await page.locator('.image-editor-text-entry').press('Control+z');
        assert.equal(await page.locator('.image-editor-canvas').evaluate(c => c.width), cropped.w, 'typing undo does not undo the image crop');
        await page.locator('.image-editor-text-entry').fill('PENDING');
        await save(page); // pending text is committed by Save without Enter
        const position = await page.evaluate(() => __paintOperations.filter(op => op.tool === 'text' && op.text === 'PENDING').at(-1));
        assert(Math.abs(position.a.x - 250) < 3 && Math.abs(position.a.y - 250) < 3, `crop/zoom text maps to source pixels: ${JSON.stringify(position.a)}`);
        const croppedSaved = await savedPixels(page, { placed: [140, 135, 180, 65], empty: [0, 0, 70, 70] });
        assert(Math.abs(croppedSaved.width - 600) <= 2 && Math.abs(croppedSaved.height - 400) <= 2);
        assert(croppedSaved.colors.placed.red > 10 && croppedSaved.colors.empty.nonwhite === 0, 'saved cropped text appears only at its clicked image location');
        await close(page); await freshImage(page, 4000, 3000); await choose(page, 'text');
        assert.equal(await page.locator('.image-editor-canvas').evaluate(c => c.width), 1920, 'large image uses a reduced preview');
        await page.locator('[data-image-size]').fill('32.5'); await page.locator('[data-image-size]').press('Tab');
        await clickImage(page, 480, 720); await page.locator('.image-editor-text-entry').fill('LARGE'); await save(page);
        const largeOp = await page.evaluate(() => __paintOperations.filter(op => op.tool === 'text' && op.text === 'LARGE').at(-1));
        assert(Math.abs(largeOp.a.x - 1000) < 4 && Math.abs(largeOp.a.y - 1500) < 4, 'downsampled preview maps text back to full-resolution pixels');
        assert.equal(largeOp.style.size, 32.5, 'plain decimal sizes remain consistent between panel and output');
        const fitScale=await page.locator('.image-editor-canvas').evaluate(c=>c.getBoundingClientRect().width/4000);
        assert(Math.abs(largeOp.style.size*largeOp.style.unitScale*fitScale-32.5)<0.1,'large photo fit '+JSON.stringify({style:largeOp.style,fitScale,actual:largeOp.style.size*largeOp.style.unitScale*fitScale}));
        const largeSaved = await savedPixels(page, { text: [990, 1490, 500, 200] });
        assert.equal(largeSaved.width, 4000); assert.equal(largeSaved.height, 3000);
        assert(largeSaved.colors.text.red > 10 && largeSaved.colors.text.black > 5, 'large-image Save retains text and outline at original resolution');
        await close(page); await freshImage(page);
      }

      // Esc cancels only the text entry. Closing the viewer without Save then
      // preserves the exact original pending attachment and releases UI nodes.
      await choose(page, 'text'); await clickImage(page, 790, 590);
      await page.locator('.image-editor-text-entry').fill('Edge text stays reachable\n'.repeat(30));
      const edge = await page.evaluate(() => {
        const entry = document.querySelector('.image-editor-text-entry'), r = entry.getBoundingClientRect(), v = document.querySelector('.image-editor-viewport').getBoundingClientRect();
        return { fits: r.left >= v.left && r.right <= v.right && r.top >= v.top && r.bottom <= v.bottom, scrollable: entry.scrollHeight > entry.clientHeight, height: r.height };
      });
      assert(edge.fits && edge.scrollable && edge.height <= 242, `long text entry near image edge stays reachable at ${width}px: ${JSON.stringify(edge)}`);
      const edgeEntry = page.locator('.image-editor-text-entry'), zoomBeforeScroll = await page.locator('[data-media-zoom="percent"]').textContent();
      await edgeEntry.press('Control+Home'); await edgeEntry.hover();
      await page.mouse.wheel(0, 150);
      await page.waitForFunction(() => document.querySelector('.image-editor-text-entry').scrollTop > 30);
      assert.equal(await page.locator('[data-media-zoom="percent"]').textContent(), zoomBeforeScroll, 'scrolling multiline text does not zoom the image');
      if (mobile) {
        await edgeEntry.focus(); await edgeEntry.press('Control+Home');
        const box = await edgeEntry.boundingBox(), cdp = await context.newCDPSession(page), x = box.x + box.width / 2, y = box.y + box.height - 25;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
        for (let i = 1; i <= 8; i++) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - i * 16, id: 1 }] });
          await page.waitForTimeout(16);
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach();
        await page.waitForFunction(() => document.querySelector('.image-editor-text-entry').scrollTop > 30);
        assert.equal(await page.locator('[data-media-zoom="percent"]').textContent(), zoomBeforeScroll, 'touch scrolling multiline text does not trigger canvas zoom');
      }
      await page.locator('.image-editor-text-entry').press('Control+Enter');
      const edgeAnchor = await page.evaluate(() => __paintOperations.filter(op => op.tool === 'text' && op.text.startsWith('Edge text')).at(-1)?.a);
      assert(Math.abs(edgeAnchor.x - 790) < 4 && Math.abs(edgeAnchor.y - 590) < 4, 'clamping the typing box never moves the image annotation anchor');
      await choose(page, 'text'); await clickImage(page, 130, 360);
      await page.locator('.image-editor-text-entry').fill('Discard this');
      await page.locator('.image-editor-text-entry').press('Escape');
      assert.equal(await page.locator('.image-editor-text-entry').count(), 0);
      assert.equal(await page.locator('#attachment-image-editor').isVisible(), true, 'Escape in text does not close the viewer');
      await clickImage(page, 130, 360); await page.locator('.image-editor-text-entry').fill('Unsaved text');
      assert.equal(await page.locator('.image-editor-text-entry').evaluate(el=>Math.round(parseFloat(getComputedStyle(el).fontSize))),32,'typing preview uses chosen readable size even on phones');
      await page.screenshot({ path: path.join(report, `text-${width}.png`) });
      await close(page);
      assert.equal(await page.evaluate(() => ChatApp.pendingFiles[0] === __originalAttachment), true);
      assert.equal(await page.locator('.image-editor-options, .image-editor-color-picker, .image-editor-text-entry, #btn-image-editor-save').count(), 0, 'closing disposes panel and entry nodes');
      await reopen(page); await choose(page, 'text'); assert.equal(await page.locator('.image-editor-options').count(), 1, 'reopening creates one panel');
      await choose(page, 'crop');
      const closingFocus = await page.evaluate(() => ({ inert: document.querySelector('.image-editor-options').inert, panelFocusable: ChatApp.getModalFocusableElements().some(el => el.closest('.image-editor-options')) }));
      assert.deepEqual(closingFocus, { inert: true, panelFocusable: false }, 'exiting options become inert and leave the focus trap immediately');
      await page.waitForFunction(() => { const el = document.querySelector('.image-editor-options'); return !el || el.hidden || getComputedStyle(el).visibility === 'hidden' || getComputedStyle(el).opacity === '0'; });
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => !!document.activeElement.closest('.image-editor-options')), false, 'Tab never enters a closed options panel');
        assert.equal(await page.evaluate(() => ChatApp.modalCard.contains(document.activeElement)), true, 'Tab stays within the viewer');
      }
      await choose(page, 'text'); await page.waitForFunction(() => getComputedStyle(document.querySelector('.image-editor-options')).opacity === '1');
      await close(page);
      assert.deepEqual(errors, [], `${width}px produces no unhandled errors`); assert.deepEqual(dialogs, [], 'no native prompt or color dialog');
      await context.close(); console.log(`PASS ${width}px editor: text, themed picker, size bounds, safe typing, layout, cancellation and panel lifecycle.`);
    }
    console.log('PASS saved text/outline/arrow/draw pixels, style snapshots, pending-text Save, undo/redo and crop/zoom coordinates.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
