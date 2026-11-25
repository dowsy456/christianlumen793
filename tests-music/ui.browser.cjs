/* Offline end-to-end Music UI tests. No production Firebase reads or writes. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright'),mock=require('../tests/firebase-mock.js');
const root=path.resolve(__dirname,'..'),captures=path.resolve(__dirname,'../../music-ui-checks');
function wav() {const n=16000,buffer=Buffer.alloc(44+n*2);buffer.write('RIFF');buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(8000,24);buffer.writeUInt32LE(16000,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(n*2,40);return buffer;}
async function verifyLongDrag(page) {
  await page.setViewportSize({width:1200,height:760});
  await page.evaluate(async () => {
    const entries = Array.from({length:36}, (_, i) => ['r'+i, {title:'Song '+i,order:i,addedAt:i+1}]);
    await __testDatabase.ref('music/playlists/long').set({ownerCode:'TEST-USER',name:'Long Mix',tracks:Object.fromEntries(entries)});
    ChatApp.openMusic({kind:'playlist',id:'long'});
  });
  const source = page.locator('#music-tracks [data-music-key="r35"] .music-track-title-cell');
  await source.scrollIntoViewIfNeeded();
  const start = await source.boundingBox(), scroller = await page.locator('#music-content').boundingBox();
  const x = start.x + 50, y = start.y + start.height / 2;
  await page.mouse.move(x,y); await page.mouse.down();
  await page.mouse.move(x,scroller.y+3,{steps:6});
  await page.waitForFunction(() => document.querySelector('#music-content').scrollTop === 0 &&
    document.querySelector('#music-tracks [data-music-key="r0"]').classList.contains('music-drop-before'));
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('#music-tracks').firstElementChild.dataset.musicKey === 'r35');
  await page.waitForFunction(() => __testDatabase.get('music/playlists/long/tracks/r35/order') < 0);
  assert.equal(await page.evaluate(() => ChatApp.musicState?.playing === true),false,'releasing the drag does not start playback');
  console.log('drag: a single held mouse gesture scrolled from track 36 to track 1 and saved the move');
}
async function verifyAdmin(browser, origin) {
  const context = await browser.newContext({viewport:{width:1200,height:800}});
  try {
    await context.addInitScript(mock);
    await context.addInitScript(() => {
      __testDatabase.ref('users/TEST-USER').update({username:'Vinny', usernameLower:'vinny'});
      __testDatabase.ref('users/OWNER').set({code:'OWNER', username:'Owner', displayName:'Owner'});
    });
    await context.route(/^https?:\/\//, route => new URL(route.request().url()).origin === origin ? route.continue() : route.fulfill({status:200,contentType:'application/json',body:'null'}));
    const page = await context.newPage();
    await page.goto(origin);
    await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
    await page.fill('#login-email','vincenzo.brogna@students.pittstonarea.com'); await page.click('#btn-go-login');
    await page.fill('#login-code','TEST-USER'); await page.click('#btn-login');
    await page.waitForFunction(() => ChatApp.isVinny());
    await page.click('#btn-music');
    await page.locator('.music-user-card').getByText('Owner', {exact:true}).click();
    const card = title => page.getByRole('button',{name:title,exact:true});
    const delegatedFile = page.waitForEvent('filechooser'); await page.click('#music-upload');
    await (await delegatedFile).setFiles({name:'owner.wav',mimeType:'audio/wav',buffer:wav()});
    await page.fill('#music-track-title','Owner Audio'); await page.click('#music-editor-save');
    const delegatedRow = page.locator('#music-audios .music-track-row').filter({hasText:'Owner Audio'});
    await delegatedRow.getByRole('button',{name:'Track Menu'}).click();
    await page.getByRole('menuitem',{name:'Edit',exact:true}).click();
    await page.fill('#music-track-title','Owner Audio Revised'); await page.click('#music-editor-save');
    await page.waitForFunction(() => ChatApp.musicGetAudios('OWNER')[0]?.title === 'Owner Audio Revised');
    await page.evaluate(async () => {
      for (const [key, createdAt] of [['First',2],['Second',1]])
        await __testDatabase.ref('music/playlists/' + key).set({ownerCode:'OWNER', name:key, createdAt});
    });
    await page.waitForFunction(() => document.querySelectorAll('.music-playlist-card').length === 2);
    const cardNames = () => page.locator('.music-playlist-card .music-card-name').allTextContents();
    assert.deepEqual(await cardNames(), ['First','Second']);
    await card('Second').dragTo(card('First'));
    await page.waitForFunction(() => document.querySelector('.music-playlist-card .music-card-name')?.textContent === 'Second');
    await card('First').focus(); await page.keyboard.press('Alt+ArrowUp');
    await page.waitForFunction(() => document.querySelector('.music-playlist-card .music-card-name')?.textContent === 'First');
    await card('First').locator('.music-card-name').click({button:'right'});
    await page.getByRole('menuitem',{name:'Move Down'}).click();
    await page.waitForFunction(() => document.querySelector('.music-playlist-card .music-card-name')?.textContent === 'Second');
    await card('Create Playlist').click(); await page.fill('#music-playlist-name','Created for Owner'); await page.click('#music-editor-save');
    await card('Created for Owner').click();
    assert.equal(await page.evaluate(() => ChatApp.musicData.playlists.get(ChatApp.musicView.id).ownerCode), 'OWNER');
    await card('Edit Playlist').click(); await page.fill('#music-playlist-name','Renamed for Owner'); await page.click('#music-editor-save');
    await page.waitForFunction(() => document.querySelector('.music-playlist-heading h1')?.textContent === 'Renamed for Owner');
    const chooser = page.waitForEvent('filechooser'); await page.click('#music-upload');
    await (await chooser).setFiles({name:'admin.wav',mimeType:'audio/wav',buffer:wav()});
    await page.fill('#music-track-title','Uploaded by Vinny'); await page.click('#music-editor-save');
    await page.waitForSelector('.music-track-row');
    for (const width of [1200,390]) {
      await page.setViewportSize({width,height:800});
      const alignment = await page.locator('#music-screen button:is(.music-icon-button,.music-play-playlist):visible').evaluateAll(buttons => buttons.map(button => {
        const box=button.getBoundingClientRect(), svg=button.querySelector('svg').getBoundingClientRect();
        return {label:button.getAttribute('aria-label'),dx:svg.x+svg.width/2-box.x-box.width/2,dy:svg.y+svg.height/2-box.y-box.height/2};
      }));
      assert(alignment.length >= 6);
      for (const {label,dx,dy} of alignment) assert(Math.abs(dx)<=1 && Math.abs(dy)<=1, `${label} at ${width}: offsets ${dx},${dy}`);
    }
    await card('Track Menu').click(); await page.getByRole('menuitem',{name:'Edit',exact:true}).click();
    await page.fill('#music-track-title','Edited by Vinny'); await page.click('#music-editor-save');
    await page.waitForFunction(() => document.querySelector('.music-track-title')?.textContent === 'Edited by Vinny');
    await card('Track Menu').click(); await page.getByRole('menuitem',{name:'Delete',exact:true}).click(); await page.click('#music-delete-confirm');
    await page.waitForFunction(() => !document.querySelector('.music-track-row'));
    await card('Playlist Menu').click(); await page.getByRole('menuitem',{name:'Delete',exact:true}).click(); await page.click('#music-delete-confirm');
    await page.waitForFunction(() => ![...ChatApp.musicData.playlists.values()].some(item => item.name === 'Renamed for Owner'));
    await verifyLongDrag(page);
    console.log('admin: cross-profile creation, editing, upload, deletion, three playlist reorder methods and desktop/mobile icon alignment passed');
  } finally { await context.close(); }
}
(async()=>{
  fs.mkdirSync(captures,{recursive:true});
  const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
  try {
    for(const kind of ['http','file','mobile']){
      const mobile=kind==='mobile',context=await browser.newContext({viewport:{width:mobile?390:1440,height:mobile?844:950},isMobile:mobile,hasTouch:mobile});context.setDefaultTimeout(15000);
      await context.addInitScript(mock);
      await context.addInitScript(()=>{
        __testDatabase.ref('users/A').set({code:'A',username:'zulu',displayName:'Alice'});
        __testDatabase.ref('users/Z').set({code:'Z',username:'alpha',displayName:'Zoe'});
      });
      await context.route(/^https?:\/\//,route=>new URL(route.request().url()).origin===origin?route.continue():route.fulfill({status:200,contentType:'application/json',body:'null'}));
      const errors=[],page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
      await page.goto(kind==='file'?pathToFileURL(path.join(root,'index.html')).href:origin);await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
      await page.fill('#login-email','vincenzo.brogna@students.pittstonarea.com');await page.click('#btn-go-login');await page.fill('#login-code','TEST-USER');await page.click('#btn-login');await page.waitForFunction(()=>ChatApp.currentUser?.code==='TEST-USER');
      if(mobile)await page.evaluate(()=>ChatApp.setMobileDrawer('navigation'));
      assert.equal(await page.locator('#btn-music').getAttribute('data-tooltip'),'Music');
      const dock = await page.locator('.sidebar-account-actions').evaluate(group => {
        const buttons = [...group.children];
        const style = node => {
          const rect = node.getBoundingClientRect(), icon = node.querySelector('svg').getBoundingClientRect();
          const css = getComputedStyle(node);
          return [rect.width, rect.height, icon.width, icon.height, css.backgroundColor, css.borderColor, css.borderRadius, css.color];
        };
        return { ids: buttons.map(node => node.id), music: style(buttons[1]), settings: style(buttons[2]) };
      });
      assert.deepEqual(dock.ids, ['btn-side-panel', 'btn-music', 'btn-side-settings']);
      assert.deepEqual(dock.music, dock.settings, 'Music and Settings use the same dock styling');
      await page.click('#btn-music');await page.waitForFunction(()=>ChatApp.musicData.loaded);
      assert.deepEqual(await page.locator('.music-section-heading h2').allTextContents(),['Playlists','Audio','Users']);
      await page.waitForFunction(()=>document.querySelectorAll('.music-user-card').length===3);
      assert.deepEqual(await page.locator('.music-user-card .music-card-name').allTextContents(),['Alice','Tester','Zoe']);
      assert.equal(await page.locator('#music-playlists').innerText(),'No playlists yet.');
      await page.getByRole('button',{name:'Create Playlist',exact:true}).click();
      assert.equal(await page.evaluate(()=>{const r=document.querySelector('#music-playlist-name').getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.id;}),'music-playlist-name','playlist modal is above music screen');
      const iconMenu = async selector => {
        const frame = page.locator(selector).first();
        const source = await frame.locator('img').getAttribute('src');
        await frame.click({button:'right'});
        const menu = page.locator('#music-context-menu');
        assert.deepEqual(await menu.locator('.msg-menu-label').allTextContents(), ['Download','Copy Address']);
        await page.evaluate(() => { ChatApp.copyImageAddress = async value => { window.__copiedMusicIcon = value; }; });
        await menu.getByText('Copy Address').click();
        assert.equal(await page.evaluate(() => __copiedMusicIcon), source);
      };
      await page.fill('#music-playlist-name','My Mix');
      await page.locator('#music-icon-file').setInputFiles({name:'cover.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXuoAAAAASUVORK5CYII=','base64')});
      await page.waitForFunction(()=>document.querySelector('#music-icon-image')?.src.startsWith('data:image/png;base64,'));
      await page.locator('#music-icon-zoom').evaluate(input=>{input.value='1.5';input.dispatchEvent(new Event('input',{bubbles:true}));});
      await iconMenu('#music-icon-clip');
      const crop=await page.locator('#music-icon-clip').boundingBox();await page.mouse.move(crop.x+50,crop.y+50);await page.mouse.down();await page.mouse.move(crop.x+65,crop.y+60);await page.mouse.up();
      await page.click('#music-editor-save');await page.waitForFunction(()=>document.querySelector('#modal').hidden);
      const savedCrop=await page.evaluate(()=>[...ChatApp.musicData.playlists.values()][0].photoTransform);assert.equal(savedCrop.scale,1.5);assert(savedCrop.x>0&&savedCrop.y>0,'room-style crop stores both offsets relative to frame width');
      await iconMenu('.music-playlist-card .music-cover');
      assert.equal(await page.locator('.music-section-heading h2').first().evaluate(n=>getComputedStyle(n).userSelect), 'none');
      assert.equal(await page.locator('#music-audio-search').evaluate(n=>getComputedStyle(n).userSelect), 'text');
      await page.locator('.music-playlist-card').first().click();await page.waitForSelector('#music-upload');
      await iconMenu('.music-hero-cover');
      await page.locator('.music-owner-link').hover();
      assert.equal(await page.locator('.music-owner-link').evaluate(n=>getComputedStyle(n).textDecorationLine), 'none');
      assert.deepEqual(await page.locator('.music-owner-link').evaluate(n=>[getComputedStyle(n).backgroundColor, getComputedStyle(n).textShadow !== 'none']), ['rgba(0, 0, 0, 0)', true]);
      await page.getByRole('button',{name:'Edit Playlist',exact:true}).click();await page.click('#music-icon-default');await page.click('#music-editor-save');await page.waitForFunction(()=>document.querySelector('#modal').hidden);
      const chooser=page.waitForEvent('filechooser');await page.click('#music-upload');await(await chooser).setFiles({name:'example.wav',mimeType:'audio/wav',buffer:wav()});
      await page.fill('#music-track-title','First Song');await page.fill('#music-track-artist','Test Artist');await page.fill('#music-track-album','Test Album');await page.click('#music-editor-save');await page.waitForFunction(()=>document.querySelector('#modal').hidden);
      await page.waitForFunction(()=>document.querySelectorAll('.music-track-row').length===1); const fonts=await page.evaluate(()=>['body','.music-screen','.music-owner-link','.music-track-artist','#rooms-head'].map(s=>getComputedStyle(document.querySelector(s)).fontFamily));assert.equal(new Set(fonts).size,1,'Music uses the same font as the main app');
      assert.equal(await page.locator('.music-track-title').innerText(),'First Song');assert.equal(await page.locator('.music-track-artist').innerText(),'Test Artist');
      assert.equal(await page.locator('.music-track-row .music-duration-column').innerText(),'0:02');
      const ids=await page.evaluate(()=>{const p=ChatApp.musicView.id,t=ChatApp.musicGetTracks(p)[0];return{p,t:t.id};});
      await page.locator('.music-track-row').click({button:'right'});await page.locator('#music-context-menu').getByRole('menuitem',{name:'Edit',exact:true}).click();await page.fill('#music-track-title','Renamed Song');await page.click('#music-editor-save');await page.waitForFunction(()=>document.querySelector('#modal').hidden);await page.waitForFunction(()=>document.querySelector('.music-track-title')?.textContent==='Renamed Song');
      await page.evaluate(({p,t})=>{const first=__testDatabase.get(`music/playlists/${p}/tracks/${t}`);__testDatabase.ref(`music/playlists/${p}/tracks/second`).set({...first,title:'Second Song',order:1});},ids);
      await page.waitForFunction(()=>document.querySelectorAll('.music-track-row').length===2);await page.locator('.music-track-row').nth(1).focus();await page.keyboard.press('Alt+ArrowUp');await page.waitForFunction(()=>document.querySelector('.music-track-title')?.textContent==='Second Song');
      const stability=await page.evaluate(()=>{const row=document.querySelector('.music-track-row');window.__stableMusicRow=row;__testDatabase.ref(`music/playlists/${ChatApp.musicView.id}/tracks/second/artist`).set('Live Artist');return true;});assert(stability);
      await page.waitForFunction(()=>document.querySelector('.music-track-artist')?.textContent==='Live Artist');assert.equal(await page.evaluate(()=>window.__stableMusicRow===document.querySelector('.music-track-row')),true,'metadata changes patch row in place');
      const elapsed=await page.locator('.music-track-row .music-added-column').first().textContent();await page.waitForFunction(old=>document.querySelector('.music-track-row .music-added-column')?.textContent!==old,elapsed);assert.equal(await page.evaluate(()=>window.__stableMusicRow===document.querySelector('.music-track-row')),true,'live timestamps preserve rows');
      if (mobile) {
        const rows = page.locator('.music-track-row');
        const first = await rows.first().locator('.music-track-cover').boundingBox();
        const second = await rows.nth(1).locator('.music-track-cover').boundingBox();
        const cdp = await context.newCDPSession(page);
        const point = y => [{x:first.x + first.width / 2, y}];
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:point(first.y + first.height / 2)});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:point(second.y + second.height)});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        await cdp.detach();
      } else {
        await page.locator('.music-track-row').first().dragTo(page.locator('.music-track-row').nth(1));
      }
      await page.waitForFunction(()=>document.querySelector('.music-track-title')?.textContent==='Renamed Song');
      await page.screenshot({path:path.join(captures,`${kind}-playlist.png`)});
      await page.click('#music-back');await page.evaluate(()=>{for(let i=0;i<6;i++)__testDatabase.ref('music/playlists/p'+i).set({id:'p'+i,ownerCode:'TEST-USER',name:'Playlist '+i,createdAt:Date.now()+i});});
      await page.waitForFunction(()=>document.querySelectorAll('.music-playlist-card').length===6);assert.equal(await page.locator('#music-view-all').isVisible(),true);await page.click('#music-view-all');assert.equal(await page.locator('.music-playlist-card').count(),7);
      await page.click('#music-back');await page.evaluate(()=>__testDatabase.ref('users/Z/displayName').set('Aaron'));await page.waitForFunction(()=>document.querySelector('.music-user-card .music-card-name')?.textContent==='Aaron').catch(async error=>{console.log(await page.evaluate(()=>({names:[...document.querySelectorAll('.music-user-card .music-card-name')].map(n=>n.textContent),data:[...ChatApp.musicData.users.values()].map(u=>u.displayName),people:[...ChatApp.schedulesPeopleByCode.values()].map(u=>u.displayName),view:ChatApp.musicView,errors:ChatApp.musicData.error})));throw error;});
      const standaloneChooser = page.waitForEvent('filechooser'); await page.click('#music-upload');
      await (await standaloneChooser).setFiles({name:'independent.wav',mimeType:'audio/wav',buffer:wav()});
      await page.fill('#music-track-title','Alpha Standalone'); await page.fill('#music-track-artist','Shelf Artist');
      await page.fill('#music-track-album','Blue Album'); await page.click('#music-editor-save');
      const audioTitles = page.locator('#music-audios .music-track-title');
      await page.waitForFunction(()=>document.querySelector('#music-audios .music-track-title')?.textContent==='Alpha Standalone');
      for(const query of ['sTaNdAlOnE','sHElf','bLuE']) {
        await page.fill('#music-audio-search',query);
        assert.deepEqual(await audioTitles.allTextContents(),['Alpha Standalone']);
      }
      await page.fill('#music-audio-search',''); assert.ok((await audioTitles.allTextContents()).length >= 2);
      await page.locator('#music-audios .music-track-row').first().click();
      await page.waitForFunction(()=>ChatApp.musicState.playing && ChatApp.musicState.track.title==='Alpha Standalone');
      await page.waitForFunction(()=>!ChatApp.musicState.playing && !ChatApp.musicState.loading);
      assert.ok(await page.evaluate(()=>!ChatApp.musicState.track || ChatApp.musicState.track.title==='Alpha Standalone'),'Audio library playback stops after one track');
      await page.evaluate(async()=>{
        const track=ChatApp.musicGetAudios('TEST-USER')[0];
        await __testDatabase.ref('music/audio/other-upload').set(__testDatabase.get('music/audio/'+track.blobId));
        await __testDatabase.ref('music/playlists/public').set({ownerCode:'Z',name:'Public Playlist',createdAt:Date.now(),tracks:{publicTrack:{...track,uploaderCode:'Z',title:'Public Track',blobId:'other-upload',order:0}}});
      });
      const publicRow = page.locator('#music-audios .music-track-row').filter({hasText:'Public Track'});
      await publicRow.getByRole('button',{name:'Track Menu'}).click();
      assert.equal(await page.getByRole('menuitem',{name:'Edit',exact:true}).count(),0,'public Audio preserves ownership');
      await page.getByRole('menuitem',{name:'Play',exact:true}).click();
      await page.waitForFunction(() => ChatApp.musicState.playing && ChatApp.musicState.playlistId === ChatApp.musicLibraryId('Z'));
      const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXuoAAAAASUVORK5CYII=';await page.evaluate(photo=>{window.__stableMusicUser=document.querySelector('.music-user-card');__testDatabase.ref('users/Z/photoDataURL').set(photo);__testDatabase.ref('users/Z/photoTransform').set({unit:'rel',x:.1,y:-.1,scale:1.5});},photo);await page.waitForFunction(photo=>document.querySelector('.music-user-card img')?.src===photo,photo);assert.equal(await page.evaluate(()=>window.__stableMusicUser===document.querySelector('.music-user-card')),true,'live avatars preserve grouped user card');
      await page.locator('.music-user-card .music-user-avatar').first().click();await page.waitForFunction(()=>ChatApp.musicView?.kind==='user');
      assert.equal(await page.locator('.user-profile-popover:not([hidden])').count(),0);
      assert.deepEqual(await audioTitles.allTextContents(),['Public Track']);
      await page.locator('#music-audios .music-track-row').first().click({button:'right'});
      await page.locator('#music-context-menu').getByRole('menuitem',{name:'My Mix',exact:true}).click();
      await page.getByRole('button',{name:'Public Playlist',exact:true}).click();assert.equal(await page.locator('#music-upload').count(),0);
      await page.locator('.music-track-row').click({button:'right'});
      const available = await page.locator('#music-context-menu .msg-menu-label').allTextContents();
      assert.ok(available.includes('Playlist 0') && !available.includes('My Mix'));
      assert.equal(await page.locator('#music-context-menu').getByText('Add to Playlist',{exact:true}).count(),1);
      await page.keyboard.press('Escape');await page.click('#music-back');await page.screenshot({path:path.join(captures,`${kind}-home.png`)});
      assert.equal(await page.evaluate(()=>document.querySelector('#music-screen').scrollWidth<=innerWidth),true,'screen stays within viewport');
      await page.click('#music-close');assert.equal(await page.locator('#music-screen').isVisible(),false);
      if (mobile) await page.evaluate(() => ChatApp.setMobileDrawer('navigation'));
      await page.locator('.me-pill-dock').click();
      const card = page.locator('.user-profile-popover:visible');
      assert.equal(await card.locator('[data-music-profile]').count(), 0);
      await card.getByRole('button', { name: 'Profile Actions' }).click();
      assert.equal(await page.locator('[data-act="viewSchedule"]:visible').count(), 0);
      await page.locator('[data-act="viewMusic"]:visible').click();
      await page.waitForFunction(() => ChatApp.musicScreenOpen && ChatApp.musicView.kind === 'user' && ChatApp.musicView.id === 'TEST-USER');
      assert.deepEqual(errors,[]);console.log(kind+': music navigation, live users, six-playlist cap, modal, upload, metadata, read-only access and reorder passed');await context.close();
    }
    await verifyAdmin(browser,origin);
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
