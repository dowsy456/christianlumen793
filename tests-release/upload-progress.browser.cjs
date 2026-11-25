"use strict";
// Recipient gets only Firebase snapshots, never the sender Blob or callback.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),{pathToFileURL}=require("node:url");
const {chromium}=require("playwright"),fixture=require("../tests/firebase-mock.js");
const report=path.resolve(process.argv[2]||path.join(__dirname,"../../upload-report"));
(async()=>{
 fs.mkdirSync(report,{recursive:true});
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||"chrome",headless:true});
 try {
  const errors=[],pages=[];
  for(let i=0;i<3;i++){
   const context=await browser.newContext(i===2?{
    viewport:{width:390,height:844},isMobile:true,hasTouch:true,
    userAgent:"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"
   }:{viewport:{width:1240,height:850}});
   await context.addInitScript(fixture);
   await context.route(/^https?:\/\//,route=>route.fulfill({status:200,contentType:"application/json",body:"null"}));
   const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));pages.push(page);
   await page.goto(pathToFileURL(path.resolve(__dirname,"../index.html")).href);
   await page.waitForFunction(()=>document.documentElement.dataset.appReady==="true");
   await page.fill("#login-email", "vincenzo.brogna@students.pittstonarea.com");
   await page.click("#btn-go-login");await page.fill("#login-code","TEST-USER");await page.click("#btn-login");
   await page.waitForFunction(()=>ChatApp.currentUser?.code==="TEST-USER");
   await page.evaluate(async()=>{await ChatApp.openRoom("test",{quiet:true});ChatApp.closeToast();ChatApp.closeMobileDrawers();});
  }
  const [sender,receiver,mobile]=pages;
  for(const recipient of [receiver,mobile]) await recipient.evaluate(()=>{ChatApp.currentUser={...ChatApp.currentUser,code:"RECEIVER",username:"Recipient"};});
  await sender.exposeFunction("relayMessages",value=>Promise.all([receiver,mobile].map(recipient=>recipient.evaluate(value=>__testDatabase.ref("messages/test").set(value),value))));
  await sender.evaluate(async()=>{
   ChatApp.db.ref("messages/test").on("value",snapshot=>{void relayMessages(snapshot.val());});
   ChatApp.assertExternalStorageConfigured=()=>{};
   ChatApp.uploadExternalBlob=async(blob,options)=>{
    window.__uploadOptions=options;await new Promise(resolve=>{window.__finishUpload=resolve;});
    return {provider:"b2-worker-v1",objectKey:options.path,size:blob.size,mimeType:blob.type};
   };
   const c=document.createElement("canvas");c.width=640;c.height=360;const ctx=c.getContext("2d");
   ctx.fillStyle="#5485ad";ctx.fillRect(0,0,640,360);ctx.fillStyle="#a8be71";ctx.fillRect(60,120,430,220);
   const blob=await new Promise(resolve=>c.toBlob(resolve,"image/png"));
   await ChatApp.addPendingFile(new File([blob],"landscape.png",{type:"image/png"}));await ChatApp.sendTextMessage();
  });
  await sender.waitForFunction(()=>!!window.__uploadOptions);
  await receiver.waitForFunction(()=>!!document.querySelector(".upload-preview"));
  assert.equal(await receiver.locator(".upload-name").textContent(),"landscape.png");
  assert.equal(await receiver.locator(".upload-preview").evaluate(image=>getComputedStyle(image).filter),"blur(10px)");
  assert.equal(await receiver.locator(".upload-card video,.upload-card iframe,.att-loading").count(),0);
  await receiver.evaluate(()=>{window.__firstUploadRow=document.querySelector(".att-upload").closest(".msg-row");window.__firstUploadPreview=document.querySelector(".upload-preview");});
  for(const ratio of [.23,.62,.987]){
   await sender.evaluate(ratio=>__uploadOptions.onProgress(ratio),ratio);
   for(const recipient of [receiver,mobile]) await recipient.waitForFunction(value=>document.querySelector(".upload-percent")?.textContent===value,`${(ratio*100).toFixed(2)}%`);
  }
  assert.equal(await receiver.evaluate(()=>__firstUploadRow===document.querySelector(".att-upload").closest(".msg-row")&&__firstUploadPreview===document.querySelector(".upload-preview")),true,"same row and decoded still survive updates");
  assert.equal(await receiver.evaluate(()=>ChatApp.msgDataByKey.values().next().value.files[0].previewURL||""),"","recipient has no sender blob URL");
  await receiver.screenshot({path:path.join(report,"recipient-live-progress.png")});
  const mobileLayout=await mobile.evaluate(()=>{
   const card=document.querySelector(".att-upload").getBoundingClientRect();
   return{mobile:document.body.dataset.mobileUi,overflow:document.documentElement.scrollWidth>innerWidth,left:card.left,right:card.right,width:innerWidth};
  });
  assert.equal(mobileLayout.mobile,"1");assert.equal(mobileLayout.overflow,false);
  assert(mobileLayout.left>=0&&mobileLayout.right<=mobileLayout.width,"upload card fits the actual mobile viewport");
  await mobile.screenshot({path:path.join(report,"recipient-mobile-progress.png")});
  await sender.evaluate(()=>__finishUpload());
  for(const recipient of [receiver,mobile]) await recipient.waitForFunction(()=>!document.querySelector(".att-upload")&&[...ChatApp.msgDataByKey.values()].some(msg=>msg.files?.[0]?.provider==="b2-worker-v1"));
  const thumbnails=await sender.evaluate(async()=>{
   window.__htmlPreviewRan=false;
   const html='<h1>Homework</h1><p>Chapter two due Friday</p><script>window.__htmlPreviewRan=true</script><img src="https://thumbnail.invalid/tracker.png">';
   const blob=new Blob([html],{type:"text/html"});
   const a=await ChatApp.createUploadPreview(blob,{name:"homework.html",kind:"html"}),b=await ChatApp.createUploadPreview(blob,{name:"homework.html",kind:"html"});
   const generic=await ChatApp.createUploadPreview(new Blob([new Uint8Array(12)]),{name:"archive.zip",kind:"file"});
   return {safe:ChatApp.isSafeUploadPreview(a),cached:a===b,length:a.length,ran:__htmlPreviewRan,generic};
  });
  assert.equal(thumbnails.safe,true);assert.equal(thumbnails.cached,true);assert(thumbnails.length<=4096);assert.equal(thumbnails.ran,false);assert.equal(thumbnails.generic,"");
  const iconPath=path.join(report,"provided-exe-icon.ico");
  if(fs.existsSync(iconPath)){
   const decoded=await sender.evaluate(async base64=>{
    const blob=await(await fetch("data:image/x-icon;base64,"+base64)).blob();
    return ChatApp.isSafeUploadPreview(await ChatApp.createUploadPreview(blob,{name:"icon.ico",kind:"image"}));
   },fs.readFileSync(iconPath).toString("base64"));
   assert.equal(decoded,true,"supplied EXE icon decodes into a compact thumbnail");
  }
  assert.deepEqual(errors,[]);
  console.log("PASS: separate sender/recipient progress23/62/98.70%, stable DOM/still, completion, fresh touch/mobile viewport and card bounds, inert HTML, EXE icon decode.");
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});


