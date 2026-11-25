'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const mock = require('../tests/firebase-mock.js');
const review = path.resolve(__dirname, '../../home-review');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, timezoneId: 'America/New_York' });
    await context.addInitScript(mock);
    await context.route(/^https?:\/\//, route => route.fulfill({ status: 200, body: 'null', contentType: 'application/json' }));
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
    await page.evaluate(async () => {
      const original = ChatApp.db.ref.bind(ChatApp.db);
      window.homePollBindings = new Map();
      window.homePollOnceReads = [];
      ChatApp.db.ref = function (name = '') {
        const ref = original(name);
        if (/^activePolls\//.test(name) || /^messages\/[^/]+\/[^/]+\/poll$/.test(name)) {
          const on = ref.on, off = ref.off, once = ref.once;
          ref.on = function (event, callback, cancel) {
            if (!homePollBindings.has(name)) homePollBindings.set(name, new Set());
            homePollBindings.get(name).add(callback);
            return on.call(this, event, callback, cancel);
          };
          ref.off = function (event, callback) {
            if (callback) homePollBindings.get(name)?.delete(callback);
            else homePollBindings.get(name)?.clear();
            return off.call(this, event, callback);
          };
          ref.once = function (...args) { homePollOnceReads.push(name); return once.apply(this, args); };
        }
        return ref;
      };
      const d = __testDatabase, today = ChatApp.calendarDateKey(), future = new Date();
      future.setDate(future.getDate() + 1);
      const tomorrow = ChatApp.calendarDateKey(future);
      window.homeFixture = { today, tomorrow, year: today.slice(0, 4) };
      const notes = {}, futureNotes = {}, reminders = {}, messages = {}, polls = {};
      for (let i = 0; i < 18; i++) {
        notes['note' + i] = { text: `Today note ${i}`, createdAt: Date.now() + i };
        futureNotes['reminder' + i] = { text: `Reminder ${i}`, createdAt: Date.now() + i };
        reminders['reminder' + i] = { noteId: 'reminder' + i, createdAt: Date.now() + i };
        messages['message' + i] = { t: 'text', text: `Read https://example.com/guide-${i}`, userCode: 'TEST-USER', username: 'Tester', createdAt: Date.now() + i };
        messages['poll' + i] = { t: 'text', text: '', userCode: 'TEST-USER', username: 'Tester', createdAt: Date.now() + i + 20,
          poll: { question: `Poll ${i}`, options: [{ id: 'a0', text: 'Monday' }, { id: 'a1', text: 'Tuesday' }], endsAt: Date.now() + 3600000 + i } };
        polls['poll' + i] = { endsAt: messages['poll' + i].poll.endsAt };
      }
      await d.ref(`calendar/years/${homeFixture.year}/${today}`).set(notes);
      await d.ref(`calendar/years/${homeFixture.year}/${tomorrow}`).set(futureNotes);
      await d.ref(`calendarReminders/TEST-USER/${tomorrow}`).set(reminders);
      await d.ref('messages/test').set(messages);
      await d.ref('activePolls/test').set(polls);
      await d.ref('rooms/locked').set({ name: 'Locked Room', private: true, password: 'secret', createdBy: 'OTHER' });
      await d.ref('messages/locked/leak').set({ text: 'https://private.example.com/', createdAt: Date.now() });
      await d.ref('activePolls/locked/leak').set({ endsAt: Date.now() + 3600000 });
    });
    await page.fill('#login-email', 'vincenzo.brogna@students.pittstonarea.com');
    await page.click('#btn-go-login');
    await page.fill('#login-code', 'TEST-USER');
    await page.click('#btn-login');
    await page.waitForFunction(() => ChatApp.currentUser?.code === 'TEST-USER' && ChatApp.homeDashboardState?.pollStatus === 'ready');
    await page.evaluate(() => ChatApp.closeToast());
    await page.waitForFunction(() => document.querySelectorAll('#home-links-items a').length === 18);
    assert.equal(await page.locator('#home-polls-refresh,.home-pager,[data-home-page],#home-new-room,.home-room-row').count(), 0);
    assert.deepEqual(await page.locator('.home-card-title h2').allTextContents(), ['Today', 'Reminders', 'Open Polls', 'Recent Links']);
    assert.equal(await page.locator('.home-card-kicker').count(), 0);
    assert.equal(await page.locator('#home-search').getAttribute('placeholder'), 'Search links across your rooms');
    assert(!(await page.locator('.home-dashboard').innerText()).includes('private.example.com'));
    assert.deepEqual(await page.evaluate(() => homePollOnceReads), [], 'Home uses live poll subscriptions, no refresh reads');
    assert.equal(await page.evaluate(() => [...homePollBindings.keys()].some(key => key.includes('/locked'))), false);

    // Every poll change is observed without a refresh button, navigation, or interval.
    await page.evaluate(() => __testDatabase.ref('messages/test/poll0/poll/question').set('Live edited question'));
    await page.waitForFunction(() => document.querySelector('[data-home-poll="poll0"]')?.textContent.includes('Live edited question'));
    await page.evaluate(() => __testDatabase.ref('messages/test/poll0/poll/votes/TEST-USER').set({ options: ['a1'] }));
    await page.waitForFunction(() => !document.querySelector('[data-home-poll="poll0"]'));
    await page.click('[data-home-poll-filter="all"]');
    await page.waitForFunction(() => document.querySelector('[data-home-poll="poll0"]')?.textContent.includes('Voted'));
    await page.evaluate(async () => {
      const poll = { question: 'Brand new poll', options: [{ id: 'a0', text: 'Yes' }], endsAt: Date.now() + 3600000 };
      await __testDatabase.ref('messages/test/added').set({ t: 'text', text: '', createdAt: Date.now(), userCode: 'TEST-USER', poll });
      await __testDatabase.ref('activePolls/test/added').set({ endsAt: poll.endsAt });
    });
    await page.waitForFunction(() => !!document.querySelector('[data-home-poll="added"]'));
    await page.evaluate(() => __testDatabase.ref('activePolls/test/added').remove());
    await page.waitForFunction(() => !document.querySelector('[data-home-poll="added"]'));
    assert.equal(await page.evaluate(() => homePollBindings.get('messages/test/added/poll')?.size), 0);
    await page.evaluate(() => __testDatabase.ref('messages/test/poll1').remove());
    await page.waitForFunction(() => !document.querySelector('[data-home-poll="poll1"]'));
    await page.evaluate(() => __testDatabase.ref('messages/test/poll2/poll/endsAt').set(ChatApp.pollNow() + 250));
    await page.waitForFunction(() => !document.querySelector('[data-home-poll="poll2"]'), null, { timeout: 2000 });
    await page.evaluate(() => __testDatabase.ref('messages/test/poll2/poll/endsAt').set(ChatApp.pollNow() + 3600000));
    await page.waitForFunction(() => !!document.querySelector('[data-home-poll="poll2"]'));

    // Card scroll positions survive unrelated renders and live edits.
    const before = await page.evaluate(() => {
      for (const type of ['today', 'reminders', 'polls', 'links']) document.getElementById(`home-${type}-items`).scrollTop = 165;
      return ['today', 'reminders', 'polls', 'links'].map(type => document.getElementById(`home-${type}-items`).scrollTop);
    });
    assert(before.every(top => top > 0));
    await page.evaluate(() => __testDatabase.ref(`calendar/years/${homeFixture.year}/${homeFixture.today}/note7/text`).set('A live note edit'));
    await page.waitForFunction(() => document.querySelector('#home-today-items').textContent.includes('A live note edit'));
    assert.deepEqual(await page.evaluate(() => ['today', 'reminders', 'polls', 'links'].map(type => document.getElementById(`home-${type}-items`).scrollTop)), before);
    await page.locator('[data-home-poll="poll5"]').focus();
    await page.evaluate(() => __testDatabase.ref('messages/test/poll5/poll/question').set('Focused poll edited'));
    await page.waitForFunction(() => document.activeElement?.dataset.homePoll === 'poll5' && document.activeElement.textContent.includes('Focused poll edited'));

    const cursor = await page.evaluate(() => ({ title: getComputedStyle(document.querySelector('.home-card-title h2')).cursor,
      titleSelection: getComputedStyle(document.querySelector('.home-card-title h2')).userSelect,
      row: getComputedStyle(document.querySelector('.home-note-row strong')).cursor,
      input: getComputedStyle(document.querySelector('#home-search')).cursor,
      inputSelection: getComputedStyle(document.querySelector('#home-search')).userSelect }));
    assert.deepEqual(cursor, { title: 'default', titleSelection: 'none', row: 'pointer', input: 'text', inputSelection: 'text' });
    fs.mkdirSync(review, { recursive: true });
    const sizes = [{ width: 1918, height: 866 }, { width: 1366, height: 768 }, { width: 1024, height: 600 }, { width: 720, height: 460 }, { width: 390, height: 844 }, { width: 390, height: 500 }, { width: 740, height: 390 }, { width: 390, height: 320 }];
    for (const size of sizes) {
      await page.setViewportSize(size); await page.waitForTimeout(120);
      for (const tab of ['today', 'reminders', 'polls', 'links']) {
        if (await page.locator(`[data-home-tab="${tab}"]`).isVisible()) await page.locator(`[data-home-tab="${tab}"]`).click();
        const fit = await page.evaluate(type => {
          const m = ChatApp.messagesEl, dash = document.querySelector('.home-dashboard'), list = document.getElementById(`home-${type}-items`);
          list.scrollTop = list.scrollHeight;
          const listRect = list.getBoundingClientRect(), card = list.closest('.home-tool-card').getBoundingClientRect();
          return { outer: m.scrollHeight - m.clientHeight, horizontal: document.documentElement.scrollWidth - innerWidth,
            bottom: dash.getBoundingClientRect().bottom, viewport: innerHeight, cardBottom: card.bottom, listBottom: listRect.bottom,
            overflow: getComputedStyle(list).overflowY, listHeight: list.clientHeight, scrollTop: list.scrollTop,
            finalVisible: list.lastElementChild.getBoundingClientRect().bottom <= listRect.bottom + 1 };
        }, tab);
        assert(fit.outer <= 1 && fit.horizontal <= 1 && fit.bottom <= fit.viewport + 1, JSON.stringify({ size, tab, fit }));
        assert(fit.listHeight > 24 && fit.listBottom <= fit.cardBottom + 1 && fit.overflow === 'auto' && fit.scrollTop > 0 && fit.finalVisible, JSON.stringify({ size, tab, fit }));
      }
      if (size.width === 390 && size.height === 844) {
        await page.click('[data-home-tab="today"]'); await page.evaluate(() => document.querySelector('#home-today-items').scrollTop = 0);
        await page.screenshot({ path: path.join(review, 'home-mobile.png') });
      }
    }
    await page.setViewportSize({ width: 1600, height: 900 }); await page.waitForTimeout(120);
    await page.evaluate(() => document.querySelectorAll('.home-card-list').forEach(list => list.scrollTop = 0));
    await page.screenshot({ path: path.join(review, 'home-desktop.png') });
    await page.fill('#home-search', 'guide-17'); assert.equal(await page.locator('#home-links-items a').count(), 1); await page.fill('#home-search', '');
    await page.evaluate(() => __testDatabase.ref('messages/test/message0/text').set('Only https://changed.example.net now'));
    await page.waitForFunction(() => document.querySelector('#home-links-items').textContent.includes('changed.example.net'));

    // Polls navigate to the real room message and release all Home listeners.
    await page.locator('[data-home-poll="poll3"]').click();
    await page.waitForFunction(() => ChatApp.currentRoomId === 'test' && ChatApp.msgDataByKey.has('poll3') && !ChatApp.homeDashboardState);
    await page.waitForFunction(() => ChatApp.messageJumpHighlight?.bubble?.closest('[data-msgkey]')?.dataset.msgkey === 'poll3', null, { timeout: 3000 });
    assert.equal(await page.evaluate(() => ChatApp.modalEl.hidden), true);
    assert.equal(await page.evaluate(() => [...homePollBindings.values()].reduce((sum, callbacks) => sum + callbacks.size, 0)), 0);
    await page.evaluate(() => ChatApp.showLoggedInHome()); await page.waitForFunction(() => ChatApp.homeDashboardState?.pollStatus === 'ready');
    await page.evaluate(() => __testDatabase.ref('memberships/TEST-USER/test').remove());
    await page.waitForFunction(() => ChatApp.homeDashboardState?.membersReady && !ChatApp.homeDashboardState.members.has('test'));
    assert.equal(await page.locator('[data-home-poll]').count(), 0); assert.equal(await page.locator('#home-links-items a').count(), 0);
    assert.equal(await page.evaluate(() => [...homePollBindings.values()].reduce((sum, callbacks) => sum + callbacks.size, 0)), 0);
    await page.evaluate(() => __testDatabase.ref('memberships/TEST-USER/test').set(true));
    await page.waitForFunction(() => ChatApp.homeDashboardState?.pollStatus === 'ready' && !!document.querySelector('[data-home-poll]'));
    await page.evaluate(async () => {
      const hash = await ChatApp.sha256Hex('OTHER-USER');
      await __testDatabase.ref('credentials/' + hash).set('OTHER');
      await __testDatabase.ref('users/OTHER').set({ username: 'Other', displayName: 'Other', credentialHash: hash });
      await ChatApp.logoutToLanding();
    });
    assert.equal(await page.evaluate(() => [...homePollBindings.values()].reduce((sum, callbacks) => sum + callbacks.size, 0)), 0);
    await page.fill('#login-email', 'vincenzo.brogna@students.pittstonarea.com');
    await page.click('#btn-go-login'); await page.fill('#login-code', 'OTHER-USER'); await page.click('#btn-login');
    await page.waitForFunction(() => ChatApp.homeDashboardState?.code === 'OTHER' && ChatApp.homeDashboardState?.membersReady);
    assert.equal(await page.locator('#home-links-items a').count(), 0); assert.equal(await page.locator('[data-home-poll]').count(), 0);
    assert(!(await page.locator('#home-reminders-items').innerText()).includes('Reminder 0'));
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS Home live polls/add/edit/vote/delete/expiry, exact room navigation, scroll retention, cursors, 8 fitted viewports, account and membership cleanup');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
