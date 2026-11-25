'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const {createSharedFirebaseBackend}=require('../tests/shared-firebase-backend.cjs');
const root=path.resolve(__dirname,'..'),output=path.resolve(root,'../calendar-layout-results');
const toggleStyle=el=>{const s=getComputedStyle(el),knob=getComputedStyle(el,'::after');return {width:s.width,height:s.height,border:s.border,background:s.backgroundImage,shadow:s.boxShadow,radius:s.borderRadius,knob:{width:knob.width,height:knob.height,background:knob.backgroundImage,transform:knob.transform}};};
const scrollbarStyle=el=>{const bar=getComputedStyle(el,'::-webkit-scrollbar'),thumb=getComputedStyle(el,'::-webkit-scrollbar-thumb'),button=getComputedStyle(el,'::-webkit-scrollbar-button');return {width:bar.width,height:bar.height,display:bar.display,color:thumb.backgroundColor,radius:thumb.borderRadius,border:thumb.border,button:button.display};};
(async()=>{
 await fs.mkdir(output,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  for(const viewport of [{width:1440,height:900},{width:1920,height:1080},{width:390,height:844},{width:740,height:390}]){
   const backend=createSharedFirebaseBackend(2),errors=[];
   const context=await browser.newContext({viewport,timezoneId:'America/New_York',hasTouch:viewport.width<821,isMobile:viewport.width<821});
   await backend.bind(context);
   await context.addInitScript(()=>{const DateBefore=Date,stamp=DateBefore.parse('2026-11-09T20:00:00Z');window.Date=class extends DateBefore{constructor(...args){super(...(args.length?args:[stamp]));}static now(){return stamp;}};});
   await context.route(/^https?:\/\//,route=>route.fulfill({status:200,contentType:'application/json',body:'null'}));
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.goto(pathToFileURL(path.join(root,'index.html')).href);
   await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
   await page.fill('#login-email', 'vincenzo.brogna@students.pittstonarea.com');
   await page.click('#btn-go-login');await page.fill('#login-code','P1');await page.click('#btn-login');
   await page.waitForFunction(()=>ChatApp.calendarState?.ready&&ChatApp.calendarState?.connected&&ChatApp.calendarState?.repeatingReady&&ChatApp.calendarState?.serverYear===2026);
   await page.evaluate(async()=>{
    ChatApp.closeToast?.();ChatApp.closeMobileDrawers?.();
    await ChatApp.saveCalendarNote('2026-11-10',null,'Spanish Quiz');
    for(let n=1;n<=18;n++)await ChatApp.saveCalendarNote('2026-11-11',null,`Review note ${n}: bring homework and prepare for the weekly discussion.`);
    await ChatApp.saveCalendarNote('2026-11-12',null,'Long note: '+('Important coursework details and revision topics. '.repeat(25)));
    await ChatApp.saveCalendarNote('2026-11-12',null,'https://school.example/'+('long-path-'.repeat(24)));
    ChatApp.showCalendarPage('2026-11-10');
   });
   const form=page.locator('.calendar-editor-new');await form.scrollIntoViewIfNeeded();
   const remind=form.locator('.calendar-remind-checkbox'),repeat=form.locator('.calendar-repeat-checkbox');
   assert.equal(await repeat.getAttribute('aria-label'),'Repeat');
   assert.equal(await form.locator('.calendar-repeat-label').textContent(),'Repeat');
   assert.deepEqual(await repeat.evaluate(toggleStyle),await remind.evaluate(toggleStyle),'unchecked toggles share the same real component style');
   await remind.check();await repeat.check();await page.waitForTimeout(180);
   assert.deepEqual(await repeat.evaluate(toggleStyle),await remind.evaluate(toggleStyle),'checked toggle styles/knobs match');
   await repeat.uncheck();await remind.uncheck();await page.waitForTimeout(180);
   const geometry=await page.evaluate(()=>{
    const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,right:r.right,width:r.width};};
    return {host:rect('#calendar-page'),blocks:['.calendar-month-grid-card','.calendar-notes-section','.calendar-repeating-section'].map(rect),overflow:document.documentElement.scrollWidth>innerWidth+1};
   });
   assert.equal(geometry.overflow,false);
   for(const block of geometry.blocks){const left=block.x-geometry.host.x,right=geometry.host.right-block.right;assert.ok(left>=9&&left<=21&&Math.abs(left-right)<1,JSON.stringify(geometry));}
   assert.ok(Math.max(...geometry.blocks.map(x=>x.width))-Math.min(...geometry.blocks.map(x=>x.width))<1);
   await page.mouse.move(1,1);await page.screenshot({path:path.join(output,`forms-${viewport.width}.png`)});
   const wheelAt=async(selector,dy)=>{
    const box=await page.locator(selector).boundingBox();assert.ok(box&&box.height>0,selector);
    await page.mouse.move(box.x+Math.min(box.width/2,16),box.y+Math.min(box.height/2,12));
    await page.mouse.wheel(0,dy);await page.waitForTimeout(300);
   };
   const reset=async()=>{await page.evaluate(()=>{ChatApp.messagesEl.scrollTop=0;for(const e of document.querySelectorAll('.calendar-day-preview'))e.scrollTop=0;});await page.waitForTimeout(300);};
   const short='.calendar-day[data-date="2026-11-10"] .calendar-day-preview',long='.calendar-day[data-date="2026-11-11"] .calendar-day-preview';
   await reset();
   assert.equal(await page.locator(short).evaluate(e=>e.scrollHeight>e.clientHeight+1),false);
   await wheelAt(short,160);
   assert.ok(await page.evaluate(()=>ChatApp.messagesEl.scrollTop>40),'non-overflowing notes let the calendar page scroll');
   await reset();
   assert.equal(await page.locator(long).evaluate(e=>e.scrollHeight>e.clientHeight+1),true);
   await wheelAt(long,90);
   assert.ok(await page.locator(long).evaluate(e=>e.scrollTop>25),'overflowing notes scroll under the pointer');
   assert.equal(await page.evaluate(()=>ChatApp.messagesEl.scrollTop),0,'page stays still while note list has scroll capacity');
   await page.locator(long).evaluate(e=>{e.scrollTop=e.scrollHeight;});await page.waitForTimeout(300);
   await wheelAt(long,160);
   assert.equal(await page.evaluate(()=>ChatApp.messagesEl.scrollTop),0,'overflowing list contains wheel input at its bottom');
   await page.locator(long).evaluate(e=>{e.scrollTop=0;});await wheelAt(long,-160);
   assert.equal(await page.evaluate(()=>ChatApp.messagesEl.scrollTop),0,'overflowing list contains wheel input at its top');
   await reset();await wheelAt('.calendar-day[data-date="2026-11-11"] .calendar-day-top',160);
   assert.ok(await page.evaluate(()=>ChatApp.messagesEl.scrollTop>40),'day heading scrolls the page even with overflowing notes below');
   await reset();
   const edges=await page.evaluate(()=>{const box=s=>document.querySelector(s).getBoundingClientRect();return {grid:box('.calendar-month-grid-card').toJSON(),title:box('.calendar-month-heading').toJSON(),controls:box('.calendar-controls').toJSON()};});
   assert.ok(Math.abs(edges.title.left-edges.grid.left)<1&&Math.abs(edges.controls.right-edges.grid.right)<1,'header aligns with grid edges');
   assert.equal(await page.locator(short).evaluate(e=>getComputedStyle(e).overflowY),'clip','short lists are not scroll containers and preserve native wheel animation');
   await page.mouse.move(1,1);await page.screenshot({path:path.join(output,`month-${viewport.width}.png`)});
   const bar=await page.locator(long).evaluate(scrollbarStyle);assert.equal(bar.width,'8px');assert.equal(bar.button,'none');
   assert.deepEqual(await page.locator('#messages').evaluate(scrollbarStyle),bar);
   await page.evaluate(()=>{const e=document.createElement('textarea');e.id='future-scroll-test';e.style.cssText='position:fixed;left:20px;top:20px;width:120px;height:60px';e.value='Future panel\n'.repeat(20);document.body.append(e);});
   assert.deepEqual(await page.locator('#future-scroll-test').evaluate(scrollbarStyle),bar,'future scrolling inputs inherit default style');
   await page.locator('#future-scroll-test').evaluate(e=>e.remove());
   await page.evaluate(()=>ChatApp.showCalendarDay('2026-11-12'));await page.waitForTimeout(120);
   const day=await page.evaluate(()=>{
    const heading=document.querySelector('.calendar-day-page-heading').getBoundingClientRect(),list=document.querySelector('.calendar-day-notes').getBoundingClientRect(),host=document.querySelector('#calendar-page').getBoundingClientRect();
    return {left:heading.left-host.left,right:host.right-heading.right,width:list.width,align:Math.abs(list.left-heading.left),overflow:[...document.querySelectorAll('.calendar-note-item')].some(e=>e.scrollWidth>e.clientWidth+1)||document.documentElement.scrollWidth>innerWidth+1,headers:[...document.querySelectorAll('.calendar-editor-header')].map(e=>e.getBoundingClientRect().width)};
   });
   assert.ok(day.left>=9&&day.right>=9&&Math.abs(day.left-day.right)<1&&day.align<1,JSON.stringify(day));assert.equal(day.overflow,false);assert.ok(day.headers.every(w=>w<350),'note order controls remain beside author');
   const first=page.locator('.calendar-note-item').first();
   const before=(await first.boundingBox()).width;
   await first.locator('.calendar-editor-edit').click();
   await first.locator('textarea').fill('Short note');await first.locator('.calendar-editor-save').click();
   await page.waitForFunction(()=>document.querySelector('.calendar-note-bubble').textContent==='Short note'&&!document.querySelector('.calendar-note-bubble').hidden);
   const after=(await first.boundingBox()).width;
   if(viewport.width>1000)assert.ok(after<before-50,'each saved card shrinks to its own text/actions');
   await page.mouse.move(1,1);await page.screenshot({path:path.join(output,'day-'+viewport.width+'.png')});
   await page.evaluate(()=>document.querySelector('#btn-side-settings').click());await page.waitForSelector('#settings-search-input');
   assert.deepEqual(await page.locator('#modal-body').evaluate(scrollbarStyle),bar,'settings scrollbar matches calendar/chat');
   if(viewport.width===1440){
    const html=await page.evaluate(()=>ChatActivities.load('merge-party'));
    assert.ok(html.includes('css/scrollbars.css?v='),'bundled activity receives the shared scrollbar contract');
   }
   assert.deepEqual(errors,[]);await context.close();
  }
  console.log('Calendar toggle, gutter, day layout, native page scrolling and contained note scrolling and app-wide scrollbar checks passed at four viewport sizes.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
