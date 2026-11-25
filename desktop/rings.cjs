'use strict';
const path = require('node:path');
const { isAppURL } = require('./overlay.cjs');
const FADE_MS = 200;
function normalizeRings(value, now = Date.now()) {
  const rooms = new Set();
  return (Array.isArray(value?.rings) ? value.rings : []).slice(0, 64).flatMap(ring => {
    if (!ring || typeof ring.id !== 'string' || !ring.id || ring.id.length > 256 || typeof ring.roomId !== 'string' || !ring.roomId || ring.roomId.length > 256 || rooms.has(ring.roomId)) return [];
    const expiresAt = Number(ring.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > now + 31000) return [];
    rooms.add(ring.roomId);
    const image = typeof ring.roomIcon === 'string' ? ring.roomIcon : '';
    const finite = (number, fallback, low, high) => Number.isFinite(Number(number)) ? Math.min(high, Math.max(low, Number(number))) : fallback;
    return [{ id: ring.id, roomId: ring.roomId, roomName: String(ring.roomName || 'Room').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 180),
      roomIcon: image.length <= 10 * 1024 * 1024 && /^data:image\/(?:png|jpe?g|webp|gif|avif|svg\+xml)(?:;[a-z0-9=._-]+)*,/i.test(image) ? image : '',
      roomIconTransform: { x: finite(ring.roomIconTransform?.x, 0, -100, 100), y: finite(ring.roomIconTransform?.y, 0, -100, 100), scale: finite(ring.roomIconTransform?.scale, 1, .2, 100) }, expiresAt }];
  });
}
// The painted invitation and its buttons use separate Windows hit-test regions.
// The visual window always passes through; Windows routes a press directly to
// the shaped controls, including when the cursor was already on a new button.
function ringLayout(display, count, requestedPage = 0) {
  const area = display.workArea || display.bounds;
  const width = Math.min(358, area.width);
  const available = Math.max(1, Math.floor((area.height - 36) / 2));
  const step = Math.min(80, Math.max(36, available - 32));
  const pageSize = Math.max(1, Math.min(6, Math.floor((available - 6) / step)));
  const capacity = count > pageSize ? Math.max(1, Math.min(6, Math.floor((available - 34) / step))) : pageSize;
  const pages = Math.max(1, Math.ceil(count / capacity));
  const page = Math.max(0, Math.min(pages - 1, requestedPage));
  const rows = Math.min(capacity, count);
  const height = Math.max(1, Math.min(available, rows * step + (pages > 1 ? 34 : 6)));
  const bounds = { x: area.x + area.width - width - Math.min(12, Math.max(0, area.width - width)), y: area.y + 12, width, height };
  const controls = [];
  for (let row = 0; row < rows; row++) {
    const y = 4 + row * step + Math.max(0, Math.floor((step - 8 - 36) / 2));
    for (const x of [width - 92, width - 48]) controls.push({ x, y, width: 36, height: 36 });
  }
  if (pages > 1) {
    for (const x of [width - 84, width - 44]) controls.push({ x, y: rows * step + 3, width: 32, height: 26 });
  }
  return { bounds, step, capacity, pages, page, rows, controls };
}
function ringBounds(display, count) { return ringLayout(display, count).bounds; }
function sameBounds(a, b) { return a && ['x','y','width','height'].every(key => a[key] === b[key]); }

