'use strict';
// Exercise the APK's stable appassets origin, Android bridge-1 ready handshake,
// drawer entry and real decoder through a touch seek with unavailable RTDB parts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const mock = require('../tests/firebase-mock.js');
const project = path.resolve(__dirname, '..'), root = path.resolve(process.env.CHAT_ANDROID_WEB_ROOT || project);
const base = 'https://appassets.androidplatform.net/app/', chunk = 192 * 1024;

(async () => {
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'build-info.json'))).nativeBridge, 1, 'supplied Android updater requires bridge 1');
  const browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'chrome', headless:true});
  try {
    const context = await browser.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, serviceWorkers:'block',
      userAgent:'Mozilla/5.0 (Linux; Android 13; Pixel 6 Build/TQ3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36 ChatAppMobile/1 Android' });
    await context.addInitScript(mock);
    await context.addInitScript(() => {
      window.__bridge = [];
      window.ChatAppNativeInfo = {platform:'android',version:1,backgroundPush:false,screenShare:true,screenShareAudio:false,notificationsPermission:'granted'};
      window.ChatAppNative = Object.freeze({postMessage(payload) { __bridge.push(JSON.parse(payload)); }});
      const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'currentTime');
      window.__seeks = [];
      Object.defineProperty(HTMLMediaElement.prototype,'currentTime',{...descriptor,set(value){
        if (this.id === 'chat-music-audio') __seeks.push(value);
        descriptor.set.call(this,value);
      }});
    });
    await context.route(/^https?:/, async route => {
      const url = new URL(route.request().url());
      if (!url.href.startsWith(base)) return route.fulfill({status:200,contentType:'application/json',body:'null'});
      const name = decodeURIComponent(url.pathname.slice(5));
      const file = path.resolve(root,name);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({status:404});
      return route.fulfill({path:file});
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(12000);
    await page.goto(base + 'index.html');
    await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true' && __bridge.some(m => m.type === 'ready'));
    await page.fill('#login-email','vincenzo.brogna@students.pittstonarea.com'); await page.tap('#btn-go-login');
    await page.fill('#login-code','TEST-USER'); await page.tap('#btn-login');
    await page.waitForFunction(() => ChatApp.currentUser?.code === 'TEST-USER');
    const clip = fs.readFileSync(path.join(root,'assets/sounds/Ringing.mp3'));
    const info = clip.indexOf('Info'), frames = clip.readUInt32BE(info+8), extent = clip.readUInt32BE(info+12);
    const first = clip.length-extent, stride=extent/(frames+1), repeat=32;
    const mp3=Buffer.concat([clip.subarray(0,first+stride), ...Array(repeat).fill(clip.subarray(first+stride))]);
    mp3.writeUInt32BE(frames*repeat,info+8); mp3.writeUInt32BE(mp3.length-first,info+12);
    const parts=[]; for(let i=0;i<mp3.length;i+=chunk)parts.push(mp3.subarray(i,i+chunk).toString('base64'));
    await page.evaluate(async ({parts,size,chunk,duration}) => {
      window.__releaseParts = null;
      const gate = new Promise(resolve => { window.__releaseParts = resolve; });
      const ref = ChatApp.db.ref.bind(ChatApp.db);
      ChatApp.db.ref = key => {
        if(!key.startsWith('music/audio/delayed/parts/')) return ref(key);
        return {async once() {
          const part = Number(key.split('/').pop()); if(part >= 5 && part <= 10) await gate;
          return {val:() => parts[part]};
        }};
      };
      const track={title:'Delayed MP3',blobId:'delayed',mime:'audio/mpeg',size,chunkBytes:chunk,chunkCount:parts.length,duration};
      await __testDatabase.ref('music/playlists/mobile').set({name:'Mobile test',ownerCode:'TEST-USER',tracks:{song:track}});
      await ChatApp.musicWatchPlaylist('mobile');
    }, {parts,size:mp3.length,chunk,duration:frames*repeat*1152/48000});
    await page.tap('#btn-mobile-nav');
    await page.tap('#btn-music');
    await page.locator('#music-screen').waitFor({state:'visible'});
    await page.locator('#music-playlists [data-music-key="mobile"]').tap();
    await page.locator('#music-tracks [data-music-key="song"] .music-track-number').tap();
    await page.waitForFunction(() => ChatApp.musicState.playing && ChatApp.musicAudio.currentTime > .02);
    await page.evaluate(() => { ChatApp.musicControl('seek',151); });
    await page.waitForFunction(() => !ChatApp.musicAudio.seeking && !ChatApp.musicAudio.muted && ChatApp.musicAudio.currentTime>151.02);
    const slider=page.locator('#music-bottom-player [data-music-seek]'), box=await slider.boundingBox();
    const duration = await slider.evaluate(s=>+s.max);
    const cdp = await context.newCDPSession(page), y=box.y+box.height/2;
    const point = seconds=>[{x:box.x+box.width*seconds/duration,y}];
    const touch = (type,seconds)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:seconds===undefined?[]:point(seconds)});
    await page.evaluate(() => { __seeks.length = 0; });
    await touch('touchStart',151); await touch('touchMove',125); await touch('touchMove',89); await touch('touchMove',70);
    const drag=await page.evaluate(() => ({writes:[...__seeks],muted:ChatApp.musicAudio.muted,time:ChatApp.musicState.position}));
    assert.deepEqual(drag.writes, [], 'touch drag previews without issuing decoder seeks');
    assert.ok(drag.muted && Math.abs(drag.time-70)<1, 'old output gated and preview follows finger');
    await touch('touchEnd');
    await page.waitForFunction(()=>ChatApp.musicAudio.seeking && ChatApp.musicAudio.muted);
    assert.equal(await page.evaluate(()=>__seeks.length),1,'one release commits exactly one decoder seek');
    const clock = await page.evaluate(()=>ChatApp.musicJamClock());
    assert.ok(!clock.playing && Math.abs(clock.position-70)<1,'shared clock waits at the chosen position during buffering');
    await page.evaluate(async()=>{ChatApp.musicControl('volume',85); await new Promise(resolve=>setTimeout(resolve,700));});
    const waiting=await page.evaluate(()=>[ChatApp.musicAudio.muted,ChatApp.musicState.position,document.querySelector('#music-bottom-player [data-music-position]').textContent]);
    assert.ok(waiting[0] && Math.abs(waiting[1]-70)<1 && /^1:(09|10)$/.test(waiting[2]), 'stale media ticks cannot overwrite the selected time or unmute old audio');
    await page.evaluate(()=>__releaseParts());
    await page.waitForFunction(()=>!ChatApp.musicAudio.muted && !ChatApp.musicAudio.seeking && !ChatApp.musicAudio.paused && Math.abs(ChatApp.musicAudio.currentTime-70)<1.5);
    assert.equal(await page.evaluate(()=>ChatApp.musicAudio.volume),.85);
    await page.locator('#music-tracks .music-icon-button').last().tap();
    await page.locator('#music-context-menu').waitFor({state:'visible'});
    const back=()=>page.evaluate(()=>!window.dispatchEvent(new Event('chatapp:nativeback',{cancelable:true})));
    assert.equal(await back(),true);
    await page.locator('#music-context-menu').waitFor({state:'hidden'});
    assert.equal(await page.locator('#music-screen').isVisible(),true);
    assert.equal(await back(),true);
    await page.locator('#music-screen').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>ChatApp.musicState.playing && document.querySelectorAll('#chat-music-audio').length===1),true);
    assert.deepEqual(errors,[]);
    await context.close();
    console.log('Android-origin bridge ready, drawer Music entry, real CBR MP3, one seek per touch drag, muted waiting, latest position retention, saved volume and layered Back passed.');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
