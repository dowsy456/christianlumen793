'use strict';
const path = require('node:path');
const { EXTRA_ICON_DATA } = require('./taskbar.cjs');

const MUSIC_ACTIONS = new Set(['play', 'pause', 'toggle', 'previous', 'next', 'stop', 'shuffle', 'repeat', 'volume', 'seek', 'open', 'jam', 'download-icon', 'copy-icon-address']);
const GUEST_ACTIONS = new Set(['volume', 'open', 'jam', 'download-icon', 'copy-icon-address']);
function musicModel(value, previous) {
  if (!value || typeof value !== 'object' || typeof value.trackId !== 'string' || !value.trackId.trim()) return null;
  const text = name => typeof value[name] === 'string' ? value[name].slice(0, 300) : '';
  const duration = Number.isFinite(value.duration) ? Math.max(0, Math.min(604800, value.duration)) : 0;
  const same = previous?.trackId === text('trackId');
  let photo = value.photoDataURL;
  if (photo === undefined && same) photo = previous.photoDataURL;
  if (typeof photo !== 'string' || photo.length > 8 * 1024 * 1024 || !/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(photo)) photo = '';
  const transform = value.photoTransform === undefined && same ? previous.photoTransform : value.photoTransform;
  const finite = (n, fallback, min, max) => Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  return { trackId: text('trackId'), title: text('title') || 'Music', artist: text('artist'), album: text('album'),
    photoDataURL: photo, photoTransform: { x: finite(transform?.x, 0, -100, 100), y: finite(transform?.y, 0, -100, 100), scale: finite(transform?.scale, 1, .2, 100) },
    guest: value.guest === true, loading: value.loading === true,
    standalone: value.standalone === true, jamDisabled: value.jamDisabled === true,
    jamState: ['shared', 'solo'].includes(value.jamState) ? value.jamState : 'none',
    jamPeople: value.jamState !== 'shared' ? [] : value.jamPeople === undefined && same ? previous.jamPeople : (Array.isArray(value.jamPeople) ? value.jamPeople.slice(0, 64) : []).map(person => ({
      displayName: String(person?.displayName || person?.code || '').slice(0, 160),
      avatar: typeof person?.avatar === 'string' && person.avatar.length <= 32768 && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(person.avatar) ? person.avatar : ''
    })).filter(person => person.displayName),
    playing: value.playing === true, blocked: value.blocked === true, shuffle: value.shuffle === true,
    repeat: ['all', 'one'].includes(value.repeat) ? value.repeat : 'off', duration,
    position: Number.isFinite(value.position) ? Math.max(0, Math.min(duration || 604800, value.position)) : 0,
    restoreVolume: 5 * Math.round(finite(value.restoreVolume, same && previous.volume > 0 ? previous.volume : same && previous.restoreVolume || 100, 5, 200) / 5),
    volume: 5 * Math.round(finite(value.volume, 100, 0, 200) / 5) };
}

function trayModel(state, music) {
  const active = !!(state?.active && state.roomId && state.sessionId), c = state?.controls || {};
  const controls = active ? [
    ['return', 'Return to Call', 'return'],
    ['mute', c.listenOnly ? 'Microphone unavailable' : c.muted ? 'Unmute' : 'Mute', c.muted || c.listenOnly ? 'mute-active' : 'mute', !!c.listenOnly],
    ['deafen', c.deafened ? 'Undeafen' : 'Deafen', c.deafened ? 'deafen-active' : 'deafen'],
    [c.sharing ? 'stop-share' : 'share', c.sharing ? 'Stop Sharing' : 'Screen Share', c.sharing ? 'share-active' : 'share', !!c.screenPending],
    ['camera', c.cameraSharing ? 'Stop Camera' : 'Camera', c.cameraSharing ? 'camera-active' : 'camera', !!c.cameraPending],
    ['overlay', state.enabled !== false ? 'Turn Off Call Overlay' : 'Turn On Call Overlay', state.enabled !== false ? 'overlay-active' : 'overlay'],
    ['leave', 'Leave Call', 'leave'],
  ].map(([action, label, icon, disabled]) => ({ action, label, icon, disabled: !!disabled })) : [];
  return { active, roomId: active ? state.roomId : '', sessionId: active ? state.sessionId : '', roomName: active ? String(state.roomName || 'Current call').slice(0, 200) : 'Chat App',
    status: active ? `${c.listenOnly ? 'Listen only' : c.muted ? 'Microphone muted' : 'Microphone on'} · ${c.sharing ? 'Screen sharing' : 'Screen off'}${c.cameraSharing ? ' · Camera on' : ''}` : '', controls, music: musicModel(music) };
}

