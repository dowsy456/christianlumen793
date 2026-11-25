'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const modules = ['file-cache', 'range-client', 'data', 'audio-stream'];
const pageHTML = '<button>Play</button>' + modules.map(name => '<script src="music/' + name + '.js"></script>').join('');

// A signed-in page owns a 120 s WAV. Delaying an early part makes a sequential
// implementation unable to complete the far seek until after this assertion.
function initialize() {
  const chunk = 192 * 1024, frames = 48000 * 120, size = 44 + frames * 4;
  const buffer = new ArrayBuffer(44), view = new DataView(buffer);
  function string(index, value) { [...value].forEach((c, i) => view.setUint8(index + i, c.charCodeAt())); }
  string(0, 'RIFF'); view.setUint32(4, size - 8, true); string(8, 'WAVE'); string(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true);
  view.setUint32(24, 48000, true); view.setUint32(28, 192000, true); view.setUint16(32, 4, true);
  view.setUint16(34, 16, true); string(36, 'data'); view.setUint32(40, size - 44, true);
  window.init = []; window.reads = [];
  window.hold = new Promise(resolve => window.releaseEarly = resolve);
  window.track = { blobId: 'wave', size, duration: 120, chunkCount: Math.ceil(size / chunk), chunkBytes: chunk, mime:'audio/wav' };
  window.ChatApp = {
    currentUser: { code: 'fixture' }, firebaseConfig: { projectId: 'test' }, register(id, fn) { init.push(fn); },
    db: { ref(path) {
      const i = Number(path.split('/').pop());
      return { async once() {
        reads.push(i);
        if (i === 7) await hold;
        const bytes = new Uint8Array(Math.min(chunk, size - i * chunk));
        bytes[bytes.length - 1] = i % 128; bytes[0] = i % 128;
        if (i === 0) bytes.set(new Uint8Array(buffer));
        const base64 = typeof bytes.toBase64 === 'function' ? bytes.toBase64() : btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
        return { val: () => base64 };
      } };
    }}
  };
}

