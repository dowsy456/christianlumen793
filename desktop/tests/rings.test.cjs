'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createRingPopups, normalizeRings, ringBounds, normalizePing, pingBounds } = require('../rings.cjs');
const ring = overrides => ({ id: 'r1', roomId: 'room1', roomName: 'Friends', roomIcon: 'data:image/png;base64,AA==', expiresAt: 31000, ...overrides });
test('ring payloads reject expired/malformed records, remote images, duplicates and excessive lifetime', () => {
  const rings = normalizeRings({ rings: [ring(), ring(), ring({ id: 'r2', roomId: 'room2', roomIcon: 'https://tracker.test/image', roomName: 'Other\nRoom' }), ring({ id: 'expired', roomId: 'room3', expiresAt: 500 }), ring({ id: 'forever', roomId: 'room4', expiresAt: 999999 })] }, 1000);
  assert.equal(rings.length, 2); assert.equal(rings[0].roomIcon, 'data:image/png;base64,AA=='); assert.equal(rings[1].roomIcon, ''); assert.equal(rings[1].roomName, 'Other Room');
  assert.deepEqual(normalizeRings(null), []);
});
test('incoming cards stay in top-right work area with a bounded stack', () => {
  const display = { workArea: { x: -1600, y: 100, width: 1600, height: 860 } };
  const bounds = ringBounds(display, 30);
  assert.equal(bounds.x + bounds.width, -12); assert.equal(bounds.y, 112); assert.ok(bounds.height <= 516); assert.ok(bounds.width <= 358);
});
function harness() {
  let time = 1000; const jobs = new Map(), windows = [];
  const timers = { setTimeout(fn, delay) { const id = {}; jobs.set(id, { fn, at: time + delay }); return id; }, clearTimeout(id) { jobs.delete(id); } };
  class Contents extends EventEmitter { constructor() { super(); this.mainFrame = { url: 'chatapp://app/index.html' }; this.sent = []; } focus() { this.focused = true; } getURL() { return this.mainFrame.url; } isDestroyed() { return false; } send(channel, state) { this.sent.push({ channel, state }); if (channel === 'chat-rings:state' && this === windows.find(w => w.options.title==='Chat App Call Buttons' && !w.destroyed)?.webContents) ipc.emit('chat-rings:painted',{sender:this,senderFrame:this.mainFrame},state.revision); } setWindowOpenHandler() {} }
  class Window extends EventEmitter {
    constructor(options) { super(); this.options = options; this.webContents = new Contents(); this.visible = false; windows.push(this); }
    getBounds() { return this.bounds || this.options; } setIgnoreMouseEvents(ignore) { this.ignoresMouse = ignore; (this.mouseModes ||= []).push(ignore); } setMenu() {} setAlwaysOnTop() {} setShape(areas) { this.areas=areas; } moveTop() { this.raises = (this.raises || 0) + 1; } setBounds(value) { this.bounds = value; this.resizeCount = (this.resizeCount || 0) + 1; } isDestroyed() { return !!this.destroyed; } isVisible() { return this.visible; } hide() { this.visible = false; } showInactive() { this.visible = true; } loadFile() { return Promise.resolve(); } destroy() { this.destroyed = true; this.emit('closed'); }
  }
  const ipc = new EventEmitter(); ipc.handlers = new Map(); ipc.handle = (key, handler) => ipc.handlers.set(key, handler); ipc.removeHandler = key => ipc.handlers.delete(key);
  const main = Object.assign(new EventEmitter(), { visible: true, windowFocused: true, minimized: false, getBounds: () => ({ x: 0, y: 0, width: 900, height: 800 }), isMinimized() { return this.minimized; }, isDestroyed: () => false, isVisible() { return this.visible; }, isFocused() { return this.windowFocused; }, show() { this.visible = true; }, moveTop() { this.raised = true; }, focus() { this.focused = true; this.windowFocused = true; }, restore() { this.minimized = false; } });
  const screen = Object.assign(new EventEmitter(), { cursor: {x:0,y:0}, getCursorScreenPoint() { return this.cursor; }, getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }) });
  const controller = createRingPopups({ BrowserWindow: Window, screen, ipcMain: ipc, mainWindow: main, uiDir: '/ui', timers, now: () => time });
  const contents = new Contents(); controller.bindContents(contents);
  const publish = (rings, senderFrame = contents.mainFrame, policy = {}) => ipc.emit('chat-rings:publish', { sender: contents, senderFrame }, { rings, statusReady: true, doNotDisturb: false, ...policy });
  const tick = milliseconds => { time += milliseconds; for (const [id, job] of [...jobs]) if (job.at <= time) { jobs.delete(id); job.fn(); } };
  const loadRings = () => { for (const win of windows.filter(w => !w.destroyed && w.options.title !== 'Chat App Pings')) win.webContents.emit('did-finish-load'); };
  return { controller, contents, windows, publish, tick, ipc, main, jobs, screen, loadRings };
}
test('painted ring, shaped buttons and ping windows warm before arrival; only actual buttons accept input', () => {
  const h = harness();
  assert.equal(h.windows.length, 3);
  assert.ok(h.windows.every(w => !w.visible));
  const [body,buttons] = h.windows;
  h.publish([ring()], { url:'chatapp://app/index.html' }); h.loadRings();
  assert.equal(body.visible,false);
  h.publish([ring()]);
  assert.equal(body.visible,true); assert.equal(buttons.visible,true);
  assert.deepEqual(body.mouseModes,[true]); assert.deepEqual(buttons.mouseModes,[false]);
  assert.equal(body.options.focusable,false); assert.equal(buttons.options.acceptFirstMouse,true);
  assert.equal(buttons.areas.length,2);
  assert.ok(buttons.areas.every(rect => rect.width === 36 && rect.height === 36 && rect.x >= 0 && rect.x + rect.width <= body.getBounds().width));
  assert.equal(h.main.focused,undefined);
  h.publish([ring({roomName:'Renamed'})]);
  assert.equal(body.webContents.sent.findLast(x=>x.channel==='chat-rings:state').state.rings[0].roomName,'Renamed');
  assert.equal(buttons.webContents.sent.findLast(x=>x.channel==='chat-rings:state').state.rings[0].roomIcon,undefined);
  h.screen.cursor = { x:body.getBounds().x + 15,y:body.getBounds().y + 15 };
  h.tick(100);
  assert.equal(body.webContents.sent.findLast(x=>x.channel==='chat-rings:hover').state,'r1');
  h.screen.cursor = { x:body.getBounds().x + buttons.areas[0].x + 2, y:body.getBounds().y + buttons.areas[0].y + 2 };
  h.tick(100); assert.equal(body.webContents.sent.findLast(x=>x.channel==='chat-rings:hover').state,'');
  assert.deepEqual(body.mouseModes,[true]); assert.deepEqual(buttons.mouseModes,[false]);
  h.tick(29800); assert.equal(buttons.visible,false);
  h.tick(230); assert.equal(body.visible,false);
  h.controller.destroy(); assert.equal(h.jobs.size,0);
});
test('only current privileged button/main frame, live invitation and allowed action can join/decline', () => {
  const h=harness(); h.loadRings(); h.publish([ring()]);
  const [body,buttons]=h.windows;
  const event={sender:buttons.webContents,senderFrame:buttons.webContents.mainFrame};
  const answer=h.ipc.handlers.get('chat-rings:answer'), command={action:'decline',id:'r1',roomId:'room1'};
  assert.equal(answer({sender:body.webContents,senderFrame:body.webContents.mainFrame},command),false);
  assert.equal(answer({...event,senderFrame:{}},command),false);
  for(const fix of [{action:'delete'},{id:'wrong'},{roomId:'wrong'}]) assert.equal(answer(event,{...command,...fix}),false);
  assert.equal(answer(event,command),true); assert.equal(h.main.focused,undefined);
  assert.deepEqual(h.contents.sent.at(-1),{channel:'chat-rings:command', state:command});
  assert.equal(answer(event,{...command,action:'join'}),true);
  assert.equal(h.main.focused,true); assert.equal(h.main.raised,true); assert.equal(h.contents.focused,true);
  assert.equal(body.visible,true,'authoritative shared ring state dismisses an invitation');
  h.contents.emit('did-start-navigation',{},'chatapp://app/index.html',false,true);
  assert.equal(body.visible,false); assert.equal(answer(event,command),false);
  h.publish([ring()]); assert.equal(body.visible,false);
  h.contents.emit('did-navigate'); h.publish([ring()]); assert.equal(body.visible,true);
  h.contents.emit('render-process-gone'); assert.equal(body.visible,false);
  h.controller.destroy(); assert.equal(h.ipc.handlers.size,0); assert.equal(h.jobs.size,0);
});
test('foreground transitions restack without focus or repeated style writes; a broken pair is recreated with live calls', () => {
  const h=harness(); h.loadRings(); h.publish([ring()]);
  const [body,buttons]=h.windows;
  const raises=body.raises, paints=body.webContents.sent.length, resizeCount=body.resizeCount;
  for(let i=0;i<60;i++) { h.main.emit('move'); h.main.emit('resize'); }
  h.tick(1000);assert.equal(body.raises,raises); assert.equal(body.webContents.sent.length,paints);assert.equal(body.resizeCount,resizeCount);
  h.main.emit('desktop-foreground'); assert.equal(body.raises,raises+1); assert.equal(h.main.focused,undefined);
  buttons.webContents.emit('render-process-gone',{},{reason:'crashed'}); assert.equal(body.destroyed,true);
  h.tick(250); h.loadRings(); const replacement=h.windows.at(-2);
  assert.equal(replacement.visible,true); assert.notEqual(replacement,body);
  assert.equal(replacement.webContents.sent.findLast(x=>x.channel==='chat-rings:state').state.rings[0].id,'r1');
  h.publish([]);h.tick(230); const stopped=replacement.raises;h.main.emit('desktop-foreground');assert.equal(replacement.raises,stopped);
  h.controller.destroy();assert.equal(h.jobs.size,0);
});
test('DND and unresolved status suppress without declining; multiple pages retain each invitation', () => {
  const h=harness();h.loadRings(); const [body,buttons]=h.windows;
  for(const flag of [{doNotDisturb:true},{statusReady:false}]) {h.publish([ring()],h.contents.mainFrame,flag);assert.equal(body.visible,false);}
  const rings=Array.from({length:12},(_,i)=>ring({id:'r'+i,roomId:'room'+i}));
  h.publish(rings);assert.equal(body.visible,true);
  const state=()=>body.webContents.sent.findLast(x=>x.channel==='chat-rings:state').state;
  const before=state();
  assert.ok(before.layout.pages>1);const event={sender:buttons.webContents,senderFrame:buttons.webContents.mainFrame};
  assert.equal(h.ipc.handlers.get('chat-rings:answer')(event,{action:'page',delta:1,revision:before.revision}),true);
  assert.notEqual(state().rings[0].id,before.rings[0].id); assert.equal(state().layout.page,1);
  h.ipc.emit('chat-notifications:policy',{sender:h.contents,senderFrame:h.contents.mainFrame},{statusReady:true,doNotDisturb:true});
  assert.equal(body.visible,false);assert.equal(buttons.visible,false);
  assert.equal(h.contents.sent.some(x=>x.channel==='chat-rings:command'),false);
  h.controller.destroy();
});

