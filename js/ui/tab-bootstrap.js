/* Runs synchronously in <head>, before the modular app. Never runs in Electron.
 * Keep data-project aligned with core/config.js; regression tests enforce it. */
(function () {
  'use strict';
  if (globalThis.chatDesktopBuild || globalThis.chatDesktopPreferences ||
      globalThis.chatDesktopRings || globalThis.chatDesktopOverlay) return;
  const projectId = document.currentScript?.dataset.project;
  const title = document.title;
  const defaultIcon = './assets/gradesort.svg';
  let tab = {name:title,icon:''};
  if (projectId) try {
    const codeKey = `chatapp_code:${projectId}`;
    const bootstrapKey = `chatapp_user_bootstrap:${projectId}`;
    const read = (storage, key) => { try { return storage.getItem(key); } catch { return null; } };
    const password = read(sessionStorage,codeKey) ?? read(localStorage,codeKey);
    if (password) for (const storage of [sessionStorage,localStorage]) {
      let cached;
      try { cached = JSON.parse(read(storage,bootstrapKey) || 'null'); } catch { continue; }
      if (cached?.code && cached.password === password && cached.browserTab && typeof cached.browserTab === 'object') {
        tab = {name:String(cached.browserTab.name || title),icon:String(cached.browserTab.icon || '').trim()};
        globalThis.ChatAppTabBootstrap = {projectId,tab};
        break;
      }
    }
  } catch {}
  document.title = tab.name;
  const link = document.createElement('link');
  link.id = 'dynamic-favicon';
  link.rel = 'icon';
  link.href = tab.icon || defaultIcon;
  document.head.appendChild(link);
})();
