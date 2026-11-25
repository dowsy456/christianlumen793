'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('playwright'),fixture=require('../tests/room-loading-fixture.cjs');
const report=path.resolve(process.argv[2]||path.join(__dirname,'../../text-inputs-report'));
const typing='input:not([type=hidden],[type=button],[type=submit],[type=reset],[type=image],[type=checkbox],[type=radio],[type=range],[type=color],[type=file]),textarea,[contenteditable]:not([contenteditable=false])';
async function inspect(page,label){
 const results=await page.evaluate(selector=>[...document.querySelectorAll(selector)].map(input=>{
  const shell=input.matches('.composer-input')?input.closest('.composer-row'):input.matches('.app-search-input')?input.closest('.app-search-field'):input.closest('.update-log-composer,.image-editor-size-field')||input;
  const style=getComputedStyle(input),surface=getComputedStyle(shell);
  return {name:input.id||input.getAttribute('aria-label')||input.className||input.outerHTML.slice(0,90),auth:!!input.closest('.auth-view'),font:style.fontFamily,bottom:surface.borderBottomWidth,canvas:input.matches('.image-editor-text-entry'),resize:style.resize,drag:style.webkitUserDrag,region:style.webkitAppRegion,selection:style.userSelect,radius:surface.borderRadius,background:surface.backgroundImage,border:surface.borderTopWidth};
 }),typing);
 assert(results.length,label);
 for(const field of results){
  assert.equal(field.resize,'none',label+' '+JSON.stringify(field));assert.equal(field.drag,'none',label+' '+field.name);assert.equal(field.region,'no-drag',label+' '+field.name);assert.equal(field.selection,'text',label+' '+field.name);
  if(field.auth){
   assert.equal(field.radius,'0px',label+' auth inputs stay square');assert.equal(field.background,'none',label+' auth inputs retain a plain surface');
   assert.equal(field.border,'0px',label+' auth inputs have no top border');assert.equal(field.bottom,'1px',label+' auth inputs retain the underline');assert.match(field.font,/Segoe UI/);continue;
  }
  if(field.canvas)continue;
  assert.equal(field.radius,'17px',label+' '+JSON.stringify(field));assert(field.background.startsWith('linear-gradient('),label+' '+JSON.stringify(field));assert.equal(field.border,'1px',label+' '+JSON.stringify(field));
 }
 return results;
}
async function close(page){await page.evaluate(()=>ChatApp.closeModal());await page.waitForFunction(()=>ChatApp.modalEl.hidden);}
(async()=>{
 fs.mkdirSync(report,{recursive:true});const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:940}});await context.addInitScript(fixture,{count:20,latencyMs:5});
  await context.route(/^https?:\/\//,route=>route.fulfill({status:200,contentType:'application/json',body:'null',headers:{'access-control-allow-origin':'*'}}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
  await page.fill('#login-email', 'vincenzo.brogna@students.pittstonarea.com');
  await page.click('#btn-go-login');await inspect(page,'login');await page.fill('#login-code','TEST-USER');await page.click('#btn-login');
  await page.waitForFunction(()=>ChatApp.currentUser?.code==='TEST-USER'&&ChatApp.membershipMap.has('test'));
  await page.evaluate(async()=>{ChatApp.closeToast();await ChatApp.openRoom('test',{quiet:true});});
  await page.waitForFunction(()=>!ChatApp.roomLoadingActive&&!ChatApp.msgInitialTailPending);
  await inspect(page,'composer and room search');
  await page.fill('#msg-input','alpha beta');await page.locator('#msg-input').press('Home');await page.keyboard.down('Shift');for(let i=0;i<5;i++)await page.keyboard.press('ArrowRight');await page.keyboard.up('Shift');
  assert.equal(await page.locator('#msg-input').evaluate(e=>e.value.slice(e.selectionStart,e.selectionEnd)),'alpha');
  await page.fill('#room-search-input','history 19');assert.equal(await page.inputValue('#room-search-input'),'history 19');await page.fill('#room-search-input','');await page.fill('#msg-input','');

  await page.evaluate(()=>{ChatApp.currentUser.username='Vinny';ChatApp.bindAdminDatabase=()=>{};ChatApp.openAdminPanel();});
  await page.waitForFunction(()=>!document.getElementById('panel-update-log-text').disabled);await inspect(page,'admin');
  await page.fill('#panel-update-log-text','A fixed textarea');const box=await page.locator('#panel-update-log-text').boundingBox();
  await page.mouse.move(box.x+box.width-2,box.y+box.height-2);await page.mouse.down();await page.mouse.move(box.x+box.width+90,box.y+box.height+65,{steps:6});await page.mouse.up();
  const after=await page.locator('#panel-update-log-text').boundingBox();assert(Math.abs(after.width-box.width)<1&&Math.abs(after.height-box.height)<1,'textarea must not manually resize');
  await page.locator('.panel-update-log').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(report,'admin-fields.png')});await close(page);

  await page.click('#btn-side-settings');await page.waitForSelector('#settings-bio');await inspect(page,'settings');
  await page.fill('#settings-bio','Selection and typing still work');assert.equal(await page.inputValue('#settings-bio'),'Selection and typing still work');await close(page);
  await page.evaluate(()=>ChatApp.openScheduleEditor('Vinny'));await page.waitForSelector('[data-sched-edit-field=className]');await inspect(page,'schedule editor');
  await page.locator('[data-sched-edit-field=className]').first().fill('New class');assert.equal(await page.locator('[data-sched-edit-field=className]').first().inputValue(),'New class');await close(page);
  await page.evaluate(()=>ChatApp.openNotepadModal());await page.waitForSelector('#notepad-editor');await inspect(page,'notepad');
  await page.fill('#notepad-editor','const selected = true;');assert.equal(await page.inputValue('#notepad-editor'),'const selected = true;');
  assert((await page.locator('#notepad-editor').evaluate(e=>getComputedStyle(e).fontFamily)).includes('monospace'));await close(page);

  await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=800;c.height=600;c.getContext('2d').fillRect(0,0,800,600);const blob=await new Promise(r=>c.toBlob(r));await ChatApp.addPendingFile(new File([blob],'Input fixture.png',{type:'image/png'}));await ChatApp.openPendingImageEditor(ChatApp.pendingFiles[0]);});
  await page.waitForFunction(()=>document.getElementById('attachment-image-editor')?.dataset.ready==='1');
  await page.locator('[data-image-tool=text]').click();await page.waitForFunction(()=>document.querySelector('.image-editor-options')?.classList.contains('is-visible'));
  await inspect(page,'screenshot toolbar');await page.locator('[data-image-size]').fill('40');await page.locator('[data-image-size]').press('Enter');
  await page.locator('[data-image-color=color]').click();await page.waitForSelector('[data-color-hex]',{state:'visible'});await inspect(page,'screenshot hex');
  await page.locator('[data-color-hex]').fill('#ffffff');await page.locator('[data-color-hex]').press('Enter');await page.locator('[data-image-color=color]').click();
  const canvas=await page.locator('.image-editor-canvas').boundingBox();await page.mouse.click(canvas.x+canvas.width*.25,canvas.y+canvas.height*.3);
  await page.waitForSelector('.image-editor-text-entry');await page.fill('.image-editor-text-entry','Annotation text');await inspect(page,'annotation typing');
  const annotation=await page.locator('.image-editor-text-entry').evaluate(e=>({font:getComputedStyle(e).fontSize,size:e.style.getPropertyValue('font-size'),bg:getComputedStyle(e).backgroundImage}));
  assert.equal(annotation.font,annotation.size);assert.equal(annotation.bg,'none','annotation text remains a WYSIWYG image overlay');
  await page.locator('.image-editor-text-entry').press('Control+Enter');await page.locator('#btn-image-editor-save').click();await page.waitForFunction(()=>document.querySelector('.image-editor-status')?.textContent.startsWith('Saved'));
  await page.screenshot({path:path.join(report,'screenshot-fields.png')});await close(page);

  await page.evaluate(()=>{const host=document.createElement('div');host.id='future-typing-fixture';host.style.cssText='position:fixed;inset:70px auto auto 360px;z-index:200000;display:grid;gap:8px;width:340px;padding:16px;background:#10151b';host.innerHTML='<textarea id="future-textarea" style="resize:both" draggable="true" aria-label="Future textarea"></textarea><div id="future-contenteditable" contenteditable="plaintext-only" role="textbox" aria-label="Future editor"></div><input id="future-range" type="range"><input id="future-checkbox" type="checkbox"><input id="future-color" type="color"><iframe id="future-embedded-page" srcdoc="<textarea style=&quot;resize:both&quot;>Own page styles</textarea>"></iframe>';document.body.append(host);});
  await inspect(page,'dynamic future controls');await page.fill('#future-textarea','Dynamic text');await page.locator('#future-contenteditable').fill('Editable content');
  assert.equal(await page.locator('#future-contenteditable').textContent(),'Editable content');
  const typingBackground=await page.locator('#future-textarea').evaluate(e=>getComputedStyle(e).backgroundImage);
  for(const id of ['future-range','future-checkbox','future-color'])assert.notEqual(await page.locator('#'+id).evaluate(e=>getComputedStyle(e).backgroundImage),typingBackground,id+' retains its own control styling');
  await page.frameLocator('#future-embedded-page').locator('textarea').waitFor();assert.equal(await page.frameLocator('#future-embedded-page').locator('textarea').evaluate(e=>getComputedStyle(e).resize),'both','third-party/code pages stay isolated');
  await page.locator('#future-checkbox').check();assert(await page.locator('#future-checkbox').isChecked());
  await page.evaluate(()=>document.getElementById('future-typing-fixture').remove());
  await page.setViewportSize({width:390,height:740});await inspect(page,'mobile');assert.equal(await page.locator('#msg-input').evaluate(e=>getComputedStyle(e).resize),'none');
  assert.deepEqual(errors,[]);await context.close();
  console.log('PASS: shared typing surfaces, nonresizable/non-draggable controls, selection/typing, admin/settings/schedules/notepad/search/composer, screenshot options and annotation save, dynamic editors, native controls and isolated embedded pages.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
