'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const install = require('../tests/room-loading-fixture.cjs');

(async () => {
  const browser = await chromium.launch({ channel:'chrome',headless:true });
  try {
    const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    await context.addInitScript(install,{count:75,latencyMs:20});
    await context.route(/^https?:\/\//,r=>r.fulfill({status:200,contentType:'application/json',body:'null'}));
    const page = await context.newPage();
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(pathToFileURL(path.join(__dirname,'../index.html')).href);
    await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
    await page.fill('#login-email','vincenzo.brogna@students.pittstonarea.com');
    await page.click('#btn-go-login'); await page.fill('#login-code','TEST-USER'); await page.click('#btn-login');
    await page.waitForFunction(()=>ChatApp.currentUser && ChatApp.membershipMap.has('test') && ChatApp.schedulesPeopleLoadedOnce);
    await page.evaluate(()=>ChatApp.openRoom('test',{quiet:true}));
    await page.waitForFunction(()=>ChatApp.currentRoomId==='test' && !ChatApp.roomLoadingActive);
    await page.evaluate(()=>{ChatApp.closeToast();ChatApp.setMobileDrawer('navigation');});
    const cdp=await context.newCDPSession(page);
    const row=page.locator('.room-row[data-room-row="second"]');
    await row.waitFor({state:'visible'});
    await row.scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.querySelector('.room-row[data-room-row="second"]').getBoundingClientRect().left>=0);
    // Wait for the actual drawer animation and scroll position to settle before touching the row.
    await row.click({trial:true});
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
      type, touchPoints: type === 'touchEnd' ? [] : [{x, y, id: 1}]
    });
    async function swipeFrom(target, distance) {
      const box = await target.boundingBox();
      const x = Math.round(box.x + box.width * (distance > 0 ? .2 : .8));
      const y = Math.round(box.y + box.height / 2);
      await touch('touchStart', x, y);
      for (let step = 1; step <= 8; step++) {
        await touch('touchMove', Math.round(x + distance * step / 8), y + 1);
        await page.waitForTimeout(36);
      }
      await touch('touchEnd');
    }
    await swipeFrom(row, -208);
    await page.waitForFunction(() => document.body.dataset.mobileNav === '0');
    assert.equal(await page.evaluate(() => ChatApp.currentRoomId), 'test', 'a swipe over a room must not open it');
    await page.evaluate(() => ChatApp.setMobileDrawer('members'));
    const member = page.locator('#members-sidebar .member-row').first();
    await member.click({trial:true});
    await swipeFrom(member, 200);
    await page.waitForFunction(() => document.body.dataset.membersSidebar !== '1');
    assert.equal(await page.evaluate(() => Boolean(ChatApp.userProfileOpen)), false, 'a swipe over a member must not open their profile');
    await page.evaluate(()=>ChatApp.setMobileDrawer('navigation'));
    await row.click({trial:true});
    await page.evaluate(async () => {
      // Both panes are moving after switching directly from Members to Navigation.
      await new Promise(requestAnimationFrame);
      await Promise.all(document.getAnimations().filter(a =>
        a instanceof CSSTransition && a.effect.target.closest('#sidebar-nav-surface,.chat-main,#members-sidebar')
      ).map(a => a.finished.catch(() => {})));
    });
    const tapBox = await row.boundingBox();
    await touch('touchStart', Math.round(tapBox.x + tapBox.width / 2), Math.round(tapBox.y + tapBox.height / 2));
    await page.waitForTimeout(65);
    await touch('touchEnd');
    await page.waitForFunction(()=>ChatApp.currentRoomId==='second');
    const times=await page.evaluate(()=>{
      const a=ChatApp, listener=a.schedulesPeopleListener;
      const durations={};
      for(const [name,open] of [['Schedules',()=>a.showSchedulesPage()],['Home',()=>a.showLoggedInHome()],['Calendar',()=>a.showCalendarPage()],['Schedules again',()=>a.showSchedulesPage()]]) {
        const start=performance.now();open();durations[name]=Math.round((performance.now()-start)*10)/10;
      }
      if(!listener || a.schedulesPeopleListener!==listener) throw Error('Account directory was detached during navigation.');
      if(!a.messagesListEl.querySelector('[data-sched-person]')) throw Error('Warm accounts missing during the opening event.');
      return durations;
    });
    // Cancel a directory subscription, supply a late event from that generation,
    // and let the active schedule recover without navigating away.
    await page.evaluate(()=>{
      const a=ChatApp, ref=a.db.ref.bind(a.db);
      a.resetSchedulesPeopleDirectory();
      let first=true;
      a.db.ref=(name,...args)=>{
        const r=ref(name,...args); if(name!=='users') return r;
        const on=r.on.bind(r);
        r.on=(event,cb,fail)=>{
          if(first) {first=false;setTimeout(()=>{fail(Object.assign(new Error('temporary disconnect'),{code:'NETWORK_ERROR'}));cb({exists:()=>true,val:()=>({stale:{username:'stale account'}})});},15);return cb;}
          return on(event,cb,fail);
        };return r;
      };
      a.showSchedulesPage();
    });
    await page.waitForFunction(()=>ChatApp.schedulesPeopleLoadedOnce && ChatApp.schedulesPeopleByCode.has('TEST-USER'));
    assert.equal(await page.getByText('stale account',{exact:true}).count(),0);
    const fastPath = await page.evaluate(() => {
      const a = ChatApp, detach = a.detachMessages;
      let teardowns = 0, hiddenMeasurements = 0;
      a.detachMessages = (...args) => { teardowns++; return detach(...args); };
      const cleanup = [a.$("composer"), a.$("composer-row")].map(node => {
        const measure = node.getBoundingClientRect;
        node.getBoundingClientRect = function () {
          if (document.body.classList.contains("composer-hidden-page")) hiddenMeasurements++;
          return measure.call(this);
        };
        return () => delete node.getBoundingClientRect;
      });
      try {
        a.showLoggedInHome(); a.showCalendarPage(); a.showSchedulesPage();
        return { teardowns, hiddenMeasurements, disabled: a.$("msg-input").disabled };
      } finally {
        cleanup.forEach(restore => restore());
        a.detachMessages = detach;
      }
    });
    assert.deepEqual(fastPath, { teardowns: 0, hiddenMeasurements: 0, disabled: true });
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({roomRowSwipe:true,memberRowSwipe:true,ordinaryTap:true,accountsRecovered:true,pageSwitchHandlerMs:times}));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
