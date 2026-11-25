'use strict';
// Fixed, offline release-owner diagnostic. It cannot sign in or reach Firebase.
// Never enable inspector fuses or use the user's ordinary profile for QA.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function run({ app, BrowserWindow, mainWindow, contents, callTray }) {
  const profile = process.env.CHAT_APP_TEST_PROFILE;
  if (process.env.CHAT_APP_NOTIFICATION_SELFTEST !== '1' || process.env.CHAT_APP_OFFLINE !== '1' || !path.isAbsolute(profile || '')) throw new Error('Notification diagnostic requires an absolute isolated offline profile.');
  const report = { version: app.getVersion(), packaged: app.isPackaged, at: new Date().toISOString(), checks: [], limitations: 'Windows hit testing and Electron pointer dispatch against an ordinary fullscreen window. Physical game performance, exclusive fullscreen, secure desktops and live production accounts require separate verification.' };
  let blocker;
  const until = async (read, label) => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) { if (await read()) return; await delay(50); }
    throw new Error(`Timed out: ${label}`);
  };
  const runWeb = code => contents.executeJavaScript(code);
  const popup = title => BrowserWindow.getAllWindows().find(win => win.getTitle() === title);
  const policy = dnd => runWeb(`chatDesktopNotifications.setPolicy({statusReady:true,pushEnabled:true,doNotDisturb:${dnd},activeRoomId:'selftest-room'});true`);
  const ring = () => runWeb(`chatDesktopRings.publish({statusReady:true,doNotDisturb:false,rings:[{id:'selftest-ring',roomId:'selftest-room',roomName:'Study Group',expiresAt:Date.now()+30000}]});true`);
  const ping = id => runWeb(`chatDesktopNotifications.showPing({id:${JSON.stringify(id)},roomId:'selftest-room',messageKey:${JSON.stringify(id)},roomName:'Study Group',username:'Alex',preview:'Ready for the review session?'})`);
  const localPoint = async (win, selector) => {
    const point = await win.webContents.executeJavaScript(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
    return point;
  };
  const hit = async (win, selector) => {
    const { screen } = require('electron');
    const local = await localPoint(win, selector), bounds = win.getContentBounds();
    const point = screen.dipToScreenPoint({x:bounds.x+local.x,y:bounds.y+local.y});
    const exec = require('node:util').promisify(require('node:child_process').execFile);
    const result = await exec(require('./rings.cjs').presentationHelper, ['--hit-test',String(point.x),String(point.y)], {windowsHide:true,timeout:3000});
    return result.stdout.trim();
  };
  const hwnd = win => win.getNativeWindowHandle().readBigUInt64LE().toString();
  const click = async (win, selector) => {
    const point=await localPoint(win,selector);
    for (const type of ['mouseDown','mouseUp']) win.webContents.sendInputEvent({type,...point,button:'left',clickCount:1});
  };
  async function startFrameSample() {
    await blocker.webContents.executeJavaScript(`new Promise(started => {
      const gaps = [];
      window.fixtureFrames = new Promise(finished => {
        requestAnimationFrame(first => {
          started(true);
          let previous = first;
          function frame(time) {
            gaps.push(time - previous);
            previous = time;
            if (time - first < 1250) return requestAnimationFrame(frame);
            gaps.sort((a,b) => a-b);
            const rounded = value => Math.round(value*10)/10;
            finished({intervals:gaps.length, durationMs:rounded(time-first),
              p95Ms:rounded(gaps[Math.ceil(gaps.length*.95)-1]), maxMs:rounded(gaps.at(-1))});
          }
          requestAnimationFrame(frame);
        });
      });
    })`);
  }
  try {
    await runWeb(`ChatApp.syncDesktopNotificationPolicy=()=>{}; window.__diagnosticRingCommands=[];window.__diagnosticPingCommands=[];chatDesktopRings.onCommand(x=>__diagnosticRingCommands.push(x));chatDesktopNotifications.onPingCommand(x=>__diagnosticPingCommands.push(x));true`);
    await policy(false);
    blocker = new BrowserWindow({ title:'Notification fullscreen diagnostic', show:false, fullscreen:true, backgroundColor:'#101820', webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true} });
    await blocker.loadURL('data:text/html,<title>Notification fullscreen diagnostic</title><body style="background:%23101820;color:%23d9e6f2;font:24px Segoe UI;padding:70px">Chat App notification diagnostic</body>');
    mainWindow.minimize(); blocker.show(); blocker.focus();
    await until(() => blocker.isFocused(), 'fullscreen fixture focus');
    // Two equal foreground samples, with no synthetic cursor or keyboard input.
    await startFrameSample();
    report.foregroundFrameIntervals = { idle: await blocker.webContents.executeJavaScript('fixtureFrames') };
    await startFrameSample();
    const firstArrival = performance.now();
    await ring(); await ping('selftest-first');
    await until(() => popup('Chat App Incoming Calls')?.isVisible() && popup('Chat App Pings')?.isVisible(), 'both popups shown');
    const rings = popup('Chat App Incoming Calls'), buttons = popup('Chat App Call Buttons'), pings = popup('Chat App Pings');
    assert.equal(rings.isAlwaysOnTop(), true); assert.equal(pings.isAlwaysOnTop(), true);
    assert.equal(rings.isFocused(), false); assert.equal(pings.isFocused(), false); assert.equal(blocker.isFocused(), true); assert.equal(mainWindow.isMinimized(), true);
    report.warmRingAndPingPublishToObservedVisibleMs = Math.round((performance.now() - firstArrival)*10)/10;
    report.foregroundFrameIntervals.ringAndMention = await blocker.webContents.executeJavaScript('fixtureFrames');
    report.displayBounds = {call:rings.getBounds(), buttons:buttons.getBounds(), ping:pings.getBounds()};
    assert.ok(rings.getBounds().y + rings.getBounds().height + 10 <= pings.getBounds().y, JSON.stringify(report.displayBounds));
    report.checks.push('Online call and same-room ping show above an ordinary fullscreen window without activation; stacks do not overlap');
    assert.equal(await hit(rings,'.name'),hwnd(blocker),'Windows routes ring body to the underlying fullscreen window');
    assert.equal(await hit(buttons,'.join'),hwnd(buttons),'Windows routes Join to the action window');
    assert.equal(await hit(buttons,'.decline'),hwnd(buttons),'Windows routes Decline to the action window');
    assert.equal(await hit(pings,'.ping-user'),hwnd(pings),'Windows routes notification to its own window');
    await click(buttons,'.decline');
    await until(() => runWeb('__diagnosticRingCommands.at(-1)?.action==="decline"'), 'Decline delivery');
    report.checks.push('Windows WindowFromPoint resolves the ring body to the underlying fullscreen app, both buttons to their permanent hit regions and the ping card to its own window. Decline dispatch reaches the web bridge.');
    await fs.writeFile(path.join(profile,'notification-rings.png'), (await rings.webContents.capturePage()).toPNG());
    await fs.writeFile(path.join(profile,'notification-ping.png'), (await pings.webContents.capturePage()).toPNG());
    assert.equal(await pings.webContents.executeJavaScript('!!document.querySelector(".ping-close svg")'), true);
    await pings.webContents.executeJavaScript('document.querySelector(".ping-close").click();true');
    await until(() => !pings.isVisible(), 'X dismisses');
    assert.equal(await runWeb('__diagnosticPingCommands.length'), 0);
    assert.equal(blocker.isFocused(), true);
    assert.equal(await ping('selftest-first'), true); await delay(100); assert.equal(pings.isVisible(), false);
    report.checks.push('SVG X dismisses without opening the app; duplicate transport ID cannot replay after dismissal');
    await ping('selftest-dnd'); await until(() => pings.isVisible(), 'next ping');
    await policy(true); await until(() => !rings.isVisible() && !pings.isVisible(), 'DND suppresses calls and pings');
    assert.equal(await ping('selftest-blocked'), false);
    report.checks.push('DND hides outstanding surfaces and rejects new pings');
    await policy(false); await ping('selftest-recovery'); await until(() => pings.isVisible(), 'pre-crash ping');
    pings.webContents.forcefullyCrashRenderer();
    await until(() => popup('Chat App Pings') && popup('Chat App Pings') !== pings && popup('Chat App Pings').isVisible(), 'ping renderer recovery');
    report.checks.push('Renderer crash recreates the ping surface without losing the pending mention');
    const recovered = popup('Chat App Pings');
    await click(recovered,'.ping-user');
    await until(() => runWeb('__diagnosticPingCommands.at(-1)?.roomId==="selftest-room" && __diagnosticPingCommands.at(-1)?.messageKey==="selftest-recovery"'), 'exact ping target');
    await until(() => mainWindow.isFocused() && !mainWindow.isMinimized(),'restored main window');
    await ring();
    await until(() => buttons.isVisible(),'new ring');
    await click(buttons,'.join');
    await until(() => runWeb('__diagnosticRingCommands.at(-1)?.action==="join"'), 'Join delivery');
    report.checks.push('A recovered ping click restores the EXE and delivers its exact room and message key. Join reaches the web bridge.');
    const badges = [], setOverlay = mainWindow.setOverlayIcon.bind(mainWindow);
    mainWindow.setOverlayIcon = (icon, label) => { badges.push({ icon:!!icon, label }); return setOverlay(icon,label); };
    await runWeb('chatDesktopNotifications.setUnreadCount(9);true'); await delay(70);
    await runWeb('chatDesktopNotifications.setUnreadCount(0);true'); await delay(70);
    assert.equal(badges.at(-1).icon, false); assert.equal(badges.at(-1).label, 'No unread messages');
    mainWindow.setOverlayIcon = setOverlay;
    report.checks.push('Actual taskbar badge accepts absolute nine and clears to zero');
    callTray.open(); await until(() => BrowserWindow.getAllWindows().some(win => win.webContents.getURL().endsWith('/tray.html')), 'tray');
    const tray = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().endsWith('/tray.html'));
    await until(() => tray.webContents.executeJavaScript('document.querySelectorAll("footer button").length===2'), 'tray ready');
    assert.deepEqual(await tray.webContents.executeJavaScript('[...document.querySelectorAll("footer button")].map(x=>x.textContent.trim())'), ['Open','Quit']);
    report.checks.push('Tray labels are Open and Quit');
    report.ok = true;
  } catch (error) { report.ok = false; report.error = error.stack || error.message; }
  finally {
    if (blocker && !blocker.isDestroyed()) blocker.destroy();
    await fs.writeFile(path.join(profile,'native-notifications-selftest.json'), JSON.stringify(report,null,2));
  }
  return report;
}
module.exports = { run };

