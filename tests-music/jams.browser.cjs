/* Three signed-in clients share an isolated realtime fixture and decode WAV through
 * the persistent HTMLAudioElement. No production service or account is used. */
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const { createSharedFirebaseBackend } = require('../tests/shared-firebase-backend.cjs');

function installAudioFixture() {
  const count = 8000 * 120, bytes = new Uint8Array(44 + count), data = new DataView(bytes.buffer);
  const ascii = (offset, text) => [...text].forEach((c, i) => data.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, 'RIFF'); data.setUint32(4, bytes.length - 8, true); ascii(8, 'WAVE'); ascii(12, 'fmt ');
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
  data.setUint32(24, 8000, true); data.setUint32(28, 8000, true); data.setUint16(32, 1, true);
  data.setUint16(34, 8, true); ascii(36, 'data'); data.setUint32(40, count, true); bytes.fill(128, 44);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
  ChatApp.musicGetAudioURL = async () => url;
}

// The shared backend normally acknowledges writes immediately. Inject the
// two local value events that the compat SDK delivers for a rejected remove.
function installRemovalRollback() {
  const original = ChatApp.db.ref.bind(ChatApp.db);
  ChatApp.db.ref = (...args) => {
    const root = original(...args);
    if (args[0] !== 'music/jams') return root;
    const push = root.push;
    root.push = () => {
      const ref = push(), on = ref.on, remove = ref.remove;
      let observe;
      ref.on = (event, callback, cancel) => { if (event === 'value') observe = callback; return on(event, callback, cancel); };
      ref.remove = async () => {
        if (!window.rejectNextJamEnd) return remove();
        window.rejectNextJamEnd = false;
        const original = await ref.once('value');
        observe({ val: () => null });
        observe(original);
        throw new Error('Simulated rejected removal');
      };
      return ref;
    };
    return root;
  };
}

