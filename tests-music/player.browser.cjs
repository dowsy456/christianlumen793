'use strict';
// Real Chromium audio decoding and offline Firebase fixture: no remote writes.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const mock = require('../tests/firebase-mock.js');
const root = path.resolve(__dirname, '..');
async function assertIconsCentered(controls) {
  const offsets = await controls.evaluateAll(buttons => buttons.map(button => {
    const frame = button.getBoundingClientRect(), icon = button.querySelector('svg').getBoundingClientRect();
    return { label: button.getAttribute('aria-label'), dx: icon.x + icon.width / 2 - frame.x - frame.width / 2,
      dy: icon.y + icon.height / 2 - frame.y - frame.height / 2 };
  }));
  assert.ok(offsets.length);
  for (const { label, dx, dy } of offsets) assert.ok(Math.abs(dx) <= 1 && Math.abs(dy) <= 1, `${label} icon offset (${dx}, ${dy})`);
}
(async () => {
  const server = http.createServer((request, response) => {
    const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
    if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
    fs.readFile(file, (error, bytes) => { if (error) response.writeHead(404).end(); else { response.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json' }[path.extname(file)] || 'application/octet-stream'); response.end(bytes); } });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  try {
    for (const mobile of [false, true]) {
      const errors = [], context = await browser.newContext({ viewport: { width: mobile ? 390 : 1440, height: mobile ? 844 : 980 }, isMobile: mobile, hasTouch: mobile });
      await context.addInitScript(mock);
      await context.addInitScript(() => { window.__nativeMusic = []; window.chatDesktopMusic = { setMusicState: async value => __nativeMusic.push(value), onMusicAction: cb => window.__nativeMusicAction = cb }; });
      await context.route(/^https?:\/\//, route => new URL(route.request().url()).origin === origin ? route.continue() : route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
      const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(20000);
      await page.goto(mobile ? origin + '/' : pathToFileURL(path.join(root, 'index.html')).href);
      await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
      await page.fill('#login-email', 'vincenzo.brogna@students.pittstonarea.com'); await page.click('#btn-go-login'); await page.fill('#login-code', 'TEST-USER'); await page.click('#btn-login');
      await page.waitForFunction(() => ChatApp.currentUser?.code === 'TEST-USER');
      await page.evaluate(async () => {
        const samples = 8000 * 12, buffer = new ArrayBuffer(44 + samples * 2), data = new DataView(buffer);
        const string = (offset, value) => [...value].forEach((character, index) => data.setUint8(offset + index, character.charCodeAt(0)));
        string(0, 'RIFF'); data.setUint32(4, buffer.byteLength - 8, true); string(8, 'WAVE'); string(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true); data.setUint32(24, 8000, true); data.setUint32(28, 16000, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true); string(36, 'data'); data.setUint32(40, samples * 2, true);
        const url = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
        window.__musicFixtureURL = url; window.__realMusicURL = ChatApp.musicGetAudioURL; ChatApp.musicGetAudioURL = async () => url;
        const tracks = {};
        for (let index = 1; index <= 3; index++) tracks['track' + index] = { title: 'Track ' + index, artist: 'Artist', album: 'Album', duration: 12, order: index, addedAt: Date.now(), blobId: 'blob' + index, size: buffer.byteLength, mime: 'audio/wav' };
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
        const ctx = canvas.getContext('2d'), pixels = ctx.createImageData(256,256);
        for (let offset = 0; offset < pixels.data.length; offset += 65536) crypto.getRandomValues(pixels.data.subarray(offset, offset + 65536));
        ctx.putImageData(pixels,0,0);
        tracks.track1.photoDataURL = canvas.toDataURL('image/png');
        navigator.clipboard.writeText = async text => { window.__testCopiedAddress = text; };
        await __testDatabase.ref('music/playlists/playlist').set({ name: 'Playback Test', ownerCode: 'TEST-USER', createdAt: Date.now(), tracks });
        await ChatApp.musicWatchPlaylist('playlist');
        ChatApp.openMusic({ kind: 'playlist', id: 'playlist' });
        const button = document.createElement('button'); button.id = 'test-play-music'; button.textContent = 'Play test'; Object.assign(button.style, { position: 'fixed', top: '0', left: '0', zIndex: 2147483647 }); button.onclick = () => ChatApp.musicPlay('playlist', 'track1'); document.body.appendChild(button);
      });
      assert.equal(await page.evaluate(() => ChatApp.musicState.repeat), 'off');
      await page.click('#test-play-music');
      await page.waitForFunction(() => ChatApp.musicState.playing && ChatApp.musicAudio.currentTime > .1);
      assert.equal(await page.locator('#music-bottom-player').isVisible(), true);
      assert.equal(await page.locator('#sidebar-music-player').isVisible(), false);
      assert.equal(await page.locator('#music-bottom-player [data-music-volume]').getAttribute('step'), '5');
      const iconActions = async anchor => {
        await anchor.click({button:'right'});
        const menu = page.locator('#music-context-menu:visible');
        assert.deepEqual(await menu.locator('button').allTextContents().then(labels => labels.map(label => label.trim())), ['Download','Copy Address']);
        await page.keyboard.press('Escape');
      };
      await iconActions(page.locator('#music-bottom-player .music-art'));
      await iconActions(page.locator('#music-tracks [data-music-key="track1"] .music-track-cover'));
      await page.locator('#music-bottom-player .music-art').click({button:'right'});
      const downloaded = page.waitForEvent('download');
      await page.getByRole('menuitem',{name:'Download',exact:true}).click();
      const file = await downloaded;
      assert.equal(file.suggestedFilename(),'Track_1-icon.png');
      const photo = await page.evaluate(() => ChatApp.musicState.track.photoDataURL);
      assert(photo.length > 131072,'cover exceeds presence payload budget');
      assert.deepEqual(fs.readFileSync(await file.path()),Buffer.from(photo.split(',')[1],'base64'));
      await page.locator('#music-bottom-player .music-art').click({button:'right'});
      await page.getByRole('menuitem',{name:'Copy Address',exact:true}).click();
      assert.equal(await page.evaluate(() => __testCopiedAddress === ChatApp.musicState.track.photoDataURL),true);
      assert.equal(await page.evaluate(() => __nativeMusic.some(frame => frame?.photoDataURL?.startsWith('data:image/'))), true);
      await assertIconsCentered(page.locator('#music-bottom-player .spotify-player-button'));
      const layout = await page.locator('#music-bottom-player').evaluate(element => ({ height: element.getBoundingClientRect().height, bottom: element.getBoundingClientRect().bottom, overflow: element.scrollWidth > element.clientWidth + 1, viewport: innerHeight }));
      assert.ok(layout.height < 190, 'compact footer height'); assert.ok(Math.abs(layout.bottom - layout.viewport) < 2, 'footer stays at bottom'); assert.equal(layout.overflow, false, 'no horizontal player overflow');
      await page.locator('#music-bottom-player [data-music-volume]').evaluate(element => { element.value = '175'; element.dispatchEvent(new Event('input', { bubbles: true })); });
      assert.equal(await page.evaluate(() => ChatApp.musicState.volume), 175);
      const mute = page.locator('#music-bottom-player .media-volume-button');
      await mute.click();
      assert.equal(await page.locator('#music-bottom-player [data-music-volume-label]').textContent(), '0%');
      assert.equal(await mute.getAttribute('aria-label'), 'Unmute Music');
      await mute.click();
      assert.equal(await page.evaluate(() => ChatApp.musicState.volume), 175);
      await mute.click();
      await page.locator('#music-bottom-player [data-music-volume]').focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.evaluate(() => ChatApp.musicState.volume), 5);
      assert.equal(await mute.getAttribute('aria-label'), 'Mute Music');
      await page.evaluate(() => ChatApp.musicControl('volume', 175));
      const captureDir = path.resolve(root, '../music-player-checks'); fs.mkdirSync(captureDir, { recursive: true });
      await page.screenshot({ path: path.join(captureDir, mobile ? 'mobile-player.png' : 'desktop-player.png') });
      await page.evaluate(() => ChatApp.musicControl('seek', 6));
      await page.evaluate(() => ChatApp.musicControl('previous'));
      assert.equal(await page.evaluate(() => ChatApp.musicState.trackId), 'track1');
      assert.ok(await page.evaluate(() => ChatApp.musicAudio.currentTime < 1));
      await page.evaluate(() => ChatApp.musicControl('next'));
      await page.waitForFunction(() => ChatApp.musicState.trackId === 'track2' && ChatApp.musicState.playing);
      await page.evaluate(() => ChatApp.musicControl('previous'));
      await page.waitForFunction(() => ChatApp.musicState.trackId === 'track1' && ChatApp.musicState.playing);
      const original = await page.evaluate(() => { window.__persistentMusic = ChatApp.musicAudio; ChatApp.closeMusic(); return ChatApp.musicState.trackId; });
      assert.equal(original, 'track1');
      assert.equal(await page.evaluate(() => ChatApp.musicAudio === __persistentMusic && !ChatApp.musicAudio.paused), true);
      if (mobile) await page.evaluate(() => ChatApp.setMobileDrawer('navigation'));
      assert.equal(await page.locator('#sidebar-music-player').isVisible(), true);
      await iconActions(page.locator('#sidebar-music-player .music-art'));
      await assertIconsCentered(page.locator('#sidebar-music-player .spotify-player-button'));
      assert.equal(await page.locator('#sidebar-music-player [data-music-volume]').getAttribute('max'), '200');
      await page.evaluate(() => { ChatApp.desktopSpotifyState = { connected: true, playback: { playing: true } }; ChatApp.musicSpotifyChanged(); });
      assert.equal(await page.evaluate(() => ChatApp.musicAudio.paused && ChatApp.musicState.blocked), true);
      assert.equal(await page.evaluate(() => ChatApp.musicPlay('playlist', 'track2')), false);
      await page.evaluate(() => { ChatApp.desktopSpotifyState.playback.playing = false; ChatApp.musicSpotifyChanged(); });
      assert.equal(await page.evaluate(() => ChatApp.musicState.playing), false, 'Spotify stop does not auto resume');
      await page.evaluate(() => __nativeMusicAction({ action: 'play' }));
      await page.waitForFunction(() => ChatApp.musicState.playing);
      await page.evaluate(() => ChatApp.musicInterruptForChatMedia({ muted: false, volume: 1 }));
      assert.equal(await page.evaluate(() => ChatApp.musicAudio.paused), true);
      await page.evaluate(() => ChatApp.musicControl('play'));
      await page.waitForFunction(() => Object.keys(ChatApp.currentUser.musicSessions || {}).length > 0);
      const profile = await page.evaluate(() => ChatApp.buildUserProfileCardHTML(ChatApp.currentUser));
      assert.match(profile, /Listening to Music/); assert.match(profile, /data-music-profile-time/); assert.doesNotMatch(profile, /data-music-profile="/);
      await page.locator('.me-pill-dock').click();
      const profilePlay = page.locator('#user-profile-popover [data-music-play-profile]');
      await profilePlay.waitFor({ state: 'visible' });
      await assertIconsCentered(profilePlay);
      await iconActions(page.locator('#user-profile-popover .user-profile-music-art'));
      await page.locator('#user-profile-popover .user-profile-close').click();
      await page.evaluate(() => { ChatApp.musicControl('shuffle', true); ChatApp.musicControl('repeat', 'all'); });
      const visits = [await page.evaluate(() => ChatApp.musicState.trackId)];
      for (let index = 0; index < 2; index++) { await page.evaluate(() => ChatApp.musicControl('next')); await page.waitForFunction(() => ChatApp.musicState.playing); visits.push(await page.evaluate(() => ChatApp.musicState.trackId)); }
      assert.equal(new Set(visits).size, 3, 'shuffle visits every song before repeating');
      // A slow old download must never start after a newer selection or manual pause.
      await page.evaluate(async () => {
        ChatApp.musicStop();
        ChatApp.musicControl('shuffle', false);
        ChatApp.musicGetAudioURL = track => track.id === 'track1' ? new Promise(resolve => window.__resolveOldMusic = resolve) : Promise.resolve(__musicFixtureURL);
        window.__pendingMusic = ChatApp.musicPlay('playlist', 'track1');
      });
      await page.waitForFunction(() => !!window.__resolveOldMusic);
      assert.ok(await page.locator('#sidebar-music-player .music-loading-spinner').isVisible());
      assert.equal(await page.locator('#sidebar-music-player .music-player-status').isVisible(),false);
      await page.evaluate(() => ChatApp.musicPlay('playlist', 'track2'));
      await page.evaluate(async () => { __resolveOldMusic(__musicFixtureURL); await __pendingMusic; });
      assert.equal(await page.evaluate(() => ChatApp.musicState.trackId), 'track2');
      await page.evaluate(() => { ChatApp.musicControl('stop'); ChatApp.musicGetAudioURL = () => new Promise(resolve => window.__resolvePausedMusic = resolve); void ChatApp.musicPlay('playlist', 'track3'); });
      await page.waitForFunction(() => !!window.__resolvePausedMusic);
      await page.evaluate(() => { ChatApp.musicControl('pause'); __resolvePausedMusic(__musicFixtureURL); });
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => ChatApp.musicState.playing || !ChatApp.musicAudio.paused), false);
      await page.evaluate(() => ChatApp.musicStop());
      assert.equal(await page.evaluate(() => __nativeMusic.at(-1)), null);
      assert.equal(await page.locator('#sidebar-music-player').isVisible(), false);
      await page.evaluate(async () => { ChatApp.musicGetAudioURL = async () => __musicFixtureURL; await ChatApp.musicPlay('playlist', 'track2'); await __testDatabase.ref('music/playlists/playlist').remove(); });
      await page.waitForFunction(() => ChatApp.musicState.track === null && ChatApp.musicAudio.paused);
      // Keep the final RTDB part unavailable until Chromium is decoding the
      // first part. A full-file-only implementation cannot pass this check.
      const clip = fs.readFileSync(path.join(root,'assets/sounds/Ringing.mp3'));
      const mp3 = Buffer.concat([clip, clip]);
      const chunkBytes = 192 * 1024;
      await page.evaluate(async ({ parts, size, chunkBytes }) => {
        ChatApp.musicGetAudioURL = __realMusicURL;
        const bytes = __testDatabase.ref('music/audio/cold/parts');
        await bytes.set(parts);
        const track = { title:'Cold MP3', duration:14, mime:'audio/mpeg', blobId:'cold', size, chunkBytes, chunkCount:2 };
        await __testDatabase.ref('music/playlists/streaming').set({ name:'Streaming', ownerCode:'TEST-USER', tracks:{mp3:track} });
        const ref = ChatApp.db.ref.bind(ChatApp.db);
        let reads = 0;
        ChatApp.db.ref = path => {
          const node = ref(path);
          if (path.startsWith('music/audio/cold/parts/')) reads++;
          if (path.endsWith('cold/parts/000001')) {
            const once = node.once.bind(node);
            node.once = (...args) => new Promise(resolve => { window.__finishMP3 = () => resolve(once(...args)); });
          }
          return node;
        };
        window.__partReads = () => reads;
        window.__startedAt = performance.now();
        void ChatApp.musicPlay('audio:TEST-USER','cold');
      }, { parts: { '000000': mp3.subarray(0,chunkBytes).toString('base64'), '000001': mp3.subarray(chunkBytes).toString('base64') }, size:mp3.length, chunkBytes });
      await page.waitForFunction(() => !!window.__finishMP3 && !ChatApp.musicAudio.paused && ChatApp.musicAudio.currentTime > 0.02);
      const coldTime = await page.evaluate(() => { const elapsed = performance.now() - __startedAt; __finishMP3(); return elapsed; });
      await page.evaluate(async () => { await ChatApp.musicGetAudioURL(ChatApp.musicState.track); });
      const warm = await page.evaluate(async () => {
        ChatApp.musicStop(); const before = __partReads(), start = performance.now();
        await ChatApp.musicPlay('audio:TEST-USER','cold');
        return { readDelta:__partReads()-before, ms:performance.now()-start };
      });
      assert.equal(warm.readDelta,0);
      const dock = page.locator('.music-player:not([hidden])').first();
      const repeat = dock.locator('[data-music-control="repeat"]');
      const title = dock.locator('.spotify-player-title');
      await title.hover();
      assert.equal(await title.evaluate(n=>getComputedStyle(n).textDecorationLine), 'none');
      assert.deepEqual(await title.evaluate(n=>[getComputedStyle(n).backgroundColor, getComputedStyle(n).textShadow !== 'none']), ['rgba(0, 0, 0, 0)', true]);
      await page.evaluate(() => ChatApp.musicControl('repeat','off'));
      for (const mode of ['all','one','off']) {
        assert.equal(await repeat.isEnabled(), true);
        await repeat.click();
        assert.equal(await page.evaluate(() => ChatApp.musicState.repeat), mode);
        const recorded = await page.evaluate(() => JSON.parse(localStorage.getItem('chat.music.settings:' + ChatApp.firebaseConfig.projectId + ':' + ChatApp.currentUser.code)));
        assert.equal(recorded.repeat, mode);
        if (mode === 'off') break;
        await page.evaluate(() => { ChatApp.musicAudio.currentTime = ChatApp.musicAudio.duration - .10; });
        await page.waitForFunction(() => ChatApp.musicState.playing && ChatApp.musicAudio.currentTime < 2 && ChatApp.musicState.trackId === 'cold');
      }
      await page.evaluate(() => { ChatApp.musicAudio.currentTime = ChatApp.musicAudio.duration - .08; });
      await page.waitForFunction(() => ChatApp.musicAudio.ended && !ChatApp.musicState.playing && ChatApp.musicState.trackId === 'cold');
      console.log(`MP3 played with final chunk withheld after ${Math.round(coldTime)} ms; cached replay ${Math.round(warm.ms)} ms, zero RTDB part reads; standalone song stopped at end.`);
      for (const mode of ['all','one','off']) {
        const restored = await page.evaluate(mode => {
          ChatApp.musicControl('repeat', mode);
          ChatApp.stopMusicPlaybackSession();
          ChatApp.musicState.repeat = 'uninitialized';
          ChatApp.startMusicPlaybackSession();
          return ChatApp.musicState.repeat;
        }, mode);
        assert.equal(restored,mode,'repeat preference survives a new sign-in session');
      }
      assert.deepEqual(errors, []);
      console.log((mobile ? 'HTTP mobile' : 'local desktop') + ': real audio, seek/previous, shuffle, persistence, volume, Spotify/chat arbitration, native commands, presence and load races passed');
      await context.close();
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