// Fixed offline native bridge/tray diagnostic. Never signs in or writes to Firebase.
async function runMusic({ app, BrowserWindow, mainWindow, contents, callTray }) {
  const profile = process.env.CHAT_APP_TEST_PROFILE;
  if (process.env.CHAT_APP_MUSIC_SELFTEST !== '1' || process.env.CHAT_APP_OFFLINE !== '1' || !path.isAbsolute(profile || '')) throw new Error('Music diagnostic requires an absolute isolated offline profile.');
  const report = { version: app.getVersion(), packaged: app.isPackaged, at: new Date().toISOString(), checks: [] };
  const timed = async (promise, label) => { let timer; try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), 10000); })]); } finally { clearTimeout(timer); } };
  const runWeb = code => timed(contents.executeJavaScript(code), 'shared renderer');
  const until = async (read, label) => { const deadline = Date.now() + 10000; while (Date.now() < deadline) { if (await timed(read(), label)) return; await delay(50); } throw new Error(`Timed out: ${label}`); };
  try {
    const photo = 'data:image/png;base64,' + (await fs.readFile(path.join(__dirname, 'assets/chat-app.png'))).toString('base64');
    await runWeb('window.__originalMusicControl=ChatApp.musicControl;true');
    await runWeb(`ChatApp.musicControl=()=>{};window.__musicCommands=[];window.__musicDiagnosticDetach=chatDesktopMusic.onMusicAction(x=>__musicCommands.push(x));window.__trayMusicFixture={trackId:'native-music-test',title:'Music test',artist:'Chat App',album:'Offline fixture',playing:true,position:12,duration:180,volume:125,shuffle:true,repeat:'all'};chatDesktopMusic.setMusicState({...__trayMusicFixture,photoDataURL:${JSON.stringify(photo)},photoTransform:{x:0,y:0,scale:1}});true`);
    callTray.open();
    await until(() => BrowserWindow.getAllWindows().some(win => win.webContents.getURL().endsWith('/tray.html')), 'tray');
    const tray = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().endsWith('/tray.html'));
    await until(() => tray.webContents.executeJavaScript('!document.getElementById("music").hidden'), 'music visible');
    assert.equal(await tray.webContents.executeJavaScript('document.getElementById("music-title").textContent'), 'Music test');
    assert.equal(await tray.webContents.executeJavaScript('document.getElementById("music-volume").value'), '125');
    await until(() => tray.webContents.executeJavaScript('document.getElementById("music-art-image").naturalWidth>0'), 'decoded uploaded art');
    assert.equal(await tray.webContents.executeJavaScript('document.getElementById("music-album").textContent'), 'Offline fixture');
    assert.equal(await tray.webContents.executeJavaScript('document.getElementById("music-volume").step'), '5');
    await tray.webContents.executeJavaScript('document.querySelector("[data-music=previous]").click();document.querySelector("[data-music=toggle]").click();document.querySelector("[data-music=next]").click();document.querySelector("[data-music=shuffle]").click();document.querySelector("[data-music=repeat]").click();true');
    await until(() => runWeb('__musicCommands.length===5'), 'transport commands');
    assert.deepEqual(await runWeb('__musicCommands.map(x=>x.action)'), ['previous','toggle','next','shuffle','repeat']);
    await tray.webContents.executeJavaScript('const slider=document.getElementById("music-volume");slider.value="200";slider.dispatchEvent(new Event("input",{bubbles:true}));true');
    await until(() => runWeb('__musicCommands.some(x=>x.action==="volume"&&x.value===200)'), 'volume 200');
    report.checks.push('Packaged preload publishes live music; previous, play/pause, next, shuffle, repeat and 200% volume reach the shared renderer');
    await tray.webContents.executeJavaScript('const seekRange=document.getElementById("music-seek");seekRange.value="72.5";seekRange.dispatchEvent(new Event("input",{bubbles:true}));true');
    await until(() => runWeb('__musicCommands.some(x=>x.action==="seek"&&x.value===72.5&&x.trackId==="native-music-test")'), 'seek IPC');
    await runWeb('const avatarCanvas=document.createElement("canvas");avatarCanvas.width=avatarCanvas.height=24;avatarCanvas.getContext("2d").fillRect(1,1,22,22);chatDesktopMusic.setMusicState({...__trayMusicFixture,position:72.5,playing:false,guest:true,jamState:"shared",jamPeople:[{code:"peer",displayName:"Guest",avatar:avatarCanvas.toDataURL()}]});true');
    await until(() => tray.webContents.executeJavaScript('document.getElementById("music-seek").disabled'), 'listener lock');
    assert.equal(await tray.webContents.executeJavaScript('document.getElementById("music-art-image").naturalWidth>0 && !document.getElementById("music-art-image").hidden'), true);
    assert.equal(await tray.webContents.executeJavaScript('document.getElementById("music-volume").disabled'), false);
    await tray.webContents.executeJavaScript('const guestVolume=document.getElementById("music-volume");guestVolume.value="55";guestVolume.dispatchEvent(new Event("input"));true');
    await until(() => runWeb('__musicCommands.some(x=>x.action==="volume"&&x.value===55)'), 'guest output gain command');
    await tray.webContents.executeJavaScript('document.querySelector("[data-music=jam]").dispatchEvent(new PointerEvent("pointerover",{bubbles:true}));true');
    await until(() => tray.webContents.executeJavaScript('document.querySelector("#music-tooltip.visible img")?.naturalWidth===24'), 'decoded Jam avatar');
    assert.equal(await tray.webContents.executeJavaScript('document.querySelector("#music-tooltip [role=listitem] > :last-child").textContent'), 'Guest');
    await tray.webContents.executeJavaScript('document.querySelector("[data-music=jam]").click();true');
    await until(() => runWeb('__musicCommands.some(x=>x.action==="jam")'), 'Jam button IPC');
    callTray.open();
    await tray.webContents.executeJavaScript('document.getElementById("music-art").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true}));true');
    assert.deepEqual(await tray.webContents.executeJavaScript('[...document.querySelectorAll("#icon-menu:not([hidden]) button")].map(x=>x.textContent.trim())'), ['Download Icon','Copy Icon Address']);
    await tray.webContents.executeJavaScript('document.querySelector("[data-icon=download-icon]").click();true');
    await until(() => runWeb('__musicCommands.some(x=>x.action==="download-icon"&&x.trackId==="native-music-test")'), 'download icon IPC');
    await runWeb('chatDesktopMusic.setMusicState({...__trayMusicFixture,position:72.5,playing:false});true');
    report.checks.push('Decoded cover and Jam avatar, member name, Jam button IPC, guest 55% volume, seek 72.5s, locked guest transport and artwork context menu');
    callTray.open();
    await fs.writeFile(path.join(profile,'native-music-tray.png'), (await timed(tray.webContents.capturePage(), 'tray capture')).toPNG());
    mainWindow.minimize();
    await runWeb(`chatDesktopMusic.setMusicState({trackId:'native-music-test',title:'Music test',artist:'Chat App',playing:false,position:24,duration:180,volume:0,blocked:true,photoDataURL:''});true`);
    callTray.open();
    await until(() => tray.webContents.executeJavaScript('document.querySelector("[data-music=toggle]").disabled'), 'Spotify lock');
    assert.equal(await tray.webContents.executeJavaScript('document.getElementById("music-volume").value'), '0');
    assert.equal(await tray.webContents.executeJavaScript('document.querySelector("[data-music=stop]").disabled'), false);
    assert.equal(await tray.webContents.executeJavaScript('document.getElementById("music-art-image").hidden'), true);
    report.checks.push('Live paused/Spotify-blocked state and 0% volume update while the main window is minimized; stop remains available');
    await runWeb('(async()=>{window.__musicDiagnosticAudio=new AudioContext();await __musicDiagnosticAudio.resume();return true;})()');
    mainWindow.close(); await delay(150);
    assert.equal(mainWindow.isVisible(), false); assert.equal(contents.isDestroyed(), false);
    assert.equal(await runWeb('__musicDiagnosticAudio.state'), 'running');
    await runWeb('__musicDiagnosticAudio.close().then(()=>true)');
    report.checks.push('Closing to the tray preserves the same shared renderer and a running audio context; no microphone or audible test tone is used');
    await runWeb('chatDesktopMusic.setMusicState(null);true');
    callTray.open();
    await until(() => tray.webContents.executeJavaScript('document.getElementById("music").hidden'), 'clear music');
    report.checks.push('Clearing the track removes the music section without disturbing Open/Quit');
    // Exercise the actual bundled player with local silent media. There is no
    // account login, presence session, Firebase write, microphone, or live Jam.
    const wav = Buffer.alloc(44 + 8 * 8000, 128);
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(8000, 28); wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34);
    wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
    const played = await timed(contents.executeJavaScript(`(async()=>{
      ChatApp.musicControl = __originalMusicControl;
      ChatApp.currentUser = {code:'native-offline-listener',displayName:'Offline'};
      const track = {id:'decoded',title:'Decoded fixture',artist:'Offline',duration:8,blobId:'offline-wav',photoDataURL:${JSON.stringify(photo)}};
      ChatApp.musicGetTracks = () => [track];
      const bytes = Uint8Array.from(atob(${JSON.stringify(wav.toString('base64'))}), ch => ch.charCodeAt(0));
      window.__offlineWav = URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));
      ChatApp.musicGetAudioURL = async () => __offlineWav;
      return ChatApp.musicPlay('audio:native-offline-listener', track.id);
    })()`, true), 'bundled silent media playback');
    assert.equal(played, true);
    callTray.open();
    await until(() => tray.webContents.executeJavaScript('document.getElementById("music-title").textContent==="Decoded fixture" && !document.getElementById("music-seek").disabled'), 'actual player metadata');
    await tray.webContents.executeJavaScript('const realSeek=document.getElementById("music-seek");realSeek.value="4";realSeek.dispatchEvent(new Event("input"));true');
    await until(() => runWeb('ChatApp.musicAudio.currentTime>=3.9 && ChatApp.musicAudio.currentTime<6'), 'actual media seek');
    await tray.webContents.executeJavaScript('const realVolume=document.getElementById("music-volume");realVolume.value="85";realVolume.dispatchEvent(new Event("input"));document.querySelector("[data-music=toggle]").click();true');
    await until(() => runWeb('ChatApp.musicState.volume===85 && ChatApp.musicAudio.paused'), 'actual volume and pause');
    const clickVolume = () => tray.webContents.executeJavaScript('document.getElementById("music-volume-button").click();true');
    await until(() => tray.webContents.executeJavaScript('document.getElementById("music-volume").value==="85"'), 'tray volume synchronization');
    await clickVolume();
    await until(() => tray.webContents.executeJavaScript('document.getElementById("music-volume-button").getAttribute("aria-pressed")==="true" && document.getElementById("music-volume-value").textContent==="0%"'), 'tray mute');
    await clickVolume();
    await until(() => runWeb('ChatApp.musicState.volume===85'), 'tray restores the previous volume');
    report.checks.push('The speaker button mutes the bundled player to 0% and restores 85% from the native tray');
    for (const mode of ['all', 'one', 'off']) {
      assert.equal(await tray.webContents.executeJavaScript('document.querySelector("[data-music=repeat]").disabled'), false);
      await tray.webContents.executeJavaScript('document.querySelector("[data-music=repeat]").click();true');
      await until(() => runWeb('ChatApp.musicState.repeat===' + JSON.stringify(mode)), 'standalone repeat ' + mode);
    }
    assert.equal(await tray.webContents.executeJavaScript('document.querySelector("[data-music=next]").disabled'), true);
    report.checks.push('Standalone Repeat cycles through All, One and Off through the packaged tray and shared player');
    await runWeb('ChatApp.musicControl("stop");URL.revokeObjectURL(__offlineWav);true');
    report.checks.push('The bundled shared audio element decoded a silent WAV, sought to four seconds, applied 85% volume and paused from the Windows tray');
    report.ok = true;
  } catch (error) { report.ok = false; report.error = error.stack || error.message; }
  finally { await fs.writeFile(path.join(profile,'native-music-selftest.json'), JSON.stringify(report,null,2)); }
  return report;
}
module.exports.runMusic = runMusic;
