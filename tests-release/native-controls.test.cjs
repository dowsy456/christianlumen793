'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { trayModel, createCallTray } = require('../desktop/tray.cjs');
const { createScreenDrawing, normalizeStroke, helperLocation } = require('../desktop/drawing.cjs');
const state = { active: true, roomId: 'r', sessionId: 's', roomName: 'A long room name', enabled: true, controls: { sharing: true, muted: false } };
test('tray call labels and states match live controls', () => {
  const model = trayModel(state); assert.equal(model.roomName, state.roomName);
  assert.deepEqual(model.controls.map(c => c.label), ['Return to Call', 'Mute', 'Deafen', 'Stop Sharing', 'Camera', 'Turn Off Call Overlay', 'Leave Call']);
  assert.match(model.status, /Microphone on.*Screen sharing/);
  const next = trayModel({ ...state, controls: { listenOnly: true, deafened: true, cameraSharing: true, cameraPending: true }, enabled: false });
  assert.equal(next.controls.find(c => c.action === 'mute').disabled, true); assert.equal(next.controls.find(c => c.action === 'camera').disabled, true);
  assert.equal(next.controls.find(c => c.action === 'deafen').label, 'Undeafen'); assert.equal(next.controls.find(c => c.action === 'camera').label, 'Stop Camera');
  assert.deepEqual(trayModel({ active: false }).controls, []);
  assert.equal(trayModel({ active: false }).status, '', 'idle tray has no background-running label');
});
test('drawing executes its unpacked native helper in a packaged app', () => {
  assert.match(helperLocation('C:\\Chat App\\resources\\app.asar'), /app\.asar\.unpacked[\\/]helpers[\\/]screen-drawing-helper\.exe$/);
  assert.match(helperLocation('/Chat App/resources/app.asar'), /app\.asar\.unpacked[\\/]helpers[\\/]screen-drawing-helper\.exe$/);
  assert.equal(helperLocation('C:\\source\\desktop').includes('asar'), false, 'development helper stays in its real source directory');
  assert.equal(helperLocation('C:\\source\\app.asar-not-an-archive').includes('asar.unpacked'), false, 'only an ASAR path component is rewritten');
});
function ipc() { const value = new EventEmitter(); value.handlers = new Map(); value.handle = (name, fn) => value.handlers.set(name, fn); value.removeHandler = name => value.handlers.delete(name); return value; }
test('tray dispatch is restricted to its renderer and current call, hidden mute never opens the app', async () => {
  const native = ipc(), windows = [], sent = []; let shown = 0;
  class Window extends EventEmitter {
    constructor() { super(); this.visible = false; this.bounds = { x: 0, y: 0, width: 320, height: 520 }; this.webContents = Object.assign(new EventEmitter(), { mainFrame: {}, setWindowOpenHandler() {}, send() {} }); windows.push(this); }
    setMenu() {} setAlwaysOnTop() {} loadFile() { return Promise.resolve(); } isDestroyed() { return false; } hide() { this.visible = false; } setBounds(value) { this.bounds = { ...value }; } getBounds() { return { ...this.bounds }; } isVisible() { return this.visible; } show() { this.visible = true; } focus() {} destroy() { this.emit('closed'); }
  }
  const main = Object.assign(new EventEmitter(), { isDestroyed: () => false });
  const controller = createCallTray({ BrowserWindow: Window, screen: { getCursorScreenPoint: () => ({ x: 200, y: 300 }), getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1000, height: 800 } }), getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1000, height: 800 } }) }, ipcMain: native, mainWindow: main, uiDir: '/ui', getContents: () => ({ isDestroyed: () => false, send: (...args) => sent.push(args) }), showMainWindow: () => shown++, quit() {} });
  controller.update(state); controller.open(); windows[0].webContents.emit('did-finish-load');
  const event = { sender: windows[0].webContents, senderFrame: windows[0].webContents.mainFrame }, invoke = native.handlers.get('chat-tray:command');
  assert.equal(invoke({ ...event, senderFrame: {} }, { action: 'mute', roomId: 'r', sessionId: 's' }), false);
  assert.equal(invoke(event, { action: 'mute', roomId: 'r', sessionId: 'old' }), false);
  assert.equal(invoke(event, { action: 'mute', roomId: 'r', sessionId: 's' }), true); assert.equal(shown, 0);
  assert.equal(invoke(event, { action: 'return', roomId: 'r', sessionId: 's' }), true); assert.equal(shown, 1);
  controller.update({ ...state, controls: { sharing: false } });
  assert.equal(invoke(event, { action: 'stop-share', roomId: 'r', sessionId: 's' }), false, 'stale stop never starts a share');
  assert.equal(sent.length, 2); controller.destroy(); assert.equal(native.handlers.size, 0);
});
test('native drawing filters bad coordinates and binds helper output to a committed source generation', async () => {
  assert.equal(normalizeStroke({ id: 'a', phase: 'points', points: [[-1, .5], [Infinity, 0]] }, 's'), null);
  assert.deepEqual(normalizeStroke({ id: 'a', phase: 'points', points: [[.2, .8], [1.1, .5]] }, 's').points, [[.2, .8]]);
  const native = ipc(), children = [], sent = [];
  const contents = Object.assign(new EventEmitter(), { mainFrame: {}, isDestroyed: () => false, getURL: () => 'chatapp://app/index.html', send: (...args) => sent.push(args) });
  const controller = createScreenDrawing({ ipcMain: native, screen: {}, getCaptureSources: () => [{ id: 'window:123:0' }], platform: 'win32', spawnImpl: () => {
    const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), stdin: { end() {} }, kill() { this.killed = true; } }); children.push(child); return child;
  } });
  controller.bindContents(contents); controller.updateCall(state);
  const event = { sender: contents, senderFrame: contents.mainFrame }, invoke = native.handlers.get('chat-drawing:source');
  assert.equal(await invoke({ ...event, senderFrame: {} }, { active: true }), false);
  const start = invoke(event, { active: true, sourceId: 'window:123:0', shareId: 'one', roomId: 'r', sessionId: 's' });
  children[0].stdout.emit('data', Buffer.from('{"ready":true}\n')); assert.equal(await start, true);
  children[0].stdout.emit('data', Buffer.from('{"id":"stroke","phase":"start","points":[[0.2,0.4]]}\n'));
  assert.equal(sent.at(-1)[1].shareId, 'one');
  await invoke(event, { active: false }); assert.equal(children[0].killed, true);
  const count = sent.length; children[0].stdout.emit('data', Buffer.from('{"id":"late","phase":"start","points":[[0.2,0.4]]}\n')); assert.equal(sent.length, count);
  controller.destroy(); assert.equal(native.handlers.size, 0);
});

