'use strict';
const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
class Track {
  constructor(id,facing,label) { this.id=id;this.kind='video';this.label=label;this.readyState='live';this.muted=false;this.onended=null;this.settings={deviceId:id,facingMode:facing}; }
  getSettings(){return {...this.settings};}
  getCapabilities(){return {facingMode:[this.settings.facingMode]};}
  async applyConstraints(){throw new DOMException('Device cannot change in place','OverconstrainedError');}
  stop(){this.readyState='ended';}
  end(){this.readyState='ended';this.onended?.();}
}
class Stream {
  constructor(tracks){this.tracks=tracks.slice();}
  getTracks(){return this.tracks.slice();}
  getVideoTracks(){return this.getTracks().filter(t=>t.kind==='video');}
  addTrack(track){if(!this.tracks.includes(track))this.tracks.push(track);}
  removeTrack(track){this.tracks=this.tracks.filter(t=>t!==track);}
}
const device=(deviceId,label)=>({kind:'videoinput',deviceId,label});
const devices=[device('ultra','Back Ultra Wide Camera'),device('tele','Back Telephoto Camera'),device('triple','Back Triple Camera'),device('front','Front Camera'),device('back','Back Camera')];
function harness({mobile=false}={}) {
 const App={register(){},currentUser:{code:'me'},currentCallRoomId:'room',callSessionId:'session',callCameraShareId:'same-camera',callCameraSharing:true,callPeerMap:new Map([['viewer',{}]]),callCameraCapturePending:false,
  syncCallControlsUI(){},syncShareViewStream(){},callShareOwner:s=>s,showToast(value){this.toasts.push(value);},toasts:[],callSetPeerCameraTrack:async function(_pc,track){this.sent.push(track);},sent:[],mobileUserAgent:mobile};
 const navigator={userAgent:mobile?'iPhone':'Chrome desktop',mediaDevices:{enumerateDevices:async()=>devices,getUserMedia:async()=>{throw new Error('Unexpected capture');}}};
 const context=vm.createContext({ChatApp:App,navigator,document:{querySelectorAll:()=>[]},DOMException,console,setTimeout,clearTimeout,Map,Set});
 vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../call-modules/screen-share.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../call-modules/capture-switch.js'),'utf8'),context);
 App.callSetPeerCameraTrack=async(_pc,track)=>{App.sent.push(track);};
 App.stopCount=0;App.callStopCamera=()=>{App.stopCount++;App.callCameraSharing=false;App.callCameraCaptureRequest=null;App.callCameraCapturePending=false;App.callCameraStream?.getTracks().forEach(t=>t.stop());App.callCameraTrack=null;};
 const front=new Track('front','user','Front Camera'),stream=new Stream([front]);
 App.callCameraStream=stream;App.callCameraTrack=front;
 front.onended=()=>{if(App.callCameraTrack===front&&App.callCameraCaptureRequest?.kind!=='camera-flip')App.callStopCamera();};
 return {App,navigator,front,stream};
}

test('multi-lens flip chooses the main rear camera instead of enumerateDevices order',async()=>{
 const {App,navigator,front,stream}=harness({mobile:true});
 front.getCapabilities=()=>({facingMode:['user','environment']});
 await App.callRefreshCameraFlipSupport();assert.equal(App.callCameraFlipTarget.deviceId,'back');
 assert.deepEqual(Array.from(App.callRankCameraDevices(devices,'environment'),d=>d.deviceId),['back','triple']);
 const requests=[],back=new Track('back','environment','Back Camera');
 navigator.mediaDevices.getUserMedia=async c=>{requests.push(c);front.end();return new Stream([back]);};
 assert.equal(await App.callSwapCameraSide(),true);
 assert.equal(requests[0].video.deviceId.exact,'back');assert.equal(App.stopCount,0);
 assert.equal(App.callCameraShareId,'same-camera');assert.equal(App.callCameraStream,stream);
 assert.equal(App.callCameraTrack,back);assert.equal(front.readyState,'ended');assert.equal(App.callCameraSharing,true);
 await App.callRefreshCameraFlipSupport();assert.equal(App.callCameraFlipTarget.deviceId,'front');
});