const ping = overrides => ({ id: 'p1', roomId: 'room1', messageKey: 'm1', roomName: 'Friends', username: 'Alex', preview: 'Hello there', roomIcon: 'data:image/png;base64,AA==', ...overrides });
test('ping and call stacks remain in disjoint screen regions even on small/multiple monitors', () => {
  for (const height of [240, 480, 720, 1040, 2160]) for (const count of [1, 3, 64]) {
    const display = { workArea: { x: -1600, y: -500, width: 1600, height } };
    const call = ringBounds(display, count), message = pingBounds(display, count, count);
    assert.ok(call.y + call.height + 12 <= message.y); assert.ok(message.y + message.height <= -500 + height);
  }
  assert.equal(normalizePing(ping({ doNotDisturb: true })).preview, '');
  assert.equal(normalizePing(ping({ messageKey: '' })), null);
});
test('pings honor push policy, expire independently, and DND hides every notification', () => {
  const h = harness(), ringWin = h.windows[0], win = h.windows[2];
  h.loadRings(); win.webContents.emit('did-finish-load');
  const event = { sender: h.contents, senderFrame: h.contents.mainFrame }, show = h.ipc.handlers.get('chat-pings:show');
  assert.equal(show(event, ping()), false);
  h.ipc.emit('chat-notifications:policy', event, { statusReady: true, pushEnabled: true, doNotDisturb: false });
  h.publish([ring()]); assert.equal(show(event, ping()), true); assert.equal(win.visible, true); assert.equal(h.main.focused, undefined);
  assert.equal(win.options.focusable, true, 'Windows must allow deliberate popup activation instead of eating the initiating click'); assert.equal(win.options.show, false); assert.equal(win.webContents.sent.at(-1).state.pings[0].preview, 'Hello there');
  h.tick(1000); show(event, ping({ id: 'p2', messageKey: 'm2' })); assert.equal(win.webContents.sent.at(-1).state.pings.length, 2);
  h.tick(2000); assert.deepEqual(win.webContents.sent.at(-1).state.pings.map(item => item.id), ['p2']); assert.equal(ringWin.visible, true);
  h.ipc.emit('chat-notifications:policy', event, { statusReady: true, pushEnabled: true, doNotDisturb: true });
  assert.equal(win.webContents.sent.at(-1).state.pings.length, 0); assert.equal(win.visible, false); assert.equal(ringWin.visible, false);
  assert.equal(show(event, ping({ id: 'dnd-blocked' })), false);
  h.tick(1000); assert.equal(win.webContents.sent.at(-1).state.pings.length, 0); h.tick(230); assert.equal(win.visible, false);
  h.controller.destroy(); assert.equal(h.jobs.size, 0);
});
test('ping click validates popup and message identity, focuses main only on open, and dismisses with a fade', () => {
  const h = harness(), win = h.windows[2]; win.webContents.emit('did-finish-load');
  const appEvent = { sender: h.contents, senderFrame: h.contents.mainFrame }, event = { sender: win.webContents, senderFrame: win.webContents.mainFrame };
  h.ipc.emit('chat-notifications:policy', appEvent, { statusReady: true, pushEnabled: true });
  const show = h.ipc.handlers.get('chat-pings:show'), command = h.ipc.handlers.get('chat-pings:command');
  show(appEvent, ping());
  assert.equal(win.ignoresMouse, false, 'first physical click is accepted without a mousemove/layout IPC round trip');
  assert.deepEqual(win.mouseModes, [false], 'ping input never toggles click-through between mouse down and up');
  assert.equal(command(appEvent, { ...ping(), action: 'open' }), false);
  assert.equal(command(event, { ...ping(), messageKey: 'wrong', action: 'open' }), false);
  assert.equal(command(event, { ...ping(), action: 'dismiss' }), true); assert.equal(h.main.focused, undefined); assert.equal(win.visible, true);
  h.tick(230); assert.equal(win.visible, false);
  show(appEvent, ping({ id: 'p2' })); assert.equal(command(event, { ...ping({ id: 'p2' }), action: 'open' }), true);
  assert.equal(h.main.focused, true); assert.equal(h.main.raised, true); assert.deepEqual(h.contents.sent.at(-1), { channel: 'chat-pings:command', state: { id: 'p2', roomId: 'room1', messageKey: 'm1' } });
  h.controller.destroy(); assert.equal(h.ipc.handlers.size, 0); assert.equal(h.jobs.size, 0);
});