function createRingPopups({ BrowserWindow, screen, ipcMain, mainWindow, uiDir, timers = globalThis, now = Date.now, log = () => {} }) {
  let contents, body, buttons, disposed = false, navigating = false, rings = [], expiryTimer, hideTimer, hoverTimer, recoveryTimer;
  let bodyReady = false, buttonsReady = false, ack = -1, revision = 0, page = 0, lastLayout, painted, hovered = '', attempts = 0;
  let statusReady = false, doNotDisturb = false;
  const subscriptions = [], appSubscriptions = [];
  const listen = (emitter, name, fn, scope = subscriptions) => { emitter.on(name, fn); scope.push(() => emitter.removeListener(name, fn)); };
  const off = scope => { for (const remove of scope.splice(0)) remove(); };
  let foregroundDisplay;
  const display = () => screen.getAllDisplays?.().find(item => item.id === foregroundDisplay) ||
    screen.getDisplayNearestPoint?.(screen.getCursorScreenPoint()) || screen.getDisplayMatching(mainWindow.getBounds());
  const pings = createPingPopups({ BrowserWindow, screen, ipcMain, mainWindow, uiDir, timers, now, log, display });
  const validApp = e => !disposed && !navigating && contents && !contents.isDestroyed() && e.sender === contents && e.senderFrame === contents.mainFrame && isAppURL(e.senderFrame?.url) && isAppURL(contents.getURL());
  const validButtons = e => !disposed && buttons && !buttons.isDestroyed() && e.sender === buttons.webContents && e.senderFrame === buttons.webContents.mainFrame;
  const focused = () => !mainWindow.isDestroyed() && !mainWindow.isMinimized() && mainWindow.isFocused();
  const visibility = () => { if (contents && !contents.isDestroyed()) contents.send('chat-rings:visibility', { focused: focused() }); };
  function trackHover() {
    timers.clearTimeout(hoverTimer);
    if (!rings.length || !lastLayout || !bodyReady || !buttonsReady) return;
    const point = screen.getCursorScreenPoint();
    const { bounds, step, controls, page, capacity, rows } = lastLayout;
    const x = point.x - bounds.x, y = point.y - bounds.y, row = Math.floor((y - 4) / step);
    const button = controls.some(r => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height);
    const onCard = !button && x >= 4 && x < bounds.width - 4 && row >= 0 && row < rows && (y - 4) % step < step - 8;
    const id = onCard ? rings[page * capacity + row]?.id || '' : '';
    if (id !== hovered) { hovered = id; for (const win of [body, buttons]) win.webContents.send('chat-rings:hover', id); }
    // Only cosmetic feedback is sampled. No mouse event is captured, forwarded,
    // delayed or consumed, and the native input region never follows the mouse.
    hoverTimer = timers.setTimeout(trackHover, 100); hoverTimer?.unref?.();
  }
  function present(raise = false) {
    if (!rings.length || !bodyReady || !buttonsReady || ack !== revision) return;
    for (const win of [body, buttons]) {
      if (!win.isVisible()) { win.showInactive(); win.moveTop(); }
      else if (raise) win.moveTop();
    }
  }
  function closePair() {
    const old = [body, buttons]; body = buttons = null; bodyReady = buttonsReady = false; ack = -1; painted = lastLayout = null; hovered = '';
    timers.clearTimeout(hoverTimer);
    for (const win of old) if (win && !win.isDestroyed()) win.destroy();
  }
  function createPair() {
    const layout = ringLayout(display(), rings.length, page);
    for (const interactive of [false, true]) {
      const win = new BrowserWindow({ ...layout.bounds, title: interactive ? 'Chat App Call Buttons' : 'Chat App Incoming Calls',
        show: false, frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false, skipTaskbar: true,
        alwaysOnTop: true, focusable: interactive, acceptFirstMouse: true, resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false, roundedCorners: false,
        webPreferences: { preload: path.join(uiDir,'rings-preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, backgroundThrottling: false, spellcheck: false } });
      if (interactive) buttons = win; else body = win;
      win.setMenu(null); win.setAlwaysOnTop(true, 'screen-saver');
      win.setIgnoreMouseEvents(!interactive);
      const failed = reason => {
        if (disposed || win !== (interactive ? buttons : body)) return;
        log('Desktop call card interrupted: ' + reason);
        closePair(); timers.clearTimeout(recoveryTimer);
        if (rings.length && attempts++ < 3) recoveryTimer = timers.setTimeout(sync, 250);
      };
      win.webContents.setWindowOpenHandler(() => ({ action:'deny' }));
      for (const event of ['will-navigate','will-attach-webview']) win.webContents.on(event, e => e.preventDefault());
      win.webContents.on('render-process-gone', (_e, details) => failed(details?.reason));
      win.once('closed', () => failed('window closed'));
      win.webContents.once('did-finish-load', () => {
        if (disposed || win !== (interactive ? buttons : body)) return;
        if (interactive) buttonsReady = true; else bodyReady = true;
        sync();
      });
      win.loadFile(path.join(uiDir,'rings.html'), interactive ? { query:{ mode:'controls' } } : {}).catch(error => failed(error.message));
    }
  }
  function sync() {
    if (disposed) return;
    timers.clearTimeout(expiryTimer);
    const remaining = rings.filter(r => r.expiresAt > now());
    if (remaining.length !== rings.length) rings = remaining;
    pings.setRingCount(rings.length);
    if (rings.length) {
      expiryTimer = timers.setTimeout(sync, Math.max(1, Math.min(...rings.map(r => r.expiresAt)) - now())); expiryTimer?.unref?.();
    } else page = 0;
    if (!body || !buttons) { if (rings.length && attempts <= 3) createPair(); return; }
    if (!bodyReady || !buttonsReady) return;
    const layout = ringLayout(display(), rings.length, page);
    page = layout.page;
    const geometry = !sameBounds(lastLayout?.bounds, layout.bounds);
    if (geometry && rings.length) for (const win of [body, buttons]) win.setBounds(layout.bounds, false);
    const changed = painted !== rings || geometry || lastLayout?.page !== page || lastLayout?.step !== layout.step;
    if (changed) {
      timers.clearTimeout(hideTimer); timers.clearTimeout(hoverTimer);
      const visible = rings.slice(page * layout.capacity, (page + 1) * layout.capacity);
      const state = { rings:visible, layout, revision:++revision };
      lastLayout = layout; painted = rings; hovered = '';
      // An empty shape restores a full rectangular Windows input area. Hide the
      // controls instead whenever there are no target buttons.
      if (layout.controls.length) buttons.setShape(layout.controls);
      else buttons.hide();
      body.webContents.send('chat-rings:state', state);
      buttons.webContents.send('chat-rings:state', { ...state, rings:visible.map(({ id, roomId }) => ({ id, roomId })) });
      if (rings.length) trackHover();
      else hideTimer = timers.setTimeout(() => { if (!rings.length && body && !body.isDestroyed()) body.hide(); }, FADE_MS);
    }
    present();
  }
  function clear(immediate = false) {
    timers.clearTimeout(recoveryTimer); rings=[]; sync();
    if (immediate) for (const win of [body, buttons]) if (win && !win.isDestroyed()) win.hide();
  }
  function bindContents(next) {
    off(appSubscriptions); contents = next; navigating = false; statusReady = false; doNotDisturb = false; attempts = 0; clear(true);
    if (next && !body) createPair();
    pings.bindContents(next);
    if (!next) return;
    listen(next,'did-start-navigation', (_e,_url,inPlace,mainFrame) => { if (mainFrame && !inPlace) { navigating = true; clear(true); } },appSubscriptions);
    listen(next,'did-navigate', () => { navigating = false; visibility(); },appSubscriptions);
    listen(next,'render-process-gone', () => clear(true),appSubscriptions);
    listen(next,'destroyed', () => { contents = null; clear(true); },appSubscriptions);
  }
  function policy(value) {
    statusReady = value?.statusReady === true; doNotDisturb = value?.doNotDisturb === true;
    if ((!statusReady || doNotDisturb) && rings.length) clear(true);
  }
  listen(ipcMain,'chat-notifications:policy', (e,value) => { if (validApp(e)) policy(value); });
  listen(ipcMain,'chat-rings:publish', (e,value) => {
    if (!validApp(e)) return;
    policy(value); attempts = 0; rings = statusReady && !doNotDisturb ? normalizeRings(value,now()) : []; sync();
  });
  listen(ipcMain,'chat-rings:painted', (e,value) => { if (validButtons(e) && value === revision) { ack = value; present(); } });
  ipcMain.handle('chat-rings:get-visibility', e => ({ focused: !!(validApp(e) && focused()) }));
  function answer(e, cmd) {
    if (!validButtons(e) || ack !== revision || !contents || contents.isDestroyed() || navigating || !statusReady || doNotDisturb) return false;
    if (cmd?.action === 'page' && cmd.revision === revision && [-1,1].includes(cmd.delta)) { page += cmd.delta; sync(); return true; }
    if (!['join','decline'].includes(cmd?.action)) return false;
    const ring = rings.find(r => r.id === cmd.id && r.roomId === cmd.roomId && r.expiresAt > now());
    if (!ring) return false;
    contents.send('chat-rings:command', { action:cmd.action, id:ring.id, roomId:ring.roomId });
    if (cmd.action === 'join' && !mainWindow.isDestroyed()) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.moveTop(); mainWindow.focus(); contents.focus(); }
    return true;
  }
  ipcMain.handle('chat-rings:answer',answer);
  listen(ipcMain,'chat-rings:command',answer);
  for (const event of ['focus','blur','minimize','restore','show','hide']) listen(mainWindow,event,visibility);
  listen(mainWindow,'desktop-foreground', (_id, point) => {
    if (point) foregroundDisplay = screen.getDisplayNearestPoint?.(point)?.id;
    if (rings.length) { sync(); present(true); }
    pings.restorePresentation();
  });
  for (const event of ['display-added','display-removed','display-metrics-changed']) listen(screen,event, () => { if (rings.length) sync(); });
  listen(mainWindow,'closed',destroy);
  function destroy() {
    if (disposed) return; disposed = true; pings.destroy(); off(appSubscriptions); off(subscriptions);
    for (const timer of [expiryTimer,hideTimer,hoverTimer,recoveryTimer]) timers.clearTimeout(timer);
    ipcMain.removeHandler('chat-rings:get-visibility'); ipcMain.removeHandler('chat-rings:answer');
    contents = null; rings=[]; closePair();
  }
  return {bindContents, clear, destroy};
}
function normalizePing(value) {
  if (!value || ['id', 'roomId', 'messageKey'].some(key => typeof value[key] !== 'string' || !value[key] || value[key].length > 256)) return null;
  const clean = (value, length) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, length);
  const metadata = normalizeRings({ rings: [{ ...value, expiresAt: 1000 }] }, 0)[0];
  if (!metadata) return null;
  return { id: value.id, roomId: value.roomId, messageKey: value.messageKey, roomName: metadata.roomName,
    roomIcon: metadata.roomIcon, roomIconTransform: metadata.roomIconTransform,
    username: clean(value.username || 'Someone', 180), preview: value.doNotDisturb === true ? '' : clean(value.preview, 500),
    doNotDisturb: value.doNotDisturb === true };
}
function pingBounds(display, count, ringCount = 0) {
  const area = display.workArea || display.bounds;
  const width = Math.min(350, area.width), height = Math.max(1, Math.min(Math.max(1, count) * 108 + 12, Math.floor((area.height - 36) / 2)));
  const offset = ringCount ? ringBounds(display, ringCount).height + 12 : 0;
  return { x: area.x + area.width - width - Math.min(12, Math.max(0, area.width - width)), y: area.y + 12 + offset, width, height };
}
function pingVisibleCapacity(display) {
  const area = display.workArea || display.bounds;
  return Math.max(1, Math.min(4, Math.floor((Math.floor((area.height - 36) / 2) - 56) / 108)));
}
function createPingPopups({ BrowserWindow, screen, ipcMain, mainWindow, uiDir, timers, now, log, display }) {
  let contents = null, win = null, ready = false, disposed = false, navigating = false, items = [];
  let statusReady = false, pushEnabled = false, doNotDisturb = false, timer, hideTimer, geometryTimer;
  let ringCount = 0, topTimer = null, recoveryTimer = null, recoveryAttempts = 0;
  const seenIds = new Map();
  let requestedBounds, paintedItems, layoutCount = 0;
  let contentSubscriptions = []; const subscriptions = [];
  const listen = (emitter, event, callback, list = subscriptions) => { emitter.on(event, callback); list.push(() => emitter.removeListener(event, callback)); };
  const validApp = event => !disposed && !navigating && contents && !contents.isDestroyed() && event.sender === contents && event.senderFrame === contents.mainFrame && isAppURL(contents.getURL()) && isAppURL(event.senderFrame?.url);
  const validPopup = event => !disposed && win && !win.isDestroyed() && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame;
  function keepOnTop(raise = false) {
    if (disposed || !ready || !win || win.isDestroyed() || !items.length) return;
    if (!win.isVisible()) { win.showInactive(); win.moveTop(); }
    else if (raise === true) win.moveTop();
  }
  function recoverWindow(created, error) {
    if (win !== created || disposed) return;
    log(`Ping UI interrupted: ${error || 'renderer exited'}`);
    ready = false;
    // An interrupted popup gets its remaining visible time after recovery.
    items = items.map(item => item.earlier ? item : { ...item, remainingMs: Math.max(1, (item.expiresAt || now() + 3000) - now()), expiresAt: 0 });
    if (!created.isDestroyed()) created.destroy();
    timers.clearTimeout(topTimer); topTimer = null;
    if (items.length && recoveryAttempts++ < 3 && !recoveryTimer) {
      recoveryTimer = timers.setTimeout(() => { recoveryTimer = null; sync(); }, 250);
      recoveryTimer?.unref?.();
    }
  }
  function fit() {
    if (!win || win.isDestroyed()) return;
    const target = pingBounds(display(), layoutCount, ringCount);
    if (!requestedBounds || ['x', 'y', 'width', 'height'].some(key => requestedBounds[key] !== target[key])) { requestedBounds = target; win.setBounds(target, false); }
  }
  function createWindow() {
    requestedBounds = pingBounds(display(), items.length, ringCount); paintedItems = null;
    win = new BrowserWindow({ ...requestedBounds, title: 'Chat App Pings', show: false, frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false, skipTaskbar: true, alwaysOnTop: true, focusable: true, acceptFirstMouse: true, resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
      webPreferences: { preload: path.join(uiDir, 'rings-preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, backgroundThrottling: false, spellcheck: false } });
    const created = win; created.setMenu(null); created.setAlwaysOnTop(true, 'screen-saver');
    // Every part of a ping is clickable. Keep its small surface interactive
    // from the first frame; polling a click-through window can lose the first
    // press before Windows delivers a forwarded mousemove or layout update.
    // Chromium on Windows eats WM_MOUSEACTIVATE's initiating click when its
    // TYPE_WINDOW cannot activate. Allow user activation, while showInactive
    // prevents arrival itself from stealing focus from a game or another app.
    created.setIgnoreMouseEvents(false);
    created.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); created.webContents.on('will-navigate', event => event.preventDefault()); created.webContents.on('will-attach-webview', event => event.preventDefault());
    created.webContents.once('did-finish-load', () => { if (win === created) { ready = true; sync(); } });
    created.webContents.on('render-process-gone', (_event, details) => recoverWindow(created, details?.reason));
    created.once('closed', () => { if (win === created) { win = null; ready = false; } });
    created.loadFile(path.join(uiDir, 'rings.html'), { query: { mode: 'pings' } }).catch(error => recoverWindow(created, error.message));
  }
  function sync() {
    if (disposed) return;
    timers.clearTimeout(timer); timers.clearTimeout(hideTimer);
    const remaining = items.filter(item => !item.expiresAt || item.expiresAt > now());
    if (remaining.length !== items.length) items = remaining;
    // Overflow is retained until deliberately visited/dismissed. A three-second
    // timer must never expire a mention that was hidden below the native surface.
    const capacity = pingVisibleCapacity(display());
    const live = items.filter(item => !item.earlier);
    if (live.length > capacity) {
      const collapsed = new Set(live.slice(0, live.length - capacity));
      items = items.map(item => collapsed.has(item) ? { ...item, earlier: true, expiresAt: 0 } : item);
    }
    if (!win || win.isDestroyed()) { if (items.length) createWindow(); return; }
    if (ready) {
      // Start the lifetime only when the card can actually be displayed.
      if (items.some(item => !item.earlier && !item.expiresAt)) items = items.map(item => item.earlier || item.expiresAt ? item : { ...item, expiresAt: now() + (item.remainingMs || 3000) });
      if (paintedItems !== items) { paintedItems = items; win.webContents.send('chat-pings:state', { pings: items.filter(item => !item.earlier), earlier: items.filter(item => item.earlier) }); }
    }
    if (items.length) {
      const expiring = items.filter(item => !item.earlier && item.expiresAt);
      if (ready && expiring.length) { timer = timers.setTimeout(sync, Math.max(1, Math.min(...expiring.map(item => item.expiresAt)) - now())); timer?.unref?.(); }
      if (items.length >= layoutCount) { timers.clearTimeout(geometryTimer); geometryTimer = null; layoutCount = items.length; }
      else if (!geometryTimer) geometryTimer = timers.setTimeout(() => { geometryTimer = null; layoutCount = items.length; if (items.length) fit(); }, FADE_MS + 30);
      fit(); if (ready) keepOnTop();
    } else {
      timers.clearTimeout(topTimer); topTimer = null;
      hideTimer = timers.setTimeout(() => { if (!items.length && win && !win.isDestroyed()) win.hide(); }, FADE_MS + 30);
    }
  }
  function clear(immediate = false) {
    timers.clearTimeout(recoveryTimer); recoveryTimer = null;
    items = []; sync();
    if (immediate && win && !win.isDestroyed()) { timers.clearTimeout(hideTimer); timers.clearTimeout(geometryTimer); geometryTimer = null; layoutCount = 0; win.hide(); }
  }
  function bindContents(next) {
    for (const off of contentSubscriptions) off(); contentSubscriptions = [];
    contents = next; navigating = false; statusReady = false; pushEnabled = false; doNotDisturb = false; seenIds.clear(); clear(true);
    if (!contents) return;
    if (!win || win.isDestroyed()) createWindow();
    listen(contents, 'did-start-navigation', (_event, _url, inPlace, mainFrame) => { if (mainFrame && !inPlace) { navigating = true; clear(true); } }, contentSubscriptions);
    listen(contents, 'did-navigate', () => { navigating = false; }, contentSubscriptions);
    listen(contents, 'render-process-gone', () => clear(true), contentSubscriptions);
    listen(contents, 'destroyed', () => { contents = null; clear(true); }, contentSubscriptions);
  }
  listen(ipcMain, 'chat-notifications:policy', (event, policy) => {
    if (!validApp(event)) return;
    statusReady = policy?.statusReady === true; pushEnabled = policy?.pushEnabled === true; doNotDisturb = policy?.doNotDisturb === true;
    if (!statusReady || !pushEnabled || doNotDisturb) clear(true);
    if (!statusReady) seenIds.clear();
  });
  ipcMain.handle('chat-pings:show', (event, value) => {
    if (!validApp(event) || !statusReady || !pushEnabled || doNotDisturb || value?.doNotDisturb === true) return false;
    const ping = normalizePing(value);
    if (!ping) return false;
    if (value.updatePhotoOnly === true) {
      const index = items.findIndex(item => item.id === ping.id && item.roomId === ping.roomId && item.messageKey === ping.messageKey);
      if (index >= 0 && ping.roomIcon.length <= 64 * 1024 && items[index].roomIcon !== ping.roomIcon) {
        items = items.map((item, i) => i === index ? { ...item, roomIcon:ping.roomIcon } : item); sync();
      }
      return true;
    }
    // An inbox event and its message may be delivered independently, or the
    // renderer may retry an interrupted acknowledgement. Never replay either.
    for (const [id, expiry] of seenIds) if (expiry <= now()) seenIds.delete(id);
    if (seenIds.has(ping.id)) return true;
    seenIds.set(ping.id, now() + 24 * 60 * 60 * 1000);
    if (seenIds.size > 4096) seenIds.delete(seenIds.keys().next().value);
    recoveryAttempts = 0;
    items = [...items, ping]; sync(); return true;
  });
  ipcMain.handle('chat-pings:command', (event, command) => {
    if (!validPopup(event) || !contents || contents.isDestroyed() || navigating || !['open', 'dismiss'].includes(command?.action)) return false;
    const ping = items.find(item => item.id === command.id && item.roomId === command.roomId && item.messageKey === command.messageKey && (!item.expiresAt || item.expiresAt > now()));
    if (!ping) return false;
    items = items.filter(item => item !== ping); sync();
    if (command.action === 'open') {
      contents.send('chat-pings:command', { id: ping.id, roomId: ping.roomId, messageKey: ping.messageKey });
      if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.moveTop(); mainWindow.focus(); contents.focus();
    }
    return true;
  });
  for (const event of ['focus', 'blur', 'show', 'restore']) listen(mainWindow, event, keepOnTop);
  for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) listen(screen, event, fit);
  function destroy() {
    if (disposed) return; disposed = true;
    for (const id of [timer, hideTimer, geometryTimer, topTimer, recoveryTimer]) timers.clearTimeout(id);
    for (const off of [...subscriptions, ...contentSubscriptions]) off();
    ipcMain.removeHandler('chat-pings:show'); ipcMain.removeHandler('chat-pings:command'); contents = null; items = [];
    if (win && !win.isDestroyed()) win.destroy(); win = null;
  }
  return { bindContents, clear, destroy, restorePresentation() { if (items.length) { sync(); keepOnTop(true); } }, setRingCount(value) { if (ringCount !== value) { ringCount = value; fit(); } } };
}
const presentationHelper = path.join(__dirname.replace(/([\\/])app\.asar(?=[\\/]|$)/i, '$1app.asar.unpacked'), 'helpers', 'desktop-presentation.exe');
function observeDesktop(mainWindow, screen, log = () => {}) {
  if (process.platform !== 'win32') return;
  const { spawn } = require('node:child_process');
  let child, retry, stopped = false, attempts = 0;
  function start() {
    if (stopped) return;
    const process = spawn(presentationHelper, ['--foreground'], { windowsHide:true, stdio:['pipe','pipe','ignore'] });
    child = process; let previous = '', buffer = '';
    process.stdout.setEncoding('utf8');
    process.stdout.on('data', data => {
      buffer += data; let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0,index).trim(); buffer=buffer.slice(index+1);
        if (line === previous || !/^\d+ -?\d+ -?\d+$/.test(line)) continue;
        previous=line;
        const [id,x,y] = line.split(' '); const point=screen.screenToDipPoint({ x:Number(x),y:Number(y) });
        if (!stopped && !mainWindow.isDestroyed()) mainWindow.emit('desktop-foreground',id,point);
      }
    });
    process.on('error', error => log('Desktop foreground observer: '+error.message));
    process.on('close', () => {
      if (process !== child || stopped) return;
      child=null;
      if (++attempts <= 3) { retry=setTimeout(start,2000); retry.unref(); }
    });
  }
  start();
  mainWindow.once('closed', () => { stopped=true; clearTimeout(retry); if (child) child.stdin.end(); });
}
module.exports = { observeDesktop, presentationHelper, createRingPopups, normalizeRings, ringBounds, ringLayout, normalizePing, pingBounds, pingVisibleCapacity };
