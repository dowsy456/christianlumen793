'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {bootstrap}=require('../tests/screen-focus.browser.cjs');
(async()=>{
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 try {
  const {page,context,errors}=await bootstrap(browser,{width:390,height:844},true);
  const result=await page.evaluate(async()=>{
   const App=ChatApp,left=new RTCPeerConnection(),right=new RTCPeerConnection(),streams=[],canvases=[];
   const wait=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(r=>setTimeout(r,25));}throw new Error('Camera loopback timed out');};
   for(const color of ['#ff0000','#0000ff']) {
    const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;
    const pen=canvas.getContext('2d');pen.fillStyle=color;pen.fillRect(0,0,320,180);canvases.push({canvas,pen,color});streams.push(canvas.captureStream(15));
   }
   const paint=setInterval(()=>canvases.forEach(({pen,color})=>{pen.fillStyle=color;pen.fillRect(0,0,320,180);}),60);
   const front=streams[0].getVideoTracks()[0],back=streams[1].getVideoTracks()[0];
   for(const [track,deviceId,facingMode,label] of [[front,'front','user','Front Camera'],[back,'main-back','environment','Back Camera']]) {
    Object.defineProperty(track,'getSettings',{configurable:true,value:()=>({deviceId,facingMode,width:320,height:180})});
    Object.defineProperty(track,'getCapabilities',{configurable:true,value:()=>({facingMode:[facingMode]})});
    Object.defineProperty(track,'label',{configurable:true,value:label});
    Object.defineProperty(track,'applyConstraints',{configurable:true,value:async()=>{throw new DOMException('Fixed source','OverconstrainedError');}});
   }
   const requested=[];
   Object.defineProperty(navigator.mediaDevices,'enumerateDevices',{configurable:true,value:async()=>[
    {kind:'videoinput',deviceId:'ultra',label:'Back Ultra Wide Camera'},{kind:'videoinput',deviceId:'tele',label:'Back Telephoto Camera'},
    {kind:'videoinput',deviceId:'main-back',label:'Back Camera'},{kind:'videoinput',deviceId:'front',label:'Front Camera'}]});
   Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async c=>{requested.push(c.video.deviceId?.exact);front.stop();front.onended?.();return streams[1];}});
   const leftIce=[],rightIce=[];
   left.onicecandidate=({candidate})=>{if(candidate){if(right.remoteDescription)void right.addIceCandidate(candidate);else rightIce.push(candidate);}};
   right.onicecandidate=({candidate})=>{if(candidate){if(left.remoteDescription)void left.addIceCandidate(candidate);else leftIce.push(candidate);}};
   let receivedTrack,receivedStream,events=0;
   const video=document.createElement('video');video.muted=true;video.playsInline=true;
   right.ontrack=event=>{if(event.transceiver.mid==='1'){events++;receivedTrack=event.track;receivedStream=event.streams[0];video.srcObject=receivedStream;void video.play();}};
   const previousMap=App.callPeerMap,previousWants=App.callPeerWantsCamera;
   try {
    left.__peerCode='camera-loopback';left.__screenTx=left.addTransceiver('video',{direction:'sendrecv'});
    left.__cameraTx=left.addTransceiver(front,{direction:'sendrecv',streams:[streams[0]]});
    await left.setLocalDescription(await left.createOffer());await right.setRemoteDescription(left.localDescription);
    for(const candidate of rightIce)await right.addIceCandidate(candidate);
    await right.setLocalDescription(await right.createAnswer());await left.setRemoteDescription(right.localDescription);
    for(const candidate of leftIce)await left.addIceCandidate(candidate);
    await wait(()=>left.connectionState==='connected'&&video.readyState>=2);
    const sample=document.createElement('canvas');sample.width=320;sample.height=180;const pen=sample.getContext('2d');
    const pixel=()=>{pen.drawImage(video,0,0,320,180);return [...pen.getImageData(160,90,1,1).data];};
    await wait(()=>pixel()[0]>180);const before=pixel(),trackId=receivedTrack.id,streamId=receivedStream.id;
    let negotiations=0;left.onnegotiationneeded=()=>{negotiations++;};
    App.callPeerMap=new Map([['camera-loopback',left]]);App.callPeerWantsCamera=()=>true;
    App.callCameraSharing=true;App.callCameraShareId='camera-real-source-switch';App.callCameraTrack=front;App.callCameraStream=streams[0];
    const key=App.callCameraKey(App.currentUser.code);App.callWatchedShareCodes.add(key);App.callFocusedShareCode=key;
    await App.callRefreshCameraFlipSupport();const supported=!!App.callCameraFlipTarget;
    const sender=left.__cameraTx.sender,local=App.callCameraStream;
    const success=await App.callSwapCameraSide();await wait(()=>pixel()[2]>180);
    return {supported,success,requested,before,after:pixel(),sameSender:left.__cameraTx.sender===sender,sameRemoteTrack:receivedTrack.id===trackId,
     sameRemoteStream:receivedStream.id===streamId,sameLocalStream:App.callCameraStream===local,events,negotiations,shareId:App.callCameraShareId,
     focus:App.callFocusedShareCode===key,watched:App.callWatchedShareCodes.has(key),oldEnded:front.readyState,newLive:back.readyState};
   } finally {
    App.callPeerMap=previousMap;App.callPeerWantsCamera=previousWants;left.close();right.close();clearInterval(paint);
    streams.forEach(stream=>stream.getTracks().forEach(track=>track.stop()));video.pause();video.srcObject=null;
   }
  });
  assert.equal(result.supported,true);assert.equal(result.success,true);assert.deepEqual(result.requested,['main-back']);
  for(const key of ['sameSender','sameRemoteTrack','sameRemoteStream','sameLocalStream','focus','watched'])assert.equal(result[key],true,key);
  assert.equal(result.events,1);assert.equal(result.negotiations,0);assert.equal(result.shareId,'camera-real-source-switch');assert.equal(result.oldEnded,'ended');assert.equal(result.newLive,'live');
  assert.deepEqual(errors,[]);await context.close();
  console.log('PASS camera source switch: main rear lens, phone viewport, actual WebRTC video changes red to blue with the same local/remote streams, receiver track, sender, share ID, subscriptions and no renegotiation.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
