/* Release notes are bound to published versions, never to their edited text. */
(function (App) {
  "use strict";
  App.UPDATE_LOG_PATH = "admin/updateLog";
  App.UPDATE_LOG_MAX_LENGTH = 16000;
  const revisionPattern = /^[A-Za-z0-9_-]{1,100}$/;
  const webPattern = /^\d{4}\.\d{1,2}\.\d{1,2}-\d+$/;
  const nativePattern = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/;

  App.normalizeUpdateLog = function (value) {
    if (!value || typeof value !== "object") return null;
    const text = typeof value.text === "string" ? value.text.slice(0, App.UPDATE_LOG_MAX_LENGTH).replace(/\r\n?/g, "\n") : "";
    if (!text.trim() || !revisionPattern.test(value.assetRevision || "") || !webPattern.test(value.webVersion || "")) return null;
    const nativeVersion = nativePattern.test(value.nativeVersion || "") ? value.nativeVersion : "";
    return { text, assetRevision: value.assetRevision, webVersion: value.webVersion, nativeVersion };
  };
  App.updateLogReleaseKey = function (record) {
    return record.assetRevision;
  };
  App.updateLogNativeReceiptKey = function (record) {
    return "native-" + (record.nativeVersion || "none").replaceAll(".", "-");
  };
  App.hasSeenUpdateLog = function (record, receipt) {
    // One claim covers the same release across browser/mobile/EXE. A later
    // native-only release can notify an updated EXE without replaying notes
    // in a browser whose shared web code has not changed.
    return !!receipt?.releases?.[App.updateLogNativeReceiptKey(record)] ||
      (!App.isNativeDesktop?.() && !!receipt?.webSeen);
  };
  App.isUpdateLogEligible = function (record) {
    if (!record || record.assetRevision !== globalThis.ChatRuntime?.version) return false;
    if (!App.isNativeDesktop?.()) return true;
    // Shared updates still install on supported older hosts. Only their release
    // notes wait until the host reaches the version Vinny published them for.
    return !!record.nativeVersion && App.getInstalledNativeVersion?.() === record.nativeVersion;
  };
  App.renderUpdateLogText = function (value) {
    return String(value || "").slice(0, App.UPDATE_LOG_MAX_LENGTH).split(/\r?\n/).map(line => {
      const heading = /^(#{1,3}) (.*)$/.exec(line);
      const subtext = line.startsWith("-# ");
      const body = heading ? heading[2] : subtext ? line.slice(3) : line;
      // Preview mode has no profile links, mentions, URL navigation or active
      // HTML. Reuse the bounded, escaped inline emphasis parser from chat.
      const html = App.formatMessageInline(body, { preview: true });
      if (heading) return `<h${heading[1].length}>${html || "<br>"}</h${heading[1].length}>`;
      return `<p${subtext ? ' class="update-log-subtext"' : ""}>${html || "<br>"}</p>`;
    }).join("");
  };

  // Delivery and Admin Preview deliberately share this exact modal renderer.
  App.openUpdateLogModal = function (text, options = {}) {
    App.openModal({ ...options, title: "Update Log", size: "update-log",
      bodyHTML: `<article class="update-log-content">${App.renderUpdateLogText(text)}</article>` });
  };
  App.previewUpdateLog = function (input) {
    if (!App.isVinny?.() || !input?.isConnected) return;
    const owner = App.currentUser.code, generation = App.accountSessionGeneration;
    const body = App.$("modal-body"), scroll = body.scrollTop;
    const saved = { title: App.$("modal-title").textContent, subtitle: App.$("modal-subtitle").textContent,
      size: App.modalEl.dataset.size, beforeClose: App.modalBeforeClose, lastFocus: App.modalLastFocus };
    const parked = document.createElement("div");
    parked.hidden = true; parked.inert = true;
    parked.append(...body.childNodes);
    // Suspend the panel without disposing its listeners, draft or in-flight save.
    App.modalBeforeClose = null;
    const restore = () => {
      if (App.currentUser?.code !== owner || App.accountSessionGeneration !== generation || !App.isVinny?.()) return true;
      const nodes = [...parked.childNodes];
      App.modalBeforeClose = null;
      App.openModal({ title: saved.title, subtitle: saved.subtitle, size: saved.size, onBeforeClose: saved.beforeClose });
      body.replaceChildren(...nodes);
      App.modalLastFocus = saved.lastFocus;
      body.scrollTop = scroll;
      input.focus({ preventScroll: true });
      return false;
    };
    App.openUpdateLogModal(input.value, { onRequestClose: restore, onBeforeClose: saved.beforeClose });
    body.append(parked);
  };

  App.stopUpdateLogSession = function () {
    const state = App.updateLogSession;
    if (!state) return;
    state.stopped = true;
    clearTimeout(state.timer);
    if (state.showing && App.modalEl?.dataset.size === "update-log") App.closeModal();
    App.updateLogSession = null;
  };
  App.startUpdateLogSession = function () {
    App.stopUpdateLogSession();
    if (!App.currentUser?.code || !App.db) return;
    const state = App.updateLogSession = {
      owner: App.currentUser.code, generation: App.accountSessionGeneration,
      readyAt: Date.now(), stopped: false, timer: 0, showing: false
    };
    const current = () => App.updateLogSession === state && !state.stopped &&
      App.currentUser?.code === state.owner && App.accountSessionGeneration === state.generation;
    const releaseClaim = async (ref, record, token) => {
      try { await ref.transaction(value => {
        const key = App.updateLogNativeReceiptKey(record);
        if (value?.releases?.[key]?.token !== token) return;
        const releases = { ...value.releases }; delete releases[key];
        const remaining = Object.values(releases);
        if (!remaining.length) return null;
        return { ...value, releases, webSeen: value.webSeen?.token === token ? remaining[0] : value.webSeen };
      }, undefined, false); } catch {}
    };
    const show = async record => {
      if (!current() || !App.isUpdateLogEligible(record)) return;
      // Do not replace a user's editor, incoming call or another modal.
      if (!App.modalEl?.hidden || App.nativeUpdateRequired || document.hidden) {
        state.timer = setTimeout(() => void show(record), 250);
        return;
      }
      const ref = App.db.ref(`users/${state.owner}/updateLogSeen/${App.updateLogReleaseKey(record)}`);
      const token = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      try {
        const result = await ref.transaction(value => {
          if (!current() || App.hasSeenUpdateLog(record, value)) return;
          const claim = { token, seenAt: App.firebase.database.ServerValue.TIMESTAMP };
          return { webSeen: value?.webSeen || claim, releases: { ...value?.releases, [App.updateLogNativeReceiptKey(record)]: claim } };
        }, undefined, false);
        if (!result.committed) return;
        if (!current() || !App.modalEl?.hidden || !App.isUpdateLogEligible(record) || document.hidden) {
          await releaseClaim(ref, record, token);
          if (current()) state.timer = setTimeout(() => void show(record), 250);
          return;
        }
        if (["Logged In", "Welcome Back"].includes(App.$?.("toast-title")?.textContent)) App.closeToast?.();
        App.openUpdateLogModal(record.text);
        state.showing = true;
      } catch {
        // A denied/offline receipt must not produce repeated, device-local
        // popups. The next verified login can retry once connectivity returns.
      }
    };
    void App.db.ref(App.UPDATE_LOG_PATH).once("value").then(async snapshot => {
      if (!current()) return;
      const record = App.normalizeUpdateLog(snapshot.val());
      if (!App.isUpdateLogEligible(record)) return;
      const receipt = await App.db.ref(`users/${state.owner}/updateLogSeen/${App.updateLogReleaseKey(record)}`).once("value");
      if (!current() || App.hasSeenUpdateLog(record, receipt.val())) return;
      const published = await App.getPublishedUpdateLogRelease({ includeNative: !!App.isNativeDesktop?.() });
      if (!current() || published.assetRevision !== record.assetRevision ||
          (App.isNativeDesktop?.() && published.nativeVersion !== record.nativeVersion)) return;
      state.timer = setTimeout(() => void show(record), Math.max(0, 500 - (Date.now() - state.readyAt)));
    }).catch(() => {});
  };

  App.fetchUpdateLogJSON = async function (url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, { cache: "no-store", signal: controller.signal, headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}.`);
      return await response.json();
    } finally { clearTimeout(timeout); }
  };
  App.resolvePublishedUpdateLogRelease = async function ({ includeNative = true } = {}) {
    // This follows the same numbered repository convention as the existing
    // native/shared launcher. Clients never duplicate the updater's download,
    // staging, signature verification or installation work.
    const repositories = [];
    for (let page = 1; page <= 100; page++) {
      const values = await App.fetchUpdateLogJSON(`https://api.github.com/users/dowsy456/repos?per_page=100&page=${page}&sort=full_name&direction=asc`);
      if (!Array.isArray(values)) throw new Error("GitHub did not return the shared releases.");
      repositories.push(...values.filter(value => /^christianlumen(?:0|[1-9]\d*)$/.test(value.name || "") &&
        String(value.owner?.login || "").toLowerCase() === "dowsy456"));
      if (values.length < 100) break;
      if (page === 100) throw new Error("Could not finish checking the shared releases.");
    }
    repositories.sort((a, b) => Number(b.name.slice(14)) - Number(a.name.slice(14)));
    let shared = null;
    for (const repository of repositories) {
      const branch = encodeURIComponent(repository.default_branch || "main");
      const commit = await App.fetchUpdateLogJSON(`https://api.github.com/repos/dowsy456/${repository.name}/commits/${branch}`);
      if (!/^[a-f0-9]{40}$/i.test(commit?.sha || "")) throw new Error("GitHub did not return a valid shared release revision.");
      let build;
      try { build = await App.fetchUpdateLogJSON(`https://raw.githubusercontent.com/dowsy456/${repository.name}/${commit.sha}/build-info.json`); }
      catch (error) { if (/HTTP 404\./.test(error.message)) continue; throw error; }
      if (!revisionPattern.test(build?.assetRevision || "") || !webPattern.test(build?.webVersion || "")) continue;
      shared = { assetRevision: build.assetRevision, webVersion: build.webVersion };
      break;
    }
    if (!shared) throw new Error("Publish the complete shared release before saving its update log.");
    if (!includeNative) return shared;
    const native = await App.fetchUpdateLogJSON("https://api.github.com/repos/dowsy456/chat-app-desktop/releases/latest");
    const nativeVersion = String(native?.tag_name || "").replace(/^v/, "");
    if (native?.draft || native?.prerelease || !nativePattern.test(nativeVersion) ||
        !Array.isArray(native?.assets) || !["Chat-App.exe", "native-update.json"].every(name => native.assets.some(asset => asset.name === name))) {
      throw new Error("The latest native release must include Chat-App.exe and native-update.json.");
    }
    return { ...shared, nativeVersion };
  };
  App.getPublishedUpdateLogRelease = function ({ includeNative = true } = {}) {
    const key = includeNative ? "desktop" : "web";
    const cache = App.updateLogPublishedCache ||= {};
    if (cache[key] && Date.now() - cache[key].at < 60000) return cache[key].promise;
    const entry = { at: Date.now(), promise: App.resolvePublishedUpdateLogRelease({ includeNative }) };
    cache[key] = entry;
    entry.promise.catch(() => { if (cache[key] === entry) delete cache[key]; });
    return entry.promise;
  };

  App.updateLogEditorHTML = function () {
    return `<section class="panel-update-log" aria-labelledby="panel-update-log-label">
      <label class="label" id="panel-update-log-label" for="panel-update-log-text">Update Log</label>
      <div class="update-log-composer"><textarea id="panel-update-log-text" enterkeyhint="enter" rows="6" maxlength="${App.UPDATE_LOG_MAX_LENGTH}" placeholder="Write the update log…" spellcheck="true" aria-describedby="panel-update-log-status"></textarea></div>
      <div class="update-log-editor-actions"><span class="muted small" id="panel-update-log-status" role="status">Loading…</span><button class="btn tiny" id="panel-update-log-preview" type="button">Preview</button><button class="btn tiny" id="panel-update-log-save" type="button" disabled>Save</button></div>
    </section>`;
  };
  App.bindUpdateLogEditor = function () {
    const input = App.$("panel-update-log-text"), button = App.$("panel-update-log-save"), status = App.$("panel-update-log-status");
    if (!input || !button || !status || !App.isVinny?.()) return;
    const owner = App.currentUser.code, generation = App.accountSessionGeneration;
    const current = () => App.currentUser?.code === owner && App.accountSessionGeneration === generation && App.isVinny?.() && input.isConnected;
    let loaded = false, saving = false, revision = 0;
    const setStatus = (message, error = false) => {
      if (!current()) return;
      status.textContent = message; input.setAttribute("aria-invalid", String(error));
    };
    App.$("panel-update-log-preview")?.addEventListener("click", () => { if (current()) App.previewUpdateLog(input); });
    input.disabled = true;
    void App.db.ref(App.UPDATE_LOG_PATH).once("value").then(snapshot => {
      if (!current()) return;
      const record = App.normalizeUpdateLog(snapshot.val());
      input.value = record?.text || ""; loaded = true; input.disabled = false; button.disabled = false;
      setStatus(record ? `Web ${record.webVersion} · EXE ${record.nativeVersion || "—"}` : document.body.dataset.mobileUi === "1" ? "Enter for a new line" : "Shift + Enter for a new line");
    }).catch(() => setStatus("Could not load the update log. Reopen the panel to retry.", true));
    input.addEventListener("input", () => { revision++; setStatus("Unsaved changes"); });
    input.addEventListener("keydown", event => {
      if (event.key !== "Enter" || event.isComposing || event.keyCode === 229) return;
      // Give the phone keyboard its native newline/selection/undo behavior.
      // Desktop keeps Shift+Enter for new lines; Save is always explicit.
      event.stopPropagation();
      if (!event.shiftKey && document.body.dataset.mobileUi !== "1") event.preventDefault();
    });
    // A text-only editor never accepts rich clipboard fragments or files.
    input.addEventListener("drop", event => event.preventDefault());
    button.addEventListener("click", async () => {
      if (!loaded || saving || !current()) return;
      const text = input.value.replace(/\r\n?/g, "\n").slice(0, App.UPDATE_LOG_MAX_LENGTH), savedRevision = revision;
      saving = true; button.disabled = true; setStatus(text.trim() ? "Checking published versions…" : "Saving…");
      try {
        const release = text.trim() ? await App.resolvePublishedUpdateLogRelease() : null;
        if (!current()) return;
        const record = release ? { ...release, text, updatedAt: App.firebase.database.ServerValue.TIMESTAMP } : null;
        await App.db.ref(App.UPDATE_LOG_PATH).set(record);
        setStatus(revision !== savedRevision ? "Unsaved changes" : release ? `Saved · Web ${release.webVersion} · EXE ${release.nativeVersion}` : "Update log cleared");
      } catch (error) {
        setStatus(error?.name === "AbortError" ? "GitHub timed out. Try Save again." : error?.message || "Could not save the update log.", true);
      } finally { saving = false; if (current()) button.disabled = false; }
    });
  };
  App.register("ui/update-log", function initializeFeature() {});
})(globalThis.ChatApp);
