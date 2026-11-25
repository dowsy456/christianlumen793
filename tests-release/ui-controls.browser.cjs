/* Shared control appearance and interaction, using only the offline database. */
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const mock = require('../tests/firebase-mock.js');
const root = path.resolve(__dirname, '..');
const output = path.resolve(root, '../ui-controls-results');
const controlSelector = '.btn,.icon-btn,.chat-icon-button,.modal-close,.settings-tab,.calendar-button,.composer-tool-btn,.sidebar-dock-button,.rooms-add,.rooms-mode-toggle,.side-btn,.mobile-header-action';
const style = el => {
  const s = getComputedStyle(el), r = el.getBoundingClientRect();
  return {font:s.fontFamily,radius:s.borderRadius,shadow:s.boxShadow,background:s.backgroundColor,image:s.backgroundImage,weight:s.fontWeight,outline:s.outlineStyle,outlineWidth:s.outlineWidth,width:r.width,height:r.height,x:r.x,y:r.y};
};
async function inspect(page, label) {
  const result = await page.evaluate(selector => {
    const ui = getComputedStyle(document.body).fontFamily;
    const controls = [...document.querySelectorAll(selector)].filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden').map(el => {
      const s=getComputedStyle(el),r=el.getBoundingClientRect();
      return {id:el.id,classes:el.className,font:s.fontFamily,radius:s.borderRadius,shadow:s.boxShadow,width:r.width,height:r.height};
    });
    return {ui,controls,overflow:document.documentElement.scrollWidth > innerWidth + 1};
  }, controlSelector);
  assert.ok(result.controls.length, `${label}: real controls are mounted`);
  for (const c of result.controls) {
    assert.equal(c.font,result.ui,`${label}: ${c.id || c.classes} uses the app font`);
    assert.equal(c.radius,'10px',`${label}: ${c.id || c.classes} shares the action shape`);
    assert.equal(c.shadow,'none',`${label}: ${c.id || c.classes} has no colored glow`);
    assert.ok(c.width > 0 && c.height > 0,`${label}: ${c.id || c.classes} retains a usable box`);
  }
  assert.equal(result.overflow,false,`${label}: controls do not overflow the page`);
  return result.controls.length;
}
(async () => {
  await fs.mkdir(output,{recursive:true});
  const browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'chrome',headless:true});
  const report=[];
  try {
    for (const viewport of [{width:1440,height:900},{width:390,height:844},{width:740,height:390}]) {
      const context=await browser.newContext({viewport,isMobile:viewport.width<821,hasTouch:viewport.width<821});
      await context.addInitScript(mock);
      await context.route(/^https?:\/\//,r=>r.fulfill({status:200,contentType:'application/json',body:'null'}));
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto(pathToFileURL(path.join(root,'index.html')).href);
      await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
      assert.equal(await page.locator('link[href*="css/ui-controls.css"]').count(),1,'shared CSS is integrated exactly once');
      await page.waitForTimeout(350);
      // Auth intentionally uses its separate square, Segoe UI controls.
      let count=2;
      await page.locator('#btn-go-create').scrollIntoViewIfNeeded();
      await page.mouse.move(1,1);await page.waitForTimeout(180);
      const primary=await page.locator('#btn-go-login').evaluate(style);
      const secondary=await page.locator('#btn-go-create').evaluate(style);
      for(const control of [primary,secondary]) {
        assert.match(control.font,/Segoe UI/,'auth controls retain their dedicated typeface');
        assert.equal(control.radius,'0px','auth controls stay square');
        assert.equal(control.shadow,'none','auth controls have no app glow');
      }
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'auth controls fit the viewport');
      assert.notEqual(primary.background,secondary.background,'primary action remains visually distinct');
      assert.equal(primary.image,'none','primary action has no blue/green gradient');
      await page.locator('#btn-go-login').hover();await page.waitForTimeout(180);
      const hovered=await page.locator('#btn-go-login').evaluate(style);
      assert.notEqual(hovered.background,primary.background,'hover is visibly responsive');
      for(const k of ['x','y','width','height'])assert.ok(Math.abs(hovered[k]-primary[k])<.2,`hover does not move or shrink the target: ${viewport.width} ${k} ${JSON.stringify(primary)} -> ${JSON.stringify(hovered)}`);
      await page.mouse.move(1,1);await page.keyboard.press('Tab');
      await page.locator('#btn-go-login').focus();
      const focused=await page.locator('#btn-go-login').evaluate(style);
      assert.equal(focused.outline,'solid');assert.equal(focused.outlineWidth,'2px','keyboard focus remains visible');
      await page.fill('#login-email', 'vincenzo.brogna@students.pittstonarea.com');
      await page.click('#btn-go-login');await page.fill('#login-code','TEST-USER');await page.click('#btn-login');
      await page.waitForFunction(()=>ChatApp.currentUser?.code==='TEST-USER');
      await page.evaluate(async()=>{await ChatApp.openRoom('test',{quiet:true});ChatApp.closeToast?.();});
      await page.waitForFunction(()=>!ChatApp.bulkLoading);
      count+=await inspect(page,'chat');
      const plus=await page.locator('#btn-room-plus').evaluate(style);
      assert.notEqual(plus.background,'rgba(0, 0, 0, 0)','room creation keeps its filled action background');
      const send=await page.locator('#btn-send').evaluate(style);
      assert.equal(send.shadow,'none');assert.equal(send.image,'none');
      await page.screenshot({path:path.join(output,`chat-${viewport.width}.png`)});
      await page.evaluate(()=>document.getElementById('btn-side-settings').click());
      await page.waitForSelector('.settings-tabs');
      for (const tab of ['profile','appearance','preferences','account']) {
        await page.locator(`#settings-tab-${tab}`).click();
        count+=await inspect(page,`settings ${tab}`);
        const selected=await page.locator(`#settings-tab-${tab}`).evaluate(style);
        const other=await page.locator(`#settings-tab-${tab==='profile'?'account':'profile'}`).evaluate(style);
        assert.notEqual(selected.background,other.background,'selected tab is still identifiable');
      }
      await page.locator('#settings-tab-profile').click();
      await page.screenshot({path:path.join(output,`settings-${viewport.width}.png`)});
      await page.evaluate(()=>ChatApp.closeModal());await page.waitForTimeout(160);
      await page.evaluate(()=>ChatApp.openNotepadModal());await page.waitForSelector('#notepad-editor');
      count+=await inspect(page,'notepad');
      assert.match(await page.locator('#notepad-editor').evaluate(e=>getComputedStyle(e).fontFamily),/monospace/,'the document editor retains intentional monospace text');
      await page.evaluate(()=>ChatApp.closeModal());await page.waitForTimeout(160);
      await page.evaluate(()=>ChatApp.showCalendarPage());await page.waitForSelector('.calendar-month-page');
      count+=await inspect(page,'calendar');
      await page.evaluate(()=>ChatApp.openTimeDisplayModal());await page.waitForSelector('.time-display-modal-ui');
      count+=await inspect(page,'time display');
      await page.evaluate(()=>ChatApp.closeModal());await page.waitForTimeout(160);
      // Rare states are fixture controls, so no live call, recording or deletion is started.
      const states=await page.evaluate(()=>{
        const host=document.createElement('div');host.style.cssText='position:fixed;top:10px;left:10px;z-index:100000;display:flex;gap:5px';
        host.innerHTML='<button class="btn">Neutral</button><button class="btn danger">Delete</button><button class="modal-close sticker-save-action is-saved" aria-label="Saved Sticker">*</button><button class="call-control call-control-join" aria-label="Join Call">+</button><button class="call-control call-control-leave" aria-label="Leave Call">x</button><button class="btn" disabled>Unavailable</button><div class="call-control-split"><button class="call-control" aria-label="Microphone">M</button><button class="call-control call-settings-toggle" aria-label="Microphone Options">v</button></div>';
        document.body.appendChild(host);
        const values=[...host.querySelectorAll('button')].map(e=>{const s=getComputedStyle(e);return {background:s.backgroundColor,color:s.color,radius:s.borderRadius,shadow:s.boxShadow,opacity:s.opacity,cursor:s.cursor};});
        host.remove();return values;
      });
      assert.equal(new Set(states.slice(0,5).map(x=>x.background)).size,5,'neutral, destructive, saved, join and leave meanings stay distinct');
      assert.ok(states.every(x=>x.shadow==='none'),'semantic states have no glow');
      assert.equal(states[5].opacity,'0.45');assert.equal(states[5].cursor,'default');
      assert.equal(states[6].radius,'10px 0px 0px 10px');assert.equal(states[7].radius,'0px 10px 10px 0px','split controls keep joined corners');
      const toggles=await page.evaluate(()=>{
        const host=document.createElement('div');document.body.appendChild(host);
        const variants=[['icon-btn call-menu-chat','aria-pressed'],['modal-close','aria-pressed'],['vpu-btn vpu-loop','aria-pressed'],['vpu-rate','data-active'],['sched-preview-btn','class'],['msg-menu-btn','aria-checked']];
        const values=variants.map(([classes,attribute])=>{
          const b=document.createElement('button');b.className=classes;b.style.setProperty('transition','none','important');host.appendChild(b);
          const off=getComputedStyle(b).backgroundColor;
          if(attribute==='class')b.classList.add('is-active');else b.setAttribute(attribute,attribute==='data-active'?'1':'true');
          return {classes,off,on:getComputedStyle(b).backgroundColor};
        });
        host.innerHTML='<button class="call-control call-control-overlay is-active"></button><div class="sidebar-call-actions"><button class="sidebar-dock-button sidebar-call-share is-active"></button></div>';
        const active=[...host.querySelectorAll('button')].map(e=>getComputedStyle(e).backgroundColor);
        host.innerHTML='<button class="call-control call-control-leave"></button><div class="sidebar-call-actions"><button class="sidebar-dock-button sidebar-call-leave"></button></div><button class="font-dd-opt" style="font-family:monospace">Font Preview</button>';
        const leave=[...host.querySelectorAll('button')].slice(0,2).map(e=>getComputedStyle(e).backgroundColor);
        const previewFont=getComputedStyle(host.querySelector('.font-dd-opt')).fontFamily;
        host.remove();return {values,active,leave,previewFont};
      });
      for(const t of toggles.values)assert.notEqual(t.off,t.on,`${t.classes}: toggled state stays visually identifiable`);
      assert.equal(toggles.active[0],toggles.active[1],'main overlay and sidebar sharing retain the same active success color');
      assert.notEqual(toggles.active[0],states[1].background,'active sharing must not use destructive styling');
      assert.equal(toggles.leave[0],toggles.leave[1],'main and sidebar leave buttons share their destructive color');
      assert.match(toggles.previewFont,/monospace/,'a font-preview option keeps its intentionally selected face');
      const compactIcon=await page.evaluate(()=>{
        const host=document.createElement('div');host.className='room-toolbar';
        host.style.cssText='position:fixed;left:20px;top:20px;width:100px';
        host.innerHTML='<button class="icon-btn room-toolbar-action chat-icon-button" aria-label="Close Companion"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6L18 18M18 6L6 18" /></svg></button>';
        document.body.appendChild(host);const b=host.querySelector('button').getBoundingClientRect(),i=host.querySelector('svg').getBoundingClientRect();
        const result={width:b.width,height:b.height,icon:i.width,dx:Math.abs(i.x+i.width/2-b.x-b.width/2),dy:Math.abs(i.y+i.height/2-b.y-b.height/2)};
        host.remove();return result;
      });
      assert.ok(compactIcon.width>=28&&compactIcon.height===32,'compact toolbar keeps its original target dimensions');
      assert.equal(compactIcon.icon,20,'compact toolbar keeps a legible 20px icon');
      assert.ok(compactIcon.dx<.6&&compactIcon.dy<.6,`short toolbar icon stays centered: ${JSON.stringify(compactIcon)}`);
      const tooltip=await page.evaluate(()=>{
        const result=['sidebar-tooltip','call-viewers-tooltip','timestamp-tooltip'].map(cls=>{
          const e=document.createElement('div');e.className=cls;document.body.appendChild(e);const s=getComputedStyle(e);
          const values={font:s.fontFamily,size:s.fontSize,weight:s.fontWeight,line:s.lineHeight,background:s.backgroundColor,border:s.border,radius:s.borderRadius,shadow:s.boxShadow};e.remove();return values;
        });return result;
      });
      assert.deepEqual(tooltip[0],tooltip[1]);assert.deepEqual(tooltip[1],tooltip[2],'plain and rich tooltips share one visual surface');
      assert.deepEqual(errors,[]);
      report.push({viewport,checkedVisibleControls:count});
      await context.close();
    }
    await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
    console.log('Shared control browser checks passed:',JSON.stringify(report));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
