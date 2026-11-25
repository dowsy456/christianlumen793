/* Complete, verified files can survive a reload and seek via a native blob URL
 * on file, mobile and embedded app origins where storage is available. */
(function (App) {
  'use strict';
  const names = ['files', 'catalog'], known = new Set();
  let opening;
  let activeScope;
  function scope() {
    const identity = JSON.stringify([App.firebaseConfig?.projectId || '', App.currentUser?.code || '']);
    if (activeScope?.identity === identity) return activeScope;
    const entry = { identity, key: '', ready: null };
    activeScope = entry;
    entry.ready = (async () => {
      if (!App.currentUser?.code || !globalThis.crypto?.subtle) return '';
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
      entry.key = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      return entry.key;
    })().catch(() => '');
    return entry;
  }
  App.prepareMusicFileCache = () => { scope(); void open(); };
  const keyFor = (owner, blobId) => JSON.stringify([owner, blobId]);
  function open() {
    if (!opening) opening = new Promise(resolve => {
      const request = indexedDB.open('chat-music-files-v1', 1);
      request.onupgradeneeded = () => {
        for (const name of names) request.result.createObjectStore(name);
      };
      request.onerror = request.onblocked = () => resolve(null);
      request.onsuccess = () => {
        const db = request.result, keys = db.transaction('catalog').objectStore('catalog').getAllKeys();
        keys.onsuccess = () => { keys.result.forEach(key => known.add(key)); resolve(db); };
        keys.onerror = () => resolve(null);
        db.onversionchange = () => { db.close(); opening = null; known.clear(); };
      };
    }).catch(() => null);
    return opening;
  }
  App.readMusicFile = function (track) {
    const { key: owner } = scope();
    if (!owner) return null;
    const key = keyFor(owner, track.blobId);
    if (!known.has(key)) return null; // A cold selection never waits for storage initialization.
    return open().then(db => new Promise(resolve => {
      const request = db.transaction('files').objectStore('files').get(key);
      request.onsuccess = () => {
        const file = request.result?.size === Number(track.size) ? request.result : null;
        if (!file) known.delete(key);
        resolve(file);
      };
      request.onerror = () => resolve(null);
    })).catch(() => null);
  };
  App.rememberMusicFile = async function (blobId, file) {
    const account = scope(), owner = await account.ready;
    if (!owner) return;
    const key = keyFor(owner, blobId), db = await open();
    if (!db || known.has(key) || account !== scope()) return;
    try {
      const tx = db.transaction(names, 'readwrite'), catalog = tx.objectStore('catalog'), files = tx.objectStore('files');
      const records = catalog.getAll();
      records.onsuccess = () => {
        const rows = records.result.filter(row => row.key !== key).sort((a, b) => a.time - b.time);
        let total = rows.reduce((bytes, row) => bytes + row.size, file.size);
        while (rows.length && (rows.length >= 8 || total > 200 * 1024 * 1024)) {
          const row = rows.shift(); total -= row.size;
          catalog.delete(row.key); files.delete(row.key); known.delete(row.key);
        }
        files.put(file, key); catalog.put({ key, owner, size: file.size, time: Date.now() }, key);
      };
      tx.oncomplete = () => known.add(key);
    } catch { /* Storage quotas and private browsing can disable the disk cache. */ }
  };
  App.clearLocalMusicFiles = async function () {
    const owner = await scope().ready, db = await open();
    if (!db || !owner) return;
    try {
      const tx = db.transaction(names, 'readwrite'), catalog = tx.objectStore('catalog'), rows = catalog.getAll();
      rows.onsuccess = () => {
        for (const row of rows.result) if (row.owner === owner) {
          catalog.delete(row.key); tx.objectStore('files').delete(row.key); known.delete(row.key);
        }
      };
    } catch {}
  };
  App.register('music/file-cache', App.prepareMusicFileCache);
})(globalThis.ChatApp);
