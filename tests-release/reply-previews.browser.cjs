'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const fixture = require('../tests/room-loading-fixture.cjs');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.argv[2] || path.join(root, '../reply-preview-results'));
(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(fixture, { count: 8, latencyMs: 10 });
    await context.route(/^https?:\/\//, r => r.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
    await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
    await page.fill('#login-email', 'vincenzo.brogna@students.pittstonarea.com');
    await page.click('#btn-go-login');
    await page.fill('#login-code', 'TEST-USER');
    await page.click('#btn-login');
    await page.waitForFunction(() => ChatApp.currentUser?.code === 'TEST-USER' && ChatApp.membershipMap.has('test'));
    await page.evaluate(() => ChatApp.openRoom('test', { quiet: true }));
    await page.waitForFunction(() => !ChatApp.msgInitialTailPending && !ChatApp.bulkLoading && !ChatApp.roomLoadingActive);
    await page.evaluate(async () => {
      ChatApp.closeToast();
      await __roomLoadFixture.ref('messages/test/k00000007/text').set('**Bold** and *italic* and ***both*** <img src=x onerror=alert(1)>');
      ChatApp.setReplyState({ key: 'k00000007', userCode: 'TEST-USER', username: 'Tester' });
    });
    await page.waitForSelector('#reply-bar-message strong');
    assert.equal(await page.locator('#reply-bar-message strong').first().textContent(), 'Bold');
    assert.equal(await page.locator('#reply-bar-message em').first().textContent(), 'italic');
    assert.equal(await page.locator('#reply-bar-message strong em').textContent(), 'both');
    assert.equal(await page.locator('#reply-bar-message img').count(), 0);
    await page.fill('#msg-input', 'Formatted reply'); await page.click('#btn-send');
    await page.waitForSelector('.reply-preview-snippet strong');
    assert.equal(await page.locator('.reply-preview-snippet strong').first().textContent(), 'Bold');
    assert.equal(await page.locator('.reply-preview-snippet em').first().textContent(), 'italic');
    assert.equal(await page.locator('.reply-preview-snippet a, .reply-preview-snippet button, .reply-preview-snippet img').count(), 0);
    // A fallback reply still formats before an older target is hydrated.
    const fallback = await page.evaluate(() => {
      const target = { text: '**' + 'Long bold text '.repeat(35).trimEnd() + '** and *italic*' };
      const source = ChatApp.getReplyTargetPreviewText(target);
      const host = document.createElement('div');
      const row = ChatApp.appendMessageRow({ _key: 'preview-fixture', userCode: 'TEST-USER', username: 'Tester', text: 'Reply', createdAt: Date.now(), replyTo: { key: 'missing', username: 'Tester', previewText: source } }, { preview: true, target: host });
      const snippet = row.querySelector('.reply-preview-snippet');
      return { saved: source, bold: snippet.querySelector('strong')?.textContent, italic: snippet.querySelector('em')?.textContent };
    });
    assert(fallback.saved.length > 240);
    assert.equal(fallback.bold, 'Long bold text '.repeat(35).trimEnd());
    assert.equal(fallback.italic, 'italic');
    await page.evaluate(async () => {
      const ref = __roomLoadFixture.ref('messages/test/k00000006');
      const msg = (await ref.once('value')).val();
      await ref.set({ ...msg, text: '', poll: { question: 'Lunch on Friday?', options: [{id:'yes',text:'Yes'},{id:'no',text:'No'}], votes:{} } });
    });
    await page.waitForFunction(()=>!ChatApp.replyState && ChatApp.getReplyTargetMessage('k00000006')?.poll?.question);
    await page.evaluate(()=>{
      ChatApp.setReplyState({key:'k00000006',userCode:'TEST-USER',username:'Tester'});
    });
    const pollPreview = 'Poll: Lunch on Friday?';
    await page.waitForFunction(text => document.querySelector('#reply-bar-message').textContent === text, pollPreview);
    await page.fill('#msg-input','Reply to poll'); await page.click('#btn-send');
    await page.waitForFunction(text => [...document.querySelectorAll('.reply-preview-snippet')].some(el => el.textContent === text), pollPreview);
    const legacy = await page.evaluate(() => {
      const target = ChatApp.getReplyTargetMessage('k00000006');
      const rendered = (source, previewText) => ChatApp.appendMessageRow({ _key:'reply-poll-fixture',text:'Reply',userCode:'TEST-USER',createdAt:Date.now(),
        replyTo:{key:'k00000006',username:'Tester',previewText} },{preview:true,target:document.createElement('div'),replyTargetMessage:source}).querySelector('.reply-preview-snippet').textContent;
      return [rendered(target, 'Original message'), rendered(null, ChatApp.getReplyTargetPreviewText(target))];
    });
    assert.deepEqual(legacy, [pollPreview,pollPreview]);
    const votes = page.locator('[data-msgkey="k00000006"] .poll-view-votes').first();
    await votes.hover();
    await page.waitForFunction(() => {
      const s=getComputedStyle(document.querySelector('[data-msgkey="k00000006"] .poll-view-votes'));
      return s.textShadow !== 'none' && s.textDecorationLine === 'none' && s.backgroundColor === 'rgba(0, 0, 0, 0)';
    });
    const long = await page.evaluate(() => {
      const text = '**' + 'B'.repeat(5000) + '**';
      const source = ChatApp.getReplyTargetPreviewText({ text });
      return { source, live: ChatApp.formatReplyPreview(text), saved: ChatApp.formatReplyPreview(source) };
    });
    assert(long.source.length < 1100);
    assert.match(long.live, /^<strong>B+…<\/strong>$/);
    assert.match(long.saved, /^<strong>B+…<\/strong>$/);
    await page.evaluate(async () => {
      const epoch = Date.now() + 1000;
      await __roomLoadFixture.ref('messages/test/k00000007/pinned').set(true);
      await __roomLoadFixture.ref('rooms/test/messagesClearedAt').set(epoch);
      ChatApp.syncRetainedPinsSeparator();
    });
    await page.waitForSelector('.retained-pins-divider');
    const label = page.locator('.retained-pins-divider');
    assert.equal(await label.evaluate(el => getComputedStyle(el).userSelect), 'none');
    assert.equal(await label.locator('span').evaluate(el => getComputedStyle(el).userSelect), 'none');
    // Move away from the live tail before dragging the retained pin divider.
    const messages = page.locator('#messages');
    await messages.hover();
    await page.mouse.wheel(0, -1000);
    await label.locator('span').hover();
    await page.waitForFunction(() => {
      const el = document.querySelector('.retained-pins-divider span');
      const rect = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    });
    await page.evaluate(() => getSelection().removeAllRanges());
    const box = await label.locator('span').boundingBox();
    await page.mouse.move(box.x + 2, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 15 }); await page.mouse.up();
    assert.equal(await page.evaluate(() => getSelection().toString()), '');
    await page.screenshot({ path: path.join(output, 'reply-previews.png') });
    assert.deepEqual(errors, []);
    console.log('PASS: composer and sent reply emphasis, nested formatting, safe HTML, long saved fallback, poll replies and vote glow, and nonselectable pinned label.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