test('Online delivers exact-room pings with the app focused and keeps them across focus changes', () => {
  const h = harness(), win = h.windows[2]; win.webContents.emit('did-finish-load');
  const event = { sender: h.contents, senderFrame: h.contents.mainFrame }, show = h.ipc.handlers.get('chat-pings:show');
  const policy = activeRoomId => h.ipc.emit('chat-notifications:policy', event, { statusReady: true, pushEnabled: true, activeRoomId });
  const ids = () => win.webContents.sent.findLast(item => item.channel === 'chat-pings:state').state.pings.map(item => item.id);
  policy('room1');
  assert.equal(show(event, ping()), true); assert.equal(win.visible, true);
  assert.deepEqual(ids(), ['p1']); assert.equal(h.main.focused, undefined);
  for (const name of ['blur', 'focus', 'show', 'restore']) h.main.emit(name);
  assert.deepEqual(ids(), ['p1'], 'focus and room selection do not consume the arrival');
  policy('room2'); assert.deepEqual(ids(), ['p1']);
  h.main.minimized = true; show(event, ping({ id: 'minimized', roomId: 'room2' }));
  assert.deepEqual(ids(), ['p1', 'minimized']); assert.equal(h.main.minimized, true);
  assert.equal(h.main.focused, undefined);
  h.controller.destroy(); assert.equal(h.jobs.size, 0);
});

