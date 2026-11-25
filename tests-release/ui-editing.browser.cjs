'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('playwright'),mock=require('../tests/firebase-mock.js');
const report=path.resolve(__dirname,'../../revision2-ui-editing-report');
const style = el => {const s=getComputedStyle(el),p=getComputedStyle(el.parentElement);return {height:p.height,radius:p.borderRadius,background:p.backgroundImage,border:p.border,padding:s.padding,font:s.font,color:s.color,input:{height:s.height,border:s.border,borderRadius:s.borderRadius,background:s.backgroundColor,backgroundImage:s.backgroundImage,shadow:s.boxShadow}};};
const zoomStyle = el => {const s=getComputedStyle(el),b=getComputedStyle(el.querySelector('[data-media-zoom=reset]')),r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,background:s.backgroundColor,border:s.border,radius:s.borderRadius,padding:s.padding,shadow:s.boxShadow,button:{width:b.width,height:b.height,background:b.backgroundColor,border:b.border,radius:b.borderRadius,padding:b.padding,font:b.font,color:b.color}};};
(async()=>{
 fs.mkdirSync(report,{recursive:true});
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
 try{
  for(const mobile of [false,true]){
   const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile});
   await context.addInitScript({content:`(${mock.toString()})();`});
   await context.route(/^https?:\/\//,r=>r.fulfill({status:200,body:'null',contentType:'application/json'}));
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
   await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
   await page.fill('#login-email', 'vincenzo.brogna@students.pittstonarea.com');
   await page.click('#btn-go-login');await page.fill('#login-code','TEST-USER');await page.click('#btn-login');
   await page.waitForFunction(()=>ChatApp.currentUser?.code==='TEST-USER');
   await page.evaluate(()=>ChatApp.openRoom('test',{quiet:true}));await page.waitForSelector('#room-search-input');
   const expected=await page.locator('#room-search-input').evaluate(style);
   await page.locator('#room-search-input').focus();await page.waitForTimeout(200);
   const expectedFocused=await page.locator('#room-search-input').evaluate(style);
   await page.locator('#room-search-input').blur();await page.evaluate(()=>ChatApp.closeToast());
   await page.evaluate(()=>ChatApp.showLoggedInHome());
   if(await page.locator('[data-home-tab="links"]').isVisible())await page.locator('[data-home-tab="links"]').click();
   await page.waitForSelector('#home-search');await page.locator('#home-search').blur();
   assert.deepEqual(await page.locator('#home-search').evaluate(style),expected,'home search matches reference');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'home layout fits the viewport');
   await page.screenshot({path:path.join(report,`home-${mobile?'mobile':'desktop'}.png`)});
   await page.evaluate(()=>ChatApp.openHtmlHubModal());await page.waitForSelector('#html-hub-search-input');
   assert.deepEqual(await page.locator('#html-hub-search-input').evaluate(style),expected,'HTML Hub shell and actual input match the room toolbar, without an inner fill or border');
   await page.locator('#html-hub-search-input').focus();await page.waitForTimeout(200);
   assert.deepEqual(await page.locator('#html-hub-search-input').evaluate(style),expectedFocused,'HTML Hub focused input matches room search without a second focus border');
   await page.locator('#html-hub-search-input').blur();await page.waitForTimeout(220);
   const searchGap=await page.evaluate(()=>document.getElementById('btn-modal-close').getBoundingClientRect().left-document.querySelector('.html-hub-search-field').getBoundingClientRect().right);
   assert(searchGap>=6,'HTML search stays within its title grid and clear of X');
   await page.screenshot({path:path.join(report,`html-hub-${mobile?'mobile':'desktop'}.png`)});
   await page.evaluate(()=>ChatApp.closeModal());await page.waitForFunction(()=>ChatApp.modalEl.hidden);
   await page.evaluate(()=>{
    ChatApp.scheduleType='full';
    ChatApp.showSchedulesPage(Object.keys(ChatApp.SCHEDULES)[0]);
    ChatApp.schedulesState.previewDay='M';ChatApp.schedulesState.previewManual=true;ChatApp.renderSchedulesUI();
    const row=document.querySelector('[data-sched-class-hover]');row.dataset.schedValue='Advanced Biology Honors: Cells, Organelles and Molecular Transport';row.textContent=row.dataset.schedValue;row.style.maxWidth='70px';row.style.whiteSpace='nowrap';row.style.overflow='hidden';
    ChatApp.getScheduleClassmatesForBlock=()=>[{username:'Avery',displayName:'Avery'},{username:'Jordan',displayName:'Jordan'}];
   });
   const className=page.locator('[data-sched-class-hover]').first();await (mobile?className.tap():className.click());
   assert.match(await page.locator('.schedule-classmates-tooltip').textContent(),/In Class With.*Avery.*Jordan/s);
   assert.doesNotMatch(await page.locator('.schedule-classmates-tooltip').textContent(),/Advanced Biology Honors/);
   assert.equal(await className.getAttribute('aria-expanded'),'true');
   await className.press('Escape');assert.equal(await className.getAttribute('aria-expanded'),'false');
   await className.press('Enter');assert.equal(await className.getAttribute('aria-expanded'),'true');
   await page.waitForFunction(()=>getComputedStyle(document.querySelector('.schedule-classmates-tooltip')).opacity==='1');
   await className.press('ArrowDown');assert.equal(await page.locator('.schedule-classmates-tooltip').evaluate(el=>document.activeElement===el),true);
   assert.equal(await className.getAttribute('aria-expanded'),'true','popover stays open when keyboard focus enters its scrollable details');
   await page.screenshot({path:path.join(report,`class-${mobile?'mobile':'desktop'}.png`)});
   await page.evaluate(()=>ChatApp.openRoom('test',{quiet:true}));
   await page.evaluate(async()=>{
    ChatApp.closeToast();const c=document.createElement('canvas');c.width=800;c.height=500;const x=c.getContext('2d');x.fillStyle='#ffffff';x.fillRect(0,0,800,500);x.fillStyle='#154870';x.font='32px sans-serif';x.fillText('Screenshot: private details here',80,200);
    const blob=await new Promise(r=>c.toBlob(r));await ChatApp.addPendingFile(new File([blob],'Screenshot.png',{type:'image/png'}));
    window.originalAttachment=ChatApp.pendingFiles[0];
   });
   await page.evaluate(()=>ChatApp.openMediaModal('image',ChatApp.pendingFiles[0].previewURL,{fileName:'Screenshot.png'}));
   await page.waitForFunction(()=>document.querySelector('.media-zoom-target')?.naturalWidth===800);
   await page.waitForTimeout(200);
   const expectedZoom=await page.locator('.media-zoom-controls').evaluate(zoomStyle);
   await page.screenshot({path:path.join(report,`viewer-reference-${mobile?'mobile':'desktop'}.png`)});
   await page.click('#btn-modal-close');await page.waitForFunction(()=>ChatApp.modalEl.hidden);
   await page.locator('button.file-thumb').click();await page.waitForFunction(()=>document.getElementById('attachment-image-editor')?.dataset.ready==='1');
   await page.waitForTimeout(200);
   assert.deepEqual(await page.locator('.media-zoom-controls').evaluate(zoomStyle),expectedZoom,'editor zoom uses the exact regular viewer component and computed styles');
   assert.equal(await page.locator('.media-zoom-controls > button[data-media-zoom="reset"] > span[data-media-zoom="percent"]').textContent(),'100%');
   assert(await page.locator('.image-editor-status').evaluate(el=>el.getBoundingClientRect().width<=1&&getComputedStyle(el).clip!=='auto'),'instructional bottom bubble is absent');
   assert(await page.locator('.image-editor-toolbar').evaluate(el=>[...el.children].every(b=>b.classList.contains('chat-icon-button'))),'editing tools reuse shared app buttons');
   assert.equal(await page.locator('#btn-media-create-sticker').isVisible(),false);
   const chrome=await page.evaluate(()=>{const save=document.getElementById('btn-image-editor-save').getBoundingClientRect(),close=document.getElementById('btn-modal-close').getBoundingClientRect(),toolbar=document.querySelector('.image-editor-toolbar').getBoundingClientRect();return {saveWidth:save.width,closeWidth:close.width,saveHeight:save.height,closeHeight:close.height,saveRight:save.right,closeLeft:close.left,sameTop:Math.abs(save.top-close.top)<1,clearTools:toolbar.bottom<save.top||toolbar.top>save.bottom||toolbar.right<save.left,toolbarFits:toolbar.left>=0&&toolbar.right<=innerWidth};});
   assert(chrome.saveWidth===chrome.closeWidth&&chrome.saveHeight===chrome.closeHeight&&chrome.saveRight<chrome.closeLeft&&chrome.sameTop&&chrome.clearTools&&chrome.toolbarFits,'icon-only Save matches X size and keeps toolbar clear: '+JSON.stringify(chrome));
   assert.equal(await page.locator('#btn-image-editor-save').textContent(),'');
   if(mobile){
    const session=await context.newCDPSession(page),r=await page.locator('.image-editor-viewport').boundingBox(),cx=r.x+r.width/2,cy=r.y+r.height/2;
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx-30,y:cy,id:1},{x:cx+30,y:cy,id:2}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx-70,y:cy,id:1},{x:cx+70,y:cy,id:2}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForFunction(()=>parseInt(document.querySelector('[data-media-zoom=percent]').textContent)>150);
    await page.locator('[data-media-zoom=reset]').tap();assert.equal(await page.locator('[data-media-zoom=reset]').textContent(),'100%');await session.detach();
   }else{
    await page.locator('.image-editor-viewport').hover();await page.mouse.wheel(0,-350);await page.waitForFunction(()=>parseInt(document.querySelector('[data-media-zoom=percent]').textContent)>100);await page.locator('[data-media-zoom=reset]').click();
   }
   await page.click('[data-image-tool="redact"]');
   let box=await page.locator('.image-editor-canvas').boundingBox();
   await page.mouse.move(box.x+box.width*.1,box.y+box.height*.3);await page.mouse.down();await page.mouse.move(box.x+box.width*.65,box.y+box.height*.5,{steps:8});await page.mouse.up();
   await page.click('#btn-modal-close');await page.waitForFunction(()=>ChatApp.modalEl.hidden);
   assert(await page.evaluate(()=>ChatApp.pendingFiles[0]===originalAttachment),'closing without Save keeps original object');
   await page.locator('button.file-thumb').click();await page.waitForFunction(()=>document.getElementById('attachment-image-editor')?.dataset.ready==='1');
   await page.click('[data-image-tool="redact"]');box=await page.locator('.image-editor-canvas').boundingBox();
   await page.mouse.move(box.x+box.width*.1,box.y+box.height*.3);await page.mouse.down();await page.mouse.move(box.x+box.width*.65,box.y+box.height*.5,{steps:8});await page.mouse.up();
   await page.click('[data-image-tool="arrow"]');
   await page.mouse.move(box.x+box.width*.7,box.y+box.height*.7);await page.mouse.down();await page.mouse.move(box.x+box.width*.55,box.y+box.height*.55,{steps:5});await page.mouse.up();
   await page.click('[data-image-action="undo"]');await page.click('[data-image-action="redo"]');
   await page.screenshot({path:path.join(report,`editor-${mobile?'mobile':'desktop'}.png`)});
   await page.click('#btn-image-editor-save');await page.waitForFunction(()=>document.querySelector('.image-editor-status').textContent.startsWith('Saved'));
   const saved=await page.evaluate(async()=>{const f=ChatApp.pendingFiles[0],b=await createImageBitmap(f.fileObject),c=document.createElement('canvas');c.width=b.width;c.height=b.height;const x=c.getContext('2d');x.drawImage(b,0,0);const pixels=[...x.getImageData(200,190,1,1).data];b.close();return{changed:f!==originalAttachment,type:f.fileObject.type,w:c.width,h:c.height,pixels};});
   assert.deepEqual(saved,{changed:true,type:'image/png',w:800,h:500,pixels:[0,0,0,255]},'saved upload has actual opaque redaction pixels');
   await page.click('[data-image-tool="crop"]');box=await page.locator('.image-editor-canvas').boundingBox();
   await page.mouse.move(box.x+box.width*.1,box.y+box.height*.1);await page.mouse.down();await page.mouse.move(box.x+box.width*.9,box.y+box.height*.9,{steps:5});await page.mouse.up();
   await page.click('#btn-image-editor-save');await page.waitForFunction(()=>document.querySelector('.image-editor-status').textContent.startsWith('Saved'));
   const dims=await page.evaluate(async()=>{const b=await createImageBitmap(ChatApp.pendingFiles[0].fileObject),d=[b.width,b.height];b.close();return d;});
   assert(dims[0]>=638&&dims[0]<=642&&dims[1]>=398&&dims[1]<=402,'crop changes saved dimensions');
   await page.click('#btn-modal-close');await page.waitForFunction(()=>ChatApp.modalEl.hidden);
   await page.evaluate(async()=>{
    const original=window.createImageBitmap; window.__oversizeClosed=false;
    window.createImageBitmap=async()=>({width:10000,height:10000,close(){window.__oversizeClosed=true;}});
    try { await ChatApp.openPendingImageEditor(ChatApp.pendingFiles[0]); } finally { window.createImageBitmap=original; }
   });
   assert.match(await page.locator('.image-editor-status').textContent(),/64 megapixels/);
   assert(await page.locator('#btn-image-editor-save').isDisabled());assert(await page.evaluate(()=>__oversizeClosed));
   await page.click('[data-image-tool="redact"]');await page.locator('.image-editor-viewport').click({position:{x:100,y:150}});
   await page.click('#btn-modal-close');await page.waitForFunction(()=>ChatApp.modalEl.hidden);
   assert.deepEqual(errors,[]);await context.close();
  }
  console.log('PASS desktop/mobile: HTML search inner/shell normal/focused style parity, exact media-viewer zoom style/markup, icon-only Save/close geometry, shared tool controls, no instruction bubble, class accessibility, edit discard/save/redaction/undo/redo/crop.');
 } finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
