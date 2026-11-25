const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const mock = require('../tests/firebase-mock.js');
const icon = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="green"/></svg>');
const fixtureUrl = pathToFileURL(path.resolve(__dirname, '../index.html')).href;
async function login(page) {
  await page.evaluate(() => { ChatApp.closeModal(); ChatApp.closeToast(); ChatApp.showView('home'); });
  await page.fill('#login-email', 'vincenzo.brogna@students.pittstonarea.com');
  await page.click('#btn-go-login');
  await page.fill('#login-code', 'TEST-USER');
  await page.click('#btn-login');
  await page.waitForFunction(() => ChatApp.currentUser?.code === 'TEST-USER' && document.getElementById('view-chat').dataset.active === 'true');
}
async function settings(page) {
  await page.evaluate(() => { ChatApp.closeToast(); ChatApp.$('btn-side-settings').click(); });
  await page.click('#settings-tab-preferences');
}
async function assertIdentity(page, title, href) {
  assert.deepEqual(await page.evaluate(() => ({title:document.title, icon:document.getElementById('dynamic-favicon')?.getAttribute('href')})), {title, icon:href});
}
async function deferImageValidation(page) {
  await page.evaluate(() => {
    window.originalIdentityImage = window.Image;
    window.pendingIdentityImages = [];
    window.Image = function () {
      const image = new window.originalIdentityImage();
      Object.defineProperty(image, 'src', {set(value) { window.pendingIdentityImages.push({value, resolve:() => image.onload?.()}); }});
      return image;
    };
  });
}
async function resolveImageValidation(page) {
  await page.evaluate(() => { for(const pending of window.pendingIdentityImages) pending.resolve(); window.Image=window.originalIdentityImage; });
}
(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  try {
    const context = await browser.newContext();
    await context.addInitScript(mock);
    await context.addInitScript(({icon}) => window.__testDatabase.ref('users/TEST-USER/settings').set({tab:{name:'My study workspace',icon}}), {icon});
    await context.route(/^https?:\/\//, r => r.fulfill({status:200,contentType:'application/json',body:'null'}));
    const page = await context.newPage(), errors=[];
    page.on('pageerror', e=>errors.push(e.message));
    await page.goto(fixtureUrl);
    await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
    const defaults = await page.evaluate(()=>({title:ChatApp.APP_TAB_TITLE_DEFAULT,icon:ChatApp.defaultBrowserFavicon}));
    assert.deepEqual(defaults,{title:'Sign in to GradeSort',icon:'./assets/gradesort.svg'});
    await assertIdentity(page,defaults.title,defaults.icon);
    await page.evaluate(({icon})=>__testDatabase.ref('users/TEST-USER/settings').set({tab:{name:'My study workspace',icon}}), {icon});
    await login(page);
    await assertIdentity(page,'My study workspace',icon);
    await page.evaluate(async()=>{await ChatApp.openRoom('test',{quiet:true});ChatApp.showView('chat');ChatApp.showLoggedInHome();});
    await assertIdentity(page,'My study workspace',icon);
    // Cache belongs to this account/tab even when another tab changes global settings.
    await page.evaluate(()=>{localStorage.setItem(ChatApp.LS.TAB_NAME,'Another account');localStorage.setItem(ChatApp.LS.TAB_ICON,'https://example.invalid/wrong.png');});
    const cached=await page.evaluate(()=>ChatApp.readCachedUserBootstrap('TEST-USER').settings.tab);
    assert.deepEqual(cached,{name:'My study workspace',icon});
    await page.reload();
    await page.waitForFunction(()=>ChatApp.currentUser?.code==='TEST-USER'&&document.documentElement.dataset.appReady==='true');
    await assertIdentity(page,'My study workspace',icon);
    await settings(page);
    // A slow validation cannot resurrect an icon after the input is cleared.
    await deferImageValidation(page);
    await page.fill('#settings-tab-icon','https://example.invalid/slow.png');
    await page.locator('#settings-tab-icon').blur();
    await page.waitForFunction(()=>pendingIdentityImages.length===1);
    await page.fill('#settings-tab-icon','');
    await page.locator('#settings-tab-icon').blur();
    await resolveImageValidation(page);
    await assertIdentity(page,'My study workspace',defaults.icon);
    assert.equal(await page.evaluate(()=>ChatApp.currentSettings.tab.icon),'');
    // A preset cancels older validators and commits the pair in one state update.
    await deferImageValidation(page);
    await page.fill('#settings-tab-icon','https://example.invalid/older.png');
    await page.locator('#settings-tab-icon').blur();
    await page.waitForFunction(()=>pendingIdentityImages.length===1);
    await page.click('#btn-tab-preset-clever');
    await resolveImageValidation(page);
    assert.equal(await page.title(),'Clever | Portal');
    assert.equal(await page.evaluate(()=>ChatApp.currentSettings.tab.icon), 'https://resources.finalsite.net/images/f_auto,q_auto/v1689877141/mooreschoolscom/emadd6nvplrnh1vsswjf/Clever-Logo.jpg');
    // Pending image callbacks also cannot mutate a logged-out or replacement session.
    await deferImageValidation(page);
    await page.fill('#settings-tab-icon','https://example.invalid/logout.png');
    await page.locator('#settings-tab-icon').blur();
    await page.waitForFunction(()=>pendingIdentityImages.length===1);
    await page.evaluate(()=>{window.identityLogout=ChatApp.logoutToLanding();});
    await assertIdentity(page,defaults.title,defaults.icon);
    await page.evaluate(()=>window.identityLogout);
    await resolveImageValidation(page);
    await assertIdentity(page,defaults.title,defaults.icon);
    assert.equal(await page.evaluate(()=>ChatApp.currentSettings.tab.icon),'');
    await page.evaluate(()=>{ChatApp.closeModal();__testDatabase.ref('users/TEST-USER/settings').set({tab:{name:'Return to study',icon:''}});});
    await login(page);
    await assertIdentity(page,'Return to study',defaults.icon);
    await page.evaluate(()=>ChatApp.updateSettingsState({tab:{name:'',icon:''}}));
    await assertIdentity(page,defaults.title,defaults.icon);
    // Desktop bridge check is a unit-level contract check, not a native-device claim.
    const nativeGuard=await page.evaluate(()=>{const before={title:document.title,icon:document.getElementById('dynamic-favicon').href};window.chatDesktopBuild={nativeVersion:'1.7.11'};const handled=ChatApp.syncBrowserTabIdentity({tab:{name:'Must not apply',icon:'data:,'}});delete window.chatDesktopBuild;return {handled,before,after:{title:document.title,icon:document.getElementById('dynamic-favicon').href}};});
    assert.equal(nativeGuard.handled,false);assert.deepEqual(nativeGuard.after,nativeGuard.before);
    assert.deepEqual(errors,[]);
    await context.close();
    console.log('PASS browser identity: login/navigation, account cache/reload, clear/preset races, immediate logout, relogin/defaults, native exclusion');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
