'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const launch = require('../native-launch.cjs');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-native-launch-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const userData = path.join(root, 'profile'), local = path.join(root, 'local');
  const runtimeRoot = path.join(local, 'Chat App', 'runtime');
  const execPath = path.join(runtimeRoot, 'a'.repeat(64), 'Chat App.exe');
  const portablePath = path.join(root, 'Chat-App.exe');
  fs.mkdirSync(path.dirname(execPath), { recursive: true }); fs.writeFileSync(execPath, 'runtime'); fs.writeFileSync(portablePath, 'portable');
  const options = { userData, version: '2.0.0', packaged: true, platform: 'win32', execPath, env: { LOCALAPPDATA: local, PORTABLE_EXECUTABLE_FILE: portablePath } };
  return { root, userData, runtimeRoot, execPath, portablePath, options };
}
test('normal portable launch saves identity; direct pinned runtime recovers exact updater target', t => {
  const h = fixture(t), normal = launch.resolveNativeLaunch(h.options);
  assert.equal(normal.portablePath, h.portablePath); assert.equal(normal.needsRelaunch, false);
  const direct = launch.resolveNativeLaunch({ ...h.options, env: { LOCALAPPDATA: h.options.env.LOCALAPPDATA } });
  assert.equal(direct.source, 'recovered-runtime'); assert.equal(direct.needsRelaunch, true); assert.equal(direct.portablePath, h.portablePath);
  const saved = JSON.parse(fs.readFileSync(path.join(h.userData, launch.MARKER), 'utf8'));
  assert.equal(saved.nativeVersion, '2.0.0'); assert.equal(saved.portablePath, h.portablePath);
});
test('replacement at the same path and moving the launcher retain its profile and stale pin identity', t => {
  const h = fixture(t); launch.resolveNativeLaunch(h.options);
  fs.writeFileSync(h.portablePath, 'updated portable');
  const recovered = launch.resolveNativeLaunch({ ...h.options, env: { LOCALAPPDATA: h.options.env.LOCALAPPDATA } });
  assert.equal(recovered.portablePath, h.portablePath);
  const moved = path.join(h.root, 'Copied Chat App.exe'); fs.renameSync(h.portablePath, moved);
  const copy = launch.resolveNativeLaunch({ ...h.options, env: { ...h.options.env, PORTABLE_EXECUTABLE_FILE: moved } });
  assert.equal(copy.portablePath, moved); assert.equal(copy.previousPortablePath, h.portablePath);
  assert.equal(JSON.parse(fs.readFileSync(path.join(h.userData, launch.MARKER), 'utf8')).portablePath, moved);
});
test('runtime targets, invalid marker, removed launcher and development runs cannot become update targets', t => {
  const h = fixture(t);
  assert.equal(launch.resolveNativeLaunch({ ...h.options, env: { ...h.options.env, PORTABLE_EXECUTABLE_FILE: h.execPath } }).portablePath, '');
  launch.resolveNativeLaunch(h.options); fs.unlinkSync(h.portablePath);
  assert.equal(launch.resolveNativeLaunch({ ...h.options, env: { LOCALAPPDATA: h.options.env.LOCALAPPDATA } }).needsRelaunch, false);
  assert.equal(launch.resolveNativeLaunch({ ...h.options, packaged: false }).portablePath, '');
  fs.writeFileSync(h.portablePath, 'portable');
  fs.writeFileSync(path.join(h.userData, launch.MARKER), JSON.stringify({ schemaVersion: 1, appId: 'some.other.app', portablePath: h.portablePath }));
  assert.equal(launch.resolveNativeLaunch({ ...h.options, env: { LOCALAPPDATA: h.options.env.LOCALAPPDATA } }).portablePath, '');
});
test('runtime detection matches only exact known cache paths', t => {
  const h = fixture(t);
  assert.equal(launch.isRuntimeExecutable(h.execPath, h.runtimeRoot), true);
  for (const candidate of [path.join(h.runtimeRoot, 'custom', 'Chat App.exe'), path.join(h.runtimeRoot, 'a'.repeat(64), 'other.exe'), path.join(h.runtimeRoot, 'a'.repeat(64), 'nested', 'Chat App.exe'), h.portablePath]) assert.equal(launch.isRuntimeExecutable(candidate, h.runtimeRoot), false);
});
test('direct launch forwards without inherited portable variables or runtime arguments', async t => {
  const h = fixture(t); let called;
  await launch.forwardToPortable({ portablePath: h.portablePath, needsRelaunch: true }, { env: { PORTABLE_EXECUTABLE_FILE: 'old', PORTABLE_EXECUTABLE_DIR: 'old', CHAT_APP_TEST_PROFILE: h.userData }, spawnImpl: (file, args, options) => {
    called = { file, args, options }; const child = new EventEmitter(); child.unref = () => { called.unref = true; }; queueMicrotask(() => child.emit('spawn')); return child;
  } });
  assert.equal(called.file, h.portablePath); assert.deepEqual(called.args, []); assert.equal(called.options.env.PORTABLE_EXECUTABLE_FILE, undefined);
  assert.equal(called.options.env.PORTABLE_EXECUTABLE_DIR, undefined); assert.equal(called.options.env.CHAT_APP_TEST_PROFILE, h.userData); assert.equal(called.unref, true);
  await assert.rejects(launch.forwardToPortable({ portablePath: h.portablePath, needsRelaunch: true }, { spawnImpl: () => { const child = new EventEmitter(); queueMicrotask(() => child.emit('error', Error('blocked'))); return child; } }), /blocked/);
});
test('pin repair changes only proven runtime or previous-launcher pins and preserves other metadata', t => {
  const h = fixture(t), pins = path.join(h.root, 'pins'); fs.mkdirSync(pins);
  const previous = path.join(h.root, 'Old Chat-App.exe'); fs.writeFileSync(previous, 'old');
  const rows = { 'runtime.lnk': { target: h.execPath, args: '', appUserModelId: launch.APP_ID, description: 'Keep me' },
    'previous.lnk': { target: previous }, 'custom.lnk': { target: h.execPath, args: '--custom' },
    'other-id.lnk': { target: h.execPath, appUserModelId: 'other' }, 'unrelated.lnk': { target: path.join(h.root, 'Chat-App.exe') },
    'lookalike.lnk': { target: path.join(h.runtimeRoot, 'not-a-release', 'Chat App.exe') } };
  for (const name of Object.keys(rows)) fs.writeFileSync(path.join(pins, name), 'fixture');
  const shell = { readShortcutLink: file => rows[path.basename(file)], writeShortcutLink: (file, operation, changes) => { assert.equal(operation, 'update'); Object.assign(rows[path.basename(file)], changes); return true; } };
  const result = launch.repairPinnedShortcuts({ shell, pinDirectory: pins, identity: { portablePath: h.portablePath, previousPortablePath: previous, runtimeRoot: h.runtimeRoot } });
  assert.deepEqual(result.repaired.sort(), ['previous.lnk', 'runtime.lnk']); assert.equal(result.failed.length, 0);
  assert.equal(rows['runtime.lnk'].target, h.portablePath); assert.equal(rows['runtime.lnk'].icon, h.portablePath); assert.equal(rows['runtime.lnk'].description, 'Keep me');
  assert.equal(rows['custom.lnk'].target, h.execPath); assert.equal(rows['other-id.lnk'].appUserModelId, 'other');
});
test('Windows taskbar properties use the shell-readable portable EXE icon and quoted launcher', t => {
  const h = fixture(t), details = launch.taskbarDetails(h.portablePath, 'app.asar/assets/icon.ico');
  assert.equal(details.relaunchCommand, `"${h.portablePath}"`); assert.equal(details.appIconPath, h.portablePath); assert.equal(details.appId, launch.APP_ID);
});
test('diagnostics require an absolute isolated offline profile', () => {
  assert.equal(launch.selftestEnabled({ CHAT_APP_LAUNCH_SELFTEST: '1' }), false);
  assert.equal(launch.selftestEnabled({ CHAT_APP_LAUNCH_SELFTEST: '1', CHAT_APP_OFFLINE: '1', CHAT_APP_TEST_PROFILE: 'relative' }), false);
  assert.equal(launch.selftestEnabled({ CHAT_APP_LAUNCH_SELFTEST: '1', CHAT_APP_OFFLINE: '1', CHAT_APP_TEST_PROFILE: path.resolve('isolated') }), true);
});
function shortcutFixture(t) {
  const h = fixture(t);
  h.startMenu = path.join(h.root, 'Start Menu', 'Programs'); h.pins = path.join(h.root, 'TaskBar');
  fs.mkdirSync(h.startMenu, { recursive: true }); fs.mkdirSync(h.pins);
  h.shell = {
    readShortcutLink: file => JSON.parse(fs.readFileSync(file, 'utf8')),
    writeShortcutLink: (file, operation, properties) => {
      let prior = {};
      if (operation === 'update') prior = JSON.parse(fs.readFileSync(file, 'utf8'));
      fs.writeFileSync(file, JSON.stringify({ ...prior, ...properties })); return true;
    }
  };
  h.identity = launch.resolveNativeLaunch(h.options);
  h.register = () => launch.repairShellRegistration({ shell: h.shell, startMenuDirectory: h.startMenu, taskbarDirectory: h.pins, identity: h.identity });
  return h;
}
test('stale Start Menu AppID is repaired before any pin exists, so a newly pinned registered app launches the portable EXE', t => {
  const h = shortcutFixture(t), registered = path.join(h.startMenu, 'Chat App.lnk');
  const legacy = path.join(h.runtimeRoot, 'b'.repeat(64), 'Chat App.exe');
  h.shell.writeShortcutLink(registered, 'create', { target: legacy, cwd: path.dirname(legacy), appUserModelId: launch.APP_ID, description: 'Keep registered description' });
  assert.deepEqual(fs.readdirSync(h.pins), []);
  const report = h.register();
  assert.equal(report.error, ''); assert.equal(report.registered, registered); assert.deepEqual(report.startMenu.repaired, ['Chat App.lnk']);
  const pin = path.join(h.pins, 'New Chat App.lnk'); fs.copyFileSync(registered, pin);
  const pinned = h.shell.readShortcutLink(pin);
  assert.equal(pinned.target, h.portablePath); assert.equal(pinned.icon, h.portablePath); assert.equal(pinned.appUserModelId, launch.APP_ID);
  assert.equal(pinned.description, 'Keep registered description');
  fs.writeFileSync(h.portablePath, 'next verified native release');
  assert.equal(h.shell.readShortcutLink(pin).target, h.portablePath, 'future in-place native updates keep the pin target');
});
test('existing legacy Start Menu and taskbar shortcuts both repair with stable identity', t => {
  const h = shortcutFixture(t), registered = path.join(h.startMenu, 'Chat App.lnk'), pin = path.join(h.pins, 'Chat App.lnk');
  for (const file of [registered, pin]) h.shell.writeShortcutLink(file, 'create', { target: h.execPath, args: '', appUserModelId: launch.APP_ID, description: 'Preserved' });
  const report = h.register();
  assert.deepEqual(report.startMenu.repaired, ['Chat App.lnk']); assert.deepEqual(report.taskbar.repaired, ['Chat App.lnk']);
  for (const file of [registered, pin]) assert.equal(h.shell.readShortcutLink(file).target, h.portablePath);
  const repeated = h.register(); assert.deepEqual(repeated.startMenu.repaired, []); assert.deepEqual(repeated.taskbar.repaired, []); assert.equal(repeated.created, false);
});
test('new installs register their launcher and moved launchers repair prior registered paths', t => {
  const h = shortcutFixture(t), first = h.register();
  assert.equal(first.created, true); assert.equal(h.shell.readShortcutLink(first.registered).target, h.portablePath);
  const moved = path.join(h.root, 'Renamed Chat App.exe'); fs.renameSync(h.portablePath, moved);
  h.identity = launch.resolveNativeLaunch({ ...h.options, env: { ...h.options.env, PORTABLE_EXECUTABLE_FILE: moved } });
  const second = h.register(); assert.equal(second.created, false); assert.equal(second.error, '');
  assert.equal(h.shell.readShortcutLink(first.registered).target, moved);
});
test('registration preserves unrelated and custom shortcuts, including colliding names and nested entries', t => {
  const h = shortcutFixture(t), collision = path.join(h.startMenu, 'Chat App.lnk');
  const nested = path.join(h.startMenu, 'Old Chat App'); fs.mkdirSync(nested);
  const custom = path.join(nested, 'Custom Chat App.lnk'), ours = path.join(nested, 'Chat App.lnk');
  h.shell.writeShortcutLink(collision, 'create', { target: path.join(h.root, 'Unrelated.exe'), appUserModelId: 'unrelated.app', description: 'Leave alone' });
  h.shell.writeShortcutLink(custom, 'create', { target: h.execPath, args: '--custom', appUserModelId: launch.APP_ID });
  h.shell.writeShortcutLink(ours, 'create', { target: h.execPath, appUserModelId: launch.APP_ID });
  const beforeCollision = fs.readFileSync(collision, 'utf8'), beforeCustom = fs.readFileSync(custom, 'utf8');
  const report = h.register();
  assert.equal(report.registered, path.join(h.startMenu, 'Chat App Native.lnk')); assert.equal(report.created, true);
  assert.equal(fs.readFileSync(collision, 'utf8'), beforeCollision); assert.equal(fs.readFileSync(custom, 'utf8'), beforeCustom);
  assert.equal(h.shell.readShortcutLink(ours).target, h.portablePath);
});
test('main repairs shell registration before singleton acquisition and before its window can be pinned', () => {
  const main = fs.readFileSync(path.join(__dirname, '../main.cjs'), 'utf8');
  const repair = main.indexOf('launchShellRegistration = nativeLaunch.repairShellRegistration(');
  assert.ok(repair > 0 && repair < main.indexOf('const gotLock ='));
  assert.ok(repair < main.indexOf('    createMainWindow();'));
  assert.match(main.slice(main.lastIndexOf('if (process.platform', repair), repair), /!process\.env\.CHAT_APP_TEST_PROFILE \|\| nativeLaunch\.selftestEnabled\(\)/);
  assert.match(main.slice(repair, main.indexOf('const gotLock =')), /isolated \? path\.join\(registrationRoot, 'start-menu-fixtures'\)/);
  assert.match(main, /startupRegistration: launchShellRegistration/);
  assert.doesNotMatch(main.slice(repair, main.indexOf('const gotLock =')), /kill|exit\(|quit\(/);
});
function nativePE(version, { product = 'Chat App', company = 'Chat App', description = 'Chat App' } = {}) {
  const align = n => (n + 3) & ~3;
  function block(key, value = Buffer.alloc(0), children = [], text = true) {
    const keyBytes = Buffer.from(key + '\0', 'utf16le'), valueOffset = align(6 + keyBytes.length), childOffset = align(valueOffset + value.length);
    const size = childOffset + children.reduce((sum, child) => sum + align(child.length), 0), buffer = Buffer.alloc(size);
    buffer.writeUInt16LE(size, 0); buffer.writeUInt16LE(text ? value.length / 2 : value.length, 2); buffer.writeUInt16LE(text ? 1 : 0, 4);
    keyBytes.copy(buffer, 6); value.copy(buffer, valueOffset); let offset = childOffset;
    for (const child of children) { child.copy(buffer, offset); offset += align(child.length); }
    return buffer;
  }
  const fields = { ProductName: product, CompanyName: company, FileDescription: description, ProductVersion: version + '.0' };
  const strings = Object.entries(fields).map(([key, value]) => block(key, Buffer.from(value + '\0', 'utf16le')));
  const versionBlock = block('VS_VERSION_INFO', Buffer.alloc(52), [block('StringFileInfo', Buffer.alloc(0), [block('040904b0', Buffer.alloc(0), strings)])], false);
  const resource = Buffer.alloc(88 + versionBlock.length);
  for (const offset of [0, 24, 48]) resource.writeUInt16LE(1, offset + 14);
  resource.writeUInt32LE(16, 16); resource.writeUInt32LE(0x80000018, 20);
  resource.writeUInt32LE(1, 40); resource.writeUInt32LE(0x80000030, 44);
  resource.writeUInt32LE(1033, 64); resource.writeUInt32LE(72, 68);
  resource.writeUInt32LE(0x1000 + 88, 72); resource.writeUInt32LE(versionBlock.length, 76); versionBlock.copy(resource, 88);
  const image = Buffer.alloc(512 + resource.length); image.writeUInt16LE(0x5a4d, 0); image.writeUInt32LE(128, 60);
  image.writeUInt32LE(0x4550, 128); image.writeUInt16LE(0x8664, 132); image.writeUInt16LE(1, 134); image.writeUInt16LE(240, 148);
  image.writeUInt16LE(0x20b, 152); image.writeUInt32LE(16, 260); image.writeUInt32LE(0x1000, 280); image.writeUInt32LE(resource.length, 284);
  Buffer.from('.rsrc').copy(image, 392); image.writeUInt32LE(resource.length, 400); image.writeUInt32LE(0x1000, 404); image.writeUInt32LE(resource.length, 408); image.writeUInt32LE(512, 412);
  resource.copy(image, 512); return image;
}
test('PE ownership reader accepts Chat App resources and rejects foreign or malformed executables', t => {
  const h = fixture(t); fs.writeFileSync(h.portablePath, nativePE('2.0.2'));
  assert.deepEqual(launch.readNativeIdentity(h.portablePath), { nativeVersion: '2.0.2', description: 'Chat App' });
  for (const bytes of [nativePE('3.0.0', { product: 'Unrelated' }), nativePE('3.0.0', { company: 'Unrelated' }), Buffer.from('Chat App'), nativePE('3.0.0').subarray(0, 600)]) {
    fs.writeFileSync(h.portablePath, bytes); assert.equal(launch.readNativeIdentity(h.portablePath), null);
  }
  const oversized = nativePE('3.0.0'); oversized.writeUInt32LE(16 * 1024 * 1024, 284); fs.writeFileSync(h.portablePath, oversized);
  assert.equal(launch.readNativeIdentity(h.portablePath), null, 'resource reads are bounded');
});
test('separately downloaded 2.0.2 and 3.0.0 repair prior outer EXE registrations without a marker', t => {
  const h = shortcutFixture(t), registered = path.join(h.startMenu, 'Chat App.lnk'), pin = path.join(h.pins, 'Chat App.lnk');
  let previous = h.portablePath; fs.writeFileSync(previous, nativePE('2.0.1'));
  for (const version of ['2.0.2', '3.0.0']) {
    for (const file of [registered, pin]) h.shell.writeShortcutLink(file, 'create', { target: previous, appUserModelId: launch.APP_ID, description: 'Keep me' });
    fs.unlinkSync(path.join(h.userData, launch.MARKER));
    const next = path.join(h.root, 'Download ' + version, 'Renamed app (' + version + ').exe'); fs.mkdirSync(path.dirname(next)); fs.writeFileSync(next, nativePE(version));
    h.identity = launch.resolveNativeLaunch({ ...h.options, version, env: { ...h.options.env, PORTABLE_EXECUTABLE_FILE: next } });
    assert.equal(h.identity.previousPortablePath, '');
    const result = h.register(); assert.equal(result.error, ''); assert.equal(result.registered, registered); assert.equal(result.created, false);
    for (const file of [registered, pin]) { const link = h.shell.readShortcutLink(file); assert.equal(link.target, next); assert.equal(link.description, 'Keep me'); }
    previous = next;
  }
});
test('missing marker and deleted prior EXE still repair the exact AppID canonical links', t => {
  const h = shortcutFixture(t); fs.unlinkSync(path.join(h.userData, launch.MARKER));
  const removed = path.join(h.root, 'Deleted old release.exe');
  for (const folder of [h.startMenu, h.pins]) h.shell.writeShortcutLink(path.join(folder, 'Chat App.lnk'), 'create', { target: removed, appUserModelId: launch.APP_ID });
  h.identity = launch.resolveNativeLaunch(h.options); const result = h.register(); assert.equal(result.created, false); assert.equal(result.error, '');
  for (const folder of [h.startMenu, h.pins]) assert.equal(h.shell.readShortcutLink(path.join(folder, 'Chat App.lnk')).target, h.portablePath);
});
test('same-AppID foreign executables and custom commands remain untouched', t => {
  const h = shortcutFixture(t), foreign = path.join(h.root, 'Foreign.exe'), ours = path.join(h.root, 'Older.exe');
  fs.writeFileSync(foreign, nativePE('9.0.0', { product: 'Other app' })); fs.writeFileSync(ours, nativePE('2.0.1'));
  const rows = [['Foreign.lnk', { target: foreign, appUserModelId: launch.APP_ID }], ['Custom.lnk', { target: ours, appUserModelId: launch.APP_ID, args: '--custom' }], ['Wrong ID.lnk', { target: ours, appUserModelId: 'other.app' }], ['Unknown missing.lnk', { target: path.join(h.root, 'unknown.exe'), appUserModelId: launch.APP_ID }]];
  for (const [name, properties] of rows) h.shell.writeShortcutLink(path.join(h.startMenu, name), 'create', properties);
  const snapshots = rows.map(([name]) => fs.readFileSync(path.join(h.startMenu, name), 'utf8'));
  h.register(); rows.forEach(([name], i) => assert.equal(fs.readFileSync(path.join(h.startMenu, name), 'utf8'), snapshots[i]));
});
test('failed registration retries from actual same-AppID EXE identity after later downloads', t => {
  const h = shortcutFixture(t), registered = path.join(h.startMenu, 'Chat App.lnk');
  const prior = path.join(h.root, 'Old.exe'); fs.writeFileSync(prior, nativePE('2.0.1'));
  h.shell.writeShortcutLink(registered, 'create', { target: prior, appUserModelId: launch.APP_ID });
  const actualWrite = h.shell.writeShortcutLink; h.shell.writeShortcutLink = () => false;
  assert.notEqual(h.register().error, '');
  h.shell.writeShortcutLink = actualWrite;
  const result = h.register(); assert.equal(result.error, ''); assert.equal(h.shell.readShortcutLink(registered).target, h.portablePath);
});
test('retained older download forwards only to a distinct verified newer Chat App release', t => {
  const h = fixture(t), newer = path.join(h.root, 'Separately downloaded3.exe'); fs.writeFileSync(newer, nativePE('3.0.0'));
  launch.resolveNativeLaunch({ ...h.options, version: '3.0.0', env: { ...h.options.env, PORTABLE_EXECUTABLE_FILE: newer } });
  const saved = fs.readFileSync(path.join(h.userData, launch.MARKER), 'utf8');
  const old = launch.resolveNativeLaunch({ ...h.options, version: '2.0.2' });
  assert.equal(old.source, 'recovered-newer-launcher'); assert.equal(old.needsRelaunch, true); assert.equal(old.portablePath, newer);
  assert.equal(fs.readFileSync(path.join(h.userData, launch.MARKER), 'utf8'), saved);
  fs.writeFileSync(newer, nativePE('2.0.1'));
  const replaced = launch.resolveNativeLaunch({ ...h.options, version: '2.0.2' }); assert.equal(replaced.needsRelaunch, false); assert.equal(replaced.portablePath, h.portablePath);
  const same = launch.resolveNativeLaunch({ ...h.options, version: '2.0.1' }); assert.equal(same.needsRelaunch, false, 'same path never forwards to itself');
});

test('corrupt marker version cannot interrupt an explicit native launch', t => {
  const h = fixture(t), prior = path.join(h.root, 'Prior.exe'); fs.writeFileSync(prior, nativePE('3.0.0'));
  fs.mkdirSync(h.userData, { recursive: true });
  fs.writeFileSync(path.join(h.userData, launch.MARKER), JSON.stringify({ schemaVersion: 1, appId: launch.APP_ID, portablePath: prior, nativeVersion: ['3.0.0'] }));
  const identity = launch.resolveNativeLaunch(h.options); assert.equal(identity.needsRelaunch, false); assert.equal(identity.portablePath, h.portablePath);
});
