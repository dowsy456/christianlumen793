'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/ui/update-log.js'), 'utf8');
const formatting = fs.readFileSync(path.join(__dirname, '../js/chat/mentions.js'), 'utf8');
const release = {text:'# **New**\n*Details*',webVersion:'2026.11.13-2',assetRevision:'20261113-dashboard-update-log',nativeVersion:'2.0.0'};
function harness(shared = new Map()) {
  let clock=1000, id=0, native=false, installed='2.0.0';
  const timers=new Map(), shown=[];
  const App={register(){},currentUser:{code:'USER'},accountSessionGeneration:1,modalEl:{hidden:true,dataset:{}},firebase:{database:{ServerValue:{TIMESTAMP:1}}},
    getRoomMentionTargetByUsername(){return null;},isNativeDesktop:()=>native,getInstalledNativeVersion:()=>installed,
    db:{ref:key=>({once:async()=>({val:()=>shared.get(key) || null}),transaction:async fn=>{const value=fn(shared.get(key)||null);if(value!==undefined)shared.set(key,value);return {committed:value!==undefined};}})},
    openModal:value=>{shown.push(value);App.modalEl.hidden=false;App.modalEl.dataset.size=value.size;},closeModal:()=>{App.modalEl.hidden=true;}};
  const context=vm.createContext({ChatApp:App,ChatRuntime:{version:release.assetRevision},document:{hidden:false},URL,Date:{now:()=>clock},crypto:{randomUUID:()=>String(++id)},
    setTimeout:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:clock+ms});return key;},clearTimeout:key=>timers.delete(key),AbortController});
  vm.runInContext(formatting,context);vm.runInContext(source,context);
  App.fetchUpdateLogJSON=async url=>url.includes('/users/')?[{name:'christianlumen10',owner:{login:'dowsy456'}}]:url.includes('/commits/')?{sha:'a'.repeat(40)}:url.includes('raw.githubusercontent')?release:{tag_name:'v2.0.0',assets:[{name:'Chat-App.exe'},{name:'native-update.json'}]};
  const flush=async()=>{for(let i=0;i<50;i++)await Promise.resolve();};
  const advance=async ms=>{await flush();clock+=ms;for(const [key,timer] of [...timers])if(timer.at<=clock){timers.delete(key);timer.fn();}await flush();};
  return {App,context,shared,shown,advance,native:(value,version='2.0.0')=>{native=value;installed=version;}};
}
test('exact loaded web/native gating and safe noninteractive markdown',()=>{
  const h=harness(),A=h.App;
  assert.equal(A.isUpdateLogEligible(release),true);
  assert.equal(A.isUpdateLogEligible({...release,assetRevision:'old'}),false);
  h.native(true,'1.7.11');assert.equal(A.isUpdateLogEligible(release),false);
  h.native(true);assert.equal(A.isUpdateLogEligible(release),true);
  h.native(true,null);assert.equal(A.isUpdateLogEligible(release),false);
  assert.equal(A.normalizeUpdateLog({...release,text:' \n '}),null);
  assert.equal(A.normalizeUpdateLog({...release,assetRevision:'bad/value'}),null);
  const html=A.renderUpdateLogText('# **Big**\n## *Medium*\n### Small\n-# **Fine**\n<script>x</script> https://example.test @everyone');
  assert.match(html,/<h1><strong>Big<\/strong><\/h1>/);assert.match(html,/<h2><em>Medium<\/em><\/h2>/);
  assert.match(html,/<h3>Small<\/h3>/);assert.match(html,/class="update-log-subtext"><strong>Fine/);
  assert(!/<(?:script|a|button)\b/.test(html));assert.match(html,/&lt;script&gt;/);
});
test('waits 500ms after verified login and records once per account across devices',async()=>{
  const shared=new Map([['admin/updateLog',release]]),h=harness(shared),other=harness(shared);
  h.App.startUpdateLogSession();await h.advance(499);assert.equal(h.shown.length,0);
  await h.advance(1);assert.equal(h.shown.length,1);assert.equal(h.shown[0].title,'Update Log');
  other.App.startUpdateLogSession();await other.advance(500);assert.equal(other.shown.length,0);
  shared.set('admin/updateLog',{...release,nativeVersion:'2.0.1'});
  other.App.startUpdateLogSession();await other.advance(500);assert.equal(other.shown.length,0);
  h.App.stopUpdateLogSession();h.App.startUpdateLogSession();await h.advance(500);assert.equal(h.shown.length,1);
  // New text for the same actual release is not a new update.
  shared.set('admin/updateLog',{...release,text:'Edited text'});
  other.App.startUpdateLogSession();await other.advance(500);assert.equal(other.shown.length,0);
  other.App.currentUser={code:'OTHER'};other.App.startUpdateLogSession();await other.advance(500);assert.equal(other.shown.length,1);
});
test('concurrent sessions claim only one popup; later native release can show again',async()=>{
  const shared=new Map([['admin/updateLog',release]]),a=harness(shared),b=harness(shared);
  a.App.startUpdateLogSession();b.App.startUpdateLogSession();await Promise.all([a.advance(500),b.advance(500)]);
  assert.equal(a.shown.length+b.shown.length,1);
  a.App.stopUpdateLogSession();a.native(true,'2.0.1');shared.set('admin/updateLog',{...release,nativeVersion:'2.0.1'});
  a.App.getPublishedUpdateLogRelease=async()=>({...release,nativeVersion:'2.0.1'});
  a.App.startUpdateLogSession();await a.advance(500);assert.equal(a.shown.length,2);
});
test('old saved log is suppressed after newer publication; seen releases skip GitHub',async()=>{
  const h=harness();h.shared.set('admin/updateLog',release);let checks=0;
  h.App.getPublishedUpdateLogRelease=async()=>{checks++;return {...release,assetRevision:'newer-published-release'};};
  h.App.startUpdateLogSession();await h.advance(500);assert.equal(h.shown.length,0);assert.equal(h.shared.size,1);assert.equal(checks,1);
  h.shared.set('users/USER/updateLogSeen/'+h.App.updateLogReleaseKey(release),{webSeen:{seenAt:1}});
  h.App.startUpdateLogSession();await h.advance(500);assert.equal(checks,1);
});
test('same account sees one shared release across browser and EXE, with native-only changes isolated',async()=>{
  const shared=new Map([['admin/updateLog',release]]),browser=harness(shared),desktop=harness(shared);desktop.native(true);
  browser.App.startUpdateLogSession();await browser.advance(500);assert.equal(browser.shown.length,1);
  desktop.App.startUpdateLogSession();await desktop.advance(500);assert.equal(desktop.shown.length,0);
  const next={...release,nativeVersion:'2.0.1'};shared.set('admin/updateLog',next);
  desktop.native(true,'2.0.1');desktop.App.getPublishedUpdateLogRelease=async()=>next;
  desktop.App.startUpdateLogSession();await desktop.advance(500);assert.equal(desktop.shown.length,1);
  browser.App.stopUpdateLogSession();browser.App.startUpdateLogSession();await browser.advance(500);assert.equal(browser.shown.length,1);
  const receipt=shared.get('users/USER/updateLogSeen/'+release.assetRevision);assert.equal(Object.keys(receipt.releases).length,2);
});
test('concurrent browser and EXE sessions share the same release claim',async()=>{
  const shared=new Map([['admin/updateLog',release]]),browser=harness(shared),desktop=harness(shared);desktop.native(true);
  browser.App.startUpdateLogSession();desktop.App.startUpdateLogSession();await Promise.all([browser.advance(500),desktop.advance(500)]);
  assert.equal(browser.shown.length+desktop.shown.length,1);
});
test('cancelled post-claim session rolls back only its token and preserves other native receipts',async()=>{
  const next={...release,nativeVersion:'2.0.1'},h=harness(),receiptPath='users/USER/updateLogSeen/'+release.assetRevision;
  h.native(true,'2.0.1');h.shared.set('admin/updateLog',next);h.App.getPublishedUpdateLogRelease=async()=>next;
  h.shared.set(receiptPath,{webSeen:{token:'older',seenAt:1},releases:{'native-2-0-0':{token:'older',seenAt:1}}});
  const ref=h.App.db.ref;let interrupted=false;
  h.App.db.ref=key=>{
    const original=ref(key);
    if(key!==receiptPath)return original;
    return {...original,transaction:async fn=>{
      const result=await original.transaction(fn);
      if(!interrupted&&result.committed){
        interrupted=true;h.App.currentUser=null;
        h.shared.get(receiptPath).releases['native-2-0-2']={token:'sibling',seenAt:2};
      }
      return result;
    }};
  };
  h.App.startUpdateLogSession();await h.advance(500);
  assert.equal(h.shown.length,0);
  assert.deepEqual(Object.keys(h.shared.get(receiptPath).releases).sort(),['native-2-0-0','native-2-0-2']);
  assert.equal(h.shared.get(receiptPath).webSeen.token,'older');
});
test('empty, old-release and cancelled sessions never consume a receipt',async()=>{
  const h=harness();h.shared.set('admin/updateLog',{...release,text:''});h.App.startUpdateLogSession();await h.advance(500);
  h.shared.set('admin/updateLog',{...release,assetRevision:'next'});h.App.startUpdateLogSession();await h.advance(500);
  h.shared.set('admin/updateLog',release);h.App.startUpdateLogSession();h.App.stopUpdateLogSession();await h.advance(500);
  assert.equal(h.shown.length,0);assert.equal(h.shared.size,1);
  h.App.startUpdateLogSession();await h.advance(500);assert.equal(h.shown.length,1);
});
test('defers behind other modals and ignores edits until next login',async()=>{
  const h=harness();h.shared.set('admin/updateLog',release);h.App.modalEl.hidden=false;
  h.App.startUpdateLogSession();await h.advance(500);assert.equal(h.shown.length,0);assert.equal(h.shared.size,1);
  h.App.modalEl.hidden=true;await h.advance(250);assert.equal(h.shown.length,1);
  h.App.stopUpdateLogSession();h.shared.set('admin/updateLog',null);h.App.startUpdateLogSession();await h.advance(500);
  h.shared.set('admin/updateLog',{...release,nativeVersion:'2.0.1'});await h.advance(1000);assert.equal(h.shown.length,1);
});
test('publisher binds highest numbered valid shared build and actual native assets',async()=>{
  const h=harness(),seen=[];
  h.App.fetchUpdateLogJSON=async url=>{
    seen.push(url);
    if(url.includes('/users/'))return [9,12,11].map(n=>({name:'christianlumen'+n,owner:{login:'dowsy456'},default_branch:'release'}));
    if(url.includes('/commits/'))return {sha:'a'.repeat(40)};
    if(url.includes('christianlumen12/'))throw Error('GitHub returned HTTP 404.');
    if(url.includes('raw.githubusercontent'))return release;
    return {tag_name:'v2.0.0',assets:[{name:'Chat-App.exe'},{name:'native-update.json'}]};
  };
  const result=await h.App.resolvePublishedUpdateLogRelease();
  assert.equal(result.assetRevision,release.assetRevision);assert.equal(result.nativeVersion,'2.0.0');
  assert(seen.some(url=>url.includes('christianlumen12/commits/release')));assert(seen.some(url=>url.includes('christianlumen11/')));assert(!seen.some(url=>url.includes('christianlumen9/')));
  const original=h.App.fetchUpdateLogJSON;h.App.fetchUpdateLogJSON=url=>url.includes('/releases/latest')?Promise.resolve({tag_name:'v2.0.1',assets:[{name:'Chat-App.exe'}]}):original(url);
  await assert.rejects(()=>h.App.resolvePublishedUpdateLogRelease(),/must include/);
});
