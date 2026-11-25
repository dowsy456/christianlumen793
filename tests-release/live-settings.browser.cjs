'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const {createSharedFirebaseBackend}=require('../tests/shared-firebase-backend.cjs');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true}),backend=createSharedFirebaseBackend(2),errors=[];
 try{
  const pages=[];
  for(let i=0;i<2;i++){
   const context=await browser.newContext({viewport:{width:1440,height:900}});await backend.bind(context);
   await context.route(/^https?:\/\//,r=>r.fulfill({status:200,body:'null',contentType:'application/json'}));
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
   await page.fill('#login-email', 'vincenzo.brogna@students.pittstonarea.com');
   await page.click('#btn-go-login');await page.fill('#login-code','P1');await page.click('#btn-login');
   await page.waitForFunction(()=>ChatApp.accountSettingsSync?.code==='P1');await page.evaluate(()=>ChatApp.closeToast());pages.push(page);
  }
  const [a,b]=pages;
  await b.click('#btn-side-settings');await b.getByRole('tab',{name:'Preferences',exact:true}).click();
  await a.evaluate(()=>{ChatApp.updateSettingsState({autoScroll:false,tab:{name:'Live title'},typingIndicatorMode:'member-list'});});
  await b.waitForFunction(()=>ChatApp.currentSettings.autoScroll===false&&document.title==='Live title'&&document.getElementById('settings-tab-name').value==='Live title');
  assert.equal(await b.locator('#settings-autoscroll').isChecked(),false);
  assert.equal(await b.locator('#btn-typing-indicator-members').getAttribute('aria-pressed'),'true');
  // A focused but unchanged field follows the other device without losing
  // focus, selection direction, or replaying its old value on blur.
  await b.locator('#settings-tab-name').focus();
  await b.locator('#settings-tab-name').evaluate(el=>el.setSelectionRange(2,6,'backward'));
  await a.evaluate(()=>ChatApp.updateSettingsState({tab:{name:'Synchronized title'}}));
  await b.waitForFunction(()=>document.getElementById('settings-tab-name').value==='Synchronized title');
  assert.deepEqual(await b.locator('#settings-tab-name').evaluate(el=>[document.activeElement===el,el.selectionStart,el.selectionEnd,el.selectionDirection]),[true,2,6,'backward']);
  await b.locator('#settings-tab-name').blur();
  assert.equal(await b.evaluate(()=>ChatApp.currentSettings.tab.name),'Synchronized title');
  // Icon text follows the same rule, including safe caret clamping when a
  // remote removal shortens it to an empty value.
  const icon='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="blue"/></svg>');
  await b.locator('#settings-tab-icon').focus();
  await a.evaluate(icon=>ChatApp.updateSettingsState({tab:{icon}}),icon);
  await b.waitForFunction(icon=>document.getElementById('settings-tab-icon').value===icon,icon);
  assert.equal(await b.locator('#settings-tab-icon').evaluate(el=>document.activeElement===el),true);
  await b.locator('#settings-tab-icon').evaluate(el=>el.setSelectionRange(4,14,'forward'));
  await a.evaluate(()=>ChatApp.updateSettingsState({tab:{icon:''}}));
  await b.waitForFunction(()=>document.getElementById('settings-tab-icon').value==='');
  assert.deepEqual(await b.locator('#settings-tab-icon').evaluate(el=>[document.activeElement===el,el.selectionStart,el.selectionEnd]),[true,0,0]);
  await b.locator('#settings-tab-icon').blur();
  assert.equal(await b.evaluate(()=>ChatApp.currentSettings.tab.icon),'');
  await b.fill('#settings-tab-name','My unfinished title');
  await a.evaluate(()=>ChatApp.updateSettingsState({tab:{name:'Another device'}}));
  await b.waitForFunction(()=>document.title==='Another device');
  assert.equal(await b.inputValue('#settings-tab-name'),'My unfinished title');
  assert.equal(await b.locator('#settings-tab-name').evaluate(el=>document.activeElement===el),true);
  await b.locator('#settings-tab-name').blur();await a.waitForFunction(()=>document.title==='My unfinished title');
  await b.evaluate(async()=>{ChatApp.closeModal();await ChatApp.logoutToLanding();});
  await b.fill('#login-email', 'vincenzo.brogna@students.pittstonarea.com');
  await b.click('#btn-go-login');await b.fill('#login-code','P2');await b.click('#btn-login');await b.waitForFunction(()=>ChatApp.accountSettingsSync?.code==='P2');
  await a.evaluate(()=>ChatApp.updateSettingsState({tab:{name:'P1 private title'}}));await a.waitForFunction(()=>document.title==='P1 private title');
  assert.notEqual(await b.title(),'P1 private title');assert.equal(await b.evaluate(()=>ChatApp.currentSettings.autoScroll),true);
  assert.deepEqual(errors,[]);console.log('PASS live account settings across two sessions, open controls, focused pristine fields/caret, unsaved drafts, local commit, and account isolation.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
