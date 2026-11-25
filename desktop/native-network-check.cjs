'use strict';
// Release-owner diagnostic for the shipping Electron transport. Requires an
// explicitly isolated profile and a second opt-in flag. It can only fetch the
// fixed public signed release feed, verify/download it, then exit. No install,
// external code execution, arbitrary URL, debug port or certificate override.
const fs = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto');
const { createNativeUpdater, createElectronUpdateFetch } = require('./native-updater.cjs');
const FEED = 'https://github.com/dowsy456/chat-app-desktop/releases/latest/download/native-update.json';
const REFERENCE_FEED = 'https://github.com/dowsy456/chat-app-desktop/releases/download/v2.0.2/native-update.json';
async function run({ app, net }) {
  if (process.env.CHAT_APP_NETWORK_SELFTEST !== '1' || !path.isAbsolute(process.env.CHAT_APP_TEST_PROFILE || '') || path.resolve(app.getPath('userData')) !== path.resolve(process.env.CHAT_APP_TEST_PROFILE)) throw new Error('The network self-test needs an explicit isolated profile.');
  const root = app.getPath('userData'); await fs.mkdir(root, { recursive: true });
  const feed = process.env.CHAT_APP_NETWORK_REFERENCE === '1' ? REFERENCE_FEED : FEED;
  const report = { startedAt: new Date().toISOString(), nativeVersion: app.getVersion(), electron: process.versions.electron, packaged: app.isPackaged, feed, requests: [], passed: false, installed: false };
  const safeURL = value => { const url = new URL(value); return url.origin + url.pathname; };
  const transport = createElectronUpdateFetch(net);
  const fetchImpl = async (url, options) => {
    const response = await transport(url, options);
    report.requests.push({ url: safeURL(url), status: response.status, ...(response.headers.get('location') ? { redirectTo: safeURL(new URL(response.headers.get('location'), url).href) } : {}) });
    return response;
  };
  let exitCode = 1;
  try {
    const updater = createNativeUpdater({ currentVersion: '0.0.0', portablePath: path.join(root, 'diagnostic-only.exe'), userData: root, fetchImpl });
    const checked = await updater.check(feed); report.publishedVersion = checked.version;
    if (!checked.available) throw new Error('The signed public feed did not offer a release to the diagnostic baseline.');
    const result = await updater.download();
    if (result.status !== 'ready') throw new Error('The native executable was not fully verified.');
    const cache = path.join(root, 'native-updates');
    const directories = (await fs.readdir(cache, { withFileTypes: true })).filter(item => item.isDirectory() && item.name.startsWith('release-'));
    const files = [];
    for (const directory of directories) {
      const file = path.join(cache, directory.name, 'update.exe');
      try { const bytes = await fs.readFile(file); files.push({ size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }); } catch {}
    }
    if (!files.length) throw new Error('No verified EXE was staged in the isolated profile.');
    if (!report.requests.some(item => item.status >= 300 && item.status < 400 && item.url.startsWith('https://github.com/'))) throw new Error('The check did not observe a real GitHub HTTPS redirect.');
    report.verifiedDownloads = files; report.passed = true; report.signatureVerified = true; report.sizeHashArchitectureVerified = true; exitCode = 0;
  } catch (error) { report.error = String(error.message || error); }
  finally {
    report.finishedAt = new Date().toISOString();
    await fs.writeFile(path.join(root, 'native-network-selftest.json'), JSON.stringify(report, null, 2) + '\n');
    app.exit(exitCode);
  }
}
module.exports = { run, FEED };
