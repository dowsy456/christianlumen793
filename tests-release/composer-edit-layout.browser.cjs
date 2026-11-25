'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),{chromium}=require(path.join(root,'node_modules/playwright'));
const mock=require(path.join(root,'tests/firebase-mock.js')),report=path.resolve(process.argv[2]||path.join(__dirname,'../../revision2-composer-review'));
(async()=>{fs.mkdirSync(report,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true});
try{for(const sample of [{name:'desktop',width:1440,height:940},{name:'narrow-desktop',width:1000,height:840},{name:'small-desktop',width:850,height:780},{name:'mobile',width:390,height:844,mobile:true}]){
 const context=await browser.newContext({viewport:{width:sample.width,height:sample.height},isMobile:!!sample.mobile,hasTouch:!!sample.mobile});
 await context.addInitScript(mock);await context.route(/^https?:\/\//,r=>r.fulfill({status:200,contentType:'application/json',body:'null'}));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(path.join(root,'index.html')).href);await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
 await page.fill('#login-email', 'vincenzo.brogna@students.pittstonarea.com');
 await page.click('#btn-go-login');await page.fill('#login-code','TEST-USER');await page.click('#btn-login');await page.waitForFunction(()=>ChatApp.currentUser?.code==='TEST-USER');
 await page.evaluate(async()=>{const A=ChatApp;await __testDatabase.ref('messages/test/review').set({userCode:'TEST-USER',username:'Tester',text:'Message under edit',createdAt:Date.now()});await __testDatabase.ref(`${A.STICKER_META_PATH}/review-sticker`).set({name:'Review sticker',kind:'image',mimeType:'image/png',creatorCode:'TEST-USER',creatorUsername:'Tester',createdAt:Date.now(),state:'ready',width:128,height:128,byteSize:20});await A.openRoom('test',{quiet:true});A.closeToast();});
 await page.waitForFunction(()=>ChatApp.msgDataByKey.has('review'));
 await page.evaluate(async()=>{const A=ChatApp;A.beginEditMessage(A.msgDataByKey.get('review'));for(let i=0;i<12;i++)await A.addPendingFile(new File(['file '+i],'Review-file-'+i+'.txt',{type:'text/plain'}));await A.sendStickerMessage({id:'review-sticker',state:'ready'});A.closeToast();});
 for(const mode of ['room','call-sidepanel']){
  if(mode==='call-sidepanel'){
   await page.evaluate(async()=>{await __testDatabase.ref('calls/test/members/TEST-USER').set({code:'TEST-USER',username:'Tester',displayName:'Tester',sessionId:'review-call',connected:true,joinedAt:Date.now()});ChatApp.currentCallRoomId='test';ChatApp.callSessionId='review-call';ChatApp.openCallMenu();});
   await page.click('#btn-call-menu-chat');await page.waitForFunction(()=>document.body.dataset.companionMode==='call'&&document.body.dataset.companionChat==='1');
  }
  await page.waitForTimeout(240);
  const state=await page.evaluate(()=>{const A=ChatApp,row=A.$('composer-row'),r=row.getBoundingClientRect();const controls=Object.fromEntries(['btn-upload','btn-cancel-edit','btn-send','btn-composer-more'].map(id=>{const el=id==='btn-cancel-edit' && A.$(id).hidden ? document.querySelector('#composer-edit-notice button') : A.$(id),b=el.getBoundingClientRect(),s=getComputedStyle(el);const shown=!!(b.width&&b.height&&s.visibility!=='hidden'&&s.display!=='none');return[id,{shown,disabled:el.disabled,label:el.getAttribute('aria-label'),left:b.left,right:b.right,top:b.top,bottom:b.bottom,hit:shown&&document.elementFromPoint(b.left+b.width/2,b.top+b.height/2)?.closest('button')===el}];}));return{controls,files:A.pendingFiles.length,sticker:A.pendingSticker?.id,count:A.filesBarLimitEl.textContent,docOverflow:document.documentElement.scrollWidth>innerWidth+1,rowOverflow:row.scrollWidth>row.clientWidth+1,inputWidth:A.$('msg-input').clientWidth,left:r.left,right:r.right,width:innerWidth};});
  assert.equal(state.files,12);assert.equal(state.sticker,'review-sticker');assert.match(state.count,/12\/12.*1 Sticker/);assert.equal(state.docOverflow,false);assert.equal(state.rowOverflow,false);assert.ok(state.inputWidth>=110,`${sample.name} ${mode}: editor input width ${state.inputWidth}`);assert.ok(state.left>=-1&&state.right<=state.width+1);
  for(const id of ['btn-upload','btn-cancel-edit','btn-send']){assert.ok(state.controls[id].shown,`${sample.name} ${mode}: ${id} shown`);assert.ok(state.controls[id].hit,`${sample.name} ${mode}: ${id} click accessible`);}
  assert.equal(state.controls['btn-send'].label,'Apply Edit');
  const header=await page.evaluate(()=>{const title=document.querySelector('#files-bar .overlay-panel-title').getBoundingClientRect(),badge=document.getElementById('files-bar-limit').getBoundingClientRect();return {titleWidth:title.width,overlap:title.left<badge.right&&title.right>badge.left&&title.top<badge.bottom&&title.bottom>badge.top};});
  assert.ok(header.titleWidth>=100,`${sample.name} ${mode}: attachment title readable`);assert.equal(header.overlap,false,`${sample.name} ${mode}: attachment title and count do not overlap`);
  if(state.controls['btn-composer-more'].shown){await page.click('#btn-composer-more');await page.waitForTimeout(180);assert.equal(await page.locator('#composer-more-menu').isVisible(),true);assert.ok(await page.locator('#composer-more-menu button').count()>0);await page.click('#btn-composer-more');await page.waitForTimeout(180);}
  if(mode==='call-sidepanel')assert.equal(await page.evaluate(()=>document.body.dataset.companionChat==='1'),true);await page.screenshot({path:path.join(report,`${sample.name}-${mode}.png`)});console.log(sample.name,mode,JSON.stringify(state));
 }
 assert.deepEqual(errors,[]);await context.close();
}console.log('PASS composer visual/accessibility regression in normal, narrow, mobile room/call-sidepanel.');}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
