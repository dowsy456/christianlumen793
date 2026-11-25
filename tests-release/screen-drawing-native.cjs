'use strict';
// Compiles a test-only entry point with the production C# source. No SendInput,
// simulated UI events, runtime host changes, or modifications to security.
const assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path');
const { spawn, execFile } = require('node:child_process'), { promisify } = require('node:util');
const execute = promisify(execFile);
(async () => {
  if (process.platform !== 'win32') throw new Error('This native rendering test requires Windows.');
  const work = path.resolve(__dirname, '../../screen-drawing-native-qa'); await fs.mkdir(work, { recursive: true });
  const framework = path.join(process.env.SystemRoot || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319');
  const executable = path.join(work, 'screen-drawing-render-test.exe'), image = path.join(work, 'native-stroke.png');
  const compilation = await execute(path.join(framework, 'csc.exe'), ['/nologo', '/target:exe', '/main:TestHarness', '/platform:x64', '/optimize+', '/debug-', '/out:' + executable,
    '/reference:' + path.join(framework, 'System.Web.Extensions.dll'), '/reference:' + path.join(framework, 'System.Windows.Forms.dll'), '/reference:' + path.join(framework, 'System.Drawing.dll'),
    path.resolve(__dirname, '../desktop/scripts/screen-drawing-helper.cs'), path.join(__dirname, 'screen-drawing-harness.cs')], { windowsHide: true, timeout: 60000 });
  if (compilation.stderr) process.stderr.write(compilation.stderr);
  const run = await execute(executable, [image], { windowsHide: true, timeout: 45000 });
  const report = run.stdout.split(/\r?\n/).filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } }).find(value => value?.passed === true);
  assert.ok(report?.checks.length >= 15, 'native DIB render checks complete');
  await fs.writeFile(path.join(work, 'render-results.json'), JSON.stringify(report, null, 2) + '\n');
  // Independently launch the actual compiled helper: it installs its ordinary
  // hook and capture exclusion, emits ready, and must exit when its IPC closes.
  // No keyboard or pointer input is generated during this lifecycle check.
  const helper = path.resolve(__dirname, '../desktop/helpers/screen-drawing-helper.exe');
  const lifecycle = await new Promise((resolve, reject) => {
    const child = spawn(helper, ['--source', 'screen:0:0', '--rect', '0,0,1280,720'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let ready = false, text = '', errors = '';
    const deadline = setTimeout(() => { child.kill(); reject(new Error('The drawing helper did not stop after IPC closed. ' + errors)); }, 45000);
    child.stdout.on('data', bytes => { text += bytes.toString(); if (!ready && text.includes('"ready":true')) { ready = true; child.stdin.end(); } });
    child.stderr.on('data', bytes => { errors += bytes.toString(); });
    child.on('error', error => { clearTimeout(deadline); reject(error); });
    child.on('exit', code => { clearTimeout(deadline); if (ready && code === 0) resolve({ ready, exitCode: code, noInputInjected: true }); else reject(new Error(`Helper exit ${code}: ${errors}`)); });
  });
  await fs.writeFile(path.join(work, 'lifecycle-results.json'), JSON.stringify(lifecycle, null, 2) + '\n');
  console.log(`PASS ${report.checks.length} native drawing render/lifecycle checks; shipping helper ready and clean exit; no input injected.`);
})().catch(error => { console.error(error.stdout || error.stack || error); process.exitCode = 1; });
