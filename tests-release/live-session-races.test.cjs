'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function fixture(files) {
 const refs=[],writes=[],queued=new Map(),calls={renders:0,home:0,toasts:0};
 let pendingRemove=null;
 const App={register(){},currentUser:{code:'A'},accountSessionGeneration:1,currentRoomId:null,
  membershipMap:new Map(),roomsMetaCache:new Map(),roomMetaListeners:new Map(),pendingRoomReads:new Map(),
  views:{chat:{dataset:{active:'false'}}},getStoredPlace:()=> 'home',clearPendingRoomReads(){},attachPinnedRoomsSync(){},
  hydrateRoomsListFromCache(){},scheduleRoomsListCacheSave(){},syncRoomMessageNotifications(){},
  clearMessagesToHome(){},showLoggedInHome(){calls.home++;},showToast(){calls.toasts++;},closeToast(){},
  sanitizeRoomCode:String,roomDisplayName:(id,meta)=>meta?.name||id,refreshRenderedRoomIcon(){},isRoomActivelyRead:()=>false,
  updateRoomListItem(){},clearReplyState(){},clearPendingFiles(){},$:()=>({value:''}),
  queueLiveUpdate:(key,fn)=>queued.set(key,fn),cancelLiveUpdate:key=>queued.delete(key)};
 const makeRef=p=>{const ref={path:p,listeners:[],on(event,cb){this.listeners.push(cb);},off(){this.stopped=true;},remove(){writes.push(p);return pendingRemove||Promise.resolve();}};refs.push(ref);return ref;};
 App.db={ref:makeRef};App.fieldGroupRef=makeRef;
 const context={ChatApp:App,console,document:{},window:{},setTimeout(){throw new Error('No timeout should delay a live search update');},clearTimeout(){}};
 vm.createContext(context);
 for(const file of files)vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
 App.renderRoomsList=()=>{calls.renders++;};
 App.stopRoomMetaListeners ||= ()=>{};
 const snap=value=>({exists:()=>value!=null,val:()=>value});
 return {App,refs,writes,queued,calls,snap,context,deferRemove(){let resolve;pendingRemove=new Promise(r=>resolve=r);return resolve;}};
}
test('membership additions and removals update immediately, while detached/account callbacks cannot restore stale rooms',()=>{
 const f=fixture(['js/rooms/memberships.js']),{App,refs,snap,calls}=f;
 App.attachMemberships();App.restoreDone=true;
 const old=refs.at(-1),deliver=old.listeners[0];
 deliver(snap({one:true,two:{joinedAt:4,lastSeenAt:9}}));
 assert.deepEqual([...App.membershipMap.keys()],['one','two']);assert.equal(calls.renders,1);
 deliver(snap({two:true}));assert.deepEqual([...App.membershipMap.keys()],['two']);
 App.currentUser={code:'B'};App.accountSessionGeneration++;
 App.attachMemberships();App.restoreDone=true;
 const replacement=refs.at(-1);replacement.listeners[0](snap({new:true}));
 const before=calls.renders;deliver(snap({stale:true}));
 assert.deepEqual([...App.membershipMap.keys()],['new']);assert.equal(calls.renders,before);
 // Even another listener for the same account invalidates a queued old callback.
 const previous=replacement.listeners[0];App.attachMemberships();App.restoreDone=true;
 refs.at(-1).listeners[0](snap({latest:true}));previous(snap({wrong:true}));
 assert.deepEqual([...App.membershipMap.keys()],['latest']);
 App.accountSessionGeneration++;refs.at(-1).listeners[0](snap({logoutRace:true}));
 assert.deepEqual([...App.membershipMap.keys()],['latest'],'logout invalidates callbacks before async teardown finishes');
});
test('room metadata changes are immediate and stale callbacks cannot mutate another account',async()=>{
 const {App,refs,snap,calls,writes}=fixture(['js/rooms/list.js']);
 App.ensureRoomMetaListener('r');const old=refs.at(-1),deliver=old.listeners[0];
 await deliver(snap({name:'First',createdBy:'A'}));assert.equal(App.roomsMetaCache.get('r').name,'First');
 await deliver(snap({name:'Renamed',createdBy:'A'}));assert.equal(App.roomsMetaCache.get('r').name,'Renamed');
 App.stopRoomMetaListeners();App.currentUser={code:'B'};App.accountSessionGeneration++;
 App.ensureRoomMetaListener('r');const replacement=refs.at(-1);await replacement.listeners[0](snap({name:'B room',createdBy:'B'}));
 const before=calls.renders;await deliver(snap(null));await deliver(snap({name:'Stale',createdBy:'A'}));
 assert.equal(App.roomsMetaCache.get('r').name,'B room');assert.equal(App.roomMetaListeners.get('r').ref,replacement);
 assert.equal(calls.renders,before);assert.deepEqual(writes,[]);
});
test('awaited room deletion cleanup cannot detach a replacement listener or navigate a new account',async()=>{
 const f=fixture(['js/rooms/list.js']),{App,refs,snap,calls,writes}=f;
 App.membershipMap.set('r',true);App.ensureRoomMetaListener('r');const old=refs.at(-1);
 const finish=f.deferRemove();const deletion=old.listeners[0](snap(null));
 assert.deepEqual(writes,['memberships/A/r']);
 App.stopRoomMetaListeners();App.currentUser={code:'B'};App.accountSessionGeneration++;App.currentRoomId='r';
 App.ensureRoomMetaListener('r');const replacement=refs.at(-1);App.membershipMap.set('r',true);
 await replacement.listeners[0](snap({name:'Current room',createdBy:'B'}));
 finish();await deletion;
 assert.equal(App.roomMetaListeners.get('r').ref,replacement);assert.equal(replacement.stopped,undefined);
 assert.equal(App.membershipMap.has('r'),true);assert.equal(App.currentRoomId,'r');assert.equal(calls.home,0);assert.equal(calls.toasts,0);
});
test('room search updates on the next shared frame and ignores a closed or replaced search',()=>{
 const {App,queued}=fixture(['js/chat/header.js']);let renders=0;
 App.renderRoomSearch=()=>{renders++;};App.roomSearchState={closed:false};
 App.scheduleRoomSearchRender();App.scheduleRoomSearchRender();
 assert.equal(renders,0);assert.equal(queued.size,1);queued.get('room-search')();assert.equal(renders,1);
 App.scheduleRoomSearchRender();const old=queued.get('room-search');App.roomSearchState={closed:false};old();assert.equal(renders,1);
 App.scheduleRoomSearchRender();App.roomSearchState.closed=true;queued.get('room-search')();assert.equal(renders,1);
});

