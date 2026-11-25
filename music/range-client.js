/* The worker has no database credentials or disk cache. Each random URL is
 * served only from its owning client and is invalidated on release. */
(function (App) {
  'use strict';
  const urls = new Map();
  let workerURL = '', scope = '';
  try {
    const directory = new URL('.', location.href);
    if (window.isSecureContext && navigator.serviceWorker && /^(https?:|chatapp:)$/.test(directory.protocol)) {
      scope = directory.href; workerURL = new URL('music-range-worker.js', scope).href;
    }
  } catch {}
  App.musicHasRange = () => !!workerURL && navigator.serviceWorker.controller?.scriptURL === workerURL && !!crypto.randomUUID;
  App.createMusicRange = function (track, job, onError) {
    if (!App.musicHasRange()) return '';
    const token = crypto.randomUUID(), url = new URL('music/.play/' + token, scope);
    url.searchParams.set('size', track.size);
    url.searchParams.set('mime', job.mime);
    urls.set(url.href, { token, href: url.href, job, onError }); return url.href;
  };
  App.releaseMusicRange = function (url, retainParts) {
    const entry = urls.get(url);
    if (entry) { urls.delete(url); if (!retainParts) entry.job.release(); }
  };
  App.retryMusicRange = function (url) {
    const entry = urls.get(url);
    if (!entry) return false;
    entry.onError(url); return true;
  };
  App.register('music/range-client', () => {
    if (!workerURL) return;
    const service = navigator.serviceWorker;
    service.addEventListener('message', event => {
      if (event.data?.type !== 'music-part-v1' || event.source?.scriptURL !== workerURL || !event.ports[0]) return;
      const { token, part } = event.data, port = event.ports[0];
      const entry = [...urls.values()].find(entry => entry.token === token);
      if (!entry || !Number.isInteger(part) || part < 0 || part >= entry.job.count) { port.postMessage(null); port.close(); return; }
      const { job } = entry;
      const current = job.read(part);
      // The decoder chooses the byte range. Only look one part ahead of it.
      if (part + 1 < job.count) void job.read(part + 1).catch(() => {});
      current.then(bytes => {
        if (!urls.has(entry.href)) { port.postMessage(null); return; }
        const copy = bytes.slice(); port.postMessage(copy.buffer, [copy.buffer]);
      }, () => port.postMessage(null)).finally(() => port.close());
    });
    void service.getRegistration(location.href).then(reg => {
      if (reg && [reg.active, reg.waiting, reg.installing].some(worker => worker && worker.scriptURL !== workerURL)) return;
      return service.register(workerURL, { scope, updateViaCache: 'none' });
    }).catch(() => {}); // Cross-origin launchers and restricted hosts use the portable player.
  });
})(globalThis.ChatApp);
