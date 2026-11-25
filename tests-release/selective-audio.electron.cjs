/* Windows-only QA. Two isolated Electron process trees exercise real system
 * loopback. One emits an external reference tone; the other captures only the
 * test window's video, measures sound in memory and exits. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const role = process.env.CHAT_AUDIO_FIXTURE_ROLE;
if (process.versions.electron && role) {
  const { app, BrowserWindow, session } = require('electron');
  app.setPath('userData', path.join(process.env.CHAT_AUDIO_FIXTURE_DIR, role));
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
  let win;
  app.whenReady().then(async () => {
    win = new BrowserWindow({ show: false, width: 420, height: 220, title: 'Chat App audio test',
      webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' } });
    await win.loadFile(path.join(process.env.CHAT_AUDIO_FIXTURE_DIR, 'fixture.html'));
    const tone = async frequency => {
      const context = new AudioContext(), oscillator = context.createOscillator(), volume = context.createGain();
      oscillator.frequency.value = frequency; volume.gain.value = 0.035;
      oscillator.connect(volume);volume.connect(context.destination);oscillator.start();
      await context.resume();
      window.testOscillator = oscillator;
    };
    if (role === 'speaker') {
      await win.webContents.executeJavaScript('('+tone+')(311)',true);
      console.log('SPEAKER_READY');
      setTimeout(() => app.quit(), 24000);
      return;
    }
    const source = win.getMediaSourceId();
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
      assert.equal(request.frame, win.webContents.mainFrame);
      callback({ video: { id: source, name: 'Chat App audio test' }, ...(request.audioRequested ? { audio: 'loopback' } : {}) });
    });
    win.showInactive();
    await win.webContents.executeJavaScript('('+tone+')(2039)',true);
    await win.webContents.executeJavaScript("window.chatDesktopCapture={version:1};window.ChatApp={register(){}, callGetMediaBudget:()=>({width:1280,height:720,maxFramerate:30}),callApplyScreenCaptureBudget:async()=>{}};void 0;");
    for (const file of ['call-modules/shared-audio.js','call-modules/screen-share.js']) await win.webContents.executeJavaScript(fs.readFileSync(path.join(root,file),'utf8'));
    const measure = async () => {
      const context = new AudioContext({sampleRate:48000});
      const allowed = context.createOscillator(), gain = context.createGain();
      allowed.frequency.value=827; gain.gain.value=0.035;
      allowed.connect(gain);gain.connect(context.destination);allowed.start();await context.resume();
      const detach=ChatApp.callSharePlaybackNode(gain);
      let approved, rawTracks, originalTrack;
      const native = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getDisplayMedia=async options=>{
        const raw=await native(options); originalTrack=raw.getAudioTracks()[0]; rawTracks=raw.getAudioTracks().length;
        const s=originalTrack?.getSettings()||{};
        approved=s.restrictOwnAudio===true || s.deviceId==='loopbackWithoutChrome';
        return raw;
      };
      const stream = await ChatApp.callRequestDisplayStream({shareAudio:true,beforeCapture:async()=>{}});
      const analyser=context.createAnalyser();analyser.fftSize=4096;analyser.smoothingTimeConstant=0;
      context.createMediaStreamSource(new MediaStream(stream.getAudioTracks())).connect(analyser);
      const sink=context.createGain();sink.gain.value=0;analyser.connect(sink);sink.connect(context.destination);
      const freqs={external:311,permitted:827,excluded:2039};
      const max={external:-160,permitted:-160,excluded:-160}, bins=new Float32Array(analyser.frequencyBinCount);
      for(let i=0;i<18;i++){
        await new Promise(resolve=>setTimeout(resolve,150));analyser.getFloatFrequencyData(bins);
        for(const [key,hz] of Object.entries(freqs)){const ix=Math.round(hz*analyser.fftSize/context.sampleRate);max[key]=Math.max(max[key],...bins.slice(ix-1,ix+2));}
      }
      stream.getTracks().forEach(track=>track.stop());detach();allowed.stop();await context.close();
      return {rawTracks,approved,levels:max,originalEnded:originalTrack?.readyState==='ended'};
    };
    const result=await win.webContents.executeJavaScript('('+measure+')()',true);
    console.log('WINDOWS_CAPTURE '+JSON.stringify(result));
    assert.equal(result.approved,true,'Windows loopback must confirm process exclusion');
    assert.ok(result.levels.external>-65,'The independent reference process should reach loopback');
    assert.ok(result.levels.permitted>-58,'Explicitly allowed Chat App playback should reach the mix');
    assert.ok(result.levels.excluded<result.levels.permitted-22,'Other Chat App playback must remain excluded');
    assert.equal(result.originalEnded,true);
    app.quit();
  }).catch(error=>{ console.error(error);app.exit(1); });
} else if (require.main===module) {
  (async()=>{
    if(process.platform!=='win32')throw new Error('This diagnostic requires Windows.');
    const binary=process.env.CHAT_TEST_ELECTRON || require(path.join(root,'desktop/node_modules/electron'));
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chat-audio-check-'));
    fs.writeFileSync(path.join(dir,'fixture.html'),'<!doctype html><title>Chat App audio test</title><p>Checking Windows screen-share audio…</p>');
    const children=[];
    const launch=role=>{
      const env={...process.env, CHAT_AUDIO_FIXTURE_ROLE:role, CHAT_AUDIO_FIXTURE_DIR:dir}; delete env.ELECTRON_RUN_AS_NODE;
      const child=spawn(binary,[__filename],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});children.push(child);child.stderr.pipe(process.stderr);
      let out='';child.stdout.on('data',data=>{out+=data;process.stdout.write(data);});
      const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
      return {done,ready:()=>out.includes('SPEAKER_READY')};
    };
    try {
      const speaker=launch('speaker');
      for(let i=0;i<100 && !speaker.ready(); i++)await delay(100);
      assert.ok(speaker.ready(),'The external reference process must be playing.');
      let timer;
      try { assert.equal(await Promise.race([launch('host').done, new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Windows capture timed out')),22000);})]),0); }
      finally {clearTimeout(timer);}
    } finally {
      for(const child of children)if(child.exitCode===null)child.kill();
      await delay(400);
      fs.rmSync(dir,{recursive:true,force:true,maxRetries:4,retryDelay:150});
    }
  })().catch(error=>{console.error(error);process.exitCode=1;});
}