test('admin known leaf deletion removes its visible parent key immediately and ignores closed explorer callbacks',async()=>{
 const {App,refs,snap,context}=fixture(['js/admin/panel.js']);
 App.currentUser={code:'A',username:'Vinny'};
 App.firebaseConfig={databaseURL:'https://database.example'};
 context.URL=URL;context.AbortController=AbortController;
 context.setTimeout=()=>1;context.fetch=async()=>({ok:true,json:async()=> 'saved value'});
 App.queueAdminDatabaseRead=async job=>job();
 const rendered=[];App.renderAdminDatabaseNode=node=>rendered.push(node.path);
 const parent={path:'admin',loaded:true,branch:true,keys:['item','other'],value:{item:true,other:true},el:{isConnected:true}};
 const leaf={path:'admin/item',parent:'admin',loaded:false,branch:false,el:{isConnected:true}};
 const state=App.adminDatabase={owner:'A',closed:false,nodes:new Map([['admin',parent],['admin/item',leaf]])};
 await App.loadAdminDatabaseNode(leaf);
 const deliver=refs.at(-1).listeners[0];rendered.length=0;
 deliver(snap('new value'));assert.equal(leaf.value,'new value');assert.deepEqual(rendered,['admin/item']);
 leaf.editing=true;deliver(snap(null));assert.deepEqual([...parent.keys],['item','other'],'a remote deletion never discards an active edit');
 leaf.editing=false;deliver(snap(null));assert.deepEqual([...parent.keys],['other']);assert.deepEqual(Object.keys(parent.value),['other']);
 assert.equal(rendered.at(-1),'admin','deletion is delivered through the existing live value listener');
 state.closed=true;deliver(snap('late'));assert.equal(leaf.value,null,'closed explorer ignores late delivery');
});
