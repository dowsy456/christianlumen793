'use strict';
// The downloaded portable launcher is the update target. Windows may otherwise
// pin its extracted Electron child, which cannot discover that target on launch.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const APP_ID = 'app.chatapp.desktop';
const MARKER = 'native-launch.json';
function samePath(a, b) { return !!a && !!b && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase(); }
function isRuntimeExecutable(file, runtimeRoot) {
  if (!file || !runtimeRoot || !path.isAbsolute(file)) return false;
  const relative = path.relative(path.resolve(runtimeRoot), path.resolve(file)).split(path.sep);
  return relative.length === 2 && /^[a-f0-9]{64}$/i.test(relative[0]) && /^Chat App\.exe$/i.test(relative[1]);
}
function portableLocation(file, runtimeRoot, execPath) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || !/\.exe$/i.test(file) || /[\0\r\n"]/.test(file) || /^\\\\/.test(file) || samePath(file, execPath) || isRuntimeExecutable(file, runtimeRoot)) return '';
  return path.resolve(file);
}
function validPortable(file, runtimeRoot, execPath) {
  const location = portableLocation(file, runtimeRoot, execPath);
  if (!location) return '';
  try { const info = fs.lstatSync(location); return info.isFile() && !info.isSymbolicLink() ? location : ''; } catch { return ''; }
}
// Read only the PE headers and bounded VERSIONINFO resource, never the embedded
// application payload. This is shortcut ownership detection, not update trust;
// publisher signature/hash verification remains exclusively in native-updater.
function readNativeIdentity(file) {
  let descriptor;
  try {
    if (!portableLocation(file, '', '')) return null;
    const info = fs.lstatSync(file);
    if (!info.isFile() || info.isSymbolicLink()) return null;
    descriptor = fs.openSync(file, 'r');
    const read = (offset, size) => {
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0 || offset + size > info.size) throw new Error('Invalid PE range.');
      const bytes = Buffer.alloc(size);
      if (fs.readSync(descriptor, bytes, 0, size, offset) !== size) throw new Error('Truncated PE.');
      return bytes;
    };
    const dos = read(0, 64), peOffset = dos.readUInt32LE(60);
    if (dos.readUInt16LE(0) !== 0x5a4d || peOffset < 64 || peOffset > 1024 * 1024) return null;
    const pe = read(peOffset, 24), sectionCount = pe.readUInt16LE(6), optionalSize = pe.readUInt16LE(20);
    if (pe.readUInt32LE(0) !== 0x4550 || sectionCount < 1 || sectionCount > 96 || optionalSize < 120 || optionalSize > 4096) return null;
    const optional = read(peOffset + 24, optionalSize), magic = optional.readUInt16LE(0);
    const directory = magic === 0x20b ? 112 : magic === 0x10b ? 96 : -1;
    if (directory < 0 || directory + 24 > optional.length || optional.readUInt32LE(directory - 4) < 3) return null;
    const resourceRVA = optional.readUInt32LE(directory + 16), resourceSize = optional.readUInt32LE(directory + 20);
    if (!resourceRVA || resourceSize < 16 || resourceSize > 2 * 1024 * 1024) return null;
    const sections = read(peOffset + 24 + optionalSize, sectionCount * 40);
    const fileOffset = (rva, size) => {
      for (let i = 0; i < sectionCount; i++) {
        const offset = i * 40, address = sections.readUInt32LE(offset + 12), rawSize = sections.readUInt32LE(offset + 16), rawOffset = sections.readUInt32LE(offset + 20);
        if (rva >= address && rva - address + size <= rawSize) return rawOffset + rva - address;
      }
      throw new Error('Resource lies outside PE sections.');
    };
    const resource = read(fileOffset(resourceRVA, resourceSize), resourceSize);
    let traversedEntries = 0;
    const visitedDirectories = new Set();
    const entries = offset => {
      if (offset < 0 || offset + 16 > resource.length) throw new Error('Invalid resource directory.');
      const count = resource.readUInt16LE(offset + 12) + resource.readUInt16LE(offset + 14);
      traversedEntries += count;
      if (count > 1024 || traversedEntries > 4096 || offset + 16 + count * 8 > resource.length) throw new Error('Invalid resource entries.');
      return Array.from({ length: count }, (_, i) => ({ id: resource.readUInt32LE(offset + 16 + i * 8), value: resource.readUInt32LE(offset + 20 + i * 8) }));
    };
    const type = entries(0).find(entry => entry.id === 16 && (entry.value & 0x80000000));
    if (!type) return null;
    const dataEntry = (offset, depth) => {
      if (depth > 2 || visitedDirectories.has(offset) || visitedDirectories.size >= 64) return null;
      visitedDirectories.add(offset);
      for (const entry of entries(offset)) {
        if (entry.value & 0x80000000) { const found = dataEntry(entry.value & 0x7fffffff, depth + 1); if (found !== null) return found; }
        else if (entry.value + 16 <= resource.length) return entry.value;
      }
      return null;
    };
    const dataOffset = dataEntry(type.value & 0x7fffffff, 0);
    if (dataOffset === null) return null;
    const versionRVA = resource.readUInt32LE(dataOffset), versionSize = resource.readUInt32LE(dataOffset + 4);
    if (versionSize < 6 || versionSize > 65536) return null;
    const version = read(fileOffset(versionRVA, versionSize), versionSize), strings = {};
    const align = value => (value + 3) & ~3;
    let blocks = 0;
    const visit = (offset, boundary, depth) => {
      if (++blocks > 256 || depth > 5 || offset + 6 > boundary) throw new Error('Invalid version block.');
      const length = version.readUInt16LE(offset), valueLength = version.readUInt16LE(offset + 2), text = version.readUInt16LE(offset + 4) === 1;
      const end = offset + length;
      if (length < 6 || end > boundary) throw new Error('Invalid version block length.');
      let cursor = offset + 6;
      while (cursor + 2 <= end && version.readUInt16LE(cursor) !== 0 && cursor - offset < 1024) cursor += 2;
      if (cursor + 2 > end || version.readUInt16LE(cursor) !== 0) throw new Error('Invalid version key.');
      const key = version.toString('utf16le', offset + 6, cursor); cursor = align(cursor + 2);
      const bytes = text ? valueLength * 2 : valueLength;
      if (cursor + bytes > end) throw new Error('Invalid version value.');
      if (text && ['ProductName', 'CompanyName', 'FileDescription', 'ProductVersion'].includes(key)) strings[key] = version.toString('utf16le', cursor, cursor + bytes).replace(/\0+$/, '');
      cursor = align(cursor + bytes);
      while (cursor + 6 <= end) { const childLength = version.readUInt16LE(cursor); if (!childLength) break; visit(cursor, end, depth + 1); cursor = align(cursor + childLength); }
    };
    visit(0, version.length, 0);
    if (strings.ProductName !== 'Chat App' || strings.CompanyName !== 'Chat App' || !['Chat App', '64-bit Chat App portable launcher'].includes(strings.FileDescription)) return null;
    const match = /^(\d{1,6}\.\d{1,6}\.\d{1,6})(?:\.0)?$/.exec(strings.ProductVersion || '');
    return match ? { nativeVersion: match[1], description: strings.FileDescription } : null;
  } catch { return null; }
  finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
}
function compareNativeVersions(left, right) {
  const parts = value => typeof value === 'string' && /^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(value) ? value.split('.').map(Number) : null;
  const a = parts(left), b = parts(right);
  if (!a || !b) return null;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  return 0;
}
function registeredPortableBelongsToApp(shortcut, shortcutName) {
  if (shortcut.appUserModelId !== APP_ID || !portableLocation(shortcut.target, '', '')) return false;
  // Exact AppID remains the ownership record when an earlier download was
  // deleted. Existing files must also identify as Chat App to avoid collisions.
  try { fs.lstatSync(shortcut.target); } catch (error) {
    return error.code === 'ENOENT' && ['Chat App.lnk', 'Chat App Native.lnk', APP_ID + '.lnk'].some(name => name.toLowerCase() === String(shortcutName || '').toLowerCase());
  }
  return !!readNativeIdentity(shortcut.target);
}
function resolveNativeLaunch({ userData, version, packaged, platform = process.platform, execPath = process.execPath, env = process.env }) {
  const runtimeRoot = env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, 'Chat App', 'runtime') : '';
  const result = { portablePath: '', previousPortablePath: '', source: 'unmanaged', needsRelaunch: false, runtimeRoot };
  if (platform !== 'win32' || !packaged) return result;
  let saved;
  try { saved = JSON.parse(fs.readFileSync(path.join(userData, MARKER), 'utf8')); } catch {}
  // A moved launcher may no longer exist at its previous path. Keep that known
  // location only for exact shortcut repair; forwarding still requires a file.
  const priorLocation = saved?.schemaVersion === 1 && saved.appId === APP_ID ? portableLocation(saved.portablePath, runtimeRoot, execPath) : '';
  const prior = validPortable(priorLocation, runtimeRoot, execPath);
  const explicit = validPortable(env.PORTABLE_EXECUTABLE_FILE, runtimeRoot, execPath);
  if (explicit) {
    // An old retained download/pin must not downgrade a newer launch target.
    // Confirm the actual distinct file still contains at least the recorded
    // newer release; stale metadata or a replaced file cannot cause a loop.
    if (prior && !samePath(prior, explicit) && compareNativeVersions(saved?.nativeVersion, version) === 1) {
      const actual = readNativeIdentity(prior);
      if (actual && compareNativeVersions(actual.nativeVersion, version) === 1 && compareNativeVersions(actual.nativeVersion, saved.nativeVersion) >= 0) {
        return { ...result, portablePath: prior, previousPortablePath: explicit, source: 'recovered-newer-launcher', needsRelaunch: true };
      }
    }
    Object.assign(result, { portablePath: explicit, previousPortablePath: priorLocation, source: 'portable' });
    try {
      fs.mkdirSync(userData, { recursive: true });
      const marker = path.join(userData, MARKER), temporary = marker + '.tmp-' + process.pid;
      fs.writeFileSync(temporary, JSON.stringify({ schemaVersion: 1, appId: APP_ID, portablePath: explicit, nativeVersion: version }, null, 2) + '\n');
      fs.renameSync(temporary, marker);
    } catch (error) { result.warning = 'Could not save native launcher location: ' + error.message; }
  } else if (prior && isRuntimeExecutable(execPath, runtimeRoot)) {
    Object.assign(result, { portablePath: prior, source: 'recovered-runtime', needsRelaunch: true });
  }
  return result;
}
function forwardToPortable(identity, { env = process.env, spawnImpl = spawn } = {}) {
  if (!identity.needsRelaunch || !identity.portablePath) return Promise.reject(new Error('No portable launcher is available.'));
  const childEnv = { ...env };
  delete childEnv.PORTABLE_EXECUTABLE_FILE; delete childEnv.PORTABLE_EXECUTABLE_DIR;
  return new Promise((resolve, reject) => {
    const child = spawnImpl(identity.portablePath, [], { cwd: path.dirname(identity.portablePath), env: childEnv, detached: true, stdio: 'ignore', windowsHide: true });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}
function taskbarDetails(portablePath, fallbackIcon, execPath = process.execPath) {
  return { appId: APP_ID, appIconPath: portablePath || fallbackIcon, appIconIndex: 0,
    relaunchCommand: `"${portablePath || execPath}"`, relaunchDisplayName: 'Chat App' };
}
function shortcutBelongsToApp(shortcut, identity, includeCurrent = false, shortcutName = '') {
  if (shortcut.args || (shortcut.appUserModelId && shortcut.appUserModelId !== APP_ID)) return false;
  return isRuntimeExecutable(shortcut.target, identity.runtimeRoot)
    || (!!identity.previousPortablePath && samePath(shortcut.target, identity.previousPortablePath))
    || (includeCurrent && samePath(shortcut.target, identity.portablePath))
    || registeredPortableBelongsToApp(shortcut, shortcutName);
}
function shortcutDetails(identity) {
  return { target: identity.portablePath, cwd: path.dirname(identity.portablePath), icon: identity.portablePath, iconIndex: 0, appUserModelId: APP_ID };
}
function shortcutIsCurrent(shortcut, identity) {
  return samePath(shortcut.target, identity.portablePath) && samePath(shortcut.cwd, path.dirname(identity.portablePath))
    && samePath(shortcut.icon, identity.portablePath) && shortcut.iconIndex === 0 && shortcut.appUserModelId === APP_ID;
}
function repairPinnedShortcuts({ shell, pinDirectory, identity, recursive = false, includeCurrent = false }) {
  const result = { repaired: [], failed: [] };
  if (!identity.portablePath || !pinDirectory) return result;
  function visit(directory) {
    let entries;
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (recursive && entry.isDirectory()) { visit(file); continue; }
      if (!entry.isFile() || !/\.lnk$/i.test(entry.name)) continue;
      const name = path.relative(pinDirectory, file);
      try {
        const shortcut = shell.readShortcutLink(file);
        // Never rewrite another app's registration or a custom launch command.
        if (!shortcutBelongsToApp(shortcut, identity, includeCurrent, entry.name) || shortcutIsCurrent(shortcut, identity)) continue;
        if (!shell.writeShortcutLink(file, 'update', shortcutDetails(identity))) throw new Error('Windows refused the shortcut update.');
        result.repaired.push(name);
      } catch (error) { result.failed.push({ name, error: error.message }); }
    }
  }
  visit(pinDirectory);
  return result;
}
function repairShellRegistration({ shell, startMenuDirectory, taskbarDirectory, identity }) {
  const result = { registered: '', created: false, startMenu: { repaired: [], failed: [] }, taskbar: { repaired: [], failed: [] }, error: '' };
  if (!identity.portablePath || !startMenuDirectory) return result;
  // Windows resolves a pinned AppID through Start Menu registrations even when
  // the current window has a different RelaunchCommand. Repair the registration
  // BEFORE the window can be pinned; taskbar-only repair cannot cover this case.
  result.startMenu = repairPinnedShortcuts({ shell, pinDirectory: startMenuDirectory, identity, recursive: true, includeCurrent: true });
  result.taskbar = repairPinnedShortcuts({ shell, pinDirectory: taskbarDirectory, identity });
  try {
    fs.mkdirSync(startMenuDirectory, { recursive: true });
    for (const name of ['Chat App.lnk', 'Chat App Native.lnk', APP_ID + '.lnk']) {
      const file = path.join(startMenuDirectory, name);
      let exists = false;
      try { const info = fs.lstatSync(file); if (!info.isFile() || info.isSymbolicLink()) continue; exists = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (exists) {
        const shortcut = shell.readShortcutLink(file);
        if (!shortcutBelongsToApp(shortcut, identity, true, name)) continue;
        if (!shortcutIsCurrent(shortcut, identity) && !shell.writeShortcutLink(file, 'update', shortcutDetails(identity))) throw new Error('Windows refused the Start Menu registration update.');
      } else {
        if (!shell.writeShortcutLink(file, 'create', { ...shortcutDetails(identity), description: 'Chat App' })) throw new Error('Windows refused the Start Menu registration.');
        result.created = true;
      }
      result.registered = file;
      break;
    }
    if (!result.registered) throw new Error('Existing custom shortcuts prevent creating the native Start Menu registration.');
  } catch (error) { result.error = error.message; }
  return result;
}
function selftestEnabled(env = process.env) {
  return env.CHAT_APP_LAUNCH_SELFTEST === '1' && env.CHAT_APP_OFFLINE === '1' && path.isAbsolute(env.CHAT_APP_TEST_PROFILE || '');
}
function traceForward(identity, profile) {
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, 'native-launch-forward.json'), JSON.stringify({ at: new Date().toISOString(), execPath: process.execPath, ...identity }, null, 2) + '\n');
}
async function checkTitlebar(contents, shellContents) {
  const waitForColor = async (read, expected) => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (await read() === expected) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('The title bar did not synchronize with the shared wallpaper (' + expected + ').');
  };
  const frameColor = () => shellContents.executeJavaScript(`(() => {
    const ctx = document.createElement('canvas').getContext('2d');
    const style = getComputedStyle(document.querySelector('.titlebar'));
    if (style.borderBottomWidth !== '0px') throw new Error('Unexpected title bar divider.');
    ctx.fillStyle = style.backgroundColor;
    ctx.fillRect(0, 0, 1, 1);
    return '#' + [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map(n => n.toString(16).padStart(2, '0')).join('');
  })()`);
  const reset = () => contents.executeJavaScript('ChatApp.renderWallpaper(ChatApp.APP_BG_DEFAULT)');
  await reset();
  await waitForColor(frameColor, '#17212b');
  const colors = {};
  for (const [name, hue] of [['lime', 120], ['blue', 240]]) {
    await contents.executeJavaScript(`(() => {
      const image = document.createElement('canvas');
      image.width = image.height = 2;
      const ctx = image.getContext('2d');
      ctx.fillStyle = ${JSON.stringify(name)};
      ctx.fillRect(0, 0, 2, 2);
      ChatApp.renderWallpaper({...ChatApp.APP_BG_DEFAULT, dataURL: image.toDataURL()});
    })()`);
    await waitForColor(() => contents.executeJavaScript("document.documentElement.style.getPropertyValue('--wallpaper-hue')"), String(hue));
    const tint = await contents.executeJavaScript(`(() => {
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.fillStyle = document.querySelector('meta[name="theme-color"]').content;
      return ctx.fillStyle;
    })()`);
    await waitForColor(frameColor, tint);
    colors[name] = tint;
  }
  if (colors.lime === colors.blue) throw new Error('Distinct wallpapers must tint the title bar differently.');
  await reset();
  await waitForColor(frameColor, '#17212b');
  return { ...colors, restored: '#17212b' };
}
async function runSelftest({ app, shell, identity, updater, contents, shellContents, details, startupRegistration }) {
  if (!selftestEnabled() || !samePath(app.getPath('userData'), process.env.CHAT_APP_TEST_PROFILE)) throw new Error('Launch diagnostic needs an isolated offline profile.');
  const root = app.getPath('userData');
  const report = { at: new Date().toISOString(), nativeVersion: app.getVersion(), packaged: app.isPackaged, execPath: process.execPath,
    userData: root, identity, appDetails: details, startupRegistration, updater: updater.getState(), passed: false };
  try {
    if (!identity.portablePath || identity.source !== 'portable' || !report.updater.supported) throw new Error('The native updater did not retain the real portable launcher.');
    report.bridge = await contents.executeJavaScript('({ nativeVersion: chatDesktopBuild.nativeVersion, nativeUpdates: chatDesktopBuild.nativeUpdates, ready: document.documentElement.dataset.appReady })');
    if (report.bridge.nativeVersion !== app.getVersion() || !report.bridge.nativeUpdates || report.bridge.ready !== 'true') throw new Error('The shared app did not load under the repaired native host.');
    report.wallpaperTitlebar = await checkTitlebar(contents, shellContents);
    const pins = path.join(root, 'pin-fixtures'); fs.mkdirSync(pins, { recursive: true });
    // The same pre-lock startup path as normal launches has already repaired
    // the fixture registration. Release QA can seed an actual legacy .lnk here
    // before starting this process, then cold-launch the resulting .lnk.
    if (!startupRegistration?.registered || startupRegistration.error) throw new Error('Native shell registration did not complete before the window opened.');
    const registered = startupRegistration.registered;
    if (!samePath(path.dirname(registered), path.join(root, 'start-menu-fixtures'))) throw new Error('The diagnostic registration escaped its isolated profile.');
    report.registeredShortcut = shell.readShortcutLink(registered);
    if (!samePath(report.registeredShortcut.target, identity.portablePath) || report.registeredShortcut.appUserModelId !== APP_ID || !samePath(report.registeredShortcut.icon, identity.portablePath)) throw new Error('The startup Start Menu AppID registration was not repaired.');
    const newPin = path.join(pins, 'New registered pin.lnk'); fs.copyFileSync(registered, newPin);
    report.newPinnedShortcut = shell.readShortcutLink(newPin);
    if (!samePath(report.newPinnedShortcut.target, identity.portablePath)) throw new Error('The newly pinned registered app retained the old runtime.');
    const fixture = path.join(pins, 'Chat App.lnk');
    if (!shell.writeShortcutLink(fixture, 'create', { target: process.execPath, cwd: path.dirname(process.execPath), appUserModelId: APP_ID, description: 'Preserve this shortcut description' })) throw new Error('Could not create isolated Windows shortcut.');
    report.pinRepair = repairPinnedShortcuts({ shell, pinDirectory: pins, identity });
    report.shortcut = shell.readShortcutLink(fixture);
    if (!samePath(report.shortcut.target, identity.portablePath) || !samePath(report.shortcut.icon, identity.portablePath) || report.shortcut.appUserModelId !== APP_ID || report.shortcut.description !== 'Preserve this shortcut description') throw new Error('Windows shortcut repair did not preserve native identity.');
    try { report.forwardedFrom = JSON.parse(fs.readFileSync(path.join(root, 'native-launch-forward.json'), 'utf8')); } catch {}
    report.passed = true;
  } catch (error) { report.error = error.message; }
  fs.writeFileSync(path.join(root, 'native-launch-selftest.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}
module.exports = { APP_ID, MARKER, isRuntimeExecutable, validPortable, readNativeIdentity, resolveNativeLaunch, forwardToPortable, taskbarDetails, repairPinnedShortcuts, repairShellRegistration, selftestEnabled, traceForward, checkTitlebar, runSelftest };