test('actual initial camera ended handler ignores a hardware switch and obsolete queued end',async()=>{
 const {App,navigator,front}=harness({mobile:true});
 App.callCameraSharing=false;App.callCameraTrack=null;App.callCameraStream=null;
 App.callApplyScreenCaptureBudget=async()=>{};App.callMakeSignalId=()=> 'started-camera';
 App.callCaptureScreenPreview=async()=>null;App.callEnsurePeers=async()=>{};App.callScheduleMediaBudget=()=>{};
 App.firebase={database:{ServerValue:{TIMESTAMP:123}}};
 App.db={ref:()=>({transaction:async change=>({committed:!!change({sessionId:'session'})})})};
 navigator.mediaDevices.getUserMedia=async()=>new Stream([front]);
 await App.callToggleCamera({deviceId:'front'});assert.equal(App.callCameraSharing,true);
 const queuedEnd=front.onended;await App.callRefreshCameraFlipSupport();
 const back=new Track('back','environment','Back Camera');
 navigator.mediaDevices.getUserMedia=async()=>{front.stop();queuedEnd();return new Stream([back]);};
 assert.equal(await App.callSwapCameraSide(),true);queuedEnd();
 assert.equal(App.stopCount,0);assert.equal(App.callCameraTrack,back);assert.equal(App.callCameraShareId,'started-camera');
});

test('supported in-place facing change uses neither a new capture nor sender replacement',async()=>{
 const {App,navigator,front,stream}=harness();await App.callRefreshCameraFlipSupport();
 front.applyConstraints=async c=>{assert.equal(c.facingMode.exact,'environment');front.settings={deviceId:'back',facingMode:'environment'};};
 let captures=0;navigator.mediaDevices.getUserMedia=async()=>{captures++;throw new Error('Should not acquire');};
 assert.equal(await App.callSwapCameraSide(),true);assert.equal(captures,0);assert.equal(App.sent.length,0);
 assert.equal(App.callCameraStream,stream);assert.equal(App.callCameraTrack,front);assert.equal(front.readyState,'live');assert.equal(App.stopCount,0);
});

test('ignored facing constraints fall back to replacing only the source',async()=>{
 const {App,navigator,front,stream}=harness();await App.callRefreshCameraFlipSupport();
 front.applyConstraints=async()=>{};const back=new Track('back','environment','Back Camera');
 navigator.mediaDevices.getUserMedia=async()=>new Stream([back]);
 assert.equal(await App.callSwapCameraSide(),true);assert.equal(App.callCameraTrack,back);assert.equal(App.callCameraStream,stream);assert.equal(App.stopCount,0);
});

test('exclusive mobile hardware releases the old capture without ending its share',async()=>{
 const {App,navigator,front,stream}=harness({mobile:true});await App.callRefreshCameraFlipSupport();
 const back=new Track('back','environment','Back Camera');let busy=0;
 navigator.mediaDevices.getUserMedia=async()=>{if(front.readyState==='live'){busy++;throw new DOMException('Only one capture session','NotReadableError');}return new Stream([back]);};
 assert.equal(await App.callSwapCameraSide(),true);assert(busy>0);assert.equal(App.stopCount,0);
 assert.equal(App.callCameraShareId,'same-camera');assert.equal(App.callCameraStream,stream);assert.equal(App.callCameraTrack,back);
});

test('main lens is retried after exclusive release before a secondary rear source is considered',async()=>{
 const {App,navigator,front}=harness({mobile:true});await App.callRefreshCameraFlipSupport();
 const back=new Track('back','environment','Back Camera'),requests=[];
 navigator.mediaDevices.getUserMedia=async c=>{requests.push(c.video.deviceId?.exact || c.video.facingMode?.exact);if(front.readyState==='live')throw new DOMException('Busy','NotReadableError');return new Stream([back]);};
 assert.equal(await App.callSwapCameraSide(),true);assert.deepEqual(requests,['back','back']);assert.equal(App.stopCount,0);
});

