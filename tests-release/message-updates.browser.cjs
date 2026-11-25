'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('playwright'),fixture=require('../tests/room-loading-fixture.cjs');
const report=path.resolve(process.argv[2]||path.join(__dirname,'../../message-updates-report'));
(async()=>{
 fs.mkdirSync(report,{recursive:true});
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 try {
  const context=await browser.newContext({viewport:{width:1440,height:940}});
  await context.addInitScript(fixture,{count:2400,latencyMs:10});
  await context.addInitScript(()=>{
   globalThis.__notifications=[];
   globalThis.Notification=class {static permission='granted';constructor(title,options){this.title=title;this.options=options;__notifications.push(this);}close(){this.closed=true;}};
  });
  await context.route(/^https?:\/\//,r=>r.fulfill({status:200,contentType:'application/json',body:'null',headers:{'access-control-allow-origin':'*'}}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
  await page.fill('#login-email', 'vincenzo.brogna@students.pittstonarea.com');
  await page.click('#btn-go-login');await page.fill('#login-code','TEST-USER');await page.click('#btn-login');
  await page.waitForFunction(()=>ChatApp.currentUser?.code==='TEST-USER'&&ChatApp.membershipMap.has('test'));
  await page.evaluate(()=>ChatApp.openRoom('test',{quiet:true}));
  await page.waitForFunction(()=>!ChatApp.msgInitialTailPending&&!ChatApp.bulkLoading&&!ChatApp.roomLoadingActive);
  await page.evaluate(async()=>{
   ChatApp.closeToast();
   await __roomLoadFixture.ref('messages/test/k00002399/text').set('# **Extra bold** *heading*\n-# **Small** *italic*\n**Bold** and *italic* with __underline__ and ~~strike~~');
   await __roomLoadFixture.ref('rooms/test/lastMessagePreview').set('Tester: **Bold** and *italic*');
  });
  await page.waitForFunction(()=>ChatApp.msgElByKey.get('k00002399')?.querySelector('.message-heading strong'));
  assert(await page.locator('.room-row[data-room-row="test"] .room-preview strong').count()>=1);
  assert(await page.locator('.room-row[data-room-row="test"] .room-preview em').count()>=1);
  // Saving and cancelling both use actual pointer actions in the composer.
  await page.evaluate(()=>ChatApp.beginEditMessage(ChatApp.msgDataByKey.get('k00002399')));
  assert.equal(await page.locator('#btn-send').getAttribute('aria-label'),'Apply Edit');
  assert(await page.locator('#btn-cancel-edit').isVisible());
  // Apply transitions from the blue Send action; compare both resting edit controls.
  await page.mouse.move(0, 0);
  await page.waitForFunction(() =>
    getComputedStyle(document.getElementById('btn-cancel-edit')).backgroundColor ===
    getComputedStyle(document.getElementById('btn-send')).backgroundColor);
  const styles=await page.evaluate(()=>['btn-cancel-edit','btn-send'].map(id=>{const s=getComputedStyle(document.getElementById(id));return [s.width,s.height,s.borderRadius,s.backgroundColor];}));
  assert.deepEqual(styles[0],styles[1]);
  await page.fill('#msg-input','Edited **bold** text');await page.click('#btn-send');
  await page.waitForFunction(()=>__roomLoadFixture.values.messages.test.k00002399.text==='Edited **bold** text'&&!ChatApp.editState);
  await page.evaluate(()=>ChatApp.beginEditMessage(ChatApp.msgDataByKey.get('k00002399')));
  await page.fill('#msg-input','Do not save');await page.click('#btn-cancel-edit');
  assert.equal(await page.evaluate(()=>__roomLoadFixture.values.messages.test.k00002399.text),'Edited **bold** text');
  assert.equal(await page.locator('#btn-send').getAttribute('aria-label'),'Send Message');
  // Render a live video and zoom it before jumping to a much older reply.
  await page.evaluate(()=>{
   ChatApp.detachCallObserver();ChatApp.attachCallObserver=()=>{};
   ChatApp.currentCallRoomId='test';ChatApp.callSessionId='jump-fixture';
   ChatApp.callMembersCache=[{code:'TEST-USER',username:'Tester',connected:true,sessionId:'self'},{code:'ALICE',username:'Alice',connected:true,sessionId:'alice',sharing:true,shareId:'alice-screen'}];
   const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;
   const pen=canvas.getContext('2d');pen.fillStyle='#345570';pen.fillRect(0,0,1280,720);pen.fillStyle='#fff';pen.font='40px sans-serif';pen.fillText('Keep this stream and zoom',80,200);
   window.__stream=canvas.captureStream(10);window.__canvas=canvas;
   ChatApp.callRemoteVideoStreams.set('ALICE',__stream);ChatApp.callWatchedShareCodes=new Set(['ALICE']);
   ChatApp.openCallMenu();ChatApp.syncShareViewStream();
   window.__reopens=0;const open=ChatApp.openRoom;ChatApp.openRoom=function(...args){__reopens++;return open.apply(this,args);};
  });
  await page.waitForFunction(()=>document.querySelector('#call-menu video')?.readyState>=2);
  await page.locator('.call-view-tile[data-share-code="ALICE"] .call-view-focus').click();
  await page.locator('.call-view-tile[data-share-code="ALICE"]').evaluate(tile=>{for(let i=0;i<4;i++)tile.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:-100}));});
  await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);window.__video=document.querySelector('#call-menu video');window.__transform=__video.style.transform;});
  const start=await page.evaluate(()=>__roomLoadFixture.traces.length);
  await page.evaluate(()=>ChatApp.scrollToMessageKey('k00000002'));
  await page.waitForFunction(()=>ChatApp.msgElByKey.get('k00000002')?.querySelector('.reply-flash'));
  const jump=await page.evaluate(start=>({reopens:__reopens,open:ChatApp.callMenuOpen,same:__video===document.querySelector('#call-menu video'),stream:__video.srcObject===__stream,transform:__video.style.transform,original:__transform,rows:ChatApp.msgElByKey.size,queries:__roomLoadFixture.traces.slice(start).filter(t=>t.kind==='once'&&t.path==='messages/test').length}),start);
  assert.equal(jump.reopens,0);assert.equal(jump.open,true);assert.equal(jump.same,true);assert.equal(jump.stream,true);assert.equal(jump.transform,jump.original);assert(jump.rows<=51);assert(jump.queries<=2);
  // Browser and same-room in-app notifications target their exact message.
  await page.evaluate(()=>{ChatApp.pushNotifsEnabled=true;ChatApp.showDesktopPingNotification({roomId:'test',fromUsername:'Alice',messageKey:'k00000050'});__notifications.at(-1).onclick();});
  await page.waitForFunction(()=>ChatApp.msgElByKey.get('k00000050')?.querySelector('.reply-flash'));
  assert.equal(await page.evaluate(()=>__reopens),0);
  await page.evaluate(()=>ChatApp.showPingToast({roomId:'test',fromUsername:'Alice',messageKey:'k00000100'}));
  await page.getByRole('button',{name:'View Message',exact:true}).click();
  await page.waitForFunction(()=>ChatApp.msgElByKey.get('k00000100')?.querySelector('.reply-flash'));
  assert.equal(await page.evaluate(()=>__reopens),0);
  await page.locator('#btn-call-menu-expand').click();
  await page.evaluate(()=>{ChatApp.callChatOpen=false;ChatApp.syncActivityChatLayout();ChatApp.showPingSummaryToast({test:2},{events:[{roomId:'test',rec:{fromUsername:'Alice',msgKey:'k00000150'}},{roomId:'test',rec:{fromUsername:'Bob',msgKey:'k00000200'}}]});});
  await page.locator('.mention-toast-entry').nth(1).click();
  await page.waitForFunction(()=>ChatApp.msgElByKey.get('k00000200')?.querySelector('.reply-flash'));
  assert.deepEqual(await page.evaluate(()=>({expanded:ChatApp.callMenuExpanded,chat:ChatApp.callChatOpen,reopens:__reopens,same:document.querySelector('#call-menu video')===__video,transform:__video.style.transform===__transform})),{expanded:true,chat:true,reopens:0,same:true,transform:true});
  await page.locator('#btn-call-menu-expand').click();
  await page.evaluate(()=>ChatApp.openMentionMessage({roomId:'test',messageKey:'removed-message'}));
  await page.waitForFunction(()=>document.getElementById('toast-body').textContent.includes('deleted or is no longer available'));
  assert.equal(await page.evaluate(()=>ChatApp.callMenuOpen&&document.querySelector('#call-menu video')===__video),true);
  await page.screenshot({path:path.join(report,'jump-preserves-stream.png')});
  await page.evaluate(()=>{ChatApp.closeToast();ChatApp.closeCallMenu();ChatApp.currentCallRoomId=null;ChatApp.beginEditMessage(ChatApp.msgDataByKey.get('k00000200'));});
  await page.setViewportSize({width:850,height:780});
  await page.waitForFunction(()=>document.getElementById('msg-input').clientWidth>=110);
  await page.evaluate(()=>ChatApp.syncComposerPreviewHeight());
  await page.waitForTimeout(180);
  await page.screenshot({path:path.join(report,'desktop-edit-controls.png')});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  await context.close();
  console.log('PASS: nested formatting/previews, pointer save/cancel, direct 2,397-message jump, stream/zoom/DOM preservation, exact browser/toast jumps, deleted fallback.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
