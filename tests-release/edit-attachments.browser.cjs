'use strict';
// Browser regressions use the real composer/edit/upload orchestration and a
// local Firebase fixture. Only object storage transport is replaced; no live
// Firebase project, microphone, camera, or external account is contacted.
const assert = require('node:assert/strict'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const firebaseMock = require('../tests/firebase-mock.js');
(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 940 } });
    await context.addInitScript(firebaseMock);
    await context.route(/^https?:\/\//, route => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
    await page.fill('#login-email', 'vincenzo.brogna@students.pittstonarea.com');
    await page.click('#btn-go-login'); await page.fill('#login-code', 'TEST-USER'); await page.click('#btn-login');
    await page.waitForFunction(() => ChatApp.currentUser?.code === 'TEST-USER');
    await page.evaluate(async () => {
      const app = ChatApp;
      window.__originalFile = { provider: 'b2-worker-v1', objectKey: 'attachments/test/existing/original', kind: 'file', fileName: 'original.txt', name: 'original.txt', size: 8, mimeType: 'text/plain' };
      window.__baseMessage = { userCode: 'TEST-USER', username: 'Tester', displayName: 'Tester', t: 'text', text: 'Original text', createdAt: Date.now() - 1000,
        files: [__originalFile], poll: { question: 'Original poll?', options: [{ id: 'a0', text: 'Yes' }, { id: 'a1', text: 'No' }], allowMultiple: false, endsAt: Date.now() + 86400000, votes: { first: ['a0'] } }, reactions: { heart: { first: true } } };
      await __testDatabase.ref('messages/test/existing').set(__baseMessage);
      await __testDatabase.ref('attachmentBlobs/test/existing').set({ files: [__originalFile] });
      await __testDatabase.ref('messages/test/plain').set({ userCode: 'TEST-USER', username: 'Tester', text: 'Plain original', createdAt: Date.now() });
      for (const key of ['race', 'cold', 'deleted', 'navigate']) await __testDatabase.ref(`messages/test/${key}`).set({ userCode: 'TEST-USER', username: 'Tester', text: key + ' original', createdAt: Date.now() - 500 });
      await __testDatabase.ref('rooms/other').set({ name: 'Other room', createdBy: 'TEST-USER', createdAt: Date.now() });
      await __testDatabase.ref('memberships/TEST-USER/other').set(true); await __testDatabase.ref('roomMembers/other/TEST-USER').set(true);
      for (const id of ['sticker-one', 'sticker-two']) await __testDatabase.ref(`${app.STICKER_META_PATH}/${id}`).set({ name: id, kind: 'image', mimeType: 'image/png', creatorCode: 'TEST-USER', creatorUsername: 'Tester', createdAt: Date.now(), state: 'ready', width: 128, height: 128, byteSize: 20 });
      app.closeToast(); await app.openRoom('test', { quiet: true });
      window.__uploadCalls = []; window.__deletions = []; window.__prefixDeletions = []; window.__uploadSequence = 0;
      // The common fixture uses 19-character synthetic push keys. Give new
      // attachment stages realistic timestamped Firebase keys so Clear's real
      // cutoff/ownership logic is exercised without weakening that logic.
      const ordinaryRef = app.db.ref; let pushSequence = 0;
      app.db.ref = function (target) {
        const ref = ordinaryRef.call(this, target);
        if (target === 'attachmentBlobs/test') ref.push = value => {
          const alphabet = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz'; let at = Date.now(), prefix = '';
          for (let i = 0; i < 8; i++) { prefix = alphabet[at % 64] + prefix; at = Math.floor(at / 64); }
          const child = ordinaryRef.call(app.db, `${target}/${prefix}${(++pushSequence).toString(36).padStart(12, '0')}`);
          if (value !== undefined) void child.set(value); return child;
        };
        return ref;
      };
      app.assertExternalStorageConfigured = () => {};
      app.uploadExternalBlob = async (blob, options) => {
        const call = { path: options.path, signal: options.signal, size: blob.size, sequence: ++__uploadSequence }; __uploadCalls.push(call);
        if (window.__storageGate) await __storageGate;
        if (window.__failUpload) throw new Error('Intentional fixture upload failure');
        // Intentionally ignore AbortSignal until completion to reproduce an
        // already-dispatched upload finishing after the user cancels an edit.
        call.finished = true;
        return { provider: 'b2-worker-v1', objectKey: options.path, size: blob.size, mimeType: blob.type || 'application/octet-stream' };
      };
      app.deleteExternalBlob = async file => { __deletions.push(file.objectKey); };
      app.deleteExternalBlobPrefix = async (prefix, options) => { __prefixDeletions.push({ prefix, options }); };
      window.__beginStorageGate = () => { __storageGate = new Promise(resolve => { window.__releaseStorage = () => { window.__storageGate = null; resolve(); }; }); };
      window.__resetComposer = () => {
        app.cancelEditMessage(); app.clearPendingFiles(); app.clearPendingPoll(); app.clearVoiceRecordingDraft(); app.pendingSticker = null;
        app.$('msg-input').value = ''; app.closeVoicePopover({ keepRecorder: false }); app.closeToast(); app.renderFilesBar();
      };
      window.__makeFile = (name, kind = 'text/plain') => new File(['fixture:' + name], name, { type: kind });
      window.__voiceFile = () => {
        const data = new ArrayBuffer(44 + 4800 * 2), view = new DataView(data);
        const text = (at, value) => [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
        text(0, 'RIFF'); view.setUint32(4, data.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 48000, true); view.setUint32(28, 96000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, 9600, true);
        return new File([data], 'voice.wav', { type: 'audio/wav' });
      };
      window.__stageSticker = id => app.sendStickerMessage({ id, state: 'ready' });
    });
    await page.waitForFunction(() => ChatApp.msgDataByKey.has('existing') && ChatApp.msgDataByKey.has('plain'));

    const cancel = await page.evaluate(async () => {
      const app = ChatApp; __resetComposer();
      app.$('msg-input').value = 'Unsent ordinary draft'; await app.addPendingFile(__makeFile('ordinary.txt'));
      const originalPending = app.pendingFiles[0], revocations = [], revoke = URL.revokeObjectURL;
      URL.revokeObjectURL = value => { revocations.push(value); revoke.call(URL, value); };
      try {
        app.beginEditMessage(app.msgDataByKey.get('plain'));
        const accepts = app.canAcceptChatFiles(); await app.addPendingFile(__makeFile('discard.txt'));
        await app.addVoiceMessageFile(__voiceFile()); await __stageSticker('sticker-one');
        const addedURLs = app.pendingFiles.map(file => file.previewURL);
        app.pendingPoll = app.validatePollDraft({ question: 'Discard this poll?', answers: ['Yes', 'No'], durationSeconds: 100 }); app.renderPendingPoll();
        app.setVoicePreview(__voiceFile()); const voiceURL = app.voicePreviewUrl;
        const staged = { files: app.pendingFiles.length, voice: app.pendingFiles.some(file => file.isVoiceMessage), sticker: app.pendingSticker?.id || app.pendingSticker?.sticker?.id || '' };
        app.cancelEditMessage();
        return { accepts, staged, restored: app.pendingFiles.length === 1 && app.pendingFiles[0] === originalPending, text: app.$('msg-input').value, poll: app.pendingPoll, sticker: app.pendingSticker,
          additionsRevoked: [...addedURLs, voiceURL].filter(Boolean).every(url => revocations.includes(url)), originalRevoked: revocations.includes(originalPending.previewURL), stored: __testDatabase.values.messages.test.plain.text, uploads: __uploadCalls.length };
      } finally { URL.revokeObjectURL = revoke; }
    });
    assert.equal(cancel.accepts, true, 'edit mode accepts file inputs'); assert.equal(cancel.staged.files, 2); assert.equal(cancel.staged.voice, true); assert.equal(cancel.staged.sticker, 'sticker-one');
    assert.equal(cancel.restored, true); assert.equal(cancel.text, 'Unsent ordinary draft'); assert.equal(cancel.poll, null); assert.equal(cancel.sticker, null);
    assert.equal(cancel.additionsRevoked, true); assert.equal(cancel.originalRevoked, false); assert.equal(cancel.stored, 'Plain original'); assert.equal(cancel.uploads, 0, 'draft staging never uploads');
    console.log('PASS edit cancel removes only staged additions and restores the ordinary draft.');

    const cap = await page.evaluate(async () => {
      __resetComposer(); const before = Object.keys(__testDatabase.values.messages.test).length;
      ChatApp.beginEditMessage(ChatApp.msgDataByKey.get('plain'));
      for (let i = 0; i < 12; i++) await ChatApp.addPendingFile(__makeFile('limit-' + i + '.txt'));
      await __stageSticker('sticker-one'); await __stageSticker('sticker-two');
      const thirteenth = await ChatApp.addPendingFile(__makeFile('over-limit.txt'));
      return { files: ChatApp.pendingFiles.length, sticker: ChatApp.pendingSticker?.id || ChatApp.pendingSticker?.sticker?.id, thirteenth, newMessages: Object.keys(__testDatabase.values.messages.test).length - before };
    });
    assert.deepEqual(cap, { files: 12, sticker: 'sticker-two', thirteenth: false, newMessages: 0 }, 'one staged sticker is separate from twelve files and replaces the earlier staged choice');

    // Cancel and start another edit while each asynchronous selection is still
    // waiting. Same room/user alone must not authorize the late completion.
    for (const kind of ['file', 'voice-import', 'voice-attach', 'sticker']) {
      const race = await page.evaluate(async kind => {
        const app = ChatApp; __resetComposer(); app.beginEditMessage(app.msgDataByKey.get('plain'));
        const originalLimit = app.ensureFileUploadLimitLoaded, originalRef = app.db.ref;
        let release; const gate = new Promise(resolve => { release = resolve; });
        let task;
        try {
          if (kind === 'sticker') {
            app.db.ref = function (target) { const ref = originalRef.call(this, target); if (target === `${app.STICKER_META_PATH}/sticker-one`) { const once = ref.once; ref.once = async (...args) => { await gate; return once.apply(ref, args); }; } return ref; };
            task = __stageSticker('sticker-one');
          } else {
            app.ensureFileUploadLimitLoaded = async () => { await gate; return originalLimit(); };
            if (kind === 'file') task = app.addPendingFile(__makeFile('late.txt'));
            else if (kind === 'voice-import') task = app.importVoiceAudio(__voiceFile());
            else { app.setVoicePreview(__voiceFile()); task = app.sendVoicePreviewToComposer(); }
          }
          app.cancelEditMessage(); app.beginEditMessage(app.msgDataByKey.get('existing')); release(); await task;
          return { files: app.pendingFiles.length, voice: !!app.voicePreviewBlob, sticker: !!app.pendingSticker, edit: app.editState?.key };
        } finally { app.ensureFileUploadLimitLoaded = originalLimit; app.db.ref = originalRef; app.cancelEditMessage(); }
      }, kind);
      assert.deepEqual(race, { files: 0, voice: false, sticker: false, edit: 'existing' }, `${kind} cannot cross an edit cancellation`);
    }
    console.log('PASS delayed file, voice import/attach, and sticker selection cannot leak into another edit.');

    const voiceMerge = await page.evaluate(async () => {
      const app = ChatApp; __resetComposer(); app.beginEditMessage(app.msgDataByKey.get('plain')); app.openVoicePopover(); app.setVoicePreview(__voiceFile());
      const NativeRecorder = window.MediaRecorder, getStream = app.ensureVoiceRecorderStream, join = app.joinVoiceSegments;
      let release, stopped = 0, merging = false; const gate = new Promise(resolve => { release = resolve; });
      class FixtureRecorder extends EventTarget {
        static isTypeSupported() { return true; }
        constructor() { super(); this.state = 'inactive'; this.mimeType = 'audio/webm'; }
        start() { this.state = 'recording'; }
        stop() { this.state = 'inactive'; this.dispatchEvent(new BlobEvent('dataavailable', { data: new Blob(['audio fixture'], { type: 'audio/webm' }) })); this.dispatchEvent(new Event('stop')); }
      }
      window.MediaRecorder = FixtureRecorder;
      app.ensureVoiceRecorderStream = async () => ({ getTracks: () => [{ stop() { stopped++; } }] });
      app.joinVoiceSegments = async () => { merging = true; await gate; return __voiceFile(); };
      try {
        await app.startVoiceRecording(); app.finishVoiceRecording({ savePreview: true });
        if (!merging) throw new Error('Voice merge did not start');
        app.cancelEditMessage(); app.beginEditMessage(app.msgDataByKey.get('existing')); release();
        for (let i = 0; i < 100 && app.voiceDraftBusy; i++) await new Promise(resolve => setTimeout(resolve, 10));
        return { merging, stopped, busy: app.voiceDraftBusy, voice: !!app.voicePreviewBlob, files: app.pendingFiles.length, edit: app.editState?.key };
      } finally { window.MediaRecorder = NativeRecorder; app.ensureVoiceRecorderStream = getStream; app.joinVoiceSegments = join; app.cancelEditMessage(); }
    });
    assert.equal(voiceMerge.merging, true); assert.ok(voiceMerge.stopped > 0); assert.equal(voiceMerge.busy, false); assert.equal(voiceMerge.voice, false); assert.equal(voiceMerge.files, 0); assert.equal(voiceMerge.edit, 'existing');
    console.log('PASS late audio merge completion cannot recreate a canceled edit recording.');

    await page.evaluate(async () => {
      __resetComposer(); const app = ChatApp; app.beginEditMessage(app.msgDataByKey.get('existing')); app.$('msg-input').value = 'Applied with attachments';
      for (let i = 0; i < 10; i++) await app.addPendingFile(__makeFile('new-' + i + '.txt'));
      await app.addVoiceMessageFile(__voiceFile()); await __stageSticker('sticker-one');
      __uploadCalls.length = 0; __deletions.length = 0; __prefixDeletions.length = 0; __beginStorageGate(); window.__editSave = app.sendTextMessage();
    });
    await page.waitForFunction(() => __uploadCalls.length > 0);
    await page.evaluate(async () => {
      await __testDatabase.ref('messages/test/existing/poll/votes/late-voter').set(['a1']);
      await __testDatabase.ref('messages/test/existing/reactions/heart/late-voter').set(true);
      __releaseStorage(); await __editSave;
    });
    const applied = await page.evaluate(() => {
      const message = __testDatabase.values.messages.test.existing;
      return { text: message.text, files: message.files.length, preservedFile: JSON.stringify(message.files[0]) === JSON.stringify(__originalFile), voice: message.files.filter(f => f.isVoiceMessage).length,
        sticker: message.sticker?.id, votes: message.poll.votes, reactions: message.reactions, scopes: ChatApp.activeFirebaseUploads.size,
        originalIndex: __testDatabase.values.attachmentBlobs.test.existing, deletions: __deletions, prefixDeletions: __prefixDeletions.map(item => item.prefix) };
    });
    assert.equal(applied.text, 'Applied with attachments'); assert.equal(applied.files, 12); assert.equal(applied.preservedFile, true); assert.equal(applied.voice, 1); assert.equal(applied.sticker, 'sticker-one');
    assert.deepEqual(applied.votes, { first: ['a0'], 'late-voter': ['a1'] }); assert.equal(applied.reactions.heart['late-voter'], true); assert.equal(applied.scopes, 0);
    assert.deepEqual(applied.originalIndex, { files: [{ provider: 'b2-worker-v1', objectKey: 'attachments/test/existing/original', kind: 'file', fileName: 'original.txt', name: 'original.txt', size: 8, mimeType: 'text/plain' }] });
    assert.deepEqual(applied.deletions, []); assert.deepEqual(applied.prefixDeletions, []);
    console.log('PASS edited uploads preserve original attachments, concurrent poll votes/reactions, and one independent sticker.');

    await page.evaluate(async () => {
      __resetComposer(); ChatApp.beginEditMessage(ChatApp.msgDataByKey.get('race')); await ChatApp.addPendingFile(__makeFile('ours.txt'));
      ChatApp.$('msg-input').value = 'Concurrent file merge'; __uploadCalls.length = 0; __beginStorageGate(); window.__editSave = ChatApp.sendTextMessage();
    });
    await page.waitForFunction(() => __uploadCalls.length > 0);
    const merge = await page.evaluate(async () => {
      const concurrent = { ...__originalFile, objectKey: 'attachments/test/race/concurrent', fileName: 'concurrent.txt' };
      await __testDatabase.ref('messages/test/race/files').set([concurrent]); __releaseStorage(); await __editSave;
      return { files: __testDatabase.values.messages.test.race.files, scopes: ChatApp.activeFirebaseUploads.size };
    });
    assert.equal(merge.files.length, 2); assert.equal(merge.files[0].objectKey, 'attachments/test/race/concurrent'); assert.equal(merge.files[1].fileName, 'ours.txt'); assert.equal(merge.scopes, 0);

    // A canceled save may still receive successful bytes from the object store.
    // Cleanup waits for those workers and removes only their isolated prefix.
    await page.evaluate(async () => {
      __resetComposer(); ChatApp.beginEditMessage(ChatApp.msgDataByKey.get('plain')); await ChatApp.addPendingFile(__makeFile('cancel-upload.txt'));
      ChatApp.$('msg-input').value = 'Never commit this'; __uploadCalls.length = 0; __deletions.length = 0; __prefixDeletions.length = 0;
      __beginStorageGate(); window.__editSave = ChatApp.sendTextMessage();
    });
    await page.waitForFunction(() => __uploadCalls.length > 0);
    const canceledUpload = await page.evaluate(async () => {
      ChatApp.cancelEditMessage(); const aborted = __uploadCalls.every(item => item.signal?.aborted); __releaseStorage(); await __editSave;
      return { aborted, text: __testDatabase.values.messages.test.plain.text, files: __testDatabase.values.messages.test.plain.files || [], scopes: ChatApp.activeFirebaseUploads.size,
        deleted: __deletions, prefixes: __prefixDeletions.map(item => item.prefix), uploadedPaths: __uploadCalls.map(item => item.path), draftFiles: ChatApp.pendingFiles.length };
    });
    assert.equal(canceledUpload.aborted, true); assert.equal(canceledUpload.text, 'Plain original'); assert.deepEqual(canceledUpload.files, []); assert.equal(canceledUpload.scopes, 0); assert.equal(canceledUpload.draftFiles, 0);
    assert.ok(canceledUpload.prefixes.length || canceledUpload.deleted.length); assert.ok(canceledUpload.uploadedPaths.every(objectKey => canceledUpload.deleted.includes(objectKey) || canceledUpload.prefixes.some(prefix => objectKey.startsWith(prefix))));
    assert.ok(canceledUpload.prefixes.every(prefix => !'attachments/test/existing/original'.startsWith(prefix) && !prefix.startsWith('attachments/test/plain/')), 'cancellation never sweeps an existing message prefix');
    console.log('PASS cancellation during upload aborts the edit and cleans only newly staged bytes.');

    // A failed transaction keeps the original record and leaves the draft retryable.
    const failedCommit = await page.evaluate(async () => {
      __resetComposer(); const app = ChatApp; app.beginEditMessage(app.msgDataByKey.get('plain')); await app.addPendingFile(__makeFile('retry.txt')); app.$('msg-input').value = 'Retry edit';
      const ref = app.db.ref; __deletions.length = 0; __prefixDeletions.length = 0;
      app.db.ref = function (target) { const value = ref.call(this, target); if (target === 'messages/test/plain') value.transaction = async () => { throw new Error('Intentional fixture transaction failure'); }; return value; };
      try { await app.sendTextMessage(); } finally { app.db.ref = ref; }
      return { text: __testDatabase.values.messages.test.plain.text, edit: app.editState?.key, draft: app.$('msg-input').value, files: app.pendingFiles.length, scopes: app.activeFirebaseUploads.size, cleanup: __deletions.length + __prefixDeletions.length };
    });
    assert.equal(failedCommit.text, 'Plain original'); assert.equal(failedCommit.edit, 'plain'); assert.equal(failedCommit.draft, 'Retry edit'); assert.equal(failedCommit.files, 1); assert.equal(failedCommit.scopes, 0); assert.ok(failedCommit.cleanup > 0);

    // Once committed, a later cancel or preview/index refresh error cannot own
    // and delete the message's uploaded objects.
    const afterCommit = await page.evaluate(async () => {
      const app = ChatApp, sync = app.syncRetainedPinnedMessage; __deletions.length = 0; __prefixDeletions.length = 0;
      app.pendingPoll = app.validatePollDraft({ question: 'New poll?', answers: ['One', 'Two'], durationSeconds: 300 }); app.renderPendingPoll();
      app.syncRetainedPinnedMessage = async () => { app.cancelEditMessage(); throw new Error('Intentional postcommit refresh failure'); };
      try { await app.sendTextMessage(); } finally { app.syncRetainedPinnedMessage = sync; }
      return { message: __testDatabase.values.messages.test.plain, deletions: __deletions, prefixes: __prefixDeletions, scopes: app.activeFirebaseUploads.size };
    });
    assert.equal(afterCommit.message.text, 'Retry edit'); assert.equal(afterCommit.message.files.length, 1); assert.equal(afterCommit.message.poll.question, 'New poll?');
    assert.deepEqual(afterCommit.deletions, []); assert.deepEqual(afterCommit.prefixes, []); assert.equal(afterCommit.scopes, 0);
    console.log('PASS precommit failures are retryable; acknowledged edits retain files across cancellation/postcommit refresh failures.');

    const cold = await page.evaluate(async () => {
      __resetComposer(); const app = ChatApp; app.beginEditMessage(app.msgDataByKey.get('cold')); app.$('msg-input').value = 'Cold cache edited';
      const ref = app.db.ref; let initial;
      app.db.ref = function (target) { const value = ref.call(this, target); if (target === 'messages/test/cold') { const transaction = value.transaction; value.transaction = async (fn, ...args) => { initial = fn(null); if (initial !== null) return { committed: false, snapshot: await value.once('value') }; return transaction.call(value, fn, ...args); }; } return value; };
      try { await app.sendTextMessage(); } finally { app.db.ref = ref; }
      return { proposedNull: initial === null, text: __testDatabase.values.messages.test.cold.text };
    });
    assert.deepEqual(cold, { proposedNull: true, text: 'Cold cache edited' }, 'a cold-null transaction allows Firebase to retry with the actual server message');

    await page.evaluate(async () => {
      __resetComposer(); ChatApp.beginEditMessage(ChatApp.msgDataByKey.get('deleted')); await ChatApp.addPendingFile(__makeFile('deleted-message.txt'));
      ChatApp.$('msg-input').value = 'Must never resurrect'; __uploadCalls.length = 0; __deletions.length = 0; __prefixDeletions.length = 0; __beginStorageGate(); window.__editSave = ChatApp.sendTextMessage();
    });
    await page.waitForFunction(() => __uploadCalls.length > 0);
    const deleted = await page.evaluate(async () => {
      await __testDatabase.ref('messages/test/deleted').remove(); __releaseStorage(); await __editSave;
      return { absent: !__testDatabase.values.messages.test.deleted, cleanup: __deletions.length + __prefixDeletions.length, scopes: ChatApp.activeFirebaseUploads.size };
    });
    assert.equal(deleted.absent, true); assert.ok(deleted.cleanup > 0); assert.equal(deleted.scopes, 0);
    console.log('PASS cold-cache transactions retry and truly deleted messages stay deleted.');

    await page.evaluate(() => {
      __resetComposer(); const app = ChatApp; app.beginEditMessage(app.msgDataByKey.get('navigate')); app.$('msg-input').value = 'Committed before navigating';
      window.__restoreRef = app.db.ref; window.__ackWaiting = false;
      const gate = new Promise(resolve => { window.__releaseAck = resolve; });
      app.db.ref = function (target) { const value = __restoreRef.call(this, target); if (target === 'messages/test/navigate') { const transaction = value.transaction; value.transaction = async (...args) => { const result = await transaction.apply(value, args); window.__ackWaiting = true; await gate; return result; }; } return value; };
      window.__editSave = app.sendTextMessage();
    });
    await page.waitForFunction(() => __ackWaiting && ChatApp.editState?.committing);
    assert.equal(await page.locator('#btn-cancel-edit').isDisabled(), true, 'cancellation is disabled only during the atomic commit acknowledgement');
    await page.evaluate(() => ChatApp.openRoom('other', { quiet: true }));
    await page.waitForFunction(() => ChatApp.currentRoomId === 'other' && !ChatApp.roomLoadingActive);
    const navigation = await page.evaluate(async () => {
      ChatApp.$('msg-input').value = 'New room draft must survive'; await ChatApp.addPendingFile(__makeFile('other-room.txt'));
      __releaseAck(); await __editSave; ChatApp.db.ref = __restoreRef;
      return { room: ChatApp.currentRoomId, text: ChatApp.$('msg-input').value, files: ChatApp.pendingFiles.map(file => file.fileName), saved: __testDatabase.values.messages.test.navigate.text, edit: !!ChatApp.editState };
    });
    assert.deepEqual(navigation, { room: 'other', text: 'New room draft must survive', files: ['other-room.txt'], saved: 'Committed before navigating', edit: false });
    console.log('PASS a late commit acknowledgement never clears a new room draft.');

    await page.evaluate(() => ChatApp.openRoom('test', { quiet: true }));
    await page.waitForFunction(() => ChatApp.currentRoomId === 'test' && !ChatApp.roomLoadingActive);
    const clearOwnership = await page.evaluate(async () => {
      const app = ChatApp, vinny = app.isVinny, keys = app.readRoomAttachmentKeys;
      const message = { ...__testDatabase.values.messages.test.existing, pinned: true };
      const stages = [...new Set(message.files.slice(1).map(file => atob(file.objectKey.split('/')[2].replace(/-/g, '+').replace(/_/g, '/'))))];
      if (!stages.length || !stages.every(key => app.firebasePushKeyTimestamp(key) > 0)) throw new Error('Staging fixture needs real timestamped push keys');
      app.isVinny = () => true; app.readRoomAttachmentKeys = async room => Object.keys(__testDatabase.values.attachmentBlobs?.[room] || {});
      __prefixDeletions.length = 0;
      try {
        await __testDatabase.ref('messages/test/existing').set(message); await __testDatabase.ref('pinnedMessages/test/existing').set(message);
        await app.clearRoomMessages('test');
        const retained = stages.every(key => !!__testDatabase.values.attachmentBlobs.test[key]);
        const retainedObjects = message.files.slice(1).every(file => !__prefixDeletions.some(item => file.objectKey.startsWith(item.prefix)));
        const pinnedStillPresent = !!__testDatabase.values.messages.test.existing;
        await __testDatabase.ref('messages/test/existing/pinned').set(false); await __testDatabase.ref('pinnedMessages/test/existing').remove();
        await app.clearRoomMessages('test');
        return { retained, retainedObjects, pinnedStillPresent, removed: stages.every(key => !__testDatabase.values.attachmentBlobs?.test?.[key]), deletedPrefixes: stages.every(key => __prefixDeletions.some(item => item.prefix === app.externalAttachmentPrefix('test', key))) };
      } finally { app.isVinny = vinny; app.readRoomAttachmentKeys = keys; }
    });
    assert.deepEqual(clearOwnership, { retained: true, retainedObjects: true, pinnedStillPresent: true, removed: true, deletedPrefixes: true });
    console.log('PASS pinned-message Clear retains committed edit storage; unpinned Clear removes its staged prefix.');
    assert.deepEqual(errors, []); await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
