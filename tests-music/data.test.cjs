'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const installFirebaseMock = require('../tests/firebase-mock.js');
async function fixture() {
  const context = { console, Blob, URL, AbortController, Uint8Array, atob, btoa, setTimeout, clearTimeout, queueMicrotask };
  context.window = context; context.globalThis = context;
  context.Audio = class { duration = 12; set src(value) { if (value) queueMicrotask(() => this.onloadedmetadata?.()); } removeAttribute() {} load() {} };
  vm.createContext(context); vm.runInContext(`(${installFirebaseMock})()`, context);
  const scopes = new Map(); let init;
  const App = context.ChatApp = { currentUser: { code: 'TEST-USER' }, db: context.firebase.database(), schedulesPeopleByCode: new Map(),
    normalizeTransformToRel: value => value, register: (_id, fn) => { init = fn; }, refreshSchedulesPeople() {}, startAppPresence() {}, stopAppPresence() {},
    throwIfUploadAborted(signal) { if (signal?.aborted) throw new Error('Upload canceled'); },
    createFirebaseUploadScope(options) { const controller = new AbortController(), scope = { ...options, controller, signal: controller.signal }; scopes.set(scope, true); return scope; },
    armFirebaseUploadDisconnect: async () => {}, finishFirebaseUploadScope: async scope => scopes.delete(scope),
    cleanupFirebaseUploadScope: async scope => { scopes.delete(scope); if (!scope.committed) await scope.cleanup(); },
    readBlobSliceAsBase64: async (blob, start, end) => Buffer.from(await blob.slice(start, end).arrayBuffer()).toString('base64'),
    updateRefWithRetry: (ref, data) => ref.update(data)
  };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/admin/panel.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../music/data.js'), 'utf8'), context); init(); await App.musicSubscribe();
  return { App, context, db: context.__testDatabase, scopes };
}
test('playlists enforce owner editing, required titles and immutable owner', async () => {
  const { App, db } = await fixture();
  const playlist = await App.musicCreatePlaylist({ name: 'One' }); await Promise.resolve();
  await App.musicUpdatePlaylist(playlist, { name: 'Two', ownerCode: 'OTHER' });
  assert.equal(db.get(`music/playlists/${playlist}`).ownerCode, 'TEST-USER');
  App.currentUser = { code: 'OTHER' };
  await assert.rejects(App.musicUpdatePlaylist(playlist, { name: 'Stolen' }), /owner/);
  await assert.rejects(App.musicDeletePlaylist(playlist), /owner/);
  assert.equal(db.get(`music/playlists/${playlist}`).name, 'Two');
  await assert.rejects(App.musicCreatePlaylist({ name: ' ' }), /name/);
});
test('transaction edits do not resurrect deleted playlist or track; ordering keeps concurrent additions', async () => {
  const { App, db } = await fixture(); const playlist = await App.musicCreatePlaylist({ name: 'Test' });
  await db.ref(`music/playlists/${playlist}/tracks`).set({ a: { title: 'A', order: 0 }, b: { title: 'B', order: 1 }, c: { title: 'C', order: 2 } });
  await App.musicReorderTracks(playlist, ['b', 'a', 'deleted']);
  assert.deepEqual(Array.from(App.musicGetTracks(playlist), track => track.id), ['b', 'a', 'c']);
  await assert.rejects(App.musicUpdateTrack(playlist, 'gone', { title: 'Missing' }), /no longer/);
  await App.musicDeletePlaylist(playlist);
  await assert.rejects(App.musicUpdatePlaylist(playlist, { name: 'Back' }), /no longer/);
  assert.equal(db.get(`music/playlists/${playlist}`), null);
});
test('audio is chunked only into RTDB, published after bytes, and round trips unchanged', async () => {
  const { App, db, scopes } = await fixture(); const playlist = await App.musicCreatePlaylist({ name: 'Test' }); await Promise.resolve();
  const bytes = Buffer.alloc(450000); for (let index = 0; index < bytes.length; index++) bytes[index] = index % 253;
  const file = new Blob([bytes], { type: 'audio/wav' }); file.name = 'song.wav';
  const progress = []; const trackId = await App.musicUploadTrack(playlist, file, { title: 'Test Audio', artist: 'Artist' }, value => progress.push(value));
  const track = App.musicGetTracks(playlist).find(value => value.id === trackId);
  assert.equal(track.chunkCount, 3); assert.equal(track.duration, 12); assert.equal(scopes.size, 0); assert.equal(progress.at(-1), 100);
  const parts = db.get(`music/audio/${track.blobId}/parts`);
  assert.deepEqual(Buffer.concat(Object.keys(parts).sort().map(key => Buffer.from(parts[key], 'base64'))), bytes);
  assert.ok(db.writes.every(write => write.path.startsWith('music/')));
  const publishIndex = db.writes.findIndex(write => write.path === `music/playlists/${playlist}` && write.value?.tracks?.[trackId]);
  const lastChunkIndex = db.writes.findLastIndex(write => write.path.startsWith(`music/audio/${track.blobId}/parts/`));
  assert.ok(publishIndex > lastChunkIndex);
  // Drop the upload cache, then verify the independent download decoder.
  App.musicUnsubscribe(); await App.musicSubscribe();
  const url = await App.musicGetAudioURL(track); const decoded = await fetch(url).then(response => response.arrayBuffer());
  assert.deepEqual(Buffer.from(decoded), bytes); App.musicUnsubscribe();
});
test('failed or revoked uploads remove bytes and never publish a track', async () => {
  const { App, db, scopes } = await fixture(); const playlist = await App.musicCreatePlaylist({ name: 'Test' }); await Promise.resolve();
  const file = new Blob([Buffer.alloc(300000)], { type: 'audio/wav' }); file.name = 'song.wav';
  let count = 0; const write = App.updateRefWithRetry;
  App.updateRefWithRetry = async (...args) => { await write(...args); if (++count === 1) { App.currentUser = { code: 'OTHER' }; App.musicUnsubscribe(); } };
  await assert.rejects(App.musicUploadTrack(playlist, file, { title: 'Song' }), /account changed/);
  assert.equal(Object.keys(db.get('music/audio') || {}).length, 0); assert.equal(db.get(`music/playlists/${playlist}/tracks`), null); assert.equal(scopes.size, 0);
});
test('Vinny can manage another library and its audio without taking ownership', async () => {
  const { App, db } = await fixture();
  const playlist = await App.musicCreatePlaylist({ name: 'Original' });
  App.currentUser = { code: 'ADMIN', username: 'Vinny' };
  await App.musicSubscribe();
  const second = await App.musicCreatePlaylist({ name: 'Another' }, 'TEST-USER');
  assert.equal(db.get(`music/playlists/${second}/ownerCode`), 'TEST-USER');
  await App.musicUpdatePlaylist(playlist, { name: 'Updated', ownerCode: 'ADMIN' });
  assert.equal(db.get(`music/playlists/${playlist}/ownerCode`), 'TEST-USER');
  const file = new Blob(['audio'], { type: 'audio/wav' }); file.name = 'test.wav';
  const a = await App.musicUploadTrack(playlist, file, { title: 'A' });
  const b = await App.musicUploadTrack(playlist, file, { title: 'B' });
  const blobId = db.get(`music/playlists/${playlist}/tracks/${a}/blobId`);
  assert.equal(db.get(`music/audio/${blobId}/meta/ownerCode`), 'TEST-USER');
  await App.musicUpdateTrack(playlist, b, { title: 'Edited', album: 'Album' });
  await App.musicReorderTracks(playlist, [b, a]);
  assert.deepEqual(Array.from(App.musicGetTracks(playlist), track => track.title), ['Edited','A']);
  await App.musicMovePlaylist(playlist, second, 'before');
  assert.deepEqual(Array.from(App.musicGetPlaylists('TEST-USER'), item => item.id), [playlist, second]);
  await App.musicDeleteTrack(playlist, a);
  const delegated = App.musicGetAudios('TEST-USER').find(t => t.blobId === blobId);
  assert.equal(delegated.title, 'A');
  assert.equal(delegated.uploadedBy, 'ADMIN');
  assert.equal(App.musicGetAudios('ADMIN').length, 0);
  await App.musicDeletePlaylist(playlist);
  assert.equal(App.musicData.playlists.has(playlist), false);
  assert.deepEqual(Array.from(App.musicGetAudios('TEST-USER'), t => t.title), ['A', 'Edited']);
  await App.musicDeleteUpload(delegated);
  assert.equal(db.get(`music/audio/${blobId}`), null);
  assert.deepEqual(Array.from(db.get('music/playlistOrder/TEST-USER')), [second]);
});
test('standalone and legacy uploads share a sorted library; membership is per playlist and does not grant upload credit', async () => {
  const { App, db } = await fixture();
  await db.ref('music/playlists/legacy').set({ownerCode:'OTHER',name:'Old mix',tracks:{old:{title:'Zulu',blobId:'old-blob',album:'Old album'}}});
  await db.ref('music/audio/old-blob/meta').set({ownerCode:'OTHER',playlistId:'legacy'});
  const actor = App.currentUser.code, library = App.musicLibraryId(actor);
  const file = new Blob(['playable bytes'], {type:'audio/wav'}); file.name = 'song.wav';
  const key = await App.musicUploadTrack(library, file, { title:'Indie', album:'Indigo' });
  assert.equal(App.musicGetPlaylists(actor).length,0);
  assert.equal(App.musicGetTracks(library)[0].id, key);
  const p = await App.musicCreatePlaylist({name:'Mix'}), q = await App.musicCreatePlaylist({name:'Other mix'});
  await App.musicUploadTrack(p, file, { title:'another' });
  assert.deepEqual(Array.from(App.musicGetAudios(actor), t => t.title), ['another','Indie']);
  const legacy = App.musicGetTracks('legacy')[0];
  assert.deepEqual(Array.from(App.musicGetAudios('OTHER'), t => t.title), ['Zulu']);
  await App.musicAddToPlaylist('legacy',legacy,p);
  assert.deepEqual(Array.from(App.musicDestinationPlaylists('legacy',legacy), t => t.id), [q]);
  await assert.rejects(App.musicAddToPlaylist('legacy',legacy,p), /contains/);
  assert.equal(App.musicGetAudios(actor).length,2);
  assert.equal(App.musicDestinationPlaylists(p,App.musicGetTracks(p)[0]).length,0);
  const solo = App.musicGetAudios(actor).find(t=>t.id===key);
  await App.musicAddToPlaylist(library,solo,q);
  await App.musicEditUpload(solo,{title:'Indigo'});
  await App.musicDeleteUpload(solo);
  assert.equal(App.musicGetTracks(q)[0].blobId,key);
  assert.ok(db.get(`music/audio/${key}/parts`));
  await App.musicDeleteTrack(q,App.musicGetTracks(q)[0].id);
  assert.equal(db.get(`music/audio/${key}`),null,'last saved copy releases shared bytes after original deletion');
  const owner = App.currentUser;
  App.currentUser = {code:'OTHER'}; await App.musicSubscribe();
  await App.musicDeletePlaylist('legacy');
  assert.equal(App.musicGetAudios('OTHER')[0].title,'Zulu');
  await App.musicDeleteUpload(App.musicGetAudios('OTHER')[0]);
  assert.equal(App.musicGetAudios('OTHER').length,0);
  assert.equal(App.musicGetTracks(p).some(track=>track.blobId==='old-blob'),true);
  App.currentUser = owner; await App.musicSubscribe();
  assert.deepEqual(Array.from(App.musicGetAudios(actor), t => t.title), ['another']);
  await App.musicDeletePlaylist(p);
  assert.equal(db.get('music/audio/old-blob'),null);
});
test('playlist placement preserves legacy order, newly added playlists and concurrent reorders across reloads', async () => {
  const { App, db } = await fixture();
  const ownerCode = App.currentUser.code;
  for (const [id, createdAt] of [['one', 1], ['two', 2], ['three', 3]])
    await db.ref('music/playlists/' + id).set({ ownerCode, name: id, createdAt });
  const ids = () => Array.from(App.musicGetPlaylists(ownerCode), item => item.id);
  assert.deepEqual(ids(), ['three','two','one']);
  await App.musicMovePlaylist('one','three','before');
  assert.deepEqual(ids(), ['one','three','two']);
  await db.ref('music/playlists/new').set({ ownerCode, name: 'New', createdAt: 4 });
  assert.deepEqual(ids(), ['new','one','three','two']);
  await db.ref('music/playlistOrder/' + ownerCode).set(['two','one','three','pendingMetadata']);
  await App.musicMovePlaylist('new','one','after');
  assert.deepEqual(Array.from(db.get('music/playlistOrder/' + ownerCode)), ['two','one','new','three','pendingMetadata']);
  App.musicUnsubscribe(); await App.musicSubscribe();
  assert.deepEqual(ids(), ['two','one','new','three']);
});
test('two concurrent adds reserve one playable copy and release the losing reservation', async () => {
  const { App, db } = await fixture(), actor = App.currentUser.code;
  const p = await App.musicCreatePlaylist({name:'Private mix'}), libraryId = App.musicLibraryId(actor);
  const blob = new Blob(['song'],{type:'audio/wav'}); blob.name='test.wav';
  const blobId = await App.musicUploadTrack(libraryId,blob,{title:'My upload'}), track = App.musicGetAudios(actor)[0];
  const adds = await Promise.allSettled([App.musicAddToPlaylist(libraryId,track,p),App.musicAddToPlaylist(libraryId,track,p)]);
  assert.equal(adds.filter(result => result.status==='fulfilled').length,1);
  const copy = App.musicGetTracks(p)[0];
  assert.deepEqual(Object.keys(db.get(`music/audio/${blobId}/meta/references`)),[copy.referenceKey]);
  App.currentUser={code:'OTHER'}; await App.musicSubscribe();
  await assert.rejects(App.musicDeleteUpload(track),/available/);
  await assert.rejects(App.musicEditUpload(track,{title:'Hijack'}),/available/);
  assert.equal(App.musicGetAudios(actor)[0].title,'My upload');
});
test('a Vinny display name cannot grant editing, upload, creation or reordering on another profile', async () => {
  const { App, db } = await fixture();
  const a = await App.musicCreatePlaylist({ name: 'A' }), b = await App.musicCreatePlaylist({ name: 'B' });
  App.currentUser = { code: 'OTHER', username: 'other', displayName: 'Vinny' };
  await App.musicSubscribe();
  await assert.rejects(App.musicCreatePlaylist({name:'Wrong library'}, 'TEST-USER'), /owner/);
  await assert.rejects(App.musicUploadTrack(a, new Blob(['x']), {title:'X'}), /owner/);
  await assert.rejects(App.musicUpdateTrack(a, 't', {title:'X'}), /owner/);
  await assert.rejects(App.musicDeleteTrack(a, 't'), /owner/);
  await assert.rejects(App.musicReorderTracks(a, ['t']), /owner/);
  await assert.rejects(App.musicMovePlaylist(a, b, 'before'), /owner/);
  assert.equal(db.get('music/playlistOrder'), null);
});
test('download rejects missing or damaged parts', async () => {
  const { App, db } = await fixture(); const track = { blobId: 'test', size: 3, chunkCount: 1, chunkBytes: 196608, mime: 'audio/wav' };
  await assert.rejects(App.musicGetAudioURL(track), /incomplete/);
  await db.ref('music/audio/test/parts/000000').set('AA==');
  await assert.rejects(App.musicGetAudioURL(track), /damaged|incomplete/);
});
test('optimistic moves survive late snapshots and serialize rapid placements; rejected writes roll back', async () => {
  const { App, db } = await fixture();
  const playlist = await App.musicCreatePlaylist({ name: 'Road Trip' });
  const base = 'music/playlists/' + playlist + '/tracks/';
  for (const [i, id] of ['a','b','c','d','e'].entries()) await db.ref(base + id).set({title:id, order:i});
  const list = () => Array.from(App.musicGetTracks(playlist), t => t.id).join('');
  let firstWrite, resume;
  const held = new Promise(resolve => { resume = resolve; });
  const entered = new Promise(resolve => { firstWrite = resolve; });
  const originalRef = App.db.ref;
  App.db.ref = path => {
    const ref = originalRef(path);
    if (path === base + 'e/order') {
      const transaction = ref.transaction;
      ref.transaction = async (...args) => { firstWrite(); await held; return transaction(...args); };
    }
    return ref;
  };
  const first = App.musicMoveTrack(playlist, 'e','a',false);
  assert.equal(list(),'eabcd');
  const second = App.musicMoveTrack(playlist,'d','a',false);
  assert.equal(list(),'edabc');
  await entered;
  await db.ref(base + 'f').set({title:'Additional track',order:5});
  assert.equal(list(),'edabcf');
  resume(); await Promise.all([first,second]);
  assert.equal(list(),'edabcf');
  assert.equal(db.writes.at(-1).path,base+'d/order');
  App.db.ref = path => {
    const ref = originalRef(path);
    if (path === base + 'c/order') ref.transaction = async () => { throw Error('Lost connection'); };
    return ref;
  };
  const rejected = App.musicMoveTrack(playlist,'c','e',false);
  assert.equal(list(),'cedabf');
  await assert.rejects(rejected,/Lost connection/);
  assert.equal(list(),'edabcf');
  App.db.ref = originalRef;
  await db.ref(base + 'd/order').set(null);
  await App.musicMoveTrack(playlist,'d','b',true);
  assert.equal(list(),'eabdcf','legacy track without a rank is normalized in place');
  App.musicUnsubscribe(); await App.musicSubscribe();
  assert.equal(list(),'eabdcf');
});
test('delegated standalone uploads use the selected profile and remain editable by that owner', async () => {
  const {App, db} = await fixture();
  const file = new Blob(['audio'], {type:'audio/wav'}); file.name = 'sample.wav';
  const library = App.musicLibraryId('OWNER');
  await assert.rejects(App.musicUploadTrack(library, file, {title:'Blocked'}), /owner/);
  App.currentUser = {code:'ADMIN',username:'Vinny'}; await App.musicSubscribe();
  const key = await App.musicUploadTrack(library, file, {title:'For Owner'});
  const original = App.musicGetAudios('OWNER')[0];
  assert.equal(original.playlistId,library);
  assert.equal(db.get('music/audio/'+key+'/meta/uploadedBy'),'ADMIN');
  await App.musicEditUpload(original,{title:'Updated'});
  await App.musicUploadTrack(App.musicLibraryId('ADMIN'),file,{title:'Another'});
  assert.deepEqual(Array.from(App.musicGetAudios(),t=>t.title),['Another','Updated']);
  assert.deepEqual(Array.from(App.musicGetAudios('OWNER'),t=>t.title),['Updated']);
  App.currentUser = {code:'OWNER',username:'Owner'}; await App.musicSubscribe();
  await App.musicEditUpload(original,{title:'Mine'});
  assert.equal(App.musicGetAudios('OWNER')[0].title,'Mine');
});
test('portable prefetch stops issuing part reads after stop and keeps work for the selected song', async () => {
  const { App } = await fixture(), chunkBytes = 192 * 1024, count = 9;
  const base64 = Buffer.alloc(chunkBytes, 12).toString('base64');
  const track = { blobId:'preload', mime:'audio/mpeg', chunkBytes, chunkCount:count, size:chunkBytes * count };
  let resume, opened, started, gate, reads;
  function reset() {
    reads = [];
    gate = new Promise(resolve => { resume = resolve; });
    started = new Promise(resolve => { opened = resolve; });
  }
  reset();
  App.readMusicFile = () => Promise.resolve(null); // Catalog entry was evicted in another tab.
  App.db.ref = key => ({ async once() {
    reads.push(key);
    if (reads.length === 6) opened();
    await gate; return {val:() => base64};
  } });
  const stale = App.musicWarmTrack(track, true);
  await started; App.cancelMusicAudioRead(); resume(); await stale;
  assert.equal(reads.length, 6, 'cancelled speculation launched no subsequent reads');
  reset();
  const warmed = App.musicWarmTrack(track, true);
  await started; App.cancelMusicAudioRead(track.blobId);
  const selected = App.musicGetAudioURL(track);
  resume();
  const url = await selected; await warmed;
  assert.equal(reads.length, count);
  assert.equal(new Set(reads).size, count, 'selected track reuses every pending part');
  assert.equal((await (await fetch(url)).blob()).size, track.size);
  App.musicUnsubscribe();
});