test('pings stay top-right, recover renderer crashes, reassert z-order and deduplicate expired IDs', () => {
  const h = harness(), first = h.windows[2]; first.webContents.emit('did-finish-load');
  const event = { sender: h.contents, senderFrame: h.contents.mainFrame }, show = h.ipc.handlers.get('chat-pings:show');
  h.ipc.emit('chat-notifications:policy', event, { statusReady: true, pushEnabled: true });
  show(event, ping()); assert.equal(first.getBounds().y, 12);
  const raises = first.raises; h.tick(1000); assert.equal(first.raises, raises); h.main.emit('desktop-foreground'); assert.equal(first.raises, raises + 1);
  first.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
  assert.equal(first.destroyed, true); h.tick(250);
  const replacement = h.windows.at(-1); replacement.webContents.emit('did-finish-load');
  assert.equal(replacement.visible, true); assert.equal(replacement.webContents.sent.at(-1).state.pings[0].id, 'p1');
  assert.equal(h.main.focused, undefined);
  h.publish([ring()]); assert.ok(replacement.getBounds().y > 12, 'a simultaneous ring reserves the top-right first row');
  h.publish([]); assert.equal(replacement.getBounds().y, 12);
  h.tick(2000); h.tick(230); assert.equal(replacement.visible, false);
  show(event, ping()); assert.equal(replacement.visible, false, 'transport retry never replays an already displayed mention');
  const stopped = replacement.raises; h.tick(1000); assert.equal(replacement.raises, stopped);
  h.controller.destroy(); assert.equal(h.jobs.size, 0);
});

