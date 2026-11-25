'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { bootstrap } = require('../tests/screen-focus.browser.cjs');

(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const { page, context, errors } = await bootstrap(browser, { width: 1440, height: 900 }, false);
    await page.evaluate(() => {
      ChatApp.callPublishScreenPreview = async () => {};
      ChatApp.callSharing = true;
      ChatApp.callScreenStream = __focusTestStream.clone();
      ChatApp.callScreenTrack = ChatApp.callScreenStream.getVideoTracks()[0];
      ChatApp.callScreenShareId = 'same-generation';
      ChatApp.callScreenSourceId = 'screen:old';
      ChatApp.callWatchedShareCodes.add('TEST-USER');
      ChatApp.callFocusedShareCode = 'ALICE'; ChatApp.callMultiViewEnabled = false;
      ChatApp.renderCallMenu();
      ChatApp.syncCallControlsUI();
    });
    assert.equal(await page.locator('#btn-call-change-source').isVisible(), true);
    await page.locator('#btn-call-change-source').click();
    await page.locator('#call-capture-picker [data-source-id="__browser_picker__"]').waitFor();
    assert.equal(await page.locator('#call-capture-title').textContent(), 'Change Shared Source');
    await page.waitForTimeout(180);
    if (process.env.CHAT_CAPTURE_REVIEW) await page.screenshot({path:require('node:path').resolve(process.env.CHAT_CAPTURE_REVIEW,'change-source.png')});
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => ChatApp.callScreenTrack.readyState), 'live');
    await page.locator('#btn-sidebar-call-share').click();
    assert.equal(await page.locator('#sidebar-media-menu .sidebar-change-source').isVisible(), true);
    await page.locator('#sidebar-media-menu .sidebar-change-source').click();
    assert.equal(await page.locator('#call-capture-title').textContent(), 'Change Shared Source');
    await page.keyboard.press('Escape');

    const replace = await page.evaluate(async () => {
      const App = ChatApp, old = App.callScreenStream, generation = App.callScreenShareId;
      const watched = [...App.callWatchedShareCodes];
      const incoming = __focusTestStream.clone();
      App.callRequestDisplayStream = async () => incoming;
      const success = await App.callChangeSharedSource({ shareAudio: false });
      return { success, sameGeneration: generation === App.callScreenShareId, watched: [...App.callWatchedShareCodes], previousWatched: watched,
        oldEnded: old.getVideoTracks()[0].readyState, newLive: incoming.getVideoTracks()[0].readyState, focus: App.callFocusedShareCode };
    });
    assert.equal(replace.success, true); assert.equal(replace.sameGeneration, true);
    assert.deepEqual(replace.watched, replace.previousWatched); assert.equal(replace.oldEnded, 'ended'); assert.equal(replace.newLive, 'live'); assert.equal(replace.focus, 'ALICE');

    const rollback = await page.evaluate(async () => {
      const App = ChatApp, old = App.callScreenStream, oldTrack = App.callScreenTrack;
      App.callRequestDisplayStream = async () => { throw new DOMException('Canceled', 'NotAllowedError'); };
      const canceled = await App.callChangeSharedSource();
      const candidate = __focusTestStream.clone();
      App.callRequestDisplayStream = async () => candidate;
      const original = App.callSetPeerScreenTrack, calls = [];
      App.callPeerMap.set('test-viewer', {});
      App.callSetPeerScreenTrack = async (_pc, track) => { calls.push(track.id); if (track !== oldTrack) throw new Error('replace failed'); };
      const failed = await App.callChangeSharedSource();
      App.callPeerMap.delete('test-viewer'); App.callSetPeerScreenTrack = original;
      return { canceled, failed, preserved: old === App.callScreenStream && oldTrack === App.callScreenTrack,
        oldLive: oldTrack.readyState, candidateEnded: candidate.getVideoTracks()[0].readyState, rollbackAttempted: calls.at(-1) === oldTrack.id };
    });
    assert.deepEqual(rollback, { canceled: false, failed: false, preserved: true, oldLive: 'live', candidateEnded: 'ended', rollbackAttempted: true });

    const camera = await page.evaluate(async () => {
      const App = ChatApp, front = __focusTestStream.clone(), back = __focusTestStream.clone(), originalFrontTrack = front.getVideoTracks()[0];
      App.callCameraStream = front; App.callCameraTrack = front.getVideoTracks()[0]; App.callCameraShareId = 'camera-stable'; App.callCameraSharing = true;
      Object.defineProperty(App.callCameraTrack, 'getSettings', { configurable: true, value: () => ({ facingMode: 'user', deviceId: 'front' }) });
      Object.defineProperty(App.callCameraTrack, 'getCapabilities', { configurable: true, value: () => ({ facingMode: ['user', 'environment'] }) });
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => back });
      await App.callRefreshCameraFlipSupport();
      const supported = !!App.callCameraFlipTarget;
      let candidateVisibleDuringReplace = false;
      const setCamera = App.callSetPeerCameraTrack;
      App.callPeerMap.set('camera-race', {});
      App.callSetPeerCameraTrack = async (_pc, track) => { await Promise.resolve(); candidateVisibleDuringReplace = App.callCameraTrack === track; };
      const success = await App.callSwapCameraSide();
      App.callPeerMap.delete('camera-race'); App.callSetPeerCameraTrack = setCamera;
      const stable = App.callCameraShareId === 'camera-stable';
      App.callCameraFlipTarget = { facingMode: 'user' };
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => { throw new DOMException('Busy', 'NotReadableError'); } });
      const failed = await App.callSwapCameraSide();
        return { supported, success, failed, stable, candidateVisibleDuringReplace, oldEnded: originalFrontTrack.readyState, live: App.callCameraTrack.readyState };
    });
    assert.deepEqual(camera, { supported: true, success: true, failed: false, stable: true, candidateVisibleDuringReplace: true, oldEnded: 'ended', live: 'live' });

    await page.evaluate(() => {
      const App=ChatApp, key=App.callCameraKey(App.currentUser.code);
      App.callCameraFlipTarget={facingMode:'user'};
      App.callWatchedShareCodes.add(key);App.callFocusedShareCode=key;App.callMultiViewEnabled=false;
      App.renderCallMenu();window.__flipClicks=0;window.__realFlip=App.callSwapCameraSide;
      App.callSwapCameraSide=()=>{window.__flipClicks++;};
    });
    const flipButton=page.locator('.call-camera-flip');
    assert.equal(await flipButton.isVisible(),true);
    await flipButton.hover();assert.equal(await page.evaluate(()=>__flipClicks),0,'hover never changes camera');
    await flipButton.click();assert.equal(await page.evaluate(()=>__flipClicks),1,'click swaps camera once');
    await page.evaluate(()=>{ChatApp.callSwapCameraSide=window.__realFlip;});

    const cameraRequestRace = await page.evaluate(async () => {
      const App=ChatApp, requests=[];
      Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:()=>new Promise(resolve=>requests.push(resolve))});
      App.callCameraFlipTarget={facingMode:'user'};
      const flipping=App.callSwapCameraSide();
      for(let i=0;i<100&&!requests.length;i++) await new Promise(resolve=>setTimeout(resolve,5));
      if(!requests.length) throw new Error('Camera flip never requested its source');
      App.callStopCamera({publish:false});
      const starting=App.callToggleCamera({deviceId:'new-camera'}), newest=App.callCameraCaptureRequest;
      const lateFlip=__focusTestStream.clone(); requests[0](lateFlip); await flipping;
      const preserved=App.callCameraCapturePending && App.callCameraCaptureRequest===newest;
      App.callStopCamera({publish:false}); const lateStart=__focusTestStream.clone(); requests[1](lateStart); await starting;
      return {preserved,lateFlipEnded:lateFlip.getVideoTracks()[0].readyState,lateStartEnded:lateStart.getVideoTracks()[0].readyState};
    });
    assert.deepEqual(cameraRequestRace,{preserved:true,lateFlipEnded:'ended',lateStartEnded:'ended'});

    await page.evaluate(() => {
      ChatApp.callConnectionQuality = { level: 'poor', label: 'Poor', issues: [{kind:'voice',text:'Voice with Alice is affected by packet loss.'},{kind:'stream',text:"Bob's screen is freezing."},{kind:'device',text:'Your device is struggling to encode video.'}], detail:'15% audio loss' };
      ChatApp.callSyncMenuStatusDisplay();
    });
    await page.locator('#sidebar-call-status').click();
    assert.match(await page.locator('#call-quality-details').textContent(), /Voice with Alice.*Bob's screen.*Your device/s);
    await page.keyboard.press('Escape');

    const loopback = await page.evaluate(async () => {
      const App = ChatApp, left = new RTCPeerConnection(), right = new RTCPeerConnection();
      const audio = new AudioContext(), oscillator = audio.createOscillator();
      const destinations = [audio.createMediaStreamDestination(), audio.createMediaStreamDestination()];
      destinations.forEach(destination => oscillator.connect(destination)); oscillator.start(); await audio.resume();
      const canvases = [], streams = [];
      for (const color of ['#ff0000', '#0000ff', '#00ff00']) {
        const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
        const pen = canvas.getContext('2d'); pen.fillStyle = color; pen.fillRect(0, 0, 320, 180);
        canvases.push({canvas,pen,color}); streams.push(canvas.captureStream(15));
      }
      streams[0].addTrack(destinations[0].stream.getAudioTracks()[0]);
      streams[2].addTrack(destinations[1].stream.getAudioTracks()[0]);
      const paint = setInterval(() => canvases.forEach(({pen,color}) => {pen.fillStyle = color; pen.fillRect(0,0,320,180);}), 65);
      const wait = async condition => { for (let i=0;i<150;i++) { if (condition()) return; await new Promise(resolve=>setTimeout(resolve,40)); } throw new Error('Loopback media timed out'); };
      const pendingLeft=[], pendingRight=[];
      left.onicecandidate = ({candidate}) => { if(candidate) { if(right.remoteDescription) void right.addIceCandidate(candidate); else pendingRight.push(candidate); } };
      right.onicecandidate = ({candidate}) => { if(candidate) { if(left.remoteDescription) void left.addIceCandidate(candidate); else pendingLeft.push(candidate); } };
      let receiverTrack, receiverStream, videoEvents=0;
      const video=document.createElement('video'); video.muted=true; video.playsInline=true;
      right.ontrack=event=> { if(event.track.kind==='video' && event.transceiver.mid==='1') { videoEvents++; receiverTrack=event.track; receiverStream=event.streams[0] || new MediaStream([event.track]); video.srcObject=receiverStream; void video.play(); } };
      const originalMap=App.callPeerMap, originalWants=App.callPeerWantsScreen;
      try {
        left.__peerCode='loopback';
        left.__audioTx=left.addTransceiver('audio',{direction:'sendrecv'});
        left.__screenTx=left.addTransceiver(streams[0].getVideoTracks()[0],{direction:'sendrecv',streams:[streams[0]]});
        left.__screenAudioTx=left.addTransceiver(streams[0].getAudioTracks()[0],{direction:'sendrecv',streams:[streams[0]]});
        left.__cameraTx=left.addTransceiver('video',{direction:'sendrecv'});
        await left.setLocalDescription(await left.createOffer()); await right.setRemoteDescription(left.localDescription);
        for(const candidate of pendingRight) await right.addIceCandidate(candidate);
        await right.setLocalDescription(await right.createAnswer()); await left.setRemoteDescription(right.localDescription);
        for(const candidate of pendingLeft) await left.addIceCandidate(candidate);
        await wait(()=>left.connectionState==='connected' && video.readyState>=2);
        const receiverId=receiverTrack.id, receiverStreamId=receiverStream.id;
        const sample=document.createElement('canvas'); sample.width=320;sample.height=180;const pen=sample.getContext('2d');
        const pixel=()=>{pen.drawImage(video,0,0,320,180);return [...pen.getImageData(160,90,1,1).data];};
        await wait(()=>pixel()[0]>180); const red=pixel();
        let negotiations=0; left.onnegotiationneeded=()=>{negotiations++;};
        App.callPeerMap=new Map([['loopback',left]]); App.callPeerWantsScreen=()=>true;
        App.callSharing=true;App.callScreenPaused=false;App.callScreenShareId='real-rtc-generation';App.callScreenStream=streams[0];App.callScreenTrack=streams[0].getVideoTracks()[0];App.callScreenAudioTrack=streams[0].getAudioTracks()[0];
        App.callRequestDisplayStream=async()=>streams[1];
        const changed=await App.callChangeSharedSource({shareAudio:false});
        await wait(()=>pixel()[2]>180); const blue=pixel(), audioOff=left.__screenAudioTx.sender.track===null;
        App.callRequestDisplayStream=async()=>streams[2];
        const audioChanged=await App.callChangeSharedSource({shareAudio:true});
        await wait(()=>pixel()[1]>180); const green=pixel();
        return {changed,audioChanged,audioOff,audioOn:left.__screenAudioTx.sender.track===streams[2].getAudioTracks()[0],red,blue,green,
          sameReceiverTrack:receiverTrack.id===receiverId,sameReceiverStream:receiverStream.id===receiverStreamId,videoEvents,negotiations,shareId:App.callScreenShareId};
      } finally {
        App.callPeerMap=originalMap;App.callPeerWantsScreen=originalWants;
        left.close();right.close();clearInterval(paint);streams.forEach(stream=>stream.getTracks().forEach(track=>track.stop()));
        oscillator.stop();await audio.close();video.pause();video.srcObject=null;
      }
    });
    assert.equal(loopback.changed, true); assert.equal(loopback.audioChanged,true); assert.equal(loopback.audioOff,true); assert.equal(loopback.audioOn,true);
    assert.equal(loopback.sameReceiverTrack,true); assert.equal(loopback.sameReceiverStream,true); assert.equal(loopback.videoEvents,1); assert.equal(loopback.negotiations,0); assert.equal(loopback.shareId,'real-rtc-generation');

    // The full-opacity drawing is encoded into a normal video frame, so older
    // viewers receive it without a new protocol or a second overlay element.
    const composite = await page.evaluate(async () => {
      const App = ChatApp; let deliver, unsubscribed = false;
      const activations = [];
      window.chatDesktopDrawing = { version: 1, setSource(value) { activations.push(value); return true; }, onStroke(fn) { deliver = fn; return () => { unsubscribed = true; }; } };
      const source = document.createElement('canvas');
      source.width = 1280; source.height = 720;
      const sourcePen = source.getContext('2d');
      const paintSource = () => sourcePen.fillRect(0, 0, source.width, source.height);
      const raw = source.captureStream(30);
      const startup = setInterval(paintSource, 32);
      let sourceDraws = 0;
      const drawImage = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
        if (image.srcObject === raw) sourceDraws++;
        return drawImage.call(this, image, ...args);
      };
      const output = await App.callPrepareIndicatorStream(raw, 'screen:one');
      App.callScreenStream = output; App.callScreenTrack = output.getVideoTracks()[0]; App.callScreenShareId = 'drawing';
      const video = document.createElement('video'); video.muted = true; video.srcObject = output; await video.play();
      clearInterval(startup);
      await new Promise(resolve => setTimeout(resolve, 200));
      const idleStart = sourceDraws;
      await new Promise(resolve => setTimeout(resolve, 350));
      const idleDraws = sourceDraws - idleStart;
      const sample = document.createElement('canvas'); sample.width = 1280; sample.height = 720; const pen = sample.getContext('2d');
      const pixel = () => { pen.drawImage(video, 0, 0, 1280, 720); return [...pen.getImageData(640,360,1,1).data]; };
      deliver({ shareId:'wrong-generation', id:'ignored', phase:'end', points:[[.3,.5],[.7,.5]] });
      await new Promise(resolve => setTimeout(resolve, 160)); const before = pixel();
      deliver({ shareId:'drawing', id:'stroke', phase:'start', points:[[.3,.5],[.7,.5]] });
      await new Promise(resolve => setTimeout(resolve, 3200)); const held = pixel();
      deliver({ shareId:'drawing', id:'stroke', phase:'end', points:[] });
      await new Promise(resolve => setTimeout(resolve, 180)); const drawn = pixel();
      App.callDesktopOverlayEnabled = true; App.callSharing = true;
      App.callSetIndicatorSource('screen:one');
      const oldActivation = App.callIndicatorActivation;
      const trackBeforeToggle = output.getVideoTracks()[0];
      App.callDesktopOverlayEnabled = false; App.callSyncDesktopOverlay();
      deliver({ shareId:'drawing', id:'late', phase:'start', points:[[.3,.5],[.7,.5]] });
      await new Promise(resolve => setTimeout(resolve, 120)); const disabled = pixel();
      App.callDesktopOverlayEnabled = true; App.callSyncDesktopOverlay();
      const originalToast = App.showToast; let staleToasts = 0;
      App.showToast = () => { staleToasts++; };
      deliver({ shareId:'drawing', sourceId:'screen:one', activationId:oldActivation, id:'queued-old', phase:'start', points:[[.3,.5],[.7,.5]] });
      deliver({ shareId:'drawing', sourceId:'screen:one', activationId:oldActivation, phase:'error' });
      await new Promise(resolve => setTimeout(resolve, 120)); const beforeResumed = pixel();
      App.showToast = originalToast;
      deliver({ shareId:'drawing', id:'resumed', phase:'end', points:[[.3,.5],[.7,.5]] });
      await new Promise(resolve => setTimeout(resolve, 160)); const resumed = pixel();
      await new Promise(resolve => setTimeout(resolve, 3050)); const expired = pixel();
      const activationStates = activations.map(item => item.active);
      const sameTrackAcrossToggle = output.getVideoTracks()[0] === trackBeforeToggle && trackBeforeToggle.readyState === 'live';
      const trackId = output.getVideoTracks()[0].id;
      source.width = 720; source.height = 1280;
      for (let i=0; i<50 && video.videoWidth!==405; i++) { paintSource(); await new Promise(resolve=>setTimeout(resolve,40)); }
      const resized = video.videoWidth===405 && video.videoHeight===720 && output.getVideoTracks()[0].id===trackId;
      output.getVideoTracks()[0].stop(); video.pause(); video.srcObject = null; delete window.chatDesktopDrawing;
      CanvasRenderingContext2D.prototype.drawImage = drawImage;
      return { before, drawn, held, disabled, beforeResumed, staleToasts, resumed, activationStates, sameTrackAcrossToggle, expired, resized, idleDraws, rawEnded: raw.getVideoTracks()[0].readyState, unsubscribed };
    });
    assert.ok(composite.idleDraws <= 1, `Static desktop source repainted ${composite.idleDraws} times in 350 ms`);
    assert.ok(composite.held[0] > 170 && composite.held[1] < 80, 'held stroke stays visible beyond three seconds until released');
    assert.ok(composite.drawn[0] > 170 && composite.drawn[1] < 80, 'stroke pixels are solid red in encoded video');
    assert.ok(composite.before[0] < 100 && composite.expired[0] < 100, 'wrong share is ignored and stroke expires after three seconds');
    assert.ok(composite.disabled[0] < 100 && composite.resumed[0] > 170 && composite.resumed[1] < 80, 'overlay off clears encoded drawings and rejects late strokes; reenable draws immediately');
    assert.deepEqual(composite.activationStates, [true, false, true]);
    assert.equal(composite.staleToasts, 0, 'queued errors from the previous activation are ignored after reenable');
    assert.ok(composite.beforeResumed[0] < 100, 'queued strokes cannot reappear after an off/on cycle of the same source');
    assert.equal(composite.sameTrackAcrossToggle, true, 'overlay toggle preserves the screen track and viewer session');
    assert.equal(composite.resized, true, 'resized portrait capture retains aspect ratio and the same outgoing track');
    assert.equal(composite.rawEnded, 'ended'); assert.equal(composite.unsubscribed, true);
    assert.deepEqual(errors, []);
    await context.close();
    const narrow = await bootstrap(browser, {width:700,height:844}, false);
    assert.ok(await narrow.page.locator('.call-view-fullscreen').count() > 0, 'narrow desktop keeps fullscreen');
    await narrow.context.close();
    const mobile = await bootstrap(browser, { width: 390, height: 844 }, true);
    assert.equal(await mobile.page.locator('.call-view-fullscreen').count(), 0);
    assert.deepEqual(mobile.errors, []); await mobile.context.close();
    console.log('PASS sharing tools: browser picker, split controls, source continuity/cancel/rollback, real RTC loopback/audio/receiver continuity, camera switch/failure, quality details, encoded drawings/expiry/cleanup, mobile fullscreen');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });



