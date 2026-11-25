'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function setup(){
 const callbacks=[],writes=[],applied=[];
 const App={register(){},SETTINGS_DEFAULTS:{autoScroll:true,pushNotifications:true,tab:{name:'Default',icon:''},blackoutCloakKeys:['Control','Q'],background:{}},currentUser:{code:'A'},accountSessionGeneration:1};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/core/session.js'),'utf8'),{ChatApp:App,console,setTimeout,clearTimeout});
 App.currentSettings=App.cloneDefaultSettings();App.rememberLoadedSettings('A',App.currentSettings);
 App.applyResolvedSettings=value=>{App.currentSettings=value;applied.push(value);};
 App.db={ref:path=>({on:(_,cb)=>callbacks.push(cb),off(){},update:async value=>writes.push({path,value})})};
 return {App,callbacks,writes,applied,emit:value=>callbacks.at(-1)({val:()=>value})};
}
test('remote account preferences apply live without writing them back or discarding unsaved local leaves',async()=>{
 const h=setup();h.App.startAccountSettingsSync();
 h.App.currentSettings=h.App.mergeSettings(h.App.currentSettings,{autoScroll:false});
 h.emit({tab:{name:'Remote'},pushNotifications:false});
 assert.equal(h.App.currentSettings.autoScroll,false);assert.equal(h.App.currentSettings.tab.name,'Remote');assert.equal(h.App.currentSettings.pushNotifications,false);
 assert.equal(h.writes.length,0);
 await h.App.flushCurrentSettingsSave('A');
 assert.equal(JSON.stringify(h.writes[0].value),JSON.stringify({autoScroll:false}));
});
test('incoming changes during a pending save remain the baseline and are not overwritten by its older snapshot',async()=>{
 const h=setup();let release;
 h.App.db.ref=()=>({on:(_,cb)=>h.callbacks.push(cb),off(){},update:()=>new Promise(resolve=>{release=resolve;})});
 h.App.startAccountSettingsSync();h.App.currentSettings=h.App.mergeSettings(h.App.currentSettings,{autoScroll:false});
 const saving=h.App.flushCurrentSettingsSave('A');
 h.emit({autoScroll:false,tab:{name:'New remote title'}});release();await saving;
 h.App.db.ref=path=>({update:async value=>h.writes.push({path,value})});
 await h.App.flushCurrentSettingsSave('A');
 assert.equal(h.writes.length,0);assert.equal(h.App.currentSettings.tab.name,'New remote title');
});
test('same-account reconnect is idempotent; callbacks after logout or an account switch are ignored',()=>{
 const h=setup();h.App.startAccountSettingsSync();h.App.startAccountSettingsSync();assert.equal(h.callbacks.length,1);
 const stale=h.callbacks[0];h.App.accountSessionGeneration++;h.App.currentUser={code:'B'};
 stale({val:()=>({tab:{name:'Wrong'}})});assert.equal(h.applied.length,0);
 h.App.stopAccountSettingsSync();stale({val:()=>({autoScroll:false})});assert.equal(h.applied.length,0);
});

test('an unchanged live echo still refreshes the account settings snapshot without reapplying the UI',()=>{
 const h=setup();h.App.currentUser.settings=h.App.cloneDefaultSettings();h.App.startAccountSettingsSync();
 h.App.currentSettings=h.App.mergeSettings(h.App.currentSettings,{autoScroll:false,tab:{name:'Locally applied'}});
 h.emit({autoScroll:false,tab:{name:'Locally applied'}});
 assert.equal(h.applied.length,0,'the local UI is already current');
 assert.equal(h.App.currentUser.settings.autoScroll,false);
 assert.equal(h.App.currentUser.settings.tab.name,'Locally applied');
 assert.equal(JSON.stringify(h.App.currentUser.settings),JSON.stringify(h.App.currentSettings));
 assert.equal(h.writes.length,0);
});
