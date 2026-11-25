const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root,'js/ui/tab-bootstrap.js'),'utf8');
const config = fs.readFileSync(path.join(root,'js/core/config.js'),'utf8');
const index = fs.readFileSync(path.join(root,'index.html'),'utf8');
const projectId = config.match(/projectId:\s*"([^"]+)"/)[1];
const defaultTitle = 'Sign in to GradeSort';
const defaultIcon = './assets/gradesort.svg';
const storage = values => ({getItem:key=>Object.hasOwn(values,key)?values[key]:null});
function boot({session={},local={},native=false}={}) {
  const links=[];
  const document={title:defaultTitle,currentScript:{dataset:{project:projectId}},head:{appendChild:link=>links.push(link)},createElement:()=>({})};
  const context={document,sessionStorage:storage(session),localStorage:storage(local),encodeURIComponent};
  if(native)context.chatDesktopBuild={nativeVersion:'1.7.11'};
  vm.runInNewContext(source,context);
  return {title:document.title,icon:links[0]?.href,identity:context.ChatAppTabBootstrap};
}
const codeKey=`chatapp_code:${projectId}`, cacheKey=`chatapp_user_bootstrap:${projectId}`;
const cache=(code,password,name,icon)=>JSON.stringify({code,password,browserTab:{name,icon}});
test('synchronous bootstrap project matches runtime namespace and remains immediately after title',()=>{
  const scripts=[...index.matchAll(/<script\s+[^>]*src="([^"]+)"[^>]*>/g)];
  const bootTag=scripts.find(match=>match[1].includes('/tab-bootstrap.js'))?.[0];
  assert(bootTag);assert.match(bootTag,new RegExp('data-project="'+projectId+'"'));
  assert.doesNotMatch(bootTag,/\b(?:async|defer)\b/);
  assert(index.indexOf(bootTag)<index.indexOf('js/ui/theme.js'));
});
test('bootstrap resolves title and icon before app modules, using the matching tab/account cache',()=>{
  const result=boot({session:{[codeKey]:'PASS-A',[cacheKey]:cache('uid_A','PASS-A','Account A','data:image/png,A')},local:{[codeKey]:'PASS-B',[cacheKey]:cache('uid_B','PASS-B','Account B','data:image/png,B')}});
  assert.equal(result.title,'Account A');assert.equal(result.icon,'data:image/png,A');
  assert.equal(result.identity.projectId,projectId);
});
test('bootstrap supports title-only/icon-only, missing cache and explicit signed-out cache',()=>{
  const titleOnly=boot({local:{[codeKey]:'PASS',[cacheKey]:cache('uid','PASS','My title','')}});
  assert.equal(titleOnly.title,'My title');assert.equal(titleOnly.icon,defaultIcon);
  const iconOnly=boot({local:{[codeKey]:'PASS',[cacheKey]:cache('uid','PASS','','data:image/png,icon')}});
  assert.equal(iconOnly.title,defaultTitle);assert.equal(iconOnly.icon,'data:image/png,icon');
  const mismatched=boot({local:{[codeKey]:'PASS',[cacheKey]:cache('uid_OTHER','WRONG','Wrong account','data:,wrong')}});
  assert.equal(mismatched.title,defaultTitle);assert.equal(mismatched.identity,undefined);
  const signedOut=boot({session:{[codeKey]:''},local:{[codeKey]:'PASS',[cacheKey]:cache('uid','PASS','Old account','data:,old')}});
  assert.equal(signedOut.title,defaultTitle);assert.equal(signedOut.identity,undefined);
});
test('bootstrap and runtime use the same explicit default favicon; Electron is untouched',()=>{
  const App={register(){}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'js/core/session.js'),'utf8'),{ChatApp:App,encodeURIComponent});
  assert.equal(boot().icon,App.defaultBrowserFavicon);
  assert.equal(App.defaultBrowserFavicon,defaultIcon);
  assert.match(fs.readFileSync(path.join(root,'js/core/session.js'),'utf8'),/APP_TAB_TITLE_DEFAULT = "Sign in to GradeSort"/);
  assert.match(index,/<title>Sign in to GradeSort<\/title>/);
  const native=boot({native:true,local:{[codeKey]:'PASS',[cacheKey]:cache('uid','PASS','Custom','data:,custom')}});
  assert.equal(native.title,defaultTitle);assert.equal(native.icon,undefined);assert.equal(native.identity,undefined);
});
test('a delayed session verification cannot overwrite a newer tab preference edit',async()=>{
  const initializers=new Map();
  let resolveLogin;
  const oldTab={name:'Before edit',icon:'data:,old'},newTab={name:'After edit',icon:'data:,new'};
  const pending=new Promise(resolve=>{resolveLogin=resolve;});
  const App={register:(id,fn)=>initializers.set(id,fn),accountSessionGeneration:0,browserTabSettingsRevision:0,currentUser:null,
    currentSettings:{tab:oldTab},getStoredAccountCode:()=> 'PASSWORD',readCachedSettings:()=>({tab:oldTab}),
    readCachedUserBootstrap:()=>({code:'uid_A',settings:{tab:oldTab}}),browserTabIdentityEnabled:()=>true,
    getStoredPlace:()=> 'home',loginWithCode:()=>pending,applyResolvedSettings:settings=>{App.currentSettings=settings;},
    leaveStaleCallFromPreviousSession:async()=>{}};
  for(const name of ['setDefaultPfp','syncEye','showView','applyScrollFixes','startAccountCreationListener','syncBrowserTabIdentity',
    'ensureLiveUserListener','startScheduleViewersListener','setMeHeader','syncPanelButtonVisibility','hydrateRoomsListFromCache',
    'showLoggedInHome','startCalendarSession','startAppPresence','migrateLegacyHtmlLibrariesToHub','writeCurrentUserBootstrapCache',
    'attachMemberships','attachPingsInbox','startScheduleTypeListener'])App[name]=()=>{};
  vm.runInNewContext(fs.readFileSync(path.join(root,'js/core/start.js'),'utf8'),{ChatApp:App,document:{querySelector:()=>null}});
  initializers.get('core/start')();
  App.currentSettings={tab:newTab};App.browserTabSettingsRevision++;
  resolveLogin({code:'uid_A',settings:{tab:oldTab}});
  await pending;await Promise.resolve();await Promise.resolve();
  assert.deepEqual(JSON.parse(JSON.stringify(App.currentSettings.tab)),newTab);
});
