/* Offline regression for the shared sign-in UI. Every account/database operation
 * uses firebase-mock; this test never reads or writes a production account. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const mock = require('../tests/firebase-mock.js');
const fixtureURL = pathToFileURL(path.resolve(__dirname, '../index.html')).href;
const captures = path.resolve(process.argv[2] || path.join(__dirname, '../../auth-report'));
const emails = [
  'vincenzo.brogna@students.pittstonarea.com',
  'caden.roberts@students.pittstonarea.com',
  'giuseppe.rodeghiero@students.pittstonarea.com',
  'santino.rodeghiero@students.pittstonarea.com',
  'thomas.craig@students.pittstonarea.com',
  'william.lykins@students.pittstonarea.com'
];
async function session(browser, viewport = {width:1440,height:900}) {
  const mobile = viewport.width < 800 || viewport.height < 500;
  const context = await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile});
  context.setDefaultTimeout(15000);
  await context.addInitScript(mock);
  await context.addInitScript(() => {
    window.__authClipboard = '';
    Object.defineProperty(navigator, 'clipboard', {configurable:true,value:{writeText:async value=>{window.__authClipboard=value;}}});
  });
  await context.route(/^https?:\/\//, route=>route.fulfill({status:200,contentType:'application/json',body:'null'}));
  const errors=[],page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(fixtureURL);
  await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
  return {context,page,errors};
}
async function view(page, name) {
  await page.waitForFunction(name=>document.getElementById('view-'+name)?.dataset.active==='true' && !ChatApp.authBusy,name);
}
async function enterEmail(page, email=emails[0]) {
  await page.fill('#login-email',email);
  await page.click('#btn-go-login');
  await view(page,'login');
  await page.waitForFunction(()=>!document.getElementById('login-code').disabled);
}
async function login(page,email=emails[0],password='TEST-USER') {
  await enterEmail(page,email);
  await page.fill('#login-code',password);
  await page.click('#btn-login');
  await view(page,'chat');
}
async function logout(page) {
  await page.evaluate(()=>ChatApp.logoutToLanding());
  await view(page,'home');
  await page.evaluate(()=>ChatApp.closeAuthNotice());
}
async function noTooltip(page, selector) {
  await page.hover(selector);
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#sidebar-tooltip.is-visible').count(),0,'auth controls never show app tooltips');
}
async function inspect(page,name,viewport) {
  await view(page,name);
  await page.waitForTimeout(400);
  const actual=await page.evaluate(name=>{
    const active=document.getElementById('view-'+name), card=document.querySelector('main.app > .card');
    const visible=el=>el.getClientRects().length && getComputedStyle(el).visibility!=='hidden';
    return {
      active:active.dataset.active,
      heading:active.querySelector('h1')?.textContent,
      pageWidth:document.documentElement.scrollWidth,viewport:innerWidth,
      overflow:[...active.querySelectorAll('button,input')].filter(visible).filter(el=>{
        const r=el.getBoundingClientRect();return r.left < -1 || r.right > innerWidth+1;
      }).map(el=>el.id),
      font:getComputedStyle(active).fontFamily,
      cardBackground:getComputedStyle(card).backgroundColor,
      radius:getComputedStyle(card).borderTopLeftRadius,
      cardLeft:card.getBoundingClientRect().left,cardRight:card.getBoundingClientRect().right,
      forbidden:[...active.querySelectorAll('[title],[data-tooltip],[data-ui-tooltip="on"]')].map(el=>el.id),
      brand:active.querySelector(".auth-brand")?.textContent,
      iconLoaded:active.querySelector(".auth-brand img")?.naturalWidth > 0,
      text:active.innerText
    };
  },name);
  assert.equal(actual.active,'true');assert(actual.heading);
  assert(actual.pageWidth<=actual.viewport+1,JSON.stringify(actual));assert.deepEqual(actual.overflow,[]);
  assert.match(actual.font,/Segoe UI/i);assert.equal(actual.cardBackground,'rgb(255, 255, 255)');assert.equal(actual.radius,'0px');
  assert(Math.abs(actual.cardLeft-(actual.viewport-actual.cardRight))<=2,'auth card remains horizontally centered: '+JSON.stringify(actual));
  assert.deepEqual(actual.forbidden,[]);
  assert.equal(actual.brand,"GradeSort");
  assert.equal(actual.iconLoaded,true);
  assert.doesNotMatch(actual.text,/Microsoft|Forgot my password|Sign-in options/);
  await page.screenshot({path:path.join(captures,`${name}-${viewport.width}x${viewport.height}.png`),fullPage:true});
}
(async()=>{
  fs.mkdirSync(captures,{recursive:true});
  const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
  try {
    // Real responsive pages, including touch/mobile landscape and 320px phones.
    for(const viewport of [{width:1440,height:900},{width:768,height:900},{width:390,height:844},{width:320,height:640},{width:844,height:390}]) {
      const {context,page,errors}=await session(browser,viewport);
      try {
        await inspect(page,'home',viewport);
        assert.equal(await page.locator('#login-email').inputValue(),'');
        assert.equal(await page.locator('#login-code').isDisabled(),true);
        await page.click('#btn-go-create');await inspect(page,'create',viewport);
        await noTooltip(page,'#btn-back-from-create');
        await page.click('#btn-create-account');assert(await page.locator('#create-error').isVisible());
        if(viewport.width===1440) {
          await page.click('.auth-avatar-options summary');
          await page.setInputFiles('#create-pfp',{name:'avatar.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aUcAAAAAASUVORK5CYII=','base64')});
          await page.waitForFunction(()=>!document.getElementById('crop-controls').hidden);
          await page.locator('#zoom').fill('1.5');await page.click('#btn-center');await page.click('#btn-reset');
          await page.click('#btn-create-use-default');
          assert.equal(await page.evaluate(()=>ChatApp.pfpState.usingDefault),true);
        }
        await page.click('#btn-back-from-create');await view(page,'home');
        await enterEmail(page);await inspect(page,'login',viewport);
        await noTooltip(page,'#btn-back-from-login');
        await page.fill('#login-code','TEST-USER');
        if(await page.locator('#btn-toggle-eye').isVisible()) {
          await noTooltip(page,'#btn-toggle-eye');
          await page.fill('#login-code','TEST-USER');
          await page.click('#btn-toggle-eye');assert.equal(await page.locator('#login-code').getAttribute('type'),'text');
          // Leave revealed before Back; the next password screen must remask.
          assert.equal(await page.locator('#login-code').getAttribute('type'),'text');
        }
        await page.click('#btn-back-from-login');await view(page,'home');
        assert.equal(await page.locator('#login-code').isDisabled(),true);
        assert.equal(await page.locator('#login-code').inputValue(),'');
        await enterEmail(page);
        assert.equal(await page.locator('#login-code').getAttribute('type'),'password');
        assert.deepEqual(errors,[]);
      }finally{await context.close();}
      console.log(`PASS responsive sign-in/create/password ${viewport.width}x${viewport.height}`);
    }
    const {context,page,errors}=await session(browser);
    try {
      // No password entry or credential lookup is possible before the email step.
      const initialWrites=await page.evaluate(()=>__testDatabase.writes.length);
      for(const email of ['', 'unknown@example.com', emails[0]+'.invalid', 'vincenzo@students.pittstonarea.com']) {
        await page.fill('#login-email',email);await page.click('#btn-go-login');
        await view(page,'home');
        assert.equal(await page.locator('#login-code').isDisabled(),true);
      }
      assert.equal(await page.evaluate(()=>__testDatabase.writes.length),initialWrites);
      // Cancel the intermediate Next panel while it is visible. Its queued
      // transition must not unlock the password view after cancellation.
      await page.fill('#login-email',emails[0]);
      await page.click('#btn-go-login');
      await page.waitForFunction(()=>!document.getElementById('auth-next-working').hidden);
      await page.click('#btn-auth-cancel',{force:true});
      await view(page,'home');
      await page.waitForTimeout(1300);
      assert.equal(await page.locator('#view-home').getAttribute('data-active'),'true');
      assert.equal(await page.locator('#auth-next-working').isVisible(),false);
      assert.equal(await page.locator('#login-code').isDisabled(),true);
      assert.equal(await page.evaluate(()=>ChatApp.authEmail),'');
      // Keyboard submission follows the same gate and canonical password path.
      await page.fill('#login-email',emails[1]);await page.locator('#login-email').press('Enter');
      await view(page,'login');
      await page.fill('#login-code','TEST-USER');await page.locator('#login-code').press('Enter');
      await view(page,'chat');
      assert.equal(await page.evaluate(()=>ChatApp.currentUser.code),'TEST-USER');
      await logout(page);
      await page.fill('#login-email',emails[0]);
      await page.evaluate(()=>{for(let i=0;i<3;i++)document.getElementById('btn-go-login').click();});
      await view(page,'login');
      assert.equal(await page.locator('#auth-login-email').textContent(),emails[0]);
      await page.fill('#login-code','NOT-A-REAL-PASSWORD');await page.click('#btn-login');
      await page.waitForFunction(()=>!ChatApp.authBusy && document.getElementById('login-error').textContent==='Password not found');
      assert.equal(await page.evaluate(()=>ChatApp.currentUser),null);
      assert.equal(await page.locator('#toast').isVisible(),false);
      await page.screenshot({path:path.join(captures,'password-not-found.png')});
      await page.click('#btn-back-from-login');await view(page,'home');
      // All six access emails resolve the SAME account from the same password.
      for(const email of emails) {
        await login(page,email);
        assert.equal(await page.evaluate(()=>ChatApp.currentUser.code),'TEST-USER');
        assert.equal(await page.evaluate(()=>ChatApp.currentUser.username),'Tester');
        await page.evaluate(()=>ChatApp.showToast({title:'Main app notice',body:'Original toast remains available.',duration:1000}));
        assert.equal(await page.locator('#toast-title').textContent(),'Main app notice');
        assert.equal(await page.locator('#auth-notice').isVisible(),false);
        await logout(page);
        assert.equal(await page.locator('#login-email').inputValue(),'');
        assert.equal(await page.locator('#login-code').inputValue(),'');
        assert.equal(await page.locator('#login-code').isDisabled(),true);
      }
      const stored=await page.evaluate(()=>({db:JSON.stringify(__testDatabase.values),local:JSON.stringify({...localStorage}),session:JSON.stringify({...sessionStorage})}));
      for(const email of emails)for(const where of Object.values(stored))assert(!where.includes(email),'access emails are neither persisted nor linked to account records');
      // Slow requests disable duplicate sign-ins; a Back action either remains
      // disabled or cancels the pending result, never producing two sessions.
      await enterEmail(page);
      await page.evaluate(()=>{
        window.__realAuthLogin=ChatApp.loginWithCode;window.__authLoginCalls=0;
        ChatApp.loginWithCode=password=>{
          window.__authLoginCalls++;
          return new Promise(resolve=>{window.__finishAuthLogin=async()=>resolve(await __realAuthLogin(password));});
        };
      });
      await page.fill('#login-code','TEST-USER');
      await page.evaluate(()=>{for(let i=0;i<3;i++)document.getElementById('btn-login').click();});
      await page.waitForFunction(()=>typeof __finishAuthLogin==='function');
      assert.equal(await page.evaluate(()=>__authLoginCalls),1);
      assert.equal(await page.locator('#login-code').isDisabled(),true);
      await page.waitForTimeout(250);
      const loading=await page.evaluate(()=>{
        const step=document.querySelector('#view-login .auth-step');
        return {opacity:Number(getComputedStyle(step).opacity),transform:getComputedStyle(step).transform};
      });
      assert(loading.opacity<=.6,'pending sign-in dims the full form');
      assert.equal(loading.transform,'none','pending sign-in never retains incoming slide translation');
      await page.screenshot({path:path.join(captures,'signing-in-loading.png')});
      await page.evaluate(()=>document.getElementById('btn-back-from-login').click());
      const cancelled=await page.evaluate(()=>document.getElementById('view-home').dataset.active==='true');
      await page.evaluate(async()=>{await __finishAuthLogin();ChatApp.loginWithCode=__realAuthLogin;});
      if(cancelled) {
        await page.waitForTimeout(1200);
        assert.equal(await page.evaluate(()=>ChatApp.currentUser),null);
        await view(page,'home');
      }else{await view(page,'chat');await logout(page);}
      // Disabled creation communicates through the auth-only notice.
      await page.evaluate(()=>__testDatabase.ref('admin/accountCreationEnabled').set(false));
      await page.waitForFunction(()=>ChatApp.accountCreationEnabled===false);
      await page.click('#btn-go-create');
      await page.waitForFunction(()=>!document.getElementById('auth-notice').hidden);
      assert.equal(await page.locator('#toast').isVisible(),false);
      await page.click('#auth-notice-close');
      await page.evaluate(()=>__testDatabase.ref('admin/accountCreationEnabled').set(true));
      await page.waitForFunction(()=>ChatApp.accountCreationEnabled===true);
      await page.click('#btn-go-create');await view(page,'create');
      await page.fill('#create-username','Fresh Tester');
      await page.evaluate(()=>{for(let i=0;i<3;i++)document.getElementById('btn-create-account').click();});
      await page.waitForFunction(()=>!document.getElementById('auth-notice').hidden && !!document.getElementById('auth-notice-code').textContent);
      const password=await page.locator('#auth-notice-code').textContent();
      assert(password.length>=16);
      assert.equal(await page.locator('#toast').isVisible(),false);
      const created=await page.evaluate(()=>Object.entries(__testDatabase.values.users).filter(([,user])=>user.username==='Fresh Tester'));
      assert.equal(created.length,1,'rapid creation clicks create exactly one account');
      await page.click('#auth-notice-copy');
      assert.equal(await page.evaluate(()=>__authClipboard),password);
      await page.screenshot({path:path.join(captures,'account-created-notice.png')});
      await page.evaluate(() => {
        navigator.clipboard.writeText = async () => { throw Error('clipboard denied'); };
        document.execCommand = () => false;
      });
      await page.click('#auth-notice-copy');
      assert.match(await page.locator('#auth-notice-body').textContent(), /Select the password/);
      assert.equal(await page.locator('#auth-notice-copy').textContent(), 'Copy');
      assert.equal(await page.locator('body > textarea[readonly]').count(), 0);
      assert.equal(await page.locator('#auth-notice-copy').evaluate(button => button === document.activeElement), true);
      await page.click('#auth-notice-close');await view(page,'home');
      await login(page,emails[5],password);
      assert.equal(await page.evaluate(()=>ChatApp.currentUser.code),created[0][0]);
      // Keep the in-memory server's data across this browser reload; only the
      // client page/session is restarting.
      const serverSnapshot=await page.evaluate(()=>__testDatabase.values);
      await context.addInitScript(data=>__testDatabase.ref().set(data),serverSnapshot);
      // Existing persisted sessions continue to use the canonical app password.
      await page.reload();
      await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true' && ChatApp.currentUser?.username==='Fresh Tester');
      await view(page,'chat');
      assert.deepEqual(errors,[]);
      console.log('PASS gate, Next cancellation, keyboard submission, wrong password, six interchangeable emails, duplicate-submit/loading guards, account creation/copy, auth/main toast isolation, logout, and cached session');
    }finally{await context.close();}
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