test('late thumbnail changes only the live matching ping and cannot replay it or extend its deadline', () => {
  const h=harness(),win=h.windows[2]; win.webContents.emit('did-finish-load');
  const event={sender:h.contents,senderFrame:h.contents.mainFrame};
  h.ipc.emit('chat-notifications:policy',event,{statusReady:true,pushEnabled:true});
  const show=h.ipc.handlers.get('chat-pings:show'), snapshot=()=>win.webContents.sent.at(-1).state.pings;
  show(event,ping({roomIcon:''})); h.tick(1000);
  show(event,ping({updatePhotoOnly:true,messageKey:'other'})); assert.equal(snapshot()[0].roomIcon,'');
  show(event,ping({updatePhotoOnly:true})); assert.equal(snapshot()[0].roomIcon,ping().roomIcon);
  h.tick(2001); h.tick(230); assert.equal(win.visible,false);
  show(event,ping({updatePhotoOnly:true})); assert.equal(win.visible,false); h.controller.destroy();
});
test('burst overflow retains older mentions after visible cards expire and every row keeps its message identity', () => {
  const h = harness(), win = h.windows[2]; win.webContents.emit('did-finish-load');
  const appEvent = { sender: h.contents, senderFrame: h.contents.mainFrame }, popupEvent = { sender: win.webContents, senderFrame: win.webContents.mainFrame };
  h.ipc.emit('chat-notifications:policy', appEvent, { statusReady: true, pushEnabled: true });
  const show = h.ipc.handlers.get('chat-pings:show'), command = h.ipc.handlers.get('chat-pings:command');
  for (let i = 0; i < 12; i++) show(appEvent, ping({ id: 'burst-' + i, messageKey: 'message-' + i }));
  const snapshot = () => win.webContents.sent.findLast(item => item.channel === 'chat-pings:state').state;
  assert.equal(snapshot().pings.length, 4); assert.equal(snapshot().earlier.length, 8);
  h.tick(3100); assert.equal(snapshot().pings.length, 0); assert.equal(snapshot().earlier.length, 8, 'overflow never expires unseen');
  const earlier = snapshot().earlier[0];
  assert.equal(command(popupEvent, { ...earlier, action: 'open', messageKey: 'wrong' }), false);
  assert.equal(command(popupEvent, { ...earlier, action: 'open' }), true);
  assert.deepEqual(h.contents.sent.at(-1).state, { id: earlier.id, roomId: earlier.roomId, messageKey: earlier.messageKey });
  assert.equal(snapshot().earlier.length, 7);
  h.controller.destroy(); assert.equal(h.jobs.size, 0);
});
