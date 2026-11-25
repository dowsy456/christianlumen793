'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
const {createSharedFirebaseBackend} = require('../tests/shared-firebase-backend.cjs');
const root = path.resolve(__dirname, '..');
const output = path.resolve(root, '../schedules-calendar-results');
(async () => {
  await fs.mkdir(output, {recursive:true});
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const backend = createSharedFirebaseBackend(2);
    const context = await browser.newContext({viewport:{width:1440,height:900},timezoneId:'America/New_York'});
    await backend.bind(context);
    await context.addInitScript(() => {const OriginalDate=Date, stamp=OriginalDate.parse('2026-11-13T15:00:00Z');window.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:[stamp]));}static now(){return stamp;}};});
    await context.route(/^https?:\/\//,r=>r.fulfill({status:200,contentType:'application/json',body:'null'}));
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(pathToFileURL(path.join(root,'index.html')).href);
    await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
    await page.fill('#login-email', 'vincenzo.brogna@students.pittstonarea.com');
    await page.click('#btn-go-login');await page.fill('#login-code','P1');await page.click('#btn-login');
    await page.waitForFunction(()=>ChatApp.calendarState?.ready&&ChatApp.calendarState?.connected&&ChatApp.calendarState?.repeatingReady);
    await page.evaluate(()=>{ChatApp.closeToast?.();ChatApp.closeMobileDrawers?.();ChatApp.showSchedulesPage();});
    await page.waitForSelector('.sched-refresh .sched-times-row');
    assert.equal(await page.locator('.sched-type-badge[data-tooltip],.sched-type-badge[title]').count(),0,'day type has no tooltip');
    assert.ok(await page.locator('[data-sched-person]').count()>0,'people remain accessible alongside schedule');
    assert.ok(await page.locator('.sched-times-row.is-active').count()>0,'current block is highlighted');
    await page.click('[data-sched-preview-day="M"]');
    assert.equal(await page.locator('.sched-times-row.is-active').count(),0,'previewing a different day removes current block highlight');
    await page.click('[data-sched-person="Vinny"] .sched-avatar');
    assert.equal(await page.evaluate(() => !!ChatApp.userProfileOpen), false, 'the avatar selects its schedule');
    await page.waitForSelector('.sched-grid-row[data-sched-block]');
    assert.equal(await page.locator('[data-sched-person="Vinny"]').getAttribute('aria-pressed'),'true');
    assert.ok(await page.locator('.sched-class-label').count()>0,'class detail targets remain available');
    await page.evaluate(()=>{window.__copiedPerson=null;ChatApp.copyPersonSchedule=p=>{window.__copiedPerson=p;};});
    await page.click('[data-sched-copy]');
    assert.equal(await page.evaluate(()=>window.__copiedPerson),'Vinny');
    for(const viewport of [{width:1920,height:1080},{width:1440,height:900},{width:1366,height:768},{width:1024,height:768},{width:920,height:640},{width:390,height:844},{width:740,height:390}]) {
      await page.setViewportSize(viewport);await page.waitForTimeout(100);
      const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,rows:[...document.querySelectorAll('.sched-grid-row')].map(e=>e.scrollWidth>e.clientWidth+1)}));
      assert.equal(layout.overflow,false,`schedule viewport ${JSON.stringify(viewport)}`);
      assert.ok(layout.rows.every(x=>!x),'schedule fields never force horizontal page overflow');
      if ([1440,1024,390].includes(viewport.width)) assert.ok(await page.evaluate(()=>document.querySelector('.sched-grid').getBoundingClientRect().bottom <= ChatApp.messagesEl.getBoundingClientRect().bottom+1),'standard nine periods fit the workspace');
      await page.screenshot({path:path.join(output,`schedule-person-${viewport.width}.png`)});
    }
    await page.click('[data-sched-back]');
    assert.equal(await page.locator('.sched-times-row').count(),9);
    await page.screenshot({path:path.join(output,'schedule-bells-740.png')});
    await page.evaluate(async()=>{
      for(let i=0;i<18;i++)await ChatApp.saveCalendarNote('2026-11-11',null,`Class review ${i+1}: homework and discussion`);
      await ChatApp.saveCalendarNote('2026-11-13',null,'Biology worksheets');
      ChatApp.showCalendarPage('2026-11-13');
    });
    for(const viewport of [{width:1920,height:1080},{width:1366,height:768},{width:920,height:640},{width:390,height:844},{width:740,height:390},{width:390,height:320}]) {
      await page.setViewportSize(viewport);
      for(const month of [1,7,10]) {
        await page.evaluate(month=>{ChatApp.calendarState.month=month;ChatApp.renderCalendar();ChatApp.messagesEl.scrollTop=0;},month);
        await page.waitForTimeout(100);
        const geometry=await page.evaluate(()=>{
          const grid=document.querySelector('.calendar-month-grid-card').getBoundingClientRect(),host=ChatApp.messagesEl.getBoundingClientRect(),card=document.querySelector('.calendar-month-card');
          return {grid:grid.toJSON(),host:host.toJSON(),height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1,cardHeight:card.getBoundingClientRect().height,variable:parseFloat(document.querySelector('.calendar-page').style.getPropertyValue('--calendar-height')),cells:[...document.querySelectorAll('.calendar-day')].map(e=>e.getBoundingClientRect().toJSON())};
        });
        assert.equal(geometry.overflow,false,JSON.stringify(geometry));
        assert.ok(geometry.grid.top>=geometry.host.top-1&&geometry.grid.bottom<=Math.min(geometry.host.bottom,geometry.height)+1,`entire month fits ${JSON.stringify(viewport)}, month ${month}: ${JSON.stringify(geometry)}`);
        assert.ok(Math.abs(geometry.cardHeight-geometry.variable)<1,'fixed minimum height cannot override measured viewport');
        assert.ok(geometry.cells.every(r=>r.height>8&&r.bottom<=geometry.grid.bottom+1),'all dates remain visible, including six-week months');
      }
      await page.screenshot({path:path.join(output,`calendar-${viewport.width}x${viewport.height}.png`)});
    }
    await page.setViewportSize({width:1440,height:900});
    await page.evaluate(()=>{ChatApp.messagesEl.scrollTop=0;});await page.waitForTimeout(100);
    const height=await page.locator('.calendar-month-card').evaluate(e=>e.getBoundingClientRect().height);
    await page.locator('.calendar-editor-new').scrollIntoViewIfNeeded();await page.waitForTimeout(100);
    assert.equal(await page.locator('.calendar-month-card').evaluate(e=>e.getBoundingClientRect().height),height,'scrolling to editors cannot change month height');
    await page.evaluate(()=>{ChatApp.showCalendarDay('2026-11-11');});
    assert.equal(await page.locator('.calendar-note-item').count(),18,'all existing day notes remain accessible');
    assert.ok(await page.evaluate(()=>ChatApp.messagesEl.scrollHeight>ChatApp.messagesEl.clientHeight),'day detail pages retain scrolling');
    assert.deepEqual(errors,[]);
    await context.close();
    console.log('Schedules selection, day preview, copy routing, tooltip removal and responsive agenda passed. Calendar month bounds passed at six viewport sizes and 4/5/6-week months; day notes retain scrolling.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