test('localized mobile device labels still allow a facing-mode switch',async()=>{
 const {App,navigator}=harness({mobile:true});
 navigator.mediaDevices.enumerateDevices=async()=>[device('front','Camera 1'),device('back','Camera 2')];
 await App.callRefreshCameraFlipSupport();assert.equal(App.callCameraFlipTarget.facingMode,'environment');assert.equal(App.callCameraFlipTarget.deviceId,'');
 const back=new Track('back','environment','Camera 2');let requested;
 navigator.mediaDevices.getUserMedia=async c=>{requested=c.video;return new Stream([back]);};
 assert.equal(await App.callSwapCameraSide(),true);assert.equal(requested.facingMode.exact,'environment');
});

test('a failed mobile target that ended the old hardware reacquires the previous source',async()=>{
 const {App,navigator,front,stream}=harness({mobile:true});await App.callRefreshCameraFlipSupport();
 const recovered=new Track('front','user','Front Camera');let recovery=0;
 navigator.mediaDevices.getUserMedia=async c=>{
  if(c.video.deviceId?.exact==='front'){recovery++;return new Stream([recovered]);}
  front.end();throw new DOMException('Rear source unavailable','NotReadableError');
 };
 assert.equal(await App.callSwapCameraSide(),false);assert.equal(recovery,1);assert.equal(App.stopCount,0);
 assert.equal(App.callCameraTrack,recovered);assert.equal(App.callCameraStream,stream);assert.equal(App.callCameraShareId,'same-camera');assert.equal(App.toasts.at(-1).title,'Camera Unchanged');
});

test('permission rejection preserves a live current source even on mobile',async()=>{
 const {App,navigator,front}=harness({mobile:true});await App.callRefreshCameraFlipSupport();
 let captures=0;navigator.mediaDevices.getUserMedia=async()=>{captures++;throw new DOMException('Denied','NotAllowedError');};
 assert.equal(await App.callSwapCameraSide(),false);assert.equal(captures,1);assert.equal(front.readyState,'live');assert.equal(App.callCameraTrack,front);assert.equal(App.stopCount,0);
});

test('sender replacement failure restores the previous live source and stops the candidate',async()=>{
 const {App,navigator,front,stream}=harness();await App.callRefreshCameraFlipSupport();
 const back=new Track('back','environment','Back Camera');navigator.mediaDevices.getUserMedia=async()=>new Stream([back]);
 const sent=[];App.callSetPeerCameraTrack=async(_pc,track)=>{sent.push(track);assert.equal(App.callCameraTrack,track);if(track===back)throw new Error('replaceTrack failed');};
 assert.equal(await App.callSwapCameraSide(),false);assert.equal(sent.at(-1),front);assert.equal(back.readyState,'ended');assert.equal(front.readyState,'live');assert.equal(App.callCameraStream,stream);assert.equal(App.stopCount,0);
});

test('cancellation disposes a late capture without restoring or clobbering a newer request',async()=>{
 const {App,navigator}=harness();await App.callRefreshCameraFlipSupport();
 let resolve;navigator.mediaDevices.getUserMedia=()=>new Promise(r=>{resolve=r;});
 const pending=App.callSwapCameraSide();for(let i=0;i<10&&!resolve;i++)await Promise.resolve();assert(resolve);
 App.callStopCamera();const newer={kind:'new-camera'};App.callCameraCaptureRequest=newer;App.callCameraCapturePending=true;
 const late=new Track('back','environment','Back Camera');resolve(new Stream([late]));assert.equal(await pending,false);
 assert.equal(late.readyState,'ended');assert.equal(App.callCameraCaptureRequest,newer);assert.equal(App.callCameraCapturePending,true);assert.equal(App.stopCount,1);
});
