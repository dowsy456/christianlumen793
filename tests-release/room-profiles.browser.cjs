'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
const mock = require('../tests/firebase-mock');

(async () => {
  const browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'chrome',headless:true});
  try {
    const ctx = await browser.newContext({viewport:{width:1450,height:900},reducedMotion:'reduce'});
    await ctx.addInitScript(mock);
    await ctx.route(/^https?:\/\//, r => r.fulfill({status:200,contentType:'application/json',body:'null'}));
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.setDefaultTimeout(9000);
    await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
    await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
    await page.evaluate(() => {
      const db = __testDatabase.values, canvas = document.createElement('canvas');
      const brush = canvas.getContext('2d'); brush.fillStyle = '#c45725'; brush.fillRect(0,0,32,32);
      window.avatarURL = canvas.toDataURL();
      db.users.A = {username:'Alice',displayName:'Alice',photoDataURL:avatarURL};
      db.users.B = {username:'Beth',displayName:'Beth',photoDataURL:avatarURL};
      db.roomMembers.test = {'TEST-USER':true,A:true,B:true};
      db.roomMembers.other = {'TEST-USER':true};
      db.rooms.other = {name:'Other',createdBy:'TEST-USER'};
      db.memberships['TEST-USER'].other=true;
      db.messages = {test:{a:{userCode:'A',username:'Alice',text:'From Alice',createdAt:1}}};
    });
    await page.fill('#login-email','vincenzo.brogna@students.pittstonarea.com');
    await page.click('#btn-go-login'); await page.fill('#login-code','TEST-USER'); await page.click('#btn-login');
    await page.waitForFunction(() => ChatApp.currentUser?.code === 'TEST-USER' && ChatApp.schedulesPeopleLoadedOnce);
    // From a cold directory, hold all remote account data except the membership
    // index and Alice's identity, crop, photo and ghost flags.
    await page.evaluate(() => {
      ChatApp.resetSchedulesPeopleDirectory(); ChatApp.stopLiveUserListeners();
      const original = ChatApp.db.ref.bind(ChatApp.db);
      window.blocked = path => path === 'users' || path.startsWith('users/B/') || path === 'users/A/bio';
      window.deferredProfiles = [];
      ChatApp.db.ref = function (path) {
        const ref = original(path);
        if (!blocked(path)) return ref;
        const on = ref.on.bind(ref);
        ref.on = (event, callback, ...rest) => on(event, snap => {
          if (blocked(path)) deferredProfiles.push(() => callback(snap)); else callback(snap);
        }, ...rest);
        return ref;
      };
      return ChatApp.openRoom('test',{quiet:true});
    });
    await page.waitForFunction(() => ChatApp.onlineTiles.has('A') && document.querySelector('.msg-avatar[data-usercode="A"] img')?.getAttribute('src') === avatarURL);
    assert.equal(await page.locator('.member-row[data-usercode="A"] img').getAttribute('src'),await page.evaluate(()=>avatarURL));
    assert.equal(await page.locator('.member-row[data-usercode="B"]').count(),0,'unverified users do not receive a placeholder');
    await page.evaluate(() => {window.blocked=()=>false;deferredProfiles.splice(0).forEach(release=>release());});
    await page.waitForFunction(() => ChatApp.onlineTiles.has('B') && ChatApp.schedulesPeopleLoadedOnce);
    await page.evaluate(() => ChatApp.openRoom('other',{quiet:true}));
    await page.waitForFunction(() => ChatApp.currentRoomId==='other' && ChatApp.onlineTiles.size===1);
    const warm = await page.evaluate(() => {
      window.blocked = path => path==='roomMembers/test' || path.startsWith('users/A/');
      void ChatApp.openRoom('test',{quiet:true});
      return {codes:[...ChatApp.onlineTiles.keys()].sort(),photo:ChatApp.onlineTiles.get('A')?.ava.querySelector('img')?.getAttribute('src')===avatarURL};
    });
    assert.deepEqual(warm,{codes:['A','B','TEST-USER'],photo:true},'cached roster and photos mount in the room-open call');
    await page.evaluate(() => ChatApp.openRoom('other',{quiet:true}));
    await page.evaluate(() => {window.blocked=()=>false;deferredProfiles.splice(0).forEach(release=>release());});
    assert.equal(await page.locator('.member-row[data-usercode="A"]').count(),0,'late prior-room snapshot stays in its own room');
    await page.evaluate(() => ChatApp.openRoom('test',{quiet:true}));
    const row=page.locator('.member-row[data-usercode="A"]');
    await row.waitFor();
    const detail=row.locator('.member-activity-primary'), tooltip=page.locator('#member-activities-tooltip');
    // Keep Alice's schedule and music information consistent across directory,
    // clock and pointer events; a periodic refresh must see the same inputs.
    await page.evaluate(() => {
      const original = {
        getUserActivityItems: ChatApp.getUserActivityItems,
        getClassNameAtTimestamp: ChatApp.getClassNameAtTimestamp,
        getMemberClassmates: ChatApp.getMemberClassmates
      };
      window.restoreClassFixture = () => Object.assign(ChatApp, original);
      ChatApp.getClassNameAtTimestamp = (time, options) => options?.username === 'Alice' && window.classFixture
        ? classFixture.name : original.getClassNameAtTimestamp(time, options);
      ChatApp.getMemberClassmates = (code, time) => code === 'A' && window.classFixture
        ? (classFixture.peers ? [ChatApp.getRosterProfile('B')] : []) : original.getMemberClassmates(code, time);
      ChatApp.getUserActivityItems = (user, ...args) => user?.code === 'A' && window.classFixture
        ? (classFixture.overflow ? [{kind:'music',activity:{title:'Track',artist:'Artist'}}] : [])
        : original.getUserActivityItems(user, ...args);
    });
    async function configureClass(name, peers, overflow=false) {
      await page.mouse.move(1,1);
      await page.evaluate(fixture=>{
        ChatApp.hideMemberActivityFloating({immediate:true});
        window.classFixture = fixture;
        ChatApp.renderOnlineIndicator();
      },{name,peers,overflow});
    }
    async function hoverAndRefresh(target) {
      await target.hover();
      await page.evaluate(() => ChatApp.refreshOnlineIndicatorStatusTexts());
    }
    await configureClass('Art',false);
    await hoverAndRefresh(detail.locator('.schedule-activity-icon'));
    assert.equal(await tooltip.isVisible(),false,'short solo class has no icon tooltip');
    await hoverAndRefresh(detail.locator('.member-activity-text'));
    assert.equal(await tooltip.isVisible(),false,'short solo class has no text tooltip');
    await configureClass('Art',true);
    await hoverAndRefresh(detail.locator('.member-class-group-icon'));
    await tooltip.waitFor();
    assert.match(await tooltip.innerText(),/Beth/); assert.doesNotMatch(await tooltip.innerText(),/Art/);
    const longName='Introduction to Comparative Literature and Composition';
    await configureClass(longName,false);
    await hoverAndRefresh(detail.locator('.schedule-activity-icon')); await tooltip.waitFor();
    assert.equal((await tooltip.innerText()).trim(), longName);
    await configureClass(longName,true);
    await hoverAndRefresh(detail.locator('.member-activity-text')); await tooltip.waitFor();
    assert.match(await tooltip.innerText(),/Introduction to Comparative Literature and Composition/);
    assert.match(await tooltip.innerText(),/Beth/);
    await configureClass('Art',true,true);
    await hoverAndRefresh(row.locator('.member-activity-more')); await tooltip.waitFor();
    assert.match(await tooltip.innerText(),/Art/);assert.match(await tooltip.innerText(),/Beth/);

    await configureClass('Art',false,true);
    await hoverAndRefresh(row.locator('.member-activity-more')); await tooltip.waitFor();
    assert.equal((await tooltip.innerText()).trim(), 'Art');
    await page.evaluate(() => { window.restoreClassFixture(); ChatApp.refreshOnlineIndicatorStatusTexts(); });

    // Play actual PCM through the normal playlist transport; retain a pending
    // display-name draft while the visible preview advances to the next song.
    await page.evaluate(async () => {
      const pcm = new ArrayBuffer(44+16000*4), view=new DataView(pcm);
      const str=(p,s)=>[...s].forEach((c,i)=>view.setUint8(p+i,c.charCodeAt(0)));
      str(0,'RIFF');view.setUint32(4,pcm.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');
      view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);
      view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,pcm.byteLength-44,true);
      const url=URL.createObjectURL(new Blob([pcm],{type:'audio/wav'}));ChatApp.musicGetAudioURL=async()=>url;
      await __testDatabase.ref('music/playlists/fixture').set({name:'Preview',ownerCode:'TEST-USER',tracks:{
        one:{title:'First song',order:1,blobId:'track1',duration:4},two:{title:'Next song',order:2,blobId:'track2',duration:4}
      }});
      await ChatApp.musicPlay('fixture','one'); ChatApp.$('btn-side-settings').click();
    });
    const preview = page.locator('#settings-profile-preview .user-profile-music-copy strong');
    await page.waitForFunction(()=>document.querySelector('#settings-profile-preview .user-profile-music-copy strong')?.textContent==='First song');
    await page.fill('#settings-display-name','My draft');
    await page.evaluate(()=>ChatApp.musicControl('seek',3.88));
    await page.waitForFunction(()=>document.querySelector('#settings-profile-preview .user-profile-music-copy strong')?.textContent==='Next song');
    assert.equal(await preview.count(),1);
    assert.equal(await page.locator('#settings-display-name').inputValue(),'My draft');
    await page.evaluate(()=>ChatApp.musicStop());
    await page.waitForFunction(()=>!document.querySelector('#settings-profile-preview .user-profile-music:not([hidden])'));
    assert.deepEqual(errors,[]);
    console.log('PASS cold/warm profiles and membership, stale room rejection, real icon/text/overflow targets and automatic preview track transition.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