(async () => {
  const db = createSharedFirebaseBackend(3);
  db.values.music = { playlists: { pl: { name: 'Jam tests', ownerCode: 'P1', tracks: {} } } };
  for (const [i, title] of ['First', 'Second', 'Third'].entries()) {
    db.values.music.playlists.pl.tracks['t' + (i + 1)] = { title, artist: 'Artist', duration: 120, order: i, blobId: 'audio' + i };
  }
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  const errors = [];
  async function signIn(code) {
    const mobile = code === 'P3';
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 960 },
      isMobile: mobile, hasTouch: mobile
    });
    await db.bind(context);
    await context.route(/^https?:\/\//, route => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
    await context.addInitScript(() => {
      window.chatDesktopMusic = { jamAvatars: true, setMusicState(frame) { if (frame?.jamPeople) window.testTrayPeople = frame.jamPeople; }, onMusicAction(cb) { window.testTray = cb; } };
    });
    const page = await context.newPage(); page.setDefaultTimeout(14000);
    page.on('pageerror', e => errors.push(code + ': ' + e.message));
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
    await page.fill('#login-email', 'vincenzo.brogna@students.pittstonarea.com');
    await page.click('#btn-go-login'); await page.fill('#login-code', code); await page.click('#btn-login');
    await page.waitForFunction(() => ChatApp.musicSessionConnected());
    await page.evaluate(() => ChatApp.openRoom('test', { quiet: true }));
    await page.evaluate(installAudioFixture);
    return page;
  }
  const dock = page => page.locator('.music-player:visible [data-music-control="jam"]');
  async function play(page, id) {
    await page.evaluate(id => ChatApp.musicPlay('pl', id), id);
    await page.waitForFunction(id => ChatApp.musicState.trackId === id && ChatApp.musicState.playing, id);
  }
  async function profile(page, code) {
    await page.evaluate(() => {
      ChatApp.closeMusic(); ChatApp.closeUserProfile(true);
      if (document.body.dataset.mobileUi === '1') ChatApp.setMobileDrawer('navigation');
    });
    await page.waitForFunction(code => !!ChatApp.getUserMusicPlayback(ChatApp.getUserProfileRecord(code)), code);
    await page.evaluate(code => ChatApp.openUserProfileAt(ChatApp.$('btn-side-settings'), code), code);
    return page.locator('.user-profile-shell [data-music-join-jam]');
  }
  async function joined(page, id) {
    await page.waitForFunction(id => ChatApp.musicJamId() === id && ChatApp.musicJamIsGuest() && !!ChatApp.musicState.track && !ChatApp.musicState.loading, id);
  }
  async function centered(buttons) {
    const offsets = await buttons.evaluateAll(nodes => nodes.map(button => {
      const outer = button.getBoundingClientRect(), inner = button.querySelector('svg').getBoundingClientRect();
      return Math.max(Math.abs((outer.left + outer.right - inner.left - inner.right) / 2),
        Math.abs((outer.top + outer.bottom - inner.top - inner.bottom) / 2));
    }));
    assert.ok(offsets.length && offsets.every(offset => offset < 1), 'Music icon centers match their visible buttons: ' + offsets);
  }
  async function confirm(page, label) {
    const button = page.locator('#poll-popover [data-jam-confirm]');
    await button.waitFor();
    assert.equal(await button.innerText(), label);
    await button.click(); // Detect a confirmation painted under another surface.
  }
  try {
    const [host, guest, third] = await Promise.all(['P1', 'P2', 'P3'].map(signIn));
    await host.evaluate(installRemovalRollback);
    await play(host, 't1'); await play(guest, 't3');
    await guest.waitForFunction(() => ChatApp.getUserMusicPlayback(ChatApp.getRosterProfile('P1'))?.trackId === 't1');
    const stableRoster = await guest.evaluate(() => {
      const live = ChatApp.liveUserCache.get('P1');
      ChatApp.liveUserCache.set('P1', { ...live, code: 'P1', musicSessions: null });
      try {
        const sub = () => document.querySelector('.member-row[data-usercode="P1"] .member-sub')?.dataset.activityKind;
        ChatApp.renderOnlineIndicator();
        const full = sub();
        ChatApp.refreshOnlineIndicatorStatusTexts();
        return [full, sub()];
      } finally { if (live) ChatApp.liveUserCache.set('P1', live); else ChatApp.liveUserCache.delete('P1'); }
    });
    assert.deepEqual(stableRoster, ['music', 'music'], 'one-second refresh keeps the same activity when profile caches differ');
    assert.equal(await host.evaluate(() => ChatApp.getUserMusicPlayback({ code: 'P1', musicSessions: null })?.trackId), 't1');
    await host.evaluate(() => ChatApp.openMusic({ kind: 'playlist', id: 'pl' }));
    await centered(host.locator('#music-bottom-player [data-music-control]:not([data-music-control=open])'));
    await dock(host).hover();
    await host.waitForFunction(() => document.querySelector('#sidebar-tooltip.is-visible')?.textContent === 'Start Jam');
    await dock(host).click();
    await host.waitForFunction(() => !!ChatApp.musicJamId());
    const first = await host.evaluate(() => ChatApp.musicJamId());
    await dock(host).hover();
    await host.waitForFunction(() => document.querySelector('#sidebar-tooltip.is-visible')?.textContent === 'End Jam');
    assert.equal(await host.locator('.music-jam-floating:visible').count(), 0);
    await host.evaluate(() => { ChatApp.musicControl('pause'); ChatApp.musicControl('seek', 14); });
    assert.equal(await (await profile(host, 'P1')).count(), 0, 'self profile never offers Join');
    await host.evaluate(() => ChatApp.closeUserProfile(true));

    // A slow private request for the same track must not auto-play over a
    // paused Jam even when its bytes arrive after the guest starts following.
    await guest.evaluate(async () => {
      const load = ChatApp.musicGetAudioURL;
      ChatApp.musicGetAudioURL = track => {
        ChatApp.musicGetAudioURL = load;
        return new Promise(resolve => { window.finishOldTrack = () => resolve(load(track)); });
      };
      void ChatApp.musicPlay('pl', 't1');
    });
    await guest.waitForFunction(() => !!window.finishOldTrack);
    await (await profile(guest, 'P1')).click();
    await joined(guest, first);
    await guest.evaluate(() => finishOldTrack());
    await guest.waitForFunction(() => ChatApp.musicState.trackId === 't1' && ChatApp.musicAudio.paused && Math.abs(ChatApp.musicAudio.currentTime - 14) < 0.12);
    const throughGuest = await profile(third, 'P2');
    await centered(third.locator('.user-profile-music-track button'));
    await throughGuest.click();
    await joined(third, first);
    await third.waitForFunction(() => ChatApp.musicAudio.paused && Math.abs(ChatApp.musicAudio.currentTime - 14) < 0.12);
    await guest.evaluate(() => ChatApp.closeUserProfile(true));
    await third.evaluate(() => ChatApp.closeUserProfile(true));
    await centered(guest.locator('#sidebar-music-player [data-music-control]:not([data-music-control=open])'));
    await dock(guest).hover();
    await guest.waitForFunction(() => document.querySelector('.music-jam-floating:not([hidden])')?.innerText.includes('P3'));
    const names = await guest.locator('.music-jam-floating [role=listitem]').allTextContents();
    assert.deepEqual(names, ['P1', 'P3']);
    await guest.waitForFunction(() => testTrayPeople?.length === 2 && testTrayPeople.every(p => p.avatar?.startsWith('data:image/png;base64,')));
    assert.equal(await guest.locator('.music-jam-floating .call-viewers-label').innerText(), 'In Jam With');
    assert.equal(await guest.locator('#sidebar-tooltip.is-visible').count(), 0);
    await guest.mouse.move(2,2);
    await guest.waitForFunction(() => document.querySelector('.music-jam-floating')?.hidden);

    await guest.evaluate(() => { ChatApp.musicControl('next'); ChatApp.musicControl('volume', 21); ChatApp.musicControl('seek', 9); ChatApp.musicControl('repeat', 'off'); ChatApp.musicControl('shuffle', true); testTray({ action: 'play' }); testTray({ action: 'stop' }); });
    assert.equal(await guest.evaluate(() => ChatApp.musicPlay('pl', 't3')), false);
    assert.deepEqual(await guest.evaluate(() => [ChatApp.musicState.trackId, ChatApp.musicState.volume, ChatApp.musicState.repeat, ChatApp.musicState.shuffle, ChatApp.musicAudio.paused]), ['t1', 20, 'off', false, true]);
    assert.equal(await guest.locator('.music-player:visible [data-music-volume]').isEnabled(), true);
    const guestMute = guest.locator('.music-player:visible .media-volume-button');
    const hostVolume = await host.evaluate(() => ChatApp.musicState.volume);
    await guestMute.click();
    assert.equal(await guest.evaluate(() => ChatApp.musicState.volume), 0);
    assert.equal(await host.evaluate(() => ChatApp.musicState.volume), hostVolume);
    await guestMute.click();
    assert.equal(await guest.evaluate(() => ChatApp.musicState.volume), 20);
    assert.equal(await guest.locator('.music-player:visible [data-music-control=stop]').isDisabled(), true);

    await host.evaluate(() => { window.rejectNextJamEnd = true; });
    await dock(host).click(); await confirm(host, 'End Jam');
    await host.waitForFunction(() => !ChatApp.musicJamBusy());
    assert.equal(await host.evaluate(() => ChatApp.musicJamId()), first, 'optimistic removal rollback retains the host listener');
    assert.equal(await third.evaluate(() => ChatApp.musicJamId()), first);

    await host.evaluate(() => { ChatApp.musicControl('volume', 44); ChatApp.musicControl('repeat', 'one'); ChatApp.musicControl('play'); });
    await third.evaluate(() => testTray({ action: 'volume', value: 155 }));
    await Promise.all([host, guest, third].map((page, i) => page.waitForFunction(volume => !ChatApp.musicAudio.paused && ChatApp.musicAudio.currentTime >= 14 && ChatApp.musicState.repeat === 'one' && ChatApp.musicState.volume === volume, [45,20,155][i])));
    await host.evaluate(() => ChatApp.musicControl('seek', 40));
    await third.waitForFunction(() => ChatApp.musicAudio.currentTime >= 39.8);
    const clocks = await Promise.all([host, guest, third].map(page => page.evaluate(() => ChatApp.musicAudio.currentTime)));
    assert.ok(Math.max(...clocks) - Math.min(...clocks) < 1, 'host and guests follow one playhead');
    await guest.evaluate(() => {
      ChatApp.desktopSpotifyState = { connected: true, playback: { playing: true } }; ChatApp.musicSpotifyChanged();
    });
    await guest.waitForFunction(() => ChatApp.musicAudio.paused);
    assert.equal(await host.evaluate(() => ChatApp.musicState.playing), true);
    await guest.evaluate(() => { ChatApp.desktopSpotifyState.playback.playing = false; ChatApp.musicSpotifyChanged(); });
    await guest.waitForFunction(() => !ChatApp.musicAudio.paused);
    await third.evaluate(() => {
      window.chatSample = { paused: false, ended: false, muted: false, volume: 1 };
      ChatApp.musicInterruptForChatMedia(chatSample);
    });
    await third.waitForFunction(() => ChatApp.musicAudio.paused);
    await third.evaluate(() => { chatSample.ended = true; });
    await third.waitForFunction(() => !ChatApp.musicAudio.paused);
    // Deliver the clock ahead of a guest's copy of the new playlist metadata.
    await guest.evaluate(() => ChatApp.musicData.tracks.get('pl').delete('t2'));
    await play(host, 't2');
    await guest.waitForFunction(() => !ChatApp.musicState.track && ChatApp.musicState.trackId === 't2' && !ChatApp.musicState.loading);
    assert.equal(await dock(guest).isEnabled(), true);
    await dock(guest).click();
    await guest.keyboard.press('Tab');
    assert.equal(await guest.locator('[data-jam-confirm]').evaluate(b => b === document.activeElement), true);
    await guest.keyboard.press('Escape');
    assert.equal(await guest.evaluate(() => ChatApp.musicJamId()), first);
    await host.evaluate(() => ChatApp.db.ref('music/playlists/pl/tracks/t2/title').set('Second, updated'));
    await Promise.all([guest, third].map(page => page.waitForFunction(() => ChatApp.musicState.trackId === 't2' && ChatApp.musicState.playing)));

    // Leave and switch in both guest and host roles, including from the full controller.
    await guest.evaluate(() => ChatApp.openMusic({ kind: 'playlist', id: 'pl' }));
    await dock(guest).click();
    assert.equal(await guest.locator('#poll-menu-close').evaluate(b => b === document.activeElement), true);
    await guest.keyboard.press('Tab');
    assert.equal(await guest.locator('[data-jam-confirm]').evaluate(b => b === document.activeElement), true);
    await guest.keyboard.press('Shift+Tab');
    assert.equal(await guest.locator('#poll-menu-close').evaluate(b => b === document.activeElement), true);
    await guest.keyboard.press('Escape');
    assert.equal(await guest.evaluate(() => ChatApp.musicScreenOpen), true);
    assert.equal(await dock(guest).evaluate(b => b === document.activeElement), true);
    await dock(guest).click(); await confirm(guest, 'Leave Jam');
    await guest.waitForFunction(() => !ChatApp.musicJamId() && !ChatApp.musicState.track && ChatApp.musicState.volume === 20 && ChatApp.musicState.repeat === 'off');
    await play(guest, 't3'); await dock(guest).click();
    await guest.waitForFunction(() => !!ChatApp.musicJamId());
    const second = await guest.evaluate(() => ChatApp.musicJamId());
    await (await profile(third, 'P2')).click();
    await third.locator('#poll-menu-close').click();
    assert.equal(await third.evaluate(() => ChatApp.musicJamId()), first);
    await (await profile(third, 'P2')).click(); await confirm(third, 'Leave Jam'); await joined(third, second);
    await (await profile(host, 'P2')).click(); await confirm(host, 'End Jam'); await joined(host, second);
    assert.equal(db.get('music/jams/' + first), null);
    await host.waitForFunction(() => ChatApp.musicState.trackId === 't3' && ChatApp.musicState.playing);
    await dock(guest).click(); await confirm(guest, 'End Jam');
    await Promise.all([host, third].map(page => page.waitForFunction(() => !ChatApp.musicJamId() && !ChatApp.musicState.track && ChatApp.musicAudio.paused)));
    assert.equal(db.get('music/jams/' + second), null);
    await host.evaluate(id => ChatApp.musicJoinJam(id, ChatApp.$('btn-side-settings')), first);
    assert.equal(await host.evaluate(() => ChatApp.musicJamId()), '');
    assert.equal(db.get('music/jams/' + first), null, 'stale join cannot recreate an ended Jam');
    assert.equal(await guest.evaluate(() => ChatApp.musicState.playing), true, 'creator continues private playback after ending');
    await host.evaluate(() => ChatApp.musicPlay('audio:P1','audio1'));
    await host.waitForFunction(() => ChatApp.musicState.playing && ChatApp.musicState.playlistId === 'audio:P1');
    await dock(host).click();
    await host.waitForFunction(() => !!ChatApp.musicJamId());
    const soloJam = await host.evaluate(() => ChatApp.musicJamId());
    await (await profile(third,'P1')).click(); await joined(third, soloJam);
    await third.waitForFunction(() => ChatApp.musicState.playlistId === 'audio:P1' && ChatApp.musicState.trackId === 'audio1' && !ChatApp.musicAudio.paused);
    await host.evaluate(() => { ChatApp.musicControl('repeat','one'); ChatApp.musicControl('seek',119.85); });
    await host.waitForFunction(() => ChatApp.musicState.playing && ChatApp.musicAudio.currentTime < 2);
    await third.waitForFunction(() => !ChatApp.musicAudio.paused && ChatApp.musicAudio.currentTime < 3);
    await host.evaluate(() => { ChatApp.musicControl('repeat','off'); ChatApp.musicControl('seek',119.85); });
    await host.waitForFunction(() => ChatApp.musicAudio.ended && !ChatApp.musicState.playing);
    await third.waitForFunction(() => ChatApp.musicState.trackId === 'audio1' && ChatApp.musicAudio.paused);
    assert.deepEqual(errors, []);
    assert.deepEqual(db.deliveryErrors, []);
    console.log('Three clients passed host/guest controls, paused join via either profile, clock synchronization, membership tooltip, both switch confirmations, end and forced removal.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
