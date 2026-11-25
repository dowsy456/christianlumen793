'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/core/config.js'), 'utf8');
function model(globals = {}) {
  const ChatApp = { register() {} };
  vm.runInNewContext(source, { ChatApp, URL, ...globals });
  return ChatApp;
}
const legacy = { url: 'https://example.test/Chat-App.exe', minimumVersion: '1.7.8' };
const manifestUrl = 'https://example.test/native-update.json';
const plain = value => JSON.parse(JSON.stringify(value));
const settle = () => new Promise(resolve => setImmediate(resolve));

test('manifest-only releases never send old EXEs to a JSON download page', () => {
  const old = model({ location: { protocol: 'chatapp:' }, chatDesktopBuild: { nativeVersion: '1.7.6' } });
  assert.equal(old.needsNativeUpdate({ manifestUrl }), false);
  assert.equal(old.needsNativeUpdate({ ...legacy, manifestUrl }), true);
  const capable = model({ location: { protocol: 'chatapp:' }, chatDesktopBuild: { nativeVersion: '1.7.8', nativeUpdates: true, configureNativeUpdate() {} } });
  assert.equal(capable.needsNativeUpdate({ ...legacy, minimumVersion: '9.0.0', manifestUrl }), false);
  assert.equal(model({ location: { protocol: 'https:' } }).needsNativeUpdate({ ...legacy, manifestUrl }), false);
});

test('only the known broken 1.7.7 updater can use a configured newer repair link', () => {
  const native = version => model({ location: { protocol: 'chatapp:' }, chatDesktopBuild: { nativeVersion: version, nativeUpdates: true, configureNativeUpdate() {} } });
  const broken = native('1.7.7');
  assert.equal(broken.needsNativeUpdate({ ...legacy, manifestUrl }), true, '1.7.8 repair link migrates the known broken updater');
  assert.equal(broken.needsNativeUpdate({ manifestUrl }), false, 'manifest alone never forces manual migration');
  assert.equal(broken.needsNativeUpdate({ ...legacy, minimumVersion: '1.7.7', manifestUrl }), false, 'the already installed release never triggers a gate');
  assert.equal(broken.needsNativeUpdate({ ...legacy, minimumVersion: '1.7.6', manifestUrl }), false);
  assert.equal(broken.needsNativeUpdate({ ...legacy, url: '', manifestUrl }), false);
  assert.equal(broken.needsNativeUpdate({ ...legacy, minimumVersion: 'latest', manifestUrl }), false);
  for (const version of ['1.7.8', '1.8.0', '2.0.1', '0.0.0', '']) {
    assert.equal(native(version).needsNativeUpdate({ ...legacy, minimumVersion: '9.0.0', manifestUrl }), false, version);
  }
});

test('the 2.0.1 repair preserves existing URL identity and never forces capable hosts to redownload', async () => {
  const repair = { url: 'https://github.com/dowsy456/chat-app-desktop/releases/download/v2.0.1/Chat-App.exe', minimumVersion: '2.0.1', manifestUrl };
  for (const nativeVersion of ['1.7.8', '1.7.11', '2.0.0', '2.0.1']) {
    const configured = [];
    const app = model({ location: { protocol: 'chatapp:' }, chatDesktopBuild: {
      nativeVersion, nativeUpdates: true, configureNativeUpdate: async url => configured.push(url)
    } });
    app.nativeBuildInfo = { nativeVersion, nativeUpdates: true };
    app.nativeUpdatePolicy = repair; app.nativeUpdatePolicyLoaded = true;
    assert.equal(app.needsNativeUpdate(), false, nativeVersion + ' uses the combined in-app update icon');
    app.configureNativeUpdates(); await settle();
    assert.deepEqual(configured, [manifestUrl]);
  }
  let stored = { ...legacy, manifestUrl };
  const app = model(); app.isVinny = () => true; app.nativeUpdatePolicyLoaded = true;
  app.db = { ref: () => ({ transaction: async change => { stored = plain(change(stored)); return { committed: true }; } }) };
  await app.setNativeUpdateURL(legacy.url);
  assert.deepEqual(stored, { ...legacy, manifestUrl }, 'resaving the 1.7.8 URL cannot relabel it as 2.0.1');
  await app.setNativeUpdateURL(repair.url);
  assert.deepEqual(stored, repair, 'changing to the published 2.0.1 URL records its actual native minimum');
});