async function portableMP3(browser) {
  const os = require('node:os'), { pathToFileURL } = require('node:url');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'music-range-'));
  const shell = path.join(dir, 'index.html');
  const context = await browser.newContext();
  try {
    await fs.writeFile(shell, modules.map(m => '<script src="' + pathToFileURL(path.join(root, 'music', m + '.js')).href + '"></script>').join(''));
    const clip = await fs.readFile(path.join(root, 'assets/sounds/Ringing.mp3'));
    const info = clip.indexOf('Info'), frames = clip.readUInt32BE(info + 8), extent = clip.readUInt32BE(info + 12);
    const first = clip.length - extent, stride = extent / (frames + 1);
    assert.equal(stride, 576); assert.equal(frames, 252);
    const repeat = 32, mp3 = Buffer.concat([clip.subarray(0, first + stride), ...Array(repeat).fill(clip.subarray(first + stride))]);
    mp3.writeUInt32BE(frames * repeat, info + 8); mp3.writeUInt32BE(mp3.length - first, info + 12);
    const chunk = 192 * 1024, parts = [], duration = frames * repeat * 1152 / 48000;
    for (let i = 0; i < mp3.length; i += chunk) parts.push(mp3.subarray(i, i + chunk).toString('base64'));
    await context.addInitScript(initialize);
    const page = await context.newPage(), failures = [];
    page.on('pageerror', error => failures.push(error.message));
    await page.goto(pathToFileURL(shell).href);
    await page.evaluate(() => init.forEach(fn => fn()));
    await page.evaluate(async ({parts, size, duration}) => {
      Object.assign(track, {blobId:'portable', mime:'audio/mpeg', size, duration, chunkCount:parts.length});
      ChatApp.db.ref = path => ({async once() {
        const i = Number(path.split('/').pop());
        reads.push(i); if (i >= 5 && i <= 10) await hold;
        return {val:() => parts[i]};
      }});
      window.audio = new Audio();
      audio.src = await ChatApp.musicGetAudioURL(track, {onStreamError() { throw Error('Unexpected decoder fallback'); }});
      audio.addEventListener('seeking', () => ChatApp.seekMusicStream(audio.src, audio.currentTime));
      document.body.append(audio); void audio.play();
    }, { parts, size:mp3.length, duration });
    await page.waitForFunction(() => audio.currentTime > .02 && reads.includes(10));
    assert.equal(await page.evaluate(() => ChatApp.musicHasRange()), false);
    await page.evaluate(() => {
      window.seekAt = performance.now();
      audio.addEventListener('seeked', () => { window.seekLatency = performance.now() - seekAt; }, {once:true});
      audio.currentTime = 151;
    });
    await page.waitForFunction(() => !audio.seeking && audio.currentTime > 151.02, undefined, {timeout:5000});
    const forward = await page.evaluate(() => Math.round(seekLatency));
    await page.evaluate(() => { audio.currentTime = 113; });
    await page.waitForFunction(() => !audio.seeking && audio.currentTime > 113.02 && audio.currentTime < 115);
    await page.evaluate(() => { audio.currentTime = 1; });
    await page.waitForFunction(() => !audio.seeking && audio.currentTime > 1.02 && audio.currentTime < 2);
    await page.evaluate(async () => {
      audio.pause(); releaseEarly(); await ChatApp.musicGetAudioURL(track);
    });
    await page.waitForFunction(async () => !!(await ChatApp.readMusicFile(track)));
    await page.reload(); await page.evaluate(() => init.forEach(fn => fn()));
    await page.evaluate(({size, duration, count}) => Object.assign(track, {blobId:'portable', mime:'audio/mpeg', size, duration, chunkCount:count}), {size:mp3.length,duration,count:parts.length});
    await page.waitForFunction(async () => !!(await ChatApp.readMusicFile(track)));
    assert.ok(await page.evaluate(async () => {
      const audio = new Audio(await ChatApp.musicGetAudioURL(track)); audio.currentTime = 90; await audio.play(); audio.pause();
      return reads.length === 0 && audio.currentTime >= 90;
    }));
    // Xing declares variable bitrate. A size/time estimate would incorrectly
    // jump past the withheld parts. Restoring them lets normal decode finish.
    mp3.write('Xing', info); parts[0] = mp3.subarray(0, chunk).toString('base64');
    await page.evaluate(async parts => {
      track.blobId = 'variable';
      ChatApp.db.ref = path => ({async once() {
        const i = Number(path.split('/').pop()); reads.push(i);
        if (i >= 5 && i <= 10) await hold;
        return {val:() => parts[i]};
      }});
      window.audio = new Audio(await ChatApp.musicGetAudioURL(track, {onStreamError() { throw Error('Bad fallback'); }}));
      audio.addEventListener('seeking', () => ChatApp.seekMusicStream(audio.src, audio.currentTime));
      await audio.play();
    }, parts);
    await page.waitForFunction(() => reads.includes(10) && audio.currentTime > .02);
    await page.evaluate(() => { audio.currentTime = 151; });
    await page.waitForFunction(() => audio.seeking);
    await page.evaluate(() => ChatApp.seekMusicStream(audio.src, audio.currentTime));
    assert.ok(await page.evaluate(() => !reads.some(i => i > 10)), 'variable bitrate never uses a fixed byte/time mapping');
    await page.evaluate(() => releaseEarly());
    await page.waitForFunction(() => !audio.seeking && audio.currentTime >= 151);
    // A file can carry a stale Info table after editing. A bad destination
    // header must request verified-file fallback instead of a guessed offset.
    mp3.write('Info', info);
    const part = Math.floor((first + (Math.floor(151 * 48000 / 1152) - 4) * stride) / chunk);
    const anchor = first + Math.ceil((part * chunk - first) / stride) * stride;
    mp3[anchor] = 0;
    parts[0] = mp3.subarray(0, chunk).toString('base64');
    parts[part] = mp3.subarray(part * chunk, (part + 1) * chunk).toString('base64');
    await page.evaluate(async parts => {
      audio.pause(); track.blobId = 'stale-index'; window.reads = [];
      window.hold = new Promise(resolve => window.releaseEarly = resolve);
      ChatApp.db.ref = path => ({async once() {
        const i = Number(path.split('/').pop()); reads.push(i);
        if (i >= 5 && i <= 10) await hold;
        return {val:() => parts[i]};
      }});
      window.audio = new Audio();
      audio.src = await ChatApp.musicGetAudioURL(track, {onStreamError(url) {
        window.fallbackPosition = audio.currentTime;
        ChatApp.releaseMusicStream(url, true);
        window.recovered = ChatApp.musicGetAudioURL(track).then(file => {
          audio.src = file; audio.currentTime = fallbackPosition; return audio.play();
        });
      }});
      audio.addEventListener('seeking', () => ChatApp.seekMusicStream(audio.src, audio.currentTime));
      await audio.play();
    }, parts);
    await page.waitForFunction(() => reads.includes(10) && audio.currentTime > .02);
    await page.evaluate(() => { audio.currentTime = 151; });
    await page.waitForFunction(() => window.fallbackPosition >= 151);
    await page.evaluate(async () => { releaseEarly(); await recovered; });
    await page.waitForFunction(() => !audio.seeking && audio.currentTime > 151.02);
    assert.deepEqual(failures, []);
    console.log('Direct file: verified CBR MP3 jumped forward in ' + forward + ' ms and backward across missing chunks; Xing guard, stale-index recovery and zero-read disk replay passed.');
  } finally { await context.close(); await fs.unlink(shell); await fs.rmdir(dir); }
}

