'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { bootstrap } = require('../tests/screen-focus.browser.cjs');

async function checkSignals(page) {
  return page.evaluate(async () => {
    const App = ChatApp;
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const audio = new AudioContext({ sampleRate: 48000 });
    await audio.resume();
    const pitches = { system: 293, hub: 521, nested: 829, attachment: 1117, viewer: 1423, preview: 1723, music: 1987, voice: 2333, office: 2671 };
    const wav = hz => {
      const count = 8000, bytes = new Uint8Array(44 + 2 * count), v = new DataView(bytes.buffer);
      const word = (at, s) => { for (let i = 0; i < s.length; i++) bytes[at+i] = s.charCodeAt(i); };
      word(0,'RIFF'); v.setUint32(4,bytes.length-8,true); word(8,'WAVE'); word(12,'fmt ');
      v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
      v.setUint32(24,8000,true); v.setUint32(28,16000,true); v.setUint16(32,2,true); v.setUint16(34,16,true);
      word(36,'data'); v.setUint32(40,count*2,true);
      for (let i=0;i<count;i++) v.setInt16(44+i*2, 2400*Math.sin(i*2*Math.PI*hz/8000),true);
      return 'data:audio/wav;base64,' + btoa(String.fromCharCode(...bytes));
    };
    const tone = (context, hz, output) => {
      const osc = context.createOscillator(), level = context.createGain();
      osc.frequency.value = hz; level.gain.value = 0.07;
      osc.connect(level); level.connect(output); osc.start();
      return osc;
    };
    const hubHtml = hz => '<!doctype html><body><script>const ctx=new AudioContext();const osc=ctx.createOscillator(), gain=ctx.createGain();osc.frequency.value='+hz+';gain.gain.value=0.07;osc.connect(gain);gain.connect(ctx.destination);osc.start();ctx.resume();<\/script>';
    const hub = document.createElement('iframe');
    document.body.append(hub);
    await App.writeHtmlIntoIframeSameOrigin(hub,hubHtml(pitches.hub),true);
    await new Promise(resolve => hub.addEventListener('load',resolve,{ once:true }));
    const nested = hub.contentDocument.createElement('iframe');
    nested.srcdoc = hubHtml(pitches.nested).replace('<!doctype html>','<html>').replace('<body>', '<body><script>document.body.dataset.marker="<head>";<\/script>');
    hub.contentDocument.body.append(nested);
    await new Promise(resolve => nested.addEventListener('load',resolve,{ once:true }));
    if (nested.contentDocument.body.dataset.marker !== '<head>' || nested.contentDocument.body.innerText.trim()) throw new Error('Nested HTML source was altered');

    const row = App.appendMessageRow({ _key:'signal-fixture', t:'audio', userCode:'TEST-USER', username:'Tester',
      name:'fixture.wav', fileName:'fixture.wav', dataURL:wav(pitches.attachment), createdAt:Date.now() });
    const attachment = [...App.chatAudioPlayers].find(element => element.src === wav(pitches.attachment));
    if (!attachment) throw new Error('Fixture did not render a real room audio player');
    attachment.loop=true; await attachment.play();
    const viewerMount = document.createElement('div');
    document.body.append(viewerMount);
    const stopPreview = App.mountDocumentViewer(viewerMount, 'html', 'data:text/html;charset=utf-8,'+encodeURIComponent(hubHtml(pitches.preview)), 'tone.html');
    const officeMount=document.createElement('div');document.body.appendChild(officeMount);
    const loadOffice=App.loadOfficeViewerLibrary;
    App.loadOfficeViewerLibrary=async()=>({renderAsync:async(_bytes,body)=>{
      const media=new Audio(wav(pitches.office)); media.loop=true; body.appendChild(media); await media.play();
    }});
    const stopOffice=App.mountDocumentViewer(officeMount,'docx','data:application/octet-stream;base64,AA==','sound.docx');
    const music = document.createElement('audio'); music.dataset.chatMusic='true'; music.loop=true; music.src=wav(pitches.music);
    // The main document plays both a Music element and a separate remote-voice graph.
    document.body.append(music); await music.play();
    const voice = tone(audio, pitches.voice, audio.destination);
    const canvas = document.createElement('canvas'); canvas.width=16; canvas.height=16;
    const otherApp = audio.createMediaStreamDestination();
    const system = tone(audio,pitches.system,otherApp);
    const original = navigator.mediaDevices.getDisplayMedia;
    navigator.mediaDevices.getDisplayMedia = async options => {
      const result=canvas.captureStream(1);
      if (options.audio) {
        const track=otherApp.stream.getAudioTracks()[0].clone();
        track.getSettings=()=>({restrictOwnAudio:true});
        result.addTrack(track);
      }
      return result;
    };
    const capture = await App.callRequestDisplayStream({shareAudio:true});
    // Relay to a real receiver. Listen to what the viewer actually decodes.
    const left=new RTCPeerConnection({iceServers:[]}),right=new RTCPeerConnection({iceServers:[]});
    left.onicecandidate=e=>{if(e.candidate) right.addIceCandidate(e.candidate).catch(()=>{});};
    right.onicecandidate=e=>{if(e.candidate) left.addIceCandidate(e.candidate).catch(()=>{});};
    const received=new Promise(resolve=>{right.ontrack=e=>resolve(e.track);});
    left.addTrack(capture.getAudioTracks()[0],capture);
    await left.setLocalDescription(await left.createOffer());
    await right.setRemoteDescription(left.localDescription);
    await right.setLocalDescription(await right.createAnswer());
    await left.setRemoteDescription(right.localDescription);
    const analyser=audio.createAnalyser(); analyser.fftSize=4096; analyser.smoothingTimeConstant=0;
    const incoming = new MediaStream([await received]);
    const playback = new Audio(); playback.muted=true; playback.srcObject=incoming; await playback.play();
    audio.createMediaStreamSource(incoming).connect(analyser);
    const quiet = audio.createGain(); quiet.gain.value=0; analyser.connect(quiet); quiet.connect(audio.destination);
    const bins=new Float32Array(analyser.frequencyBinCount);
    const measure=()=>{analyser.getFloatFrequencyData(bins);return Object.fromEntries(Object.entries(pitches).map(([key,hz])=>{
      const ix=Math.round(hz*analyser.fftSize/audio.sampleRate); return [key,Number(Math.max(-160,...bins.slice(ix-1,ix+2)).toFixed(1))];
    }));};
    // Exercise the actual file viewer. Audio-only content in a video container
    // uses the same playback graph as a video with a soundtrack.
    App.openMediaModal('video',wav(pitches.viewer),{fileName:'viewer.wav',mimeType:'audio/wav'});
    let vid;
    for(let i=0;i<100;i++){vid=document.querySelector('.vpu-video');if(vid&&App.videoPlayerTeardowns.size) break;await wait(30);}
    if (!vid) throw new Error('Missing file viewer video');
    vid.loop=true;await vid.play();
    const permitted = ['system','hub','nested','attachment','viewer','preview','office'];
    let levels = measure();
    for (let i=0; i<70 && permitted.some(key => levels[key] < -50); i++) { await wait(80); levels=measure(); }
    const volume = vid.closest('.vpu').querySelector('.media-volume input, .vpu-volrange');
    volume.value='160';volume.dispatchEvent(new Event('input',{bubbles:true}));
    await wait(450); const boosted=measure();
    attachment.muted=true; stopPreview(); viewerMount.remove(); stopOffice(); officeMount.remove(); App.loadOfficeViewerLibrary=loadOffice; hub.remove(); vid.muted=true;
    await wait(650); const after=measure();
    const silent=await App.callRequestDisplayStream({shareAudio:false});
    const disabledTracks=silent.getAudioTracks().length;
    silent.getTracks().forEach(track=>track.stop()); capture.getTracks().forEach(track=>track.stop()); left.close();right.close();
    music.pause(); attachment.pause(); music.remove(); row?.remove(); system.stop(); voice.stop(); await audio.close();
    navigator.mediaDevices.getDisplayMedia=original;
    return {levels,boosted,after,disabledTracks};
  });
}

async function main() {
  const browser=await chromium.launch({ channel:process.env.BROWSER_CHANNEL||'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required'] });
  try {
    const {page,context}=await bootstrap(browser,{width:1200,height:900});
    await page.evaluate(()=>{window.chatDesktopCapture={version:1};});
    const result=await checkSignals(page);
    console.log(JSON.stringify(result));
    for (const source of ['system','hub','nested','attachment','viewer','preview','office']) assert.ok(result.levels[source]>-50, source+' did not reach the viewer');
    assert.ok(Math.abs(result.levels.hub-result.levels.nested)<3,'Nested Web Audio must enter the mix only once');
    assert.ok(result.boosted.viewer > -50, 'The video gain graph must survive a volume boost');
    for (const source of ['music','voice']) assert.ok(result.levels[source]<-65, source+' leaked');
    for (const source of ['hub','nested','attachment','viewer','preview','office']) assert.ok(result.after[source]<-65,source+' remained audible after mute, pause, or removal');
    assert.ok(result.after.system>-50);
    assert.equal(result.disabledTracks,0);
    await context.close();
  } finally { await browser.close(); }
}
if(require.main===module) main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={checkSignals};
