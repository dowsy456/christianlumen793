'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('playwright'),fixture=require('../tests/room-loading-fixture.cjs');
const build=JSON.parse(fs.readFileSync(path.join(__dirname,'../build-info.json'),'utf8'));
const report=path.resolve(process.argv[2]||path.join(__dirname,'../../update-log-report'));
(async()=>{
 fs.mkdirSync(report,{recursive:true});
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
 try{
  for(const automatic of [false,true]){
   const context=await browser.newContext({viewport:{width:automatic?390:1280,height:automatic?740:800},isMobile:automatic,hasTouch:automatic});
   await context.addInitScript(fixture,{count:10,latencyMs:5});
   await context.addInitScript(({build,automatic})=>{
    __roomLoadFixture.values.admin.updateLog={text:'# **New workspace**\n## *Make it yours*\n### Ready\n-# Small details\n**Bold** and *italic* <script>bad()</script>',webVersion:build.webVersion,assetRevision:build.assetRevision,nativeVersion:build.desktopVersion};
    if(automatic)localStorage.setItem('chatapp_code:chatappv6-e9da9','TEST-USER');
    else{localStorage.clear();sessionStorage.clear();}
   },{build,automatic});
   let github=0;
   await context.route(/^https?:\/\//,route=>{
    const url=route.request().url();let body=null;
    if(url.includes('api.github.com/users/')){github++;body=[{name:'christianlumen100',owner:{login:'dowsy456'},default_branch:'main'}];}
    else if(url.includes('/commits/')){github++;body={sha:'a'.repeat(40)};}
    else if(url.includes('raw.githubusercontent.com/')){github++;body=build;}
    else if(url.includes('/releases/latest')){github++;body={tag_name:'v'+build.desktopVersion,assets:[{name:'Chat-App.exe'},{name:'native-update.json'}]};}
    return route.fulfill({status:200,body:JSON.stringify(body),contentType:'application/json',headers:{'access-control-allow-origin':'*'}});
   });
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
   await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
   if(!automatic){await page.fill('#login-email', 'vincenzo.brogna@students.pittstonarea.com');await page.click('#btn-go-login');await page.fill('#login-code','TEST-USER');await page.click('#btn-login');}
   await page.waitForFunction(()=>ChatApp.updateLogSession?.readyAt);
   await page.waitForFunction(()=>document.getElementById('modal-title').textContent==='Update Log');
   const timing=await page.evaluate(()=>Date.now()-ChatApp.updateLogSession.readyAt);assert(timing>=490&&timing<10000,String(timing));
   await page.waitForTimeout(220);
   assert.equal(await page.locator('.update-log-content h1 strong').textContent(),'New workspace');
   assert.equal(await page.locator('.update-log-content h2 em').textContent(),'Make it yours');
   assert.equal(await page.locator('.update-log-content script').count(),0);
   assert.equal(await page.locator('.update-log-subtext').textContent(),'Small details');
   assert(await page.locator('.update-log-content').isVisible());
   const bounds=await page.locator('.modal-card').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=(automatic?390:1280)+1);
   await page.screenshot({path:path.join(report,automatic?'automatic-mobile.png':'manual-desktop.png')});
   const requestsBefore=github;
   await page.click('#btn-modal-close');await page.waitForFunction(()=>ChatApp.modalEl.hidden);
   await page.evaluate(()=>ChatApp.startUpdateLogSession());await page.waitForTimeout(650);
   assert.equal(await page.locator('#modal').isHidden(),true);assert.equal(github,requestsBefore,'seen release should not query GitHub');
   {
    await page.evaluate(()=>{ChatApp.currentUser.username='Vinny';ChatApp.bindAdminDatabase=()=>{};ChatApp.openAdminPanel();});
    await page.waitForFunction(()=>!document.getElementById('panel-update-log-text').disabled);
    assert.equal(await page.locator('#modal-body > :last-child').getAttribute('class'),'panel-update-log');
    const draft='# **Preview title**\n## *Second*\n### Third\n-# Small\n**Bold** and *italic* <script>bad()</script>';
    await page.fill('#panel-update-log-text',draft);
    await page.locator('.panel-update-log').scrollIntoViewIfNeeded();
    const before=await page.evaluate(()=>({scroll:document.getElementById('modal-body').scrollTop,record:JSON.stringify(__roomLoadFixture.values.admin.updateLog),receipt:JSON.stringify(__roomLoadFixture.values.users['TEST-USER'].updateLogSeen)}));
    await page.click('#panel-update-log-preview');
    assert.equal(await page.locator('#modal-title').textContent(),'Update Log');
    assert.equal(await page.locator('.update-log-content').innerHTML(),await page.evaluate(text=>ChatApp.renderUpdateLogText(text),draft));
    assert.equal(await page.locator('.update-log-content h1 strong').textContent(),'Preview title');
    assert.equal(await page.locator('.update-log-content h2 em').textContent(),'Second');
    assert.equal(await page.locator('.update-log-content h3').textContent(),'Third');
    assert.equal(await page.locator('.update-log-content .update-log-subtext').textContent(),'Small');
    assert.equal(await page.locator('.update-log-content p strong').textContent(),'Bold');
    assert.equal(await page.locator('.update-log-content p em').textContent(),'italic');
    assert.equal(await page.locator('.update-log-content script').count(),0);
    await page.screenshot({path:path.join(report,automatic?'preview-mobile.png':'preview-desktop.png')});
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#modal-title').textContent(),'Update Log','preview retains the normal explicit-close policy');
    await page.click('#btn-modal-close');
    assert.equal(await page.locator('#modal-title').textContent(),'Admin Panel');
    assert.equal(await page.inputValue('#panel-update-log-text'),draft);
    assert.equal(await page.evaluate(()=>document.getElementById('modal-body').scrollTop),before.scroll);
    assert.equal(await page.evaluate(()=>JSON.stringify(__roomLoadFixture.values.admin.updateLog)),before.record);
    assert.equal(await page.evaluate(()=>JSON.stringify(__roomLoadFixture.values.users['TEST-USER'].updateLogSeen)),before.receipt);
    await page.click('#panel-update-log-preview');await page.click('#btn-modal-close');
    assert.equal(await page.inputValue('#panel-update-log-text'),draft);
    await page.fill('#panel-update-log-text','');await page.click('#panel-update-log-preview');
    assert.equal((await page.locator('.update-log-content').innerText()).trim(),'');
    await page.click('#btn-modal-close');
    await page.fill('#panel-update-log-text','# **Fresh**');await page.locator('#panel-update-log-text').press('Shift+Enter');await page.locator('#panel-update-log-text').press('End');await page.locator('#panel-update-log-text').press('Enter');
    const entered = '# **Fresh**' + (automatic ? '\n\n' : '\n');
    assert.equal(await page.inputValue('#panel-update-log-text'), entered);
    assert.equal(await page.getAttribute('#panel-update-log-text', 'enterkeyhint'), 'enter');
    assert.equal(await page.evaluate(()=>JSON.stringify(__roomLoadFixture.values.admin.updateLog)),before.record,'Enter never publishes an edit');
    await page.locator('#panel-update-log-text').press('A');
    await page.click('#panel-update-log-save');await page.waitForFunction(()=>document.getElementById('panel-update-log-status').textContent.startsWith('Saved'));
    const saved=await page.evaluate(()=>__roomLoadFixture.values.admin.updateLog);
    assert.equal(saved.assetRevision,build.assetRevision);assert.equal(saved.webVersion,build.webVersion);assert.equal(saved.nativeVersion,build.desktopVersion);assert.equal(saved.text,entered+'A');
    await page.locator('.panel-update-log').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(report,'admin-editor.png')});
    await page.fill('#panel-update-log-text','');await page.click('#panel-update-log-save');await page.waitForFunction(()=>document.getElementById('panel-update-log-status').textContent==='Update log cleared');
    assert.equal(await page.evaluate(()=>__roomLoadFixture.values.admin.updateLog),undefined);
   }
   assert.deepEqual(errors,[]);await context.close();
  }
  console.log('PASS: manual/automatic login, 500ms delay, per-account receipt, markdown, responsive modal, bottom admin editor, desktop Shift+Enter and mobile Return, shared preview/restore, published version binding and clear.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
