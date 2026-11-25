/* Music metadata and audio live exclusively in Firebase Realtime Database. */
(function (App) {
  'use strict';
  const CHUNK_BYTES = 192 * 1024, MAX_BYTES = 100 * 1024 * 1024;
  const urls = new Map(), downloads = new Map(), pendingMoves = new Map();
  let session = null, generation = 0;
  const id = value => {
    const key = String(value || '');
    if (!key || /[.#$\[\]/\u0000-\u001f\u007f]/.test(key) || key.length > 180) throw new Error('Invalid Music item.');
    return key;
  };
  const text = (value, max) => String(value || '').trim().slice(0, max);
  const now = () => Date.now() + (Number(App.appPresenceServerOffsetMs) || 0);
  const fail = message => { throw new Error(message); };
  const currentOwner = () => App.currentUser?.code ? id(App.currentUser.code) : fail('Sign in to use Music.');
  App.musicCanManage = ownerCode => !!ownerCode && !!App.currentUser?.code &&
    (App.currentUser.code === ownerCode || App.isVinny?.() === true);
  const notify = () => {
    const run = () => { App.renderMusic?.(); App.musicPlayerDataChanged?.(); App.refreshUserMenuLinks?.(); };
    if (App.queueLiveUpdate) App.queueLiveUpdate('music:data', run); else run();
  };
  const photo = source => {
    const value = String(source || '');
    if (!value) return null;
    if (value.length > 8 * 1024 * 1024 || !/^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) throw new Error('Choose a PNG, JPG, GIF, or WebP image under 6 MB.');
    return value;
  };
  const transform = value => value ? App.normalizeTransformToRel(value, 132) : null;
  const playlistFields = (data, partial = false) => {
    const out = {};
    if (!partial || Object.hasOwn(data, 'name')) { out.name = text(data.name, 100); if (!out.name) fail('Enter a playlist name.'); }
    if (!partial || Object.hasOwn(data, 'photoDataURL')) out.photoDataURL = photo(data.photoDataURL);
    if (!partial || Object.hasOwn(data, 'photoTransform')) out.photoTransform = transform(data.photoTransform);
    return out;
  };
  const trackFields = (data, partial = false) => {
    const out = {};
    if (!partial || Object.hasOwn(data, 'title')) { out.title = text(data.title, 160); if (!out.title) fail('Enter an audio title.'); }
    for (const key of ['artist', 'album']) if (!partial || Object.hasOwn(data, key)) out[key] = text(data[key], 160);
    if (!partial || Object.hasOwn(data, 'photoDataURL')) out.photoDataURL = photo(data.photoDataURL);
    if (!partial || Object.hasOwn(data, 'photoTransform')) out.photoTransform = transform(data.photoTransform);
    return out;
  };
  // Standalone uploads and archived playlist uploads have metadata only here.
  // Audio bytes remain at music/audio/{blobId} and are never copied between playlists.
  App.musicLibraryId = ownerCode => 'audio:' + id(ownerCode);
  App.musicLibraryOwner = collection => String(collection || '').startsWith('audio:') ? String(collection).slice(6) : '';
  const emptyLibrary = () => ({ playlists: new Map(), tracks: new Map(), audios: new Map(), users: new Map(), orders: new Map(), loaded: false, error: '' });
  App.musicData = emptyLibrary();
  App.musicLimits = Object.freeze({ maxBytes: MAX_BYTES, chunkBytes: CHUNK_BYTES });
  function acceptPlaylists(snapshot) {
    const playlists = new Map(), tracks = new Map(), audios = new Map();
    function catalog(item, ownerCode, sourceId) {
      if (!ownerCode || !item?.blobId || typeof item.title !== 'string' || item.playlistReference) return;
      if (!audios.has(ownerCode)) audios.set(ownerCode, new Map());
      audios.get(ownerCode).set(item.blobId, { ...item, uploaderCode: ownerCode, sourceId, id: item.blobId, playlistId: App.musicLibraryId(ownerCode) });
    }
    for (const [key, raw] of Object.entries(snapshot.val() || {})) {
      if (!raw) continue;
      const { tracks: records, uploads, ...metadata } = raw;
      for (const track of Object.values(uploads || {})) catalog(track, track?.uploaderCode || raw.ownerCode, key);
      if (typeof raw.ownerCode !== 'string' || typeof raw.name !== 'string') continue;
      playlists.set(key, { ...metadata, id: key });
      tracks.set(key, new Map(Object.entries(records || {}).filter(([, track]) => track && typeof track.title === 'string').map(([trackId, track]) => [trackId, { ...track, id: trackId, playlistId: key }])));
      // Older uploads only recorded the playlist owner.
      for (const track of Object.values(records || {})) catalog(track, track?.uploaderCode || raw.ownerCode, key);
    }
    Object.assign(App.musicData, { playlists, tracks, audios });
  }
  App.musicSubscribe = function () {
    const code = currentOwner();
    App.prepareMusicFileCache?.();
    // Home may release the shared directory while no people screen is open.
    // Reacquire it on every Music open, even when playlist data is already live.
    App.startSchedulesPeopleListener?.();
    if (session?.code === code) return session.ready;
    App.musicUnsubscribe({ keepScreen: true });
    const state = { code, generation: ++generation, listeners: [], ready: null, cancel: null };
    session = state;
    state.ready = new Promise((resolve, reject) => {
      state.cancel = () => reject(new Error('Music session ended.'));
      const received = new Set();
      const listen = (path, accept) => {
        const ref = App.db.ref(path);
        const callback = snapshot => {
          if (session !== state) return;
          accept(snapshot);
          received.add(path);
          if (received.size === 2) { App.musicData.loaded = true; App.musicData.error = ''; resolve(); }
          notify();
        };
        state.listeners.push({ ref, callback });
        ref.on('value', callback, error => {
          if (session !== state) return;
          received.delete(path); App.musicData.error = 'Could not load Music. Check your connection.'; notify(); reject(error);
        });
      };
      listen('music/playlists', acceptPlaylists);
      listen('music/playlistOrder', snapshot => { App.musicData.orders = new Map(Object.entries(snapshot.val() || {})); });
    });
    state.ready.catch(() => {});
    App.musicRefreshUsers();
    return state.ready;
  };
  App.musicRefreshUsers = function () {
    App.musicData.users = new Map([...(App.schedulesPeopleByCode || new Map())].filter(([, user]) => user && user.code && !user.scheduleOnly));
    if (App.currentUser && !App.musicData.users.has(App.currentUser.code)) App.musicData.users.set(App.currentUser.code, App.currentUser);
    if (session) notify();
  };
  App.musicUnsubscribe = function (options = {}) {
    if (session) { for (const {ref, callback} of session.listeners) ref.off('value', callback); session.cancel?.(); }
    session = null; ++generation;
    for (const entry of urls.values()) URL.revokeObjectURL(entry.url);
    urls.clear(); downloads.clear(); pendingMoves.clear(); warmJob = null; currentJob = null; ++warmRequest;
    App.musicData = emptyLibrary();
    if (!options.keepScreen && App.musicScreenOpen) App.closeMusic?.();
  };
  App.musicWatchPlaylist = async function (playlistId) {
    id(playlistId); await App.musicSubscribe();
    return App.musicGetTracks(playlistId);
  };
  const titleCollator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  App.musicGetAudios = function (ownerCode) {
    const catalog = App.musicData.audios;
    const uploads = ownerCode == null ? [...catalog.values()].flatMap(library => [...library.values()]) :
      [...(catalog.get(ownerCode)?.values() || [])];
    return uploads.sort((a, b) => titleCollator.compare(a.title, b.title) || a.id.localeCompare(b.id));
  };
  const trackOrder = (a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) ||
    (Number(a.addedAt) || 0) - (Number(b.addedAt) || 0) || a.id.localeCompare(b.id);
  function placeTrack(list, move) {
    const from = list.findIndex(track => track.id === move.source);
    let to = list.findIndex(track => track.id === move.target);
    if (from < 0 || to < 0 || from === to) return false;
    if (move.after) to++;
    if (from < to) to--;
    list.splice(to, 0, ...list.splice(from, 1));
    return true;
  }
  App.musicGetTracks = function (playlistId) {
    const libraryOwner = App.musicLibraryOwner(playlistId);
    if (libraryOwner) return App.musicGetAudios(libraryOwner);
    const list = [...(App.musicData.tracks.get(playlistId)?.values() || [])].sort(trackOrder);
    for (const move of pendingMoves.get(playlistId) || []) placeTrack(list, move);
    return list;
  };
  function storedIds(order) {
    return [...new Set(Object.values(order || {}).filter(key => typeof key === 'string'))];
  }
  function newestFirst(ownerCode) {
    return [...App.musicData.playlists.values()].filter(p => p.ownerCode === ownerCode)
      .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0) || a.id.localeCompare(b.id));
  }
  App.musicGetPlaylists = function (ownerCode) {
    const rank = new Map(storedIds(App.musicData.orders.get(ownerCode)).map((key, i) => [key, i]));
    // Newly created and legacy playlists keep newest-first order ahead of the saved list.
    return newestFirst(ownerCode).sort((a, b) => (rank.get(a.id) ?? -1) - (rank.get(b.id) ?? -1));
  };
  App.musicMovePlaylist = async function (playlistId, targetId, placement) {
    const source = App.musicData.playlists.get(id(playlistId)), target = App.musicData.playlists.get(id(targetId));
    if (!source || !target || source.ownerCode !== target.ownerCode) fail('Choose two playlists from the same profile.');
    if (!App.musicCanManage(source.ownerCode)) fail('Only the playlist owner or Vinny can reorder playlists.');
    if (!['before', 'after'].includes(placement)) fail('Choose a playlist position.');
    if (source.id === target.id) return;
    const actor = currentOwner(), started = generation, ownerCode = source.ownerCode;
    const result = await App.db.ref(`music/playlistOrder/${id(ownerCode)}`).transaction(order => {
      if (App.currentUser?.code !== actor || generation !== started || !App.musicCanManage(ownerCode)) return;
      if (App.musicData.playlists.get(source.id)?.ownerCode !== ownerCode || App.musicData.playlists.get(target.id)?.ownerCode !== ownerCode) return;
      // Change just this relative placement on every retry. Preserve another
      // device's order, including IDs whose metadata has not reached us yet.
      const ranked = storedIds(order), seen = new Set(ranked);
      const ordered = newestFirst(ownerCode).map(p => p.id).filter(key => !seen.has(key)).concat(ranked);
      ordered.splice(ordered.indexOf(source.id), 1);
      ordered.splice(ordered.indexOf(target.id) + (placement === 'after' ? 1 : 0), 0, source.id);
      return ordered;
    }, undefined, false);
    if (!result.committed) fail('Could not move this playlist. Refresh Music and try again.');
  };
  App.musicCreatePlaylist = async function (data, ownerCode = currentOwner()) {
    id(ownerCode);
    if (!App.musicCanManage(ownerCode)) fail('Only the playlist owner or Vinny can create playlists here.');
    const ref = App.db.ref('music/playlists').push();
    await ref.set({ ...playlistFields(data), ownerCode, createdAt: now(), updatedAt: now() });
    return ref.key;
  };
  async function mutate(playlistId, apply, expectedActor = currentOwner(), expectedGeneration = generation) {
    const ref = App.db.ref(`music/playlists/${id(playlistId)}`);
    let reason = 'This playlist is no longer available.', touched = false;
    const result = await ref.transaction(value => {
      touched = false;
      if (App.currentUser?.code !== expectedActor || generation !== expectedGeneration) { reason = 'Your account changed. Try again.'; return; }
      if (!value) return null; // Retry a cold SDK cache without resurrecting a deleted playlist.
      if (typeof value.name !== 'string') return; // A removed playlist can still retain its user's uploads.
      if (!App.musicCanManage(value.ownerCode)) { reason = 'Only the playlist owner or Vinny can edit it.'; return; }
      const next = apply(value);
      if (next === undefined) { reason = 'This audio is no longer available.'; return; }
      touched = true;
      if (next) next.updatedAt = now();
      return next;
    }, undefined, false);
    if (!result.committed || !touched) throw new Error(reason);
    return result;
  }
  App.musicUpdatePlaylist = (playlistId, patch) => { const fields = playlistFields(patch, true); return mutate(playlistId, value => ({ ...value, ...fields })); };
  function archiveUpload(value, track) {
    if (!track?.blobId || track.playlistReference) return;
    (value.uploads ||= {})[track.blobId] = { ...track, uploaderCode: track.uploaderCode || value.ownerCode };
  }
  // Reserve a reference in the tiny descriptor before exposing the track. The
  // same transaction arbitrates deletion of the original and the last copy.
  // Neither operation reads audio chunks or writes to another user's playlist.
  async function changeBlobReference(blobId, action, referenceKey) {
    const blob = App.db.ref(`music/audio/${id(blobId)}`);
    let accepted = false;
    const result = await blob.child('meta').transaction(meta => {
      accepted = false;
      if (!meta) return null; // allow a cold SDK cache to retry with server data
      if (meta.removing) return;
      if (action === 'reserve') (meta.references ||= {})[id(referenceKey)] = true;
      if (action === 'release' && meta.references) delete meta.references[id(referenceKey)];
      if (action === 'deleteOriginal') meta.originalDeleted = true;
      if (meta.originalDeleted && !Object.keys(meta.references || {}).length) meta.removing = true;
      accepted = true;
      return meta;
    }, undefined, false);
    if (action === 'reserve' && (!accepted || !result.committed)) fail('This audio is no longer available.');
    if (accepted && result.committed && result.snapshot.val()?.removing) await blob.remove();
  }
  App.musicDeletePlaylist = async function (playlistId) {
    let removed;
    await mutate(playlistId, value => {
      removed = value;
      for (const track of Object.values(value.tracks || {})) archiveUpload(value, track);
      return value.uploads ? { uploads: value.uploads } : null;
    });
    const cleanup = Object.values(removed.tracks || {}).filter(track => track.playlistReference)
      .map(track => changeBlobReference(track.blobId, 'release', track.referenceKey));
    cleanup.push(App.db.ref(`music/playlistOrder/${id(removed.ownerCode)}`).transaction(order => {
      const keys = storedIds(order);
      if (!keys.includes(playlistId)) return order;
      const kept = keys.filter(key => key !== playlistId);
      return kept.length ? kept : null;
    }, undefined, false));
    await Promise.all(cleanup);
  };
  App.musicUpdateTrack = (playlistId, trackId, patch) => {
    const fields = trackFields(patch, true), key = id(trackId);
    return mutate(playlistId, value => { if (!value.tracks?.[key]) return; value.tracks[key] = { ...value.tracks[key], ...fields }; return value; });
  };
  App.musicDeleteTrack = async function (playlistId, trackId) {
    const key = id(trackId); let removed;
    await mutate(playlistId, value => {
      if (!value.tracks?.[key]) return;
      removed = value.tracks[key];
      archiveUpload(value, removed); delete value.tracks[key]; return value;
    });
    if (removed.playlistReference) await changeBlobReference(removed.blobId, 'release', removed.referenceKey);
  };
  // Find the original even if the playlist was removed between rendering and
  // the transaction. Both its track and archive occupy the same RTDB parent.
  async function changeUpload(track, apply) {
    const actor = currentOwner(), started = generation;
    let found = false;
    const result = await App.db.ref(`music/playlists/${id(track.sourceId)}`).transaction(value => {
      found = false;
      if (App.currentUser?.code !== actor || generation !== started) return;
      if (!value) return null;
      const records = value.uploads?.[track.blobId] ? value.uploads : value.tracks || {};
      const key = Object.keys(records).find(key => records[key]?.blobId === track.blobId && !records[key].playlistReference);
      if (!key || !App.musicCanManage(records[key].uploaderCode || value.ownerCode)) return;
      apply(records, key);
      found = true;
      if (!value.name && !Object.keys(value.uploads || {}).length) return null;
      return value;
    }, undefined, false);
    if (!result.committed || !found) fail('This audio is no longer available to you.');
  }
  App.musicEditUpload = (track, patch) => {
    const fields = trackFields(patch, true);
    return changeUpload(track, (records, key) => Object.assign(records[key], fields));
  };
  App.musicDeleteUpload = async track => {
    await changeUpload(track, (records, key) => { delete records[key]; });
    await changeBlobReference(track.blobId, 'deleteOriginal');
  };
  App.musicDestinationPlaylists = function (sourceId, track) {
    const actor = App.currentUser?.code;
    if (!track?.blobId || App.musicData.playlists.get(sourceId)?.ownerCode === actor) return [];
    return App.musicGetPlaylists(actor).filter(p => !App.musicGetTracks(p.id).some(t => t.blobId === track.blobId));
  };
  App.musicAddToPlaylist = async function (sourceId, track, destinationId) {
    const actor = currentOwner(), started = generation;
    if (!App.musicDestinationPlaylists(sourceId, track).some(p => p.id === destinationId)) fail('This playlist already contains the audio or is unavailable.');
    const source = App.musicGetTracks(sourceId).find(t => t.id === track.id && t.blobId === track.blobId);
    if (!source) fail('This audio is no longer available.');
    const uploaderCode = source.uploaderCode || App.musicData.playlists.get(sourceId)?.ownerCode;
    const referenceKey = App.db.ref(`music/playlists/${id(destinationId)}/tracks`).push().key;
    const { id: sourceTrackId, playlistId, sourceId: sourceLocation, ...metadata } = source;
    await changeBlobReference(source.blobId, 'reserve', referenceKey);
    try {
      return await mutate(destinationId, value => {
        if (value.ownerCode !== actor) fail('Choose one of your own playlists.');
        const records = value.tracks ||= {};
        if (Object.values(records).some(t => t.blobId === source.blobId)) fail('This playlist already contains the audio.');
        records[referenceKey] = { ...metadata, uploaderCode, referenceKey, playlistReference: true, addedAt: now(),
          order: Math.max(-1, ...Object.values(records).map(t => Number(t.order) || 0)) + 1 };
        return value;
      }, actor, started);
    } catch (error) {
      await changeBlobReference(source.blobId, 'release', referenceKey);
      throw error;
    }
  };
  App.musicReorderTracks = (playlistId, ids) => {
    const order = [...new Set(ids.map(id))];
    return mutate(playlistId, value => {
      // Keep concurrently added tracks; skip tracks deleted on another device.
      const records = value.tracks || {}, remaining = Object.keys(records).filter(key => !order.includes(key)).sort((a, b) => (records[a].order || 0) - (records[b].order || 0));
      [...order.filter(key => records[key]), ...remaining].forEach((key, index) => { records[key].order = index; });
      value.tracks = records; return value;
    });
  };
  // Most moves write one numeric rank. The old integer ranks and saved tracks
  // without ranks stay readable by every host. Tied/invalid or exhausted
  // ranks are normalized in a playlist transaction against the latest order.
  async function persistMove(playlistId, move, actor, started) {
    function check() {
      if (actor !== App.currentUser?.code || started !== generation) fail('Your account changed.');
      if (!App.musicCanManage(App.musicData.playlists.get(playlistId)?.ownerCode)) fail('Only the playlist owner or Vinny can reorder tracks.');
    }
    check();
    const sorted = [...(App.musicData.tracks.get(playlistId)?.values() || [])].sort(trackOrder);
    if (!placeTrack(sorted, move)) fail('This track is no longer available.');
    const index = sorted.findIndex(track => track.id === move.source);
    const before = sorted[index - 1], after = sorted[index + 1];
    const lo = before ? Number(before.order) || 0 : null;
    const hi = after ? Number(after.order) || 0 : null;
    const rank = before && after ? lo + (hi - lo) / 2 : before ? lo + 1 : hi - 1;
    if (Number.isFinite(sorted[index].order) && Number.isFinite(rank) &&
        (!before || rank > lo) && (!after || rank < hi)) {
      const result = await App.db.ref(`music/playlists/${playlistId}/tracks/${move.source}/order`).transaction(value => {
        check();
        // A missing rank can mean the track was deleted. Never create a new
        // child there. A null return also lets Firebase retry a cold cache.
        return value == null ? null : rank;
      }, undefined, false);
      if (result.committed && result.snapshot.val() === rank) return;
    }
    await mutate(playlistId, value => {
      const rows = Object.entries(value.tracks || {}).map(([id, track]) => ({ id, order: track.order, addedAt: track.addedAt })).sort(trackOrder);
      if (!placeTrack(rows, move)) return;
      rows.forEach(({id}, i) => { value.tracks[id].order = i; });
      return value;
    }, actor, started);
  }
  App.musicMoveTrack = async function (playlistId, trackId, targetId, after) {
    id(playlistId);
    const actor = currentOwner(), started = generation;
    if (!App.musicCanManage(App.musicData.playlists.get(playlistId)?.ownerCode)) fail('Only the playlist owner or Vinny can reorder tracks.');
    const move = { source: id(trackId), target: id(targetId), after: !!after };
    if (move.source === move.target) return;
    const queue = pendingMoves.get(playlistId) || [];
    const previous = queue.at(-1)?.done;
    pendingMoves.set(playlistId, queue);
    queue.push(move);
    move.done = Promise.resolve(previous).catch(() => {}).then(() => persistMove(playlistId, move, actor, started)).finally(() => {
      queue.splice(queue.indexOf(move), 1);
      if (pendingMoves.get(playlistId) !== queue) return;
      if (!queue.length) pendingMoves.delete(playlistId);
      App.refreshMusicTrackOrder?.(playlistId);
    });
    App.refreshMusicTrackOrder?.(playlistId);
    return move.done;
  };
  const mimeFor = file => {
    const extension = String(file.name || '').split('.').pop().toLowerCase();
    return /^audio\//i.test(file.type) ? file.type : ({ mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', wave: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac', webm: 'audio/webm', aiff: 'audio/aiff', aif: 'audio/aiff', wma: 'audio/x-ms-wma' }[extension] || '');
  };
  async function inspectAudio(file, mime, signal) {
    const url = URL.createObjectURL(new Blob([file], { type: mime }));
    try {
      return await new Promise((resolve, reject) => {
        const audio = new Audio(); audio.preload = 'metadata';
        const finish = (error, duration) => { clearTimeout(timer); signal?.removeEventListener('abort', abort); audio.removeAttribute('src'); audio.load(); error ? reject(error) : resolve(duration); };
        const abort = () => finish(new Error('Upload canceled.'));
        const timer = setTimeout(() => finish(new Error('Could not read this audio file.')), 15000);
        signal?.addEventListener('abort', abort, { once: true });
        audio.onloadedmetadata = () => finish(!Number.isFinite(audio.duration) || audio.duration <= 0 ? new Error('This audio has no readable duration.') : null, audio.duration);
        audio.onerror = () => finish(new Error('This device cannot play that audio format. Try MP3, M4A, WAV, Ogg, or FLAC.'));
        audio.src = url;
      });
    } finally { URL.revokeObjectURL(url); }
  }
  App.musicUploadTrack = async function (playlistId, file, metadata, onProgress) {
    const fields = trackFields(metadata), actor = currentOwner(), started = generation;
    const libraryOwner = App.musicLibraryOwner(playlistId);
    const playlist = App.musicData.playlists.get(id(playlistId));
    const ownerCode = libraryOwner || playlist?.ownerCode;
    if (!App.musicCanManage(ownerCode)) fail('Only the owner or Vinny can upload audio to this library.');
    const credit = { uploaderCode: ownerCode };
    if (ownerCode !== actor) credit.uploadedBy = actor;
    if (!(file instanceof Blob) || !file.size) fail('Choose an audio file.');
    if (file.size > MAX_BYTES) fail('Choose an audio file under 100 MB.');
    const mime = mimeFor(file); if (!mime) fail('Choose an audio file.');
    const blobRef = App.db.ref('music/audio').push();
    const trackId = libraryOwner ? blobRef.key : App.db.ref(`music/playlists/${playlistId}/tracks`).push().key;
    const scope = App.createFirebaseUploadScope({ type: 'music', place: '', cleanup: () => blobRef.remove(), disconnectRefs: [blobRef] });
    const check = () => { App.throwIfUploadAborted(scope.signal); if (App.currentUser?.code !== actor || generation !== started || !App.musicCanManage(ownerCode)) fail('Your account changed. Upload canceled.'); };
    try {
      const duration = await inspectAudio(file, mime, scope.signal); check();
      await App.armFirebaseUploadDisconnect(scope); check();
      const count = Math.ceil(file.size / CHUNK_BYTES);
      await blobRef.child('meta').set({ ownerCode, ...credit, playlistId, size: file.size, mime, chunkBytes: CHUNK_BYTES, chunkCount: count, createdAt: now(), encoding: 'base64-parts-v1' });
      // One bounded write at a time keeps music out of B2 and below RTDB limits.
      // Publish the playable track only after every byte is acknowledged.
      for (let index = 0; index < count; index++) {
        check();
        const encoded = await App.readBlobSliceAsBase64(file, index * CHUNK_BYTES, Math.min(file.size, (index + 1) * CHUNK_BYTES), scope.signal);
        check(); await App.updateRefWithRetry(blobRef.child('parts'), { [String(index).padStart(6, '0')]: encoded }, 2, scope.signal);
        onProgress?.(Math.round((index + 1) / count * 99));
      }
      check();
      // Cancel disconnect cleanup before metadata publication. Never let a later
      // disconnect delete bytes belonging to an already published track.
      await blobRef.onDisconnect().cancel(); check();
      const track = { ...fields, ...credit, blobId: blobRef.key, mime, size: file.size, chunkBytes: CHUNK_BYTES, chunkCount: count, encoding: 'base64-parts-v1', duration, addedAt: now(), fileName: text(file.name, 200) };
      if (libraryOwner) await App.db.ref(`music/playlists/${playlistId}/uploads/${blobRef.key}`).set(track);
      else await mutate(playlistId, value => {
        check(); const tracks = value.tracks ||= {};
        tracks[trackId] = { ...track, order: Math.max(-1, ...Object.values(tracks).map(item => Number(item.order) || 0)) + 1 };
        return value;
      }, actor, started);
      scope.committed = true; await App.finishFirebaseUploadScope(scope);
      cacheURL(blobRef.key, file.type === mime ? file : file.slice(0, file.size, mime)); onProgress?.(100);
      return trackId;
    } catch (error) { await App.cleanupFirebaseUploadScope(scope); throw error; }
  };
  function cacheURL(key, blob, remember = true) {
    if (urls.has(key)) return urls.get(key).url;
    const url = URL.createObjectURL(blob); urls.set(key, { url, size: blob.size });
    if (remember) void App.rememberMusicFile?.(key, blob);
    // Bound prefetch memory while retaining the currently playing source.
    let bytes = [...urls.values()].reduce((total, entry) => total + entry.size, 0);
    for (const [oldKey, entry] of urls) {
      if (urls.size <= 6 && bytes <= 200 * 1024 * 1024) break;
      if (oldKey === key || App.musicState?.track?.blobId === oldKey) continue;
      URL.revokeObjectURL(entry.url); urls.delete(oldKey); bytes -= entry.size;
    }
    return url;
  }
  function audioJob(track, key) {
    const size = Number(track.size), count = Number(track.chunkCount);
    if (!Number.isInteger(size) || size <= 0 || size > MAX_BYTES || Number(track.chunkBytes) !== CHUNK_BYTES ||
        count !== Math.ceil(size / CHUNK_BYTES)) fail('This audio file has invalid metadata.');
    if (downloads.has(key)) return downloads.get(key);
    const started = generation, pending = new Map(), parts = [], listeners = new Set();
    const mime = /^audio\/[a-z0-9.+-]+$/i.test(String(track.mime || '').split(';')[0]) ? track.mime.split(';')[0] : 'audio/mpeg';
    let received = 0, full, url = '', stopped = false;
    function release() {
      if (downloads.get(key) === job) downloads.delete(key);
    }
    function read(index) {
      if (stopped || started !== generation) return Promise.reject(new Error('Music selection changed.'));
      if (parts[index]) return Promise.resolve(parts[index]);
      if (pending.has(index)) return pending.get(index);
      const request = (async () => {
        if (started !== generation) fail('Your account changed.');
        const encoded = (await App.db.ref(`music/audio/${key}/parts/${String(index).padStart(6, '0')}`).once('value')).val();
        if (started !== generation || stopped) fail('Music selection changed.');
        const expected = Math.min(CHUNK_BYTES, size - index * CHUNK_BYTES);
        if (typeof encoded !== 'string' || encoded.length !== Math.ceil(expected / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) fail('This audio file is incomplete.');
        let bytes;
        if (Uint8Array.fromBase64) bytes = Uint8Array.fromBase64(encoded);
        else {
          const binary = atob(encoded); bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        }
        if (bytes.length !== expected) fail('This audio file is damaged.');
        parts[index] = bytes;
        if (++received === count) {
          url = cacheURL(key, new Blob(parts, { type: mime }));
          release();
        }
        listeners.forEach(notify => notify());
        return bytes;
      })().finally(() => pending.delete(index));
      pending.set(index, request); return request;
    }
    function complete() {
      if (!full) {
        let cursor = 0;
        full = Promise.all(Array.from({ length: Math.min(6, count) }, async () => {
          while (cursor < count) await read(cursor++);
        })).then(() => url).catch(error => { stopped = true; release(); throw error; });
      }
      return full;
    }
    const job = { key, read, complete, count, mime, parts, listeners, release, stop() { stopped = true; release(); } };
    downloads.set(key, job); return job;
  }
  let warmJob, warmRequest = 0, currentJob, selection = 0;
  App.cancelMusicWarm = function (keepKey) {
    ++warmRequest;
    if (warmJob && warmJob.key !== keepKey) {
      if (warmJob !== currentJob) warmJob.stop();
      warmJob = null;
    }
  };
  App.musicWarmTrack = async function (track, nextInQueue = false) {
    if (!track?.blobId || !App.currentUser || globalThis.navigator?.connection?.saveData) return;
    try {
      const key = id(track.blobId);
      App.cancelMusicWarm(key);
      if (urls.has(key)) return;
      const local = App.readMusicFile?.(track), request = warmRequest, started = generation;
      if (local) {
        const blob = await local;
        if (request !== warmRequest || generation !== started) return;
        if (blob) { cacheURL(key, blob, false); return; }
      }
      const job = audioJob(track, key);
      warmJob = job;
      const prepare = nextInQueue && (job.count <= 6 || !App.musicHasRange?.()) ? job.complete() : job.read(0);
      await prepare.catch(() => job.release());
    } catch {}
  };
  App.cancelMusicAudioRead = function (keepKey) {
    ++selection;
    App.cancelMusicWarm(keepKey);
    if (currentJob && currentJob.key !== keepKey) currentJob.stop();
    currentJob = null;
  };
  App.musicGetAudioURL = async function (track, options = {}) {
    const key = id(track?.blobId), started = generation, selected = selection;
    if (urls.has(key)) return urls.get(key).url;
    const local = App.readMusicFile?.(track);
    if (local) {
      const blob = await local;
      if (started !== generation || selected !== selection) fail('Music selection changed.');
      if (blob) return cacheURL(key, blob, false);
    }
    const job = audioJob(track, key);
    if (warmJob === job) warmJob = null;
    currentJob = job;
    if (options.onStreamError) {
      const range = job.count > 1 && App.createMusicRange?.(track, job, options.onStreamError);
      if (range) return range;
      const stream = App.createMusicStream?.(track, job, options.onStreamError);
      if (stream) return stream;
    }
    return job.complete();
  };
  App.register('music/data', function () {
    const refresh = App.refreshSchedulesPeople;
    App.refreshSchedulesPeople = function (...args) { const result = refresh.apply(this, args); App.musicRefreshUsers(); return result; };
    const stopPeople = App.stopSchedulesPeopleListener;
    App.stopSchedulesPeopleListener = function (...args) { if (session && App.musicScreenOpen) return; return stopPeople?.apply(this, args); };
    const start = App.startAppPresence, stop = App.stopAppPresence;
    App.startAppPresence = function (...args) { const result = start.apply(this, args); if (App.currentUser) void App.musicSubscribe().catch(() => {}); return result; };
    App.stopAppPresence = function (...args) { App.musicUnsubscribe(); return stop.apply(this, args); };
  });
})(globalThis.ChatApp);