(async () => {
  const rootPrefix = '/fixture/';
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === rootPrefix) return res.writeHead(200, { 'Content-Type': 'text/html' }).end(pageHTML);
    if (!url.pathname.startsWith(rootPrefix)) return res.writeHead(404).end();
    const name = url.pathname.slice(rootPrefix.length);
    if (!['music-range-worker.js', ...modules.map(m => 'music/' + m + '.js')].includes(name)) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(await fs.readFile(path.join(root, name)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true, args:['--autoplay-policy=no-user-gesture-required'] });
  try {
    const context = await browser.newContext();
    await context.addInitScript(initialize);
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:' + server.address().port + rootPrefix);
    await page.evaluate(() => init.forEach(fn => fn()));
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await page.evaluate(async () => {
      window.audio = new Audio();
      audio.preload = 'auto'; audio.muted = false;
      audio.src = await ChatApp.musicGetAudioURL(track, { onStreamError() { throw new Error('Range playback failed'); } });
      document.body.append(audio); window.start = performance.now();
      audio.addEventListener('playing', () => { window.startLatency = performance.now() - start; }, {once:true});
      void audio.play();
    });
    assert.match(await page.evaluate(() => audio.src), /\/fixture\/music\/\.play\//);
    await page.waitForFunction(() => audio.currentTime > .02);
    const cold = await page.evaluate(() => startLatency);
    await page.evaluate(() => {
      window.seekAt = performance.now();
      audio.addEventListener('seeked', () => { window.seekLatency = performance.now() - seekAt; }, {once:true});
      audio.currentTime = 105;
    });
    await page.waitForFunction(() => !audio.seeking && audio.currentTime > 105.02);
    const far = await page.evaluate(() => ({ms: seekLatency, reads: [...reads]}));
    assert.ok(far.reads.some(i => i >= 100), 'requested destination bytes while earlier part withheld');
    assert.ok(far.reads.length < 70, 'decoder skipped preceding parts');
    await page.evaluate(() => { audio.currentTime = 1; });
    await page.waitForFunction(() => !audio.seeking && audio.currentTime > 1.02 && audio.currentTime < 5);
    const rangeChecks = await page.evaluate(async () => {
      const response = await fetch(audio.src, {headers:{Range:'bytes=0-3'}});
      const suffix = await fetch(audio.src, {headers:{Range:'bytes=-3'}});
      const outside = await fetch(audio.src, {headers:{Range:'bytes=' + track.size + '-'}});
      const boundary = await fetch(audio.src, {headers:{Range:'bytes=393215-393216'}});
      const edgeBytes = Array.from(new Uint8Array(await boundary.arrayBuffer()));
      return [edgeBytes, response.status, response.headers.get('content-range'), await response.text(), suffix.status, (await suffix.arrayBuffer()).byteLength, outside.status];
    });
    assert.deepEqual(rangeChecks, [[1, 2], 206, 'bytes 0-3/23040044', 'RIFF', 206, 3, 416]);
    const other = await context.newPage();
    await other.goto('http://127.0.0.1:' + server.address().port + rootPrefix);
    await other.evaluate(() => init.forEach(fn => fn()));
    await other.waitForFunction(() => !!navigator.serviceWorker.controller);
    assert.equal(await other.evaluate(async url => {
      try { await (await fetch(url, {headers:{Range:'bytes=0-3'}})).arrayBuffer(); return true; } catch { return false; }
    }, await page.evaluate(() => audio.src)), false, 'other tabs cannot use the owning document’s playback URL');
    await other.close();
    await page.evaluate(() => { audio.pause(); releaseEarly(); });
    const file = await page.evaluate(async () => {
      const url = await ChatApp.musicGetAudioURL(track);
      return (await (await fetch(url)).blob()).size;
    });
    assert.equal(file, 23040044);
    await page.waitForFunction(async () => !!(await ChatApp.readMusicFile(track)));
    await page.reload(); await page.evaluate(() => init.forEach(fn => fn()));
    await page.waitForFunction(async () => !!(await ChatApp.readMusicFile(track)));
    const reuse = await page.evaluate(async () => {
      const url = await ChatApp.musicGetAudioURL(track), audio = new Audio(url);
      audio.currentTime = 95; await audio.play(); audio.pause();
      const different = Object.assign({}, track);
      ChatApp.currentUser.code = 'someone else';
      return [url.startsWith('blob:'), reads.length, audio.currentTime, ChatApp.readMusicFile(different)];
    });
    assert.ok(reuse[0] && !reuse[1] && reuse[2] >= 95 && reuse[3] === null);
    await page.evaluate(async () => { ChatApp.currentUser.code = 'fixture'; await ChatApp.clearLocalMusicFiles(); });
    await page.waitForFunction(async () => !(await ChatApp.readMusicFile(track)));
    assert.deepEqual(errors, []);
    console.log('Real WAV: started in ' + Math.round(cold) + ' ms; cold forward seek in ' + Math.round(far.ms) + ' ms with an earlier part withheld; backward seek and zero-read replay after reload passed.');
    // A sandboxed srcdoc launcher has no persistent origin or worker scope.
    // Its ordinary audio path must still play when IndexedDB rejects access.
    await page.evaluate(markup => {
      const frame = document.createElement('iframe');
      frame.sandbox = 'allow-scripts'; frame.allow = 'autoplay'; frame.srcdoc = markup; document.body.append(frame);
    }, pageHTML);
    const embedded = page.frameLocator('iframe');
    await embedded.locator('button').waitFor();
    const frame = page.frames().find(child => child.parentFrame());
    await frame.waitForFunction(() => typeof ChatApp?.musicGetAudioURL === 'function' && init.length === 4);
    await frame.evaluate(async base64 => {
      init.forEach(fn => fn());
      const size = atob(base64).length;
      const song = { blobId:'embedded', mime:'audio/mpeg', size, duration:6, chunkCount:1, chunkBytes:192 * 1024 };
      ChatApp.db.ref = () => ({once:async () => ({val:() => base64})});
      window.audio = new Audio(await ChatApp.musicGetAudioURL(song, {onStreamError() { throw Error('Unexpected fallback'); }}));
      await audio.play(); audio.currentTime = 4;
    }, (await fs.readFile(path.join(root, 'assets/sounds/Ringing.mp3'))).toString('base64'));
    await frame.waitForFunction(() => !audio.seeking && audio.currentTime > 4.02);
    assert.equal(await frame.evaluate(() => ChatApp.musicHasRange()), false);
    console.log('Opaque srcdoc launcher played and sought without a worker or disk cache.');
    await context.close();
    await portableMP3(browser);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