test('display changes refresh capture geometry, discard old helper output and stop invalid source activations', async () => {
  const native = ipc(), children = [], sent = [], display = { id: 7, bounds: { x: 0, y: 0, width: 1280, height: 720 }, scaleFactor: 1 };
  const screen = Object.assign(new EventEmitter(), { getAllDisplays: () => [display], dipToScreenRect: (_window, rectangle) => ({ ...rectangle }) });
  const contents = Object.assign(new EventEmitter(), { mainFrame: {}, isDestroyed: () => false, getURL: () => 'chatapp://app/index.html', send: (...args) => sent.push(args) });
  const controller = createScreenDrawing({ ipcMain: native, screen, getCaptureSources: () => [{ id: 'screen:5:0', display_id: '7' }], platform: 'win32', spawnImpl: (_file, args) => {
    const child = Object.assign(new EventEmitter(), { args, stdout: new EventEmitter(), stderr: new EventEmitter(), stdin: { end() {} }, kill() { this.killed = true; queueMicrotask(() => this.emit('exit', 0)); } }); children.push(child); return child;
  } });
  controller.bindContents(contents); controller.updateCall(state);
  const event = { sender: contents, senderFrame: contents.mainFrame }, invoke = native.handlers.get('chat-drawing:source');
  const value = { active: true, sourceId: 'screen:5:0', shareId: 'one', roomId: 'r', sessionId: 's' };
  const initial = invoke(event, value); children[0].stdout.emit('data', Buffer.from('{"ready":true}\n')); assert.equal(await initial, true);
  assert.deepEqual(children[0].args, ['--source', 'screen:5:0', '--rect', '0,0,1280,720']);
  display.bounds = { x: -1920, y: 0, width: 1920, height: 1080 };
  screen.emit('display-metrics-changed', {}, display, ['bounds', 'rotation']);
  await new Promise(resolve => setTimeout(resolve, 110));
  assert.equal(children.length, 2); assert.equal(children[0].killed, true);
  assert.deepEqual(children[1].args, ['--source', 'screen:5:0', '--rect', '-1920,0,1920,1080']);
  assert.deepEqual(sent.at(-1)[1], { shareId: 'one', sourceId: 'screen:5:0', phase: 'reset' });
  const before = sent.length; children[0].stdout.emit('data', Buffer.from('{"id":"stale","phase":"start","points":[[0.2,0.4]]}\n')); assert.equal(sent.length, before);
  children[1].stdout.emit('data', Buffer.from('{"ready":true}\n'));
  const batch = Buffer.from(Array.from({ length: 1500 }, (_, i) => JSON.stringify({ id: 'batch-' + i, phase: 'points', points: [[.2, .4]] })).join('\n') + '\n');
  assert.ok(batch.length > 65536); children[1].stdout.emit('data', batch);
  assert.equal(sent.length, before + 1500, 'valid complete lines can arrive in one large stdout chunk'); assert.equal(children[1].killed, undefined);
  assert.equal(sent.at(-1)[1].sourceId, 'screen:5:0');
  assert.equal(await invoke(event, { ...value, sourceId: 'window:999:0' }), false); assert.equal(children[1].killed, true, 'failed new-source activation cannot leave old-source drawing enabled');
  const cold = invoke(event, value); display.bounds.width = 1600; screen.emit('display-metrics-changed', {}, display, ['bounds']);
  children[2].stdout.emit('data', Buffer.from('{"ready":true}\n')); assert.equal(await cold, true);
  await new Promise(resolve => setTimeout(resolve, 110)); assert.equal(children.length, 4); assert.equal(children[2].killed, true);
  assert.equal(children[3].args.at(-1), '-1920,0,1600,1080', 'a display change during startup refreshes geometry after readiness');
  children[3].stdout.emit('data', Buffer.from('{"ready":true}\n'));
  controller.destroy(); assert.equal(children[3].killed, true); assert.equal(screen.listenerCount('display-metrics-changed'), 0); assert.equal(native.handlers.size, 0);
});
test('overlay disable immediately stops native drawing and reenable permits the same committed source', async () => {
  const native=ipc(),children=[],sent=[];
  const contents=Object.assign(new EventEmitter(),{mainFrame:{},isDestroyed:()=>false,getURL:()=>'chatapp://app/index.html',send:(...args)=>sent.push(args)});
  const controller=createScreenDrawing({ipcMain:native,screen:{},getCaptureSources:()=>[{id:'window:123:0'}],platform:'win32',spawnImpl:(file,args,options)=>{
    assert.match(file,/helpers[\\/]screen-drawing-helper\.exe$/);assert.equal(options.shell,false);
    const child=Object.assign(new EventEmitter(),{stdout:new EventEmitter(),stderr:new EventEmitter(),stdin:{end(){}},kill(){this.killed=true;queueMicrotask(()=>this.emit('exit',0));}});children.push(child);return child;
  }});
  controller.bindContents(contents);controller.updateCall(state);
  const event={sender:contents,senderFrame:contents.mainFrame},invoke=native.handlers.get('chat-drawing:source'),value={active:true,sourceId:'window:123:0',shareId:'same',roomId:'r',sessionId:'s'};
  const first=invoke(event,value);children[0].stdout.emit('data',Buffer.from('{"ready":true}\n'));assert.equal(await first,true);
  controller.updateCall({...state,enabled:false});assert.equal(children[0].killed,true);
  assert.equal(await invoke(event,value),true,'racing activation is handled as suspended');assert.equal(children.length,1,'disabled overlay never installs another hook');
  children[0].stdout.emit('data',Buffer.from('{"id":"late","phase":"start","points":[[0.2,0.4]]}\n'));assert.equal(sent.length,0,'disabled state discards late points and exit notices');
  controller.updateCall(state);const second=invoke(event,value);children[1].stdout.emit('data',Buffer.from('{"ready":true}\n'));assert.equal(await second,true);
  children[1].stdout.emit('data',Buffer.from('{"id":"new","phase":"start","points":[[0.2,0.4]]}\n'));assert.equal(sent.length,1);assert.equal(sent[0][1].shareId,'same');
  controller.destroy();assert.equal(children[1].killed,true);
});
test('native drawing scopes queued events and geometry restarts to the activation id', async () => {
  const native=ipc(),children=[],sent=[];
  const screen=Object.assign(new EventEmitter(),{getAllDisplays:()=>[{id:7,bounds:{x:0,y:0,width:1280,height:720},scaleFactor:1}],dipToScreenRect:(_window,r)=>({...r})});
  const contents=Object.assign(new EventEmitter(),{mainFrame:{},isDestroyed:()=>false,getURL:()=>'chatapp://app/index.html',send:(...args)=>sent.push(args[1])});
  const controller=createScreenDrawing({ipcMain:native,screen,getCaptureSources:()=>[{id:'screen:5:0',display_id:'7'}],platform:'win32',spawnImpl:()=>{
    const child=Object.assign(new EventEmitter(),{stdout:new EventEmitter(),stderr:new EventEmitter(),stdin:{end(){}},kill(){this.killed=true;queueMicrotask(()=>this.emit('exit',0));}});children.push(child);return child;
  }});
  controller.bindContents(contents);controller.updateCall(state);
  const event={sender:contents,senderFrame:contents.mainFrame},invoke=native.handlers.get('chat-drawing:source'),value={active:true,sourceId:'screen:5:0',shareId:'same',roomId:'r',sessionId:'s',activationId:4};
  for(const activationId of [0,-1,1.5,Infinity,'4']) assert.equal(await invoke(event,{...value,activationId}),false);
  assert.equal(children.length,0,'invalid activation ids never launch a helper');
  const first=invoke(event,value);children[0].stdout.emit('data',Buffer.from('{"ready":true}\n'));assert.equal(await first,true);
  children[0].stdout.emit('data',Buffer.from('{"id":"first","phase":"start","points":[[0.2,0.4]]}\n'));assert.equal(sent.at(-1).activationId,4);
  assert.equal(await invoke(event,value),true);assert.equal(children.length,1,'same activation is reused');
  const second=invoke(event,{...value,activationId:5});assert.equal(children[0].killed,true);assert.equal(children.length,2,'a new activation for the same source cannot reuse the old helper');
  children[1].stdout.emit('data',Buffer.from('{"ready":true}\n'));assert.equal(await second,true);
  screen.emit('display-metrics-changed');await new Promise(resolve=>setTimeout(resolve,110));
  assert.equal(sent.at(-1).phase,'reset');assert.equal(sent.at(-1).activationId,5);assert.equal(children.length,3);
  children[2].stdout.emit('data',Buffer.from('{"ready":true}\n'));
  children[2].stdout.emit('data',Buffer.from('{"id":"current","phase":"start","points":[[0.2,0.4]]}\n'));assert.equal(sent.at(-1).activationId,5,'geometry restart retains its activation id');
  children[2].emit('exit',1);assert.equal(sent.at(-1).phase,'error');assert.equal(sent.at(-1).activationId,5);
  controller.destroy();
});
