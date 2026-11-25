'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { musicModel, trayModel, createCallTray } = require('../tray.cjs');

test('music state is bounded and remains independent of call controls', () => {
  assert.equal(musicModel(null), null); assert.equal(musicModel({ trackId: '' }), null);
  const value = musicModel({ trackId: 'song', title: 'A'.repeat(600), volume: 999, position: 300, duration: 100, repeat: 'bad', playing: 1 });
  assert.equal(value.title.length, 300); assert.equal(value.volume, 200); assert.equal(value.position, 100); assert.equal(value.repeat, 'off'); assert.equal(value.playing, false);
  assert.equal(musicModel({ trackId: 'song', volume: NaN }).volume, 100);
  const both = trayModel({ active: true, roomId: 'room', sessionId: 'call', controls: { muted: true } }, { trackId: 'song', playing: true });
  assert.equal(both.active, true); assert.equal(both.music.playing, true); assert.equal(both.controls.find(x => x.action === 'mute').label, 'Unmute');
});

function fixture() {
  let window; const handlers = new Map(), sent = [], copied = [];
  class BrowserWindow extends EventEmitter {
    constructor() { super(); window = this; this.webContents = new EventEmitter(); this.webContents.mainFrame = {}; this.webContents.setWindowOpenHandler = () => {}; this.webContents.send = () => {}; }
    isDestroyed() { return false; } setMenu() {} setAlwaysOnTop() {} loadFile() { return Promise.resolve(); } hide() {} destroy() {}
  }
  const wc = { isDestroyed: () => false, send: (channel, value) => sent.push({ channel, value }) };
  const main = new EventEmitter(); main.isDestroyed = () => false;
  const tray = createCallTray({ BrowserWindow, screen: {}, ipcMain: { handle: (name, callback) => handlers.set(name, callback), removeHandler: name => handlers.delete(name) }, mainWindow: main, uiDir: '.', getContents: () => wc, showMainWindow() {}, copyIconAddress: value => copied.push(value), quit() {} });
  tray.open();
  return { tray, sent, copied, invoke: (value, trusted = true) => handlers.get('chat-tray:command')({ sender: trusted ? window.webContents : {}, senderFrame: window.webContents.mainFrame }, value) };
}

test('tray forwards only current validated music commands from its own renderer', () => {
  const f = fixture(); f.tray.updateMusic({ trackId: 'song', title: 'Track' });
  for (const command of ['play', 'pause', 'toggle', 'previous', 'next', 'stop', 'shuffle', 'repeat', 'open']) assert.equal(f.invoke({ action: 'music', trackId: 'song', command }), true);
  assert.equal(f.sent.length, 9); assert.equal(f.sent[0].channel, 'chat-music:action');
  assert.equal(f.invoke({ action: 'music', trackId: 'old', command: 'next' }), false);
  assert.equal(f.invoke({ action: 'music', trackId: 'song', command: 'next' }, false), false);
  assert.equal(f.invoke({ action: 'music', trackId: 'song', command: 'eval' }), false);
  for (const value of [-1, 201, 103, NaN, Infinity, '100']) assert.equal(f.invoke({ action: 'music', trackId: 'song', command: 'volume', value }), false);
  for (const value of [0, 100, 200]) assert.equal(f.invoke({ action: 'music', trackId: 'song', command: 'volume', value }), true);
  assert.deepEqual(f.sent.at(-1).value, { action: 'volume', trackId: 'song', value: 200 });
  f.tray.updateMusic(null); assert.equal(f.invoke({ action: 'music', trackId: 'song', command: 'play' }), false);
});

test('tray Return and Leave target the call that supplied the button', () => {
  const f = fixture(), active = { active: true, roomId: 'test', sessionId: 'first' };
  f.tray.update(active);
  for (const action of ['return', 'leave']) {
    const command = { action, roomId: 'test', sessionId: 'first' };
    assert.equal(f.invoke(command, false), false);
    assert.equal(f.invoke({ ...command, sessionId: 'old' }), false);
    assert.equal(f.invoke(command), true);
    assert.deepEqual(f.sent.at(-1), { channel: 'chat-call:command', value: command });
  }
  f.tray.update(null);
  assert.equal(f.invoke({ action: 'leave', roomId: 'test', sessionId: 'first' }), false);
});

test('seek, artwork operations and Jam controls respect current playback and image state', () => {
  const f = fixture(), photo = 'data:image/png;base64,aW1hZ2U=';
  const set = fields => f.tray.updateMusic({ trackId: 'song', duration: 180, ...fields });
  const act = (command, value) => f.invoke({ action: 'music', trackId: 'song', command, value });
  set({ photoDataURL: photo });
  set({ position: 10 }); // Sparse progress updates retain the original uploaded bytes.
  assert.equal(act('copy-icon-address'), true); assert.deepEqual(f.copied, [photo]);
  for (const value of [-1, 180.1, NaN, Infinity, '65']) assert.equal(act('seek', value), false);
  assert.equal(act('seek', 78.5), true); assert.equal(f.sent.at(-1).value.value, 78.5);
  set({ guest: true });
  for (const action of ['seek', 'play', 'previous', 'next', 'toggle', 'stop', 'shuffle', 'repeat']) assert.equal(act(action, 5), false);
  assert.equal(act('volume', 5), true);
  assert.equal(act('jam'), true); assert.equal(act('download-icon'), true);
  set({ standalone: true, jamDisabled: true });
  for (const action of ['previous', 'next', 'shuffle', 'jam']) assert.equal(act(action), false);
  assert.equal(act('repeat'), true);
  set({ photoDataURL: '', loading: true });
  assert.equal(act('seek', 10), false); assert.equal(act('copy-icon-address'), false);
  assert.equal(musicModel({ trackId: 'different' }, { trackId: 'song', photoDataURL: photo }).photoDataURL, '');
  assert.equal(musicModel({ trackId: 'song', photoDataURL: 'file:///C:/local.png' }).photoDataURL, '');
});

test('Spotify blocking cannot be bypassed from tray and does not block volume or stopping', () => {
  const f = fixture(); f.tray.updateMusic({ trackId: 'song', blocked: true });
  for (const command of ['play', 'toggle', 'previous', 'next']) assert.equal(f.invoke({ action: 'music', trackId: 'song', command }), false);
  for (const command of ['pause', 'stop', 'open', 'shuffle', 'repeat']) assert.equal(f.invoke({ action: 'music', trackId: 'song', command }), true);
});
