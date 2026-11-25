'use strict';
const assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const { trayModel } = require('../desktop/tray.cjs'), { EXTRA_ICON_DATA } = require('../desktop/taskbar.cjs');
(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  const qa = path.resolve(__dirname, '../../native-menu-qa'); await fs.mkdir(qa, { recursive: true });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 520 } }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { window.chatTray = { onState: fn => window.__state = fn, command: value => { window.__command = value; return Promise.resolve(true); } }; });
    await page.goto(pathToFileURL(path.resolve(__dirname, '../desktop/ui/tray.html')).href);
    await page.evaluate(value => __state(value), { ...trayModel({ active: true, roomId: 'room', sessionId: 'session', roomName: 'Study Group · Evening call', controls: { sharing: true } }), extraIcons: EXTRA_ICON_DATA });
    assert.equal(await page.getByRole('button', { name: 'Stop Sharing', exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Mute', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => __command), { action: 'mute', roomId: 'room', sessionId: 'session' });
    assert.equal(await page.locator('#music').isVisible(), false, 'this call has no active Music player');
    const callButtons = page.locator('#controls button:visible, footer button:visible');
    assert.equal(await callButtons.count(), 9, 'seven call controls plus Open and Quit');
    const nativeImages = page.locator('header img:visible, #controls img:visible');
    assert.equal(await nativeImages.count(), 7, 'the logo and six image-backed call controls are present');
    await nativeImages.evaluateAll(images => Promise.all(images.map(image => image.decode())));
    assert.ok(await nativeImages.evaluateAll(images => images.every(image => image.naturalWidth > 0)), 'visible native icons decoded');
    assert.equal(await page.evaluate(() => document.querySelector('main').scrollHeight <= document.querySelector('main').clientHeight), true, 'menu fits without clipped controls');
    assert.equal(await callButtons.evaluateAll(buttons => buttons.every(button => { const icon=button.querySelector('svg,img'),r=button.getBoundingClientRect(),i=icon?.getBoundingClientRect();return !!i&&Math.abs((i.top+i.bottom-r.top-r.bottom)/2)<.1&&i.width===21&&i.height===21; })),true,'visible call and footer buttons have centered 21px icons');
    await page.screenshot({ path: path.join(qa, 'tray-menu.png'), omitBackground: true });
    await page.evaluate(value => __state(value), { ...trayModel({active:false}), extraIcons: EXTRA_ICON_DATA });
    assert.equal(await page.locator('#status').isVisible(),false,'idle status label is removed');
    assert.equal(await page.getByText('Running in the background').count(),0);
    assert.equal(await page.locator('footer button svg').count(),2,'footer uses centered SVG icons instead of baseline-dependent text glyphs');
    await page.screenshot({ path: path.join(qa, 'tray-idle.png'), omitBackground: true });
    const pings = await browser.newPage({ viewport: { width: 350, height: 430 } });
    pings.on('pageerror', error => errors.push(error.message));
    await pings.addInitScript(() => {
      window.ringPopup = {
        mode: 'pings',
        onState: render => { window.__state = snapshot => { window.__snapshot = snapshot; render(snapshot); }; },
        command: value => {
          window.__command = value;
          const snapshot = window.__snapshot;
          window.__state({ ...snapshot, earlier: snapshot.earlier.filter(item => item.id !== value.id) });
          return Promise.resolve(true);
        },
      };
    });
    await pings.goto(pathToFileURL(path.resolve(__dirname, '../desktop/ui/rings.html')).href);
    await pings.evaluate(() => __state({ pings: [{ id: 'new', roomId: 'r', messageKey: 'new-key', roomName: 'Study group', username: 'Alex', preview: 'Latest mention' }], earlier: Array.from({ length: 9 }, (_, i) => ({ id: 'old-' + i, roomId: 'r', messageKey: 'key-' + i, roomName: 'Study group', username: 'Sam', preview: 'Earlier mention ' + i })) }));
    await pings.getByRole('button', { name: '+9 earlier mentions', exact: true }).click();
    await pings.locator('.earlier-open-message').last().click();
    assert.deepEqual(await pings.evaluate(() => __command), { action: 'open', id: 'old-0', roomId: 'r', messageKey: 'key-0' });
    assert.equal(await pings.locator('.earlier-open-message').count(), 8);
    assert.equal(await pings.getByRole('button', { name: '+8 earlier mentions', exact: true }).getAttribute('aria-expanded'), 'true');
    assert.equal(await pings.locator('.ring.ping').isVisible(), false);
    await pings.screenshot({ path: path.join(qa, 'earlier-mentions.png'), omitBackground: true });
    await pings.locator('.earlier-dismiss').first().click();
    assert.deepEqual(await pings.evaluate(() => __command), { action: 'dismiss', id: 'old-8', roomId: 'r', messageKey: 'key-8' });
    await pings.getByRole('button', { name: '+7 earlier mentions', exact: true }).click();
    assert.equal(await pings.locator('.earlier-list').isVisible(), false);
    assert.equal(await pings.locator('.ring.ping').isVisible(), true, 'collapsing retained mentions restores the current card');
    assert.deepEqual(errors, []); console.log('Native tray and earlier mention renderer checks passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