test('bad legacy fields cannot discard a valid native manifest, and vice versa', () => {
  const app = model();
  assert.deepEqual(plain(app.normalizeNativeUpdatePolicy({ ...legacy, manifestUrl })), { ...legacy, manifestUrl });
  assert.deepEqual(plain(app.normalizeNativeUpdatePolicy({ url: 'javascript:bad', minimumVersion: 'bad', manifestUrl })), { manifestUrl });
  assert.deepEqual(plain(app.normalizeNativeUpdatePolicy({ ...legacy, manifestUrl: 'http://example.test/update.json' })), legacy);
  assert.equal(app.normalizeNativeUpdatePolicy({ manifestUrl: 'file:///update.json' }), null);
  assert.equal(app.normalizeNativeUpdatePolicy({ manifestUrl: manifestUrl + '#fragment' }), null);
});

test('manifest and migration settings save independently without deleting the other field', async () => {
  let stored = { ...legacy }, authorized = true;
  const app = model();
  app.nativeUpdatePolicyLoaded = true; app.isVinny = () => authorized;
  app.db = { ref: key => {
    assert.equal(key, 'admin/desktopUpdate');
    return { transaction: async change => {
      const next = change(stored); if (next !== undefined) stored = plain(next);
      return { committed: next !== undefined };
    } };
  } };
  await app.setNativeUpdateManifestURL(manifestUrl);
  assert.deepEqual(stored, { ...legacy, manifestUrl });
  await app.setNativeUpdateURL('');
  assert.deepEqual(stored, { manifestUrl });
  const repair = { url: 'https://github.com/dowsy456/chat-app-desktop/releases/download/v2.0.1/Chat-App.exe', minimumVersion: '2.0.1' };
  await app.setNativeUpdateURL(repair.url);
  assert.equal(app.NATIVE_RELEASE_VERSION, '2.0.1');
  assert.deepEqual(stored, { ...repair, manifestUrl });
  await app.setNativeUpdateManifestURL('');
  assert.deepEqual(stored, repair);
  authorized = false;
  await assert.rejects(app.setNativeUpdateManifestURL(manifestUrl), /Only Vinny/);
  assert.deepEqual(stored, repair);
  authorized = true; app.nativeUpdatePolicyLoaded = false;
  await assert.rejects(app.setNativeUpdateManifestURL(manifestUrl), /still loading/);
  assert.deepEqual(stored, repair);
});

test('new desktops receive confirmed manifest changes and clearing, with duplicate snapshots coalesced', async () => {
  const configured = [];
  const app = model({ chatDesktopBuild: { nativeUpdates: true, configureNativeUpdate: async value => configured.push(value) } });
  app.nativeUpdatePolicy = { manifestUrl };
  app.configureNativeUpdates(); await settle();
  assert.deepEqual(configured, [], 'an unconfirmed cached policy cannot clear native configuration');
  app.nativeUpdatePolicyLoaded = true;
  app.configureNativeUpdates(); app.configureNativeUpdates(); await settle();
  assert.deepEqual(configured, [manifestUrl]);
  app.nativeUpdatePolicy = { ...legacy }; app.configureNativeUpdates(); await settle();
  assert.deepEqual(configured, [manifestUrl, ''], 'confirmed removal disables the native candidate');
  app.configureNativeUpdates(); await settle();
  assert.equal(configured.length, 2);
});

test('temporary bridge failure permits a later snapshot to retry configuration', async () => {
  let attempts = 0;
  const app = model({ chatDesktopBuild: { nativeUpdates: true, configureNativeUpdate() { if (++attempts === 1) throw new Error('Unavailable'); } } });
  app.nativeUpdatePolicyLoaded = true; app.nativeUpdatePolicy = { manifestUrl };
  app.configureNativeUpdates(); await settle();
  app.configureNativeUpdates(); await settle();
  assert.equal(attempts, 2);
});
