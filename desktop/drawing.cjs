'use strict';
// Only this fixed, locally built helper observes held middle-button drags. It starts on a
// committed screen share and dies on stop, navigation, renderer loss or exit.
const path = require('node:path');
const { spawn } = require('node:child_process');
function helperLocation(root = __dirname) {
  // spawn cannot execute an ASAR member, even when Electron marks it unpacked.
  // Use the actual packaged file, as the other fixed native helpers do.
  const unpacked = root.replace(/([\\/])app\.asar(?=[\\/]|$)/i, '$1app.asar.unpacked');
  return path.join(unpacked, 'helpers', 'screen-drawing-helper.exe');
}
function normalizeStroke(value, shareId, sourceId, activationId) {
  if (!value || !['start', 'points', 'end'].includes(value.phase) || typeof value.id !== 'string' || value.id.length > 80) return null;
  const points = Array.isArray(value.points) ? value.points.slice(0, 128).filter(p => Array.isArray(p) && p.length === 2 && p.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1)) : [];
  if (value.phase !== 'end' && !points.length) return null;
  return { shareId, ...(sourceId ? { sourceId } : {}), ...(activationId !== undefined ? { activationId } : {}), id: value.id, phase: value.phase, points, at: Date.now() };
}
function createScreenDrawing({ ipcMain, screen, getCaptureSources, log = () => {}, spawnImpl = spawn, platform = process.platform }) {
  let contents = null, helper = null, generation = 0, requestSerial = 0, shareId = '', sourceId = '', call = null, disposed = false, removers = [];
  let committed = null, helperReady = false, geometryDirty = false, geometryTimer = null, starting = null;
  const valid = event => !disposed && contents && !contents.isDestroyed() && event.sender === contents && event.senderFrame === contents.mainFrame && /^chatapp:\/\/app\//.test(contents.getURL());
  function stop() { generation++; shareId = ''; sourceId = ''; committed = null; helperReady = false; geometryDirty = false; starting = null; clearTimeout(geometryTimer); geometryTimer = null; if (helper) { const old = helper; helper = null; old.stdin?.end(); old.kill(); } }
  function updateCall(state) { call = state; if (!state?.active || !state.controls?.sharing || state.enabled === false) { requestSerial++; stop(); } }
  function bindContents(next) {
    requestSerial++; stop(); for (const off of removers) off(); removers = []; contents = next; call = null;
    if (!next) return;
    for (const event of ['render-process-gone', 'destroyed']) { const fn = () => { requestSerial++; stop(); }; next.on(event, fn); removers.push(() => next.removeListener(event, fn)); }
    const navigation = (_event, _url, inPlace, mainFrame) => { if (mainFrame && !inPlace) { requestSerial++; stop(); } }; next.on('did-start-navigation', navigation); removers.push(() => next.removeListener('did-start-navigation', navigation));
  }
  async function setSource(event, value) {
    if (!valid(event)) return false;
    requestSerial++;
    if (value?.active !== true) { stop(); return true; }
    if (platform !== 'win32' || typeof value.shareId !== 'string' || !value.shareId || value.shareId.length > 256 || typeof value.sourceId !== 'string') return false;
    const activationId = value.activationId;
    if (activationId !== undefined && (!Number.isSafeInteger(activationId) || activationId < 1)) return false;
    if (!call?.active || !call.controls?.sharing || value.roomId !== call.roomId || value.sessionId !== call.sessionId) return false;
    // A source request can race the overlay preference update. Treat disabled
    // overlay as a handled suspension; never start a hook or report a failure.
    if (call.enabled === false) { stop(); return true; }
    if (helper && shareId === value.shareId && sourceId === value.sourceId && committed?.value.activationId === activationId) return starting || true;
    // The web capture is already committed. Never leave an old-source input
    // helper alive when a new-source activation cannot proceed.
    stop();
    const selected = getCaptureSources().find(item => item.id === value.sourceId); if (!selected) return false;
    const args = ['--source', value.sourceId];
    if (selected.id.startsWith('screen:')) {
      const display = screen.getAllDisplays().find(item => String(item.id) === String(selected.display_id)); if (!display) return false;
      const physical = screen.dipToScreenRect ? screen.dipToScreenRect(null, display.bounds) : { x: display.bounds.x * display.scaleFactor, y: display.bounds.y * display.scaleFactor, width: display.bounds.width * display.scaleFactor, height: display.bounds.height * display.scaleFactor };
      args.push('--rect', [physical.x, physical.y, physical.width, physical.height].map(Math.round).join(','));
    } else if (!/^window:\d+:\d+$/.test(selected.id)) return false;
    shareId = value.shareId; sourceId = value.sourceId;
    const activation = activationId !== undefined ? { activationId } : {};
    committed = { event: { sender: contents, senderFrame: contents.mainFrame }, value: { active: true, sourceId, shareId, ...activation, roomId: value.roomId, sessionId: value.sessionId } };
    const current = generation, currentContents = contents, currentShare = shareId;
    const startup = new Promise(resolve => {
      let settled = false, started = false, buffer = '';
      const finish = value => { if (!settled) { settled = true; clearTimeout(timeout); if (current === generation) starting = null; resolve(value); } };
      const child = spawnImpl(helperLocation(), args, { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] }); helper = child;
      const timeout = setTimeout(() => { if (helper === child) stop(); finish(false); }, 30000); timeout.unref?.();
      child.stdout.on('data', bytes => {
        if (current !== generation || contents !== currentContents) return;
        buffer += bytes.toString('utf8');
        let index;
        while ((index = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
          if (line.length > 65536) { stop(); finish(false); return; }
          let data; try { data = JSON.parse(line); } catch { continue; }
          if (data.ready === true) { started = true; helperReady = true; finish(true); if (geometryDirty) geometryChanged(); continue; }
          const stroke = normalizeStroke(data, currentShare, value.sourceId, activationId); if (stroke && !currentContents.isDestroyed()) currentContents.send('chat-drawing:stroke', stroke);
        }
        if (buffer.length > 65536) { stop(); finish(false); }
      });
      child.stderr.on('data', bytes => log('Screen indicators: ' + bytes.toString('utf8').slice(0, 500)));
      child.once('error', error => { log(`Screen indicators unavailable: ${error.message}`); if (helper === child) stop(); finish(false); });
      child.once('exit', () => { if (helper === child) {
        if (started && current === generation && contents === currentContents && !currentContents.isDestroyed()) currentContents.send('chat-drawing:stroke', { shareId: currentShare, sourceId: value.sourceId, ...activation, phase: 'error', message: 'Screen drawing stopped. Stop and restart sharing to retry.' });
        helper = null; shareId = ''; sourceId = ''; committed = null; helperReady = false;
      } finish(false); });
    });
    starting = startup; return startup;
  }
  function geometryChanged() {
    if (disposed || !helper || !committed) return;
    if (!helperReady) { geometryDirty = true; return; }
    clearTimeout(geometryTimer);
    geometryTimer = setTimeout(async () => {
      geometryTimer = null;
      const previous = committed, owner = contents;
      if (!previous || !valid(previous.event)) return;
      const activation = previous.value.activationId !== undefined ? { activationId: previous.value.activationId } : {};
      owner.send('chat-drawing:stroke', { shareId: previous.value.shareId, sourceId: previous.value.sourceId, ...activation, phase: 'reset' });
      stop();
      const pending = setSource(previous.event, previous.value), serial = requestSerial;
      let ready = false; try { ready = await pending; } catch {}
      if (!ready && requestSerial === serial && contents === owner && !owner.isDestroyed() && call?.active && call.controls?.sharing) owner.send('chat-drawing:stroke', { shareId: previous.value.shareId, sourceId: previous.value.sourceId, ...activation, phase: 'error', message: 'Screen drawing could not follow the display change. Stop and restart sharing to retry.' });
    }, 80); geometryTimer.unref?.();
  }
  for (const event of ['display-metrics-changed', 'display-added', 'display-removed']) screen.on?.(event, geometryChanged);
  ipcMain.handle('chat-drawing:source', setSource);
  function destroy() { if (disposed) return; disposed = true; bindContents(null); for (const event of ['display-metrics-changed', 'display-added', 'display-removed']) screen.removeListener?.(event, geometryChanged); ipcMain.removeHandler('chat-drawing:source'); }
  return { bindContents, updateCall, destroy, stop };
}
module.exports = { createScreenDrawing, normalizeStroke, helperLocation };
