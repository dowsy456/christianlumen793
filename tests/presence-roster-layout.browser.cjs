/* Offline end-to-end regressions; never connects to the live database. */
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
const mock = require('./firebase-mock.js');

(async () => {
  const browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'chrome',headless:true});
  try {
    for (const width of [1440,390]) {
      const context = await browser.newContext({viewport:{width,height:960}});
      await context.addInitScript(mock);
      await context.addInitScript(() => {
        for (const method of ['getItem','setItem','removeItem','clear']) Storage.prototype[method] = () => { throw new DOMException('Storage disabled','SecurityError'); };
        const db=window.__testDatabase;
        const ref=db.ref;
        window.__membersSubscriptions=0;
        const decorate = database => {
          const original=database.ref;
          database.ref=function(p){const item=original(p);const on=item.on;item.on=function(event,cb){if(p==='memberships')window.__membersSubscriptions++;return on.call(this,event,cb);};return item;};
          return database;
        };
        const database=window.firebase.database;
        window.firebase.database=()=>decorate(database());
        window.firebase.database.ServerValue=database.ServerValue;
        for(const [code,name] of [['Z','Zoe'],['A','Alice'],['M','Mira']]) {
          db.values.users[code]={username:name,displayName:name};
          db.values.memberships[code]={test:true,other:true};
          db.values.roomMembers.test[code]=true;
        }
        db.values.rooms.other={name:'Other',createdBy:'TEST-USER'};
        db.values.memberships['TEST-USER'].other=true;
        db.values.roomMembers.other={A:true,Z:true,M:true,'TEST-USER':true};
        db.values.messages={test:{
          a:{userCode:'M',username:'Mira',text:'First line\nSecond line',createdAt:1},
          b:{userCode:'M',username:'Mira',text:'',files:[{kind:'file',name:'note.txt',dataURL:'data:text/plain;base64,aGk='}],createdAt:2},
          c:{userCode:'M',username:'Mira',text:'Reply line',replyTo:{key:'a',userCode:'M',username:'Mira',text:'First line'},createdAt:3}
        }};
        db.values.readReceipts={test:{old:{A:1},older:{M:1}}};
      });
      await context.route(/^https?:\/\//,route=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'null'}));
      const page=await context.newPage(), errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
      await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
      await page.fill('#login-email', 'vincenzo.brogna@students.pittstonarea.com');
      await page.click('#btn-go-login');
      await page.fill('#login-code','TEST-USER');
      await page.click('#btn-login');
      await page.waitForFunction(()=>ChatApp.currentUser?.code==='TEST-USER' && ChatApp.schedulesPeopleLoadedOnce);
      await page.evaluate(()=>{
        window.__rosterFrames=[];
        new MutationObserver(()=>{
          const codes=[...document.querySelectorAll('#online-list .member-row')].map(row=>row.dataset.usercode);
          if(codes.length)window.__rosterFrames.push(codes.join(','));
        }).observe(document.querySelector('#online-list'),{childList:true});
        // A blocked display-name service must not delay other members.
        ChatApp.ensureOwnedDisplayNameForUser=()=>new Promise(()=>{});
      });
      await page.evaluate(()=>ChatApp.openRoom('test',{quiet:true}));
      await page.waitForFunction(()=>document.querySelectorAll('#online-list .member-row').length===4 && ChatApp.msgElByKey.size===3);
      await page.waitForTimeout(120);
      assert.deepEqual(await page.evaluate(()=>[...new Set(__rosterFrames)]),['TEST-USER,A,M,Z'],'the first painted roster is complete and sorted');
      const before=await page.evaluate(()=>__membersSubscriptions);
      await page.evaluate(()=>ChatApp.openRoom('other',{quiet:true}));
      await page.evaluate(()=>ChatApp.openRoom('test',{quiet:true}));
      await page.waitForFunction(()=>ChatApp.msgElByKey.size===3);
      await page.waitForTimeout(120);
      assert.equal(await page.evaluate(()=>__membersSubscriptions),before,'room navigation reuses the memberships subscription');
      const geometry=await page.evaluate(()=>[...document.querySelectorAll('.msg-row')].map(row=>{
        const avatar=row.querySelector('.msg-avatar').getBoundingClientRect();
        const name=row.querySelector('.bubble-name').getBoundingClientRect();
        const bubble=row.querySelector('.bubble').getBoundingClientRect();
        const reply=row.querySelector('.reply-preview')?.getBoundingClientRect();
        return {key:row.dataset.msgkey,width:avatar.width,height:avatar.height,
          topOffset:Math.abs(avatar.top-bubble.top), separate:avatar.right<=bubble.left,
          replyPreserved:!reply||reply.bottom<=name.top};
      }));
      for(const row of geometry) {
        assert.equal(row.width,40,`${width}/${row.key}: avatar keeps its fixed width`);
        assert.equal(row.height,40,`${width}/${row.key}: avatar keeps its fixed height`);
        assert(row.topOffset<1 && row.separate,`${width}/${row.key}: avatar aligns with the bubble frame`);
        assert(row.replyPreserved,`${width}/${row.key}: reply stays above sender`);
      }
      if(process.env.QA_SCREENSHOTS) {
        require('node:fs').mkdirSync(process.env.QA_SCREENSHOTS,{recursive:true});
        await page.screenshot({path:path.join(process.env.QA_SCREENSHOTS,`avatar-roster-${width}.png`)});
        console.log(JSON.stringify({width,geometry}));
      }
      await page.waitForFunction(()=>window.__testDatabase.get('readReceipts/test/_latest/key')==='c');
      assert.equal(await page.evaluate(()=>__testDatabase.get('readReceipts/test/old')),null);
      assert.equal(await page.evaluate(()=>__testDatabase.get('readReceipts/test/older')),null);
      await page.evaluate(async()=>{
        const prior=ChatApp.readReceiptState;
        await ChatApp.db.ref('messages/test/d').set({userCode:'M',username:'Mira',text:'Latest',createdAt:4});
        await ChatApp.pruneReadReceipts('test',{_key:'d',createdAt:4});
        await ChatApp.saveLatestReadReceipt(prior,'A');
      });
      assert.equal(await page.evaluate(()=>__testDatabase.get('readReceipts/test/c')),null,'late reader cannot recreate older receipts');
      await page.evaluate(async()=>{
        await ChatApp.db.ref('messages/test/d').remove();
        await ChatApp.pruneReadReceipts('test',{_key:'c',createdAt:3});
      });
      assert.equal(await page.evaluate(()=>__testDatabase.get('readReceipts/test/_latest/key')),'c','deleting latest restores valid receipt ownership');
      assert.deepEqual(errors,[]);
      console.log(`${width}: storage-blocked complete roster, reused subscriptions, avatar/file/reply alignment, atomic receipt cleanup passed`);
      await context.close();
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