function createCallTray({ BrowserWindow, screen, ipcMain, mainWindow, uiDir, getContents, showMainWindow, copyIconAddress, quit, log = () => {} }) {
  let state = null, music = null, win, ready = false, disposed = false, callSignature = '';
  let sentPhoto, sentPeople, musicUpdatedAt = 0;
  const model = () => ({ ...trayModel(state), music });
  const valid = event => !disposed && win && !win.isDestroyed() && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame;
  const preferredHeight = () => (model().active ? 520 : 204) + (music ? 160 : 0);
  function publish(opening = false) {
    if (!ready || !win || win.isDestroyed() || !opening && !win.isVisible()) return;
    if (win.isVisible()) {
      const bounds = win.getBounds(), area = screen.getDisplayMatching(bounds).workArea, height = Math.min(area.height, preferredHeight());
      if (height !== bounds.height) win.setBounds({ ...bounds, height, y: Math.max(area.y, Math.min(bounds.y + bounds.height - height, area.y + area.height - height)) });
    }
    const snapshot = model();
    if (music) {
      const elapsed = music.playing ? (Date.now() - musicUpdatedAt) / 1000 : 0;
      snapshot.music = { ...music, position: Math.min(music.duration || Infinity, music.position + elapsed) };
      if (music.photoDataURL === sentPhoto) delete snapshot.music.photoDataURL;
      if (music.jamPeople === sentPeople) delete snapshot.music.jamPeople;
    }
    sentPhoto = music?.photoDataURL;
    sentPeople = music?.jamPeople;
    win.webContents.send('chat-tray:state', { ...snapshot, extraIcons: EXTRA_ICON_DATA });
  }
  function update(value) { state = value; const next = JSON.stringify(trayModel(state)); if (next === callSignature) return; callSignature = next; publish(); }
  function updateMusic(value) { music = musicModel(value, music); musicUpdatedAt = Date.now(); publish(); }
  function close() { if (win && !win.isDestroyed()) win.hide(); }
  function open() {
    if (disposed || mainWindow.isDestroyed()) return;
    if (!win || win.isDestroyed()) {
      win = new BrowserWindow({ width: 320, height: 520, show: false, frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false, skipTaskbar: true, alwaysOnTop: true, resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
        webPreferences: { preload: path.join(uiDir, 'tray-preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, spellcheck: false } });
      win.setMenu(null); win.setAlwaysOnTop(true, 'pop-up-menu');
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      win.webContents.on('will-navigate', event => event.preventDefault());
      win.webContents.on('will-attach-webview', event => event.preventDefault());
      win.once('closed', () => { win = null; ready = false; sentPhoto = sentPeople = undefined; });
      win.on('blur', close);
      win.webContents.once('did-finish-load', () => { ready = true; open(); });
      win.loadFile(path.join(uiDir, 'tray.html')).catch(error => { log(`Tray menu failed: ${error.message}`); close(); });
      return;
    }
    if (!ready) return;
    const point = screen.getCursorScreenPoint(), area = screen.getDisplayNearestPoint(point).workArea;
    const height = Math.min(area.height, preferredHeight()), width = Math.min(320, area.width);
    win.setBounds({ x: Math.max(area.x, Math.min(point.x - width + 16, area.x + area.width - width)), y: Math.max(area.y, Math.min(point.y - height - 8, area.y + area.height - height)), width, height });
    publish(true); win.show(); win.focus();
  }
  const command = (event, value) => {
    if (!valid(event)) return false;
    const action = value?.action;
    if (action === 'close') { close(); return true; }
    if (action === 'open') { close(); showMainWindow(); return true; }
    if (action === 'quit') { close(); quit(); return true; }
    if (action === 'music') {
      const command = value?.command, wc = getContents();
      if (!music || value.trackId !== music.trackId || !MUSIC_ACTIONS.has(command) || !wc || wc.isDestroyed()) return false;
      if (music.guest && !GUEST_ACTIONS.has(command)) return false;
      if (command === 'jam' && music.jamDisabled) return false;
      if (music.standalone && ['shuffle', 'previous', 'next'].includes(command)) return false;
      if (music.blocked && ['play', 'toggle', 'previous', 'next'].includes(command)) return false;
      if (command === 'volume' && (!Number.isFinite(value.value) || value.value < 0 || value.value > 200 || value.value % 5)) return false;
      if (command === 'seek' && (music.loading || !music.duration || !Number.isFinite(value.value) || value.value < 0 || value.value > music.duration)) return false;
      if (['download-icon', 'copy-icon-address'].includes(command) && !music.photoDataURL) return false;
      if (command === 'copy-icon-address') { copyIconAddress(music.photoDataURL); return true; }
      if (command === 'open' || command === 'download-icon' || command === 'jam' || command === 'stop' && music.jamState !== 'none') { close(); showMainWindow(); }
      wc.send('chat-music:action', { action: command, trackId: music.trackId, ...(['volume', 'seek'].includes(command) ? { value: value.value } : {}) });
      return true;
    }
    const current = model(), control = current.controls.find(item => item.action === action);
    const wc = getContents();
    if (!current.active || !control || control.disabled || value.roomId !== current.roomId || value.sessionId !== current.sessionId || !wc || wc.isDestroyed()) return false;
    close();
    if (action === 'return' || action === 'share' || action === 'camera' && !state.controls?.cameraSharing) showMainWindow();
    wc.send('chat-call:command', { action, roomId: current.roomId, sessionId: current.sessionId });
    return true;
  };
  ipcMain.handle('chat-tray:command', command);
  function destroy() { if (disposed) return; disposed = true; ipcMain.removeHandler('chat-tray:command'); state = null; if (win && !win.isDestroyed()) win.destroy(); }
  mainWindow.once('closed', destroy);
  return { update, updateMusic, open, close, destroy };
}
module.exports = { createCallTray, trayModel, musicModel };
