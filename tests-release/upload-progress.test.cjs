"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const code = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
function setup(initial) {
  const app = { register() {} }, timers = new Map(); let seq = 0, value = initial, calls = 0;
  vm.runInNewContext(code("js/media/uploads.js"), { ChatApp: app, Blob, AbortController, TextEncoder, btoa, setTimeout(fn) { timers.set(++seq, fn); return seq; }, clearTimeout(id) { timers.delete(id); } });
  app.isExternalBlobDescriptor = f => f?.provider === "b2-worker-v1";
  app.isSafeUploadPreview = s => /^data:image\/jpeg;base64,/.test(s);
  const ref = { async transaction(update) { calls++; const next = update(value); if (next !== undefined) value = next; return { committed: next !== undefined, snapshot: { val: () => value } }; } };
  const tick = async () => { const ready = [...timers.values()]; timers.clear(); for (const fn of ready) fn(); for (let i = 0; i < 6; i++) await Promise.resolve(); };
  return { app, ref, tick, timers, get value() { return value; }, set value(v) { value = v; }, get calls() { return calls; } };
}
test("compact upload progress coalesces hundreds of events and preserves other message fields", async () => {
  const h = setup({ userCode: "A", text: "keep", reactions: { heart: { B: true } }, files: [{ uploadPending: 1, fileName: "file.png", uploadProgress: 0 }, { uploadPending: 1 }] });
  const reporter = h.app.createMessageUploadReporter(h.ref);
  for (let i = 1; i <= 300; i++) reporter.progress(0, i / 4);
  reporter.progress(1, 32); reporter.preview(0, "data:image/jpeg;base64,YQ==");
  assert.equal(h.calls, 0); await h.tick(); assert.equal(h.calls, 1);
  assert.equal(h.value.files[0].uploadProgress, 75); assert.equal(h.value.files[1].uploadProgress, 32);
  assert.equal(h.value.files[0].uploadPreview, "data:image/jpeg;base64,YQ=="); assert.equal(h.value.text, "keep"); assert.equal(h.value.reactions.heart.B, true);
  reporter.progress(0, 20); await h.tick(); assert.equal(h.value.files[0].uploadProgress, 75, "retry progress never moves backwards");
  reporter.progress(0, 100); await h.tick(); assert.equal(h.value.files[0].uploadProgress, 99.99, "100 belongs to acknowledged publication");
  await reporter.stop(); assert.equal(h.timers.size, 0);
});
test("deleted messages and already committed files cannot be recreated by progress", async () => {
  const h = setup({ files: [{ uploadPending: 1 }] }), reporter = h.app.createMessageUploadReporter(h.ref);
  reporter.progress(0, 50); h.value = null; await h.tick(); assert.equal(h.value, null);
  h.value = { files: [{ provider: "b2-worker-v1", objectKey: "ready", size: 4 }] }; reporter.progress(0, 75); await h.tick();
  assert.equal(h.value.files[0].objectKey, "ready"); assert.equal(h.value.files[0].uploadProgress, undefined); await reporter.stop();
});
test("stopping never waits on a disconnected metadata transaction and discards late callbacks", async () => {
  const h = setup({ files: [{ uploadPending: 1 }] }); let release;
  const real = h.ref.transaction; h.ref.transaction = async fn => { await new Promise(resolve => { release = resolve; }); return real(fn); };
  const reporter = h.app.createMessageUploadReporter(h.ref); reporter.progress(0, 30); await h.tick();
  let stopped = false; const stop = reporter.stop().then(() => { stopped = true; }); await stop; assert.equal(stopped, true);
  release(); await h.tick(); assert.equal(h.value.files[0].uploadProgress, undefined);
  reporter.progress(0, 70); await h.tick(); assert.equal(h.timers.size, 0); assert.equal(h.value.files[0].uploadProgress, undefined);
});
test("transient metadata failure retries compact pending values without failing the upload", async () => {
  const h = setup({ files: [{ uploadPending: 1 }] }), real = h.ref.transaction; let fail = true;
  h.ref.transaction = fn => { if (fail) { fail = false; return Promise.reject(new Error("offline")); } return real(fn); };
  const reporter = h.app.createMessageUploadReporter(h.ref); reporter.progress(0, 42); await h.tick(); await h.tick(); assert.equal(h.value.files[0].uploadProgress, 42); await reporter.stop();
});
test("preview validation permits bounded raster thumbnails only", () => {
  const app = { register() {} }; vm.runInNewContext(code("js/media/upload-previews.js"), { ChatApp: app });
  assert.equal(app.isSafeUploadPreview("data:image/jpeg;base64,YQ=="), true);
  for (const value of ["javascript:alert(1)", "data:image/svg+xml;base64,YQ==", "https://example.com/x.png", "data:image/jpeg;base64," + "a".repeat(4096)]) assert.equal(app.isSafeUploadPreview(value), false);
});
test("malformed and oversized executable resources are rejected without executing files", async () => {
  const app = { register() {} }; vm.runInNewContext(code("js/media/upload-previews.js"), { ChatApp: app, Blob, DataView, Uint8Array });
  assert.equal(await app.readExecutableIcon(new Blob(["not an executable"])), null);
  const buffer = new ArrayBuffer(1024), view = new DataView(buffer); view.setUint16(0, 0x5a4d, true); view.setUint32(60, 0xfffffff0, true);
  assert.equal(await app.readExecutableIcon(new Blob([buffer])), null);
});
