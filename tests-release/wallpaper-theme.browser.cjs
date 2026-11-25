'use strict';
/* Exercise the actual image sampler and stylesheets in the signed-in app.
   Compare individual painted properties so an unchanged blue panel cannot pass
   simply because it inherited a different text color. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const firebaseMock = require('../tests/firebase-mock.js');

async function wallpaper(page, hue) {
  await page.evaluate(hue => {
    const canvas = document.createElement('canvas');
    canvas.width = 96; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 96, 64);
    gradient.addColorStop(0, 'hsl(' + hue + ' 70% 29%)');
    gradient.addColorStop(1, 'hsl(' + hue + ' 70% 71%)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 96, 64);
    ChatApp.applyAppBackground({dataURL: canvas.toDataURL()}, {persist:false});
  }, hue);
  await page.waitForFunction(hue => document.documentElement.style.getPropertyValue('--wallpaper-hue') === String(hue), hue);
}

async function paints(page, checks) {
  return page.evaluate(checks => checks.map(([selector, property]) => {
    const el = document.querySelector(selector);
    if (!el) throw Error('Missing ' + selector);
    return getComputedStyle(el)[property];
  }), checks);
}

async function verify(page, checks) {
  await wallpaper(page, 30);
  const warm = await paints(page, checks);
  await wallpaper(page, 210);
  const cool = await paints(page, checks);
  checks.forEach(([selector, property], i) => {
    assert.notEqual(warm[i], cool[i], selector + ' ' + property + ' should change with the image');
    assert(![warm[i],cool[i]].includes('rgba(0, 0, 0, 0)'), selector + ' is expected to paint ' + property);
  });
}

async function closeModal(page) {
  await page.evaluate(() => ChatApp.closeModal());
  await page.waitForFunction(() => ChatApp.modalEl.hidden);
}

(async () => {
  const browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'chrome',headless:true});
  try {
    for (const mobile of [false,true]) {
      const viewport = mobile ? {width:390,height:844} : {width:1440,height:900};
      const context = await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce'});
      await context.addInitScript(firebaseMock);
      await context.route(/^https?:\/\//, route => route.fulfill({status:200, contentType:'application/json', body:'null'}));
      const page = await context.newPage();
      page.setDefaultTimeout(8000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
      await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
      await page.fill('#login-email','vincenzo.brogna@students.pittstonarea.com');
      await page.click('#btn-go-login'); await page.fill('#login-code','TEST-USER'); await page.click('#btn-login');
      await page.waitForFunction(() => ChatApp.currentUser?.code === 'TEST-USER');
      await page.evaluate(() => ChatApp.showLoggedInHome());
      await page.waitForSelector('.home-tool-card', {state:'attached'});
      await verify(page, [['.home-tool-card','backgroundColor'],['.home-card-icon','color']]);

      await page.evaluate(async () => {await ChatApp.openRoom('test',{quiet:true}); ChatApp.closeToast();});
      await page.waitForFunction(() => !ChatApp.bulkLoading);
      await page.evaluate(() => ChatApp.clearAppBackground({persist:false}));
      const send = [['#btn-send','backgroundColor']];
      const original = await paints(page, send);
      await verify(page, [...send,['#composer-row','backgroundImage'],['.chat-main','backgroundColor'],
        ['#room-toolbar','backgroundColor'],['#sidebar-nav-surface','backgroundColor'],
        ['.sidebar-icon-rail','backgroundColor'],['.members-sidebar','backgroundColor'],['#sidebar-tooltip','backgroundColor']]);
      await page.evaluate(() => ChatApp.clearAppBackground({persist:false}));
      assert.deepEqual(await paints(page, send), original, 'removing the image restores the original send button');
      await page.evaluate(() => ChatApp.openRoomSearch());
      await verify(page, [['#room-search-panel','backgroundColor'],['#room-search-filters button b','color']]);
      await page.evaluate(() => ChatApp.closeRoomSearch());

      await page.evaluate(() => { ChatApp.callActive = true; ChatApp.currentCallRoomId = 'test'; ChatApp.openCallMenu(); });
      await page.waitForSelector('#call-menu.is-open');
      await verify(page, [['#call-menu','backgroundColor'],['#call-menu .call-menu-head','color']]);
      await page.evaluate(() => ChatApp.setCallMenuExpanded(true));
      await page.waitForSelector('#call-menu.is-expanded');
      await verify(page, [['#call-menu.is-expanded','backgroundColor']]);
      await page.evaluate(() => { ChatApp.closeCallMenu(); ChatApp.callActive = false; ChatApp.currentCallRoomId = null; });

      await page.evaluate(() => ChatApp.openTimeDisplayModal());
      await page.waitForSelector('.time-display-modal-clock');
      await verify(page, [['.time-display-modal-clock','backgroundImage'],['.time-display-modal-time','color']]);
      await closeModal(page);
      await page.evaluate(() => ChatApp.openUserProfileAt(ChatApp.$('btn-side-settings'),'TEST-USER'));
      await page.waitForSelector('.user-profile-shell', {state:'attached'});
      await verify(page, [['#user-profile-card','backgroundColor']]);
      await page.evaluate(() => ChatApp.closeUserProfile(true));

      await page.evaluate(() => ChatApp.openMusic());
      await page.waitForSelector('.music-screen');
      await verify(page, [['.music-screen','backgroundColor'],['.music-screen-header','backgroundColor'],['#music-bottom-player','backgroundColor']]);
      await page.evaluate(() => ChatApp.closeMusic());
      await page.evaluate(() => ChatApp.openPollMenu({title:'End Jam',anchor:ChatApp.$('btn-music'),bodyHTML:'<p class="poll-confirm-copy">The Jam will end for everyone.</p>',actionsHTML:'<button class="btn primary" data-jam-confirm>End Jam</button>'}));
      await verify(page, [['#poll-popover','backgroundColor'],['[data-jam-confirm]','backgroundColor'],['[data-jam-confirm]','color']]);
      await page.evaluate(() => ChatApp.closePollPopover());

      await page.evaluate(async () => {
        const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 80;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fd102f'; ctx.fillRect(0,0,160,80);
        const file = new File([await new Promise(resolve => canvas.toBlob(resolve))],'Test.png',{type:'image/png'});
        await ChatApp.addPendingFile(file); await ChatApp.openPendingImageEditor(ChatApp.pendingFiles[0]);
      });
      await page.waitForSelector('.image-editor-toolbar');
      await verify(page, [['.image-editor-toolbar','backgroundColor'],['.image-editor-options','backgroundColor'],
        ['.image-editor-color-button','backgroundColor'],['.image-editor-hex-input','backgroundImage']]);
      assert.equal(await page.locator('[data-color-swatch="#ef3737"]').first().evaluate(el => getComputedStyle(el).backgroundColor),'rgb(239, 55, 55)');
      await closeModal(page);

      // These message decorations mount only for particular attachment/receipt data.
      await page.evaluate(() => {
        const row = document.createElement('div');
        row.className = 'msg-row';
        row.innerHTML = '<div class="bubble"><div class="att-gallery"><div class="att-item"><div class="att-file"><div class="att-file-icon"></div></div></div><div class="chat-audio-player"></div></div><span class="message-seen"></span></div>';
        ChatApp.$('messages').append(row);
      });
      await verify(page, [['.att-gallery .att-file','backgroundImage'],['.att-gallery .chat-audio-player','backgroundImage'],['.message-seen','backgroundColor']]);
      assert.deepEqual(errors,[]);
      await context.close();
    }
    console.log('PASS sampled wallpaper colors through chat, Home, controls, media, dialogs, menus, music, calls and editor on desktop and phone layouts.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
