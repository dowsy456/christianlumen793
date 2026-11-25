'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright'),mock=require('../tests/firebase-mock.js');
const report=path.resolve(__dirname,'../../revision5-selection-report');
async function pick(page,tool){await page.locator(`[data-image-tool="${tool}"]`).click();}
async function point(page,x,y){return page.locator('.image-editor-canvas').evaluate((c,{x,y})=>{const r=c.getBoundingClientRect();return{x:r.x+x*r.width/800,y:r.y+y*r.height/600};},{x,y});}
async function click(page,x,y){const p=await point(page,x,y);await page.mouse.click(p.x,p.y);}
async function draw(page,tool,a,b){await pick(page,tool);const start=await point(page,...a),end=await point(page,...b);await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:8});await page.mouse.up();}
async function color(page,field,value){await page.locator(`[data-image-color="${field}"]`).click();await page.locator('[data-color-hex]').fill(value);await page.locator('[data-color-hex]').press('Enter');await page.locator(`[data-image-color="${field}"]`).click();}
async function number(page,selector,value){await page.locator(selector).fill(String(value));await page.locator(selector).press('Tab');}
async function save(page){const before=await page.evaluate(()=>ChatApp.pendingFiles[0].fileObject.lastModified);await page.click('#btn-image-editor-save');await page.waitForFunction(before=>ChatApp.pendingFiles[0].fileObject.lastModified!==before,before);}
async function close(page){await page.click('#btn-modal-close');await page.waitForFunction(()=>ChatApp.modalEl.hidden);}
async function open(page){await page.evaluate(()=>ChatApp.openPendingImageEditor(ChatApp.pendingFiles[0]));await page.waitForFunction(()=>document.querySelector('#attachment-image-editor')?.dataset.ready==='1');}
async function savedOps(page){return page.evaluate(()=>ChatApp.pendingImageEditDocuments.get(ChatApp.pendingFiles[0].fileObject).operations);}
async function noChromeTooltips(page){
 for(const selector of ['[data-media-zoom="reset"]','#btn-image-editor-save','#btn-modal-close']){
  const button=page.locator(selector);assert.equal(await button.getAttribute('title'),null);assert.equal(await button.getAttribute('data-tooltip'),null);
  assert(await button.getAttribute('aria-label'),'controls retain accessible names');
  await button.hover();await page.waitForFunction(()=>!document.querySelector('#sidebar-tooltip.is-visible'));
 }
}
async function wheelSteps(page,selector){return page.locator(selector).evaluate(view=>{
 const labels=[],r=view.getBoundingClientRect(),step=delta=>{view.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:delta,clientX:r.x+r.width/2,clientY:r.y+r.height/2}));labels.push(document.querySelector('[data-media-zoom="percent"]').textContent);};
 for(let i=0;i<25;i++)step(-100);for(let i=0;i<25;i++)step(100);return labels;
});}
(async()=>{
 fs.mkdirSync(report,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:900}});await context.addInitScript(mock);
  await context.route(/^https?:\/\//,r=>r.fulfill({status:200,body:'null',contentType:'application/json'}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
  await page.fill('#login-email', 'vincenzo.brogna@students.pittstonarea.com');
  await page.click('#btn-go-login');await page.fill('#login-code','TEST-USER');await page.click('#btn-login');await page.waitForFunction(()=>ChatApp.currentUser?.code==='TEST-USER');
  await page.evaluate(async()=>{await ChatApp.openRoom('test',{quiet:true});ChatApp.closeToast();});
  const tooltipStyle=el=>{const s=getComputedStyle(el);return{font:s.font,background:s.backgroundColor,border:s.border,borderRadius:s.borderRadius};};
  await page.locator('#btn-upload').hover();await page.waitForSelector('#sidebar-tooltip.is-visible');const referenceTip=await page.locator('#sidebar-tooltip').evaluate(tooltipStyle);
  await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=800;c.height=600;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,800,600);const b=await new Promise(r=>c.toBlob(r));await ChatApp.addPendingFile(new File([b],'selection.png',{type:'image/png'}));ChatApp.openMediaModal('image',ChatApp.pendingFiles[0].previewURL);});
  await page.waitForFunction(()=>document.querySelector('.media-zoom-target')?.naturalWidth>0);
  const regularCloseAttributes=await page.locator('#btn-modal-close').evaluate(el=>({tooltip:el.getAttribute('data-tooltip'),title:el.getAttribute('title')}));
  const viewer=await wheelSteps(page,'.media-zoom-viewport');await close(page);await open(page);
  const editor=await wheelSteps(page,'.image-editor-viewport');assert.deepEqual(editor,viewer,'editor uses exactly the media viewer zoom sequence');
  assert.deepEqual(editor.slice(0,10),['150%','200%','250%','300%','350%','400%','450%','500%','600%','700%']);assert(editor.includes('2000%'));assert.equal(editor.at(-1),'100%');
  await page.locator('[data-image-tool="select"]').hover();await page.waitForFunction(()=>document.querySelector('#sidebar-tooltip.is-visible')?.textContent==='Select');
  assert.deepEqual(await page.locator('#sidebar-tooltip').evaluate(tooltipStyle),referenceTip,'toolbar uses the composer tooltip element and style');
  assert.equal(await page.locator('.image-editor-toolbar [title]').count(),0,'no browser title tooltips');
  await page.screenshot({path:path.join(report,'select-tooltip.png')});
  await noChromeTooltips(page);
  await pick(page,'text');assert.equal(await page.locator('[data-image-size]').inputValue(),'32');assert(!/\bpt\b/.test(await page.locator('.image-editor-options').innerText()));
  await click(page,120,200);await page.locator('.image-editor-text-entry').fill('READABLE');await page.locator('.image-editor-text-entry').press('Control+Enter');
  await draw(page,'arrow',[100,380],[400,420]);await draw(page,'pen',[100,500],[400,510]);
  assert(await page.locator('#btn-image-editor-save').isEnabled());await noChromeTooltips(page);await save(page);
  const initial=await savedOps(page);assert.equal(initial.length,3);assert.equal(initial[0].style.size,32);
  await pick(page,'select');await click(page,140,215);assert.equal(await page.locator('#attachment-image-editor').getAttribute('data-selected-object'),'text');
  const editButton=await page.locator('.image-editor-edit-text').evaluate(el=>{
   ChatApp.ensureMsgMenu();const icon=el.querySelector('svg'),reference=document.querySelector('#msg-menu [data-act="edit"] svg'),b=el.getBoundingClientRect(),i=icon.getBoundingClientRect();
   return{label:el.getAttribute('aria-label'),text:el.textContent.trim(),icon:icon.innerHTML,reference:reference.innerHTML,square:Math.abs(b.width-b.height)<1,centered:Math.abs(i.x+i.width/2-b.x-b.width/2)<1&&Math.abs(i.y+i.height/2-b.y-b.height/2)<1};
  });
  assert.equal(editButton.label,'Edit text');assert.equal(editButton.text,'');assert.equal(editButton.icon,editButton.reference,'edit text uses the message context-menu edit icon');assert(editButton.square&&editButton.centered,'edit text is a centered square icon button');
  await number(page,'[data-image-size]',64);await color(page,'color','#3366ff');await color(page,'strokeColor','#9933cc');await number(page,'[data-image-stroke-width]',2);
  await page.locator('.image-editor-edit-text').click();await page.locator('.image-editor-text-entry').fill('CHANGED');await page.locator('.image-editor-text-entry').press('Escape');
  await page.locator('.image-editor-edit-text').click();assert.equal(await page.locator('.image-editor-text-entry').inputValue(),'READABLE','Escape preserves original text');
  await page.locator('.image-editor-text-entry').fill('EDITED');await page.locator('.image-editor-text-entry').press('Control+Enter');
  await click(page,250,400);assert.equal(await page.locator('#attachment-image-editor').getAttribute('data-selected-object'),'arrow');
  await color(page,'color','#00aa00');await number(page,'[data-image-width]',7);await number(page,'[data-image-stroke-width]',3);
  await page.click('[data-image-action="undo"]');await page.click('[data-image-action="redo"]');await click(page,250,400);assert.equal(await page.locator('[data-image-stroke-width]').inputValue(),'3');
  await click(page,250,505);assert.equal(await page.locator('#attachment-image-editor').getAttribute('data-selected-object'),'pen');await color(page,'color','#ff00aa');await number(page,'[data-image-width]',8);
  await click(page,150,220);const start=await point(page,150,220),end=await point(page,210,250);await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:5});await page.mouse.up();
  await save(page);const edited=await savedOps(page);
  assert.equal(edited[0].text,'EDITED');assert.equal(edited[0].style.size,64);assert.equal(edited[0].style.color,'#3366ff');assert(Math.abs(edited[0].a.x-180)<2&&Math.abs(edited[0].a.y-230)<2,'drag moves selected text');
  assert.equal(edited[1].style.width,7);assert.equal(edited[1].style.color,'#00aa00');assert.equal(edited[2].style.width,8);
  const pixels=await page.evaluate(async()=>{const b=await createImageBitmap(ChatApp.pendingFiles[0].fileObject),c=document.createElement('canvas');c.width=b.width;c.height=b.height;const x=c.getContext('2d');x.drawImage(b,0,0);b.close();return{arrow:[...x.getImageData(250,400,1,1).data],pen:[...x.getImageData(250,505,1,1).data],oldText:[...x.getImageData(130,210,1,1).data]};});
  assert.deepEqual(pixels.arrow,[0,170,0,255]);assert.deepEqual(pixels.pen,[255,0,170,255]);assert.deepEqual(pixels.oldText,[255,255,255,255],'old object pixels are replaced, not painted over');
  await page.screenshot({path:path.join(report,'selected-objects.png')});await close(page);await open(page);await pick(page,'select');await click(page,250,400);
  assert.equal(await page.locator('[data-image-width]').inputValue(),'7','saved pending images reopen with editable objects');
  await color(page,'color','#ef3737');await close(page);await open(page);await pick(page,'select');await click(page,250,400);
  assert.equal(await page.locator('[data-image-color="color"] .image-editor-color-value').innerText(),'#00AA00','closing discards unsaved object settings');
  await click(page,750,550);assert.equal(await page.locator('#attachment-image-editor').getAttribute('data-selected-object'),'');
  assert(await page.locator('.image-editor-select-hint').isVisible());
  await close(page);assert.deepEqual(await page.locator('#btn-modal-close').evaluate(el=>({tooltip:el.getAttribute('data-tooltip'),title:el.getAttribute('title')})),regularCloseAttributes,'shared Close attributes restored after editor closes');assert.deepEqual(errors,[]);await context.close();
  console.log('PASS selection: text/content/color/size/outline, arrow/drawing colors and widths, movement, undo/redo, saved pixels, save/reopen/discard, exact zoom sequence, toolbar-only composer tooltips and matching icon-only Edit text.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
