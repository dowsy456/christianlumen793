/* One bounded, inert still per attachment; shared by sender and recipients. */
(function (App) {
  "use strict";
  const MAX_PREVIEW_LENGTH = 4096;
  App.isSafeUploadPreview = value => typeof value === "string" && value.length <= MAX_PREVIEW_LENGTH && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
  const canvas = () => { const c = document.createElement("canvas"); c.width = 320; c.height = 180; return c; };
  const encode = c => {
    const small = document.createElement("canvas"); small.width = 128; small.height = 72;
    small.getContext("2d").drawImage(c, 0, 0, 128, 72);
    for (const quality of [.64, .40, .22]) { const value = small.toDataURL("image/jpeg", quality); if (value.length <= MAX_PREVIEW_LENGTH) return value; }
    return "";
  };
  const draw = image => {
    const c = canvas(), ctx = c.getContext("2d"), w = image.videoWidth || image.naturalWidth || image.width, h = image.videoHeight || image.naturalHeight || image.height;
    if (!w || !h) return "";
    ctx.fillStyle = "#17212b"; ctx.fillRect(0, 0, c.width, c.height);
    const scale = Math.min(c.width / w, c.height / h);
    ctx.drawImage(image, (c.width - w * scale) / 2, (c.height - h * scale) / 2, w * scale, h * scale);
    return encode(c);
  };
  const loadImage = blob => new Promise(resolve => {
    const url = URL.createObjectURL(blob), img = new Image();
    let done = false;
    const end = value => { if (done) return; done = true; clearTimeout(timer); img.onload = img.onerror = null; img.removeAttribute("src"); URL.revokeObjectURL(url); resolve(value); };
    const timer = setTimeout(() => end(""), 3500);
    img.onload = () => { try { end(draw(img)); } catch { end(""); } };
    img.onerror = () => end(""); img.decoding = "async"; img.src = url;
  });
  const videoStill = blob => new Promise(resolve => {
    const video = document.createElement("video"), url = URL.createObjectURL(blob);
    let done = false;
    const end = value => {
      if (done) return; done = true; clearTimeout(timer);
      video.onloadeddata = video.onerror = null; video.pause(); video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url); resolve(value);
    };
    const timer = setTimeout(() => end(""), 4000);
    video.preload = "auto"; video.muted = true; video.playsInline = true;
    // Decode only the initial frame; never play or capture a stream.
    video.onloadeddata = () => { try { end(draw(video)); } catch { end(""); } };
    video.onerror = () => end(""); video.src = url;
  });
  const documentStill = (name, body = "") => {
    const c = canvas(), ctx = c.getContext("2d");
    ctx.fillStyle = "#1b2833"; ctx.fillRect(0, 0, 320, 180);
    ctx.fillStyle = "#dce4eb"; ctx.fillRect(65, 12, 190, 235);
    ctx.fillStyle = "#4e6a80"; ctx.fillRect(81, 29, 95, 7);
    ctx.fillStyle = "#46545f"; ctx.font = "bold 10px sans-serif"; ctx.fillText(name.slice(0, 28), 81, 54);
    const lines = String(body).replace(/\s+/g, " ").match(/.{1,32}(?:\s|$)|.{1,32}/g) || [];
    ctx.font = "8px sans-serif"; ctx.fillStyle = "#667787";
    for (let i = 0; i < 13; i++) {
      if (lines.length) ctx.fillText(lines[i] || "", 81, 71 + i * 11);
      else { ctx.fillStyle = "#a8b5c1"; ctx.fillRect(81, 68 + i * 11, i % 3 ? 151 : 113, 3); }
    }
    return encode(c);
  };
  // Read PE resources as data only. Bounded slices avoid loading a large EXE or
  // running it, and work in browsers as well as the existing Electron host.
  App.readExecutableIcon = async function (blob) {
    const header = new DataView(await blob.slice(0, Math.min(blob.size, 65536)).arrayBuffer());
    if (header.byteLength < 64 || header.getUint16(0, true) !== 0x5a4d) return null;
    const pe = header.getUint32(60, true);
    if (pe + 24 > header.byteLength || header.getUint32(pe, true) !== 0x4550) return null;
    const count = header.getUint16(pe + 6, true), optSize = header.getUint16(pe + 20, true), opt = pe + 24;
    if (count > 96 || opt + optSize + count * 40 > header.byteLength) return null;
    const magic = header.getUint16(opt, true), directory = opt + (magic === 0x20b ? 112 : magic === 0x10b ? 96 : optSize);
    if (directory + 24 > opt + optSize) return null;
    const resourceRva = header.getUint32(directory + 16, true);
    if (!resourceRva) return null;
    let raw = -1, size = 0;
    for (let i = 0; i < count; i++) {
      const s = opt + optSize + i * 40, rva = header.getUint32(s + 12, true), bytes = header.getUint32(s + 16, true);
      if (resourceRva >= rva && resourceRva < rva + bytes) { raw = header.getUint32(s + 20, true) + resourceRva - rva; size = bytes - (resourceRva - rva); break; }
    }
    if (raw < 0 || !size || size > 8 * 1024 * 1024 || raw + size > blob.size) return null;
    const bytes = await blob.slice(raw, raw + size).arrayBuffer(), view = new DataView(bytes);
    const entries = offset => {
      if (offset < 0 || offset + 16 > size) return [];
      const count = view.getUint16(offset + 12, true) + view.getUint16(offset + 14, true);
      if (count > 1024 || offset + 16 + count * 8 > size) return [];
      return Array.from({ length: count }, (_, i) => { const at = offset + 16 + i * 8; return { id: view.getUint32(at, true), child: view.getUint32(at + 4, true) }; });
    };
    const payload = entry => {
      for (let depth = 0; entry && (entry.child & 0x80000000) && depth < 4; depth++) entry = entries(entry.child & 0x7fffffff)[0];
      if (!entry || entry.child & 0x80000000 || entry.child + 16 > size) return null;
      const at = view.getUint32(entry.child, true) - resourceRva, length = view.getUint32(entry.child + 4, true);
      return at >= 0 && length > 0 && length <= 1024 * 1024 && at + length <= size ? bytes.slice(at, at + length) : null;
    };
    const root = entries(0), groupType = root.find(e => e.id === 14), iconType = root.find(e => e.id === 3);
    if (!groupType || !iconType) return null;
    const group = payload(groupType);
    if (!group || group.byteLength < 20) return null;
    const gv = new DataView(group), iconCount = Math.min(gv.getUint16(4, true), 64), candidates = [];
    for (let i = 0; i < iconCount && 6 + (i + 1) * 14 <= group.byteLength; i++) {
      const at = 6 + i * 14; candidates.push({ at, id: gv.getUint16(at + 12, true), width: gv.getUint8(at) || 256 });
    }
    candidates.sort((a, b) => Math.abs(a.width - 64) - Math.abs(b.width - 64));
    const resources = entries(iconType.child & 0x7fffffff);
    for (const candidate of candidates) {
      const data = payload(resources.find(e => e.id === candidate.id));
      if (!data) continue;
      const ico = new Uint8Array(22 + data.byteLength), iv = new DataView(ico.buffer);
      iv.setUint16(2, 1, true); iv.setUint16(4, 1, true);
      ico.set(new Uint8Array(group, candidate.at, 8), 6); iv.setUint32(14, data.byteLength, true); iv.setUint32(18, 22, true); ico.set(new Uint8Array(data), 22);
      return new Blob([ico], { type: "image/x-icon" });
    }
    return null;
  };
  const pdfStill = async blob => {
    if (!App.loadPdfViewerLibrary || blob.size > 32 * 1024 * 1024) return "";
    let task, render, timeout, expired = false;
    try {
      return await Promise.race([
        (async () => {
          const { library } = await App.loadPdfViewerLibrary();
          if (expired) return "";
          const data = new Uint8Array(await blob.arrayBuffer());
          if (expired) return "";
          task = library.getDocument({ data, isEvalSupported: false, disableAutoFetch: true });
          const pdf = await task.promise, page = await pdf.getPage(1), original = page.getViewport({ scale: 1 });
          const c = canvas(), viewport = page.getViewport({ scale: Math.min(320 / original.width, 180 / original.height) });
          c.width = Math.max(1, Math.ceil(viewport.width)); c.height = Math.max(1, Math.ceil(viewport.height));
          render = page.render({ canvasContext: c.getContext("2d"), viewport }); await render.promise;
          return draw(c);
        })(),
        new Promise(resolve => { timeout = setTimeout(() => { expired = true; try { render?.cancel(); Promise.resolve(task?.destroy()).catch(() => {}); } catch {} resolve(""); }, 4500); })
      ]);
    } catch { return ""; } finally { clearTimeout(timeout); try { await task?.destroy(); } catch {} }
  };
  App.createUploadPreview = function (blob, item = {}) {
    App.uploadPreviewCache ||= new WeakMap();
    if (App.uploadPreviewCache.has(blob)) return App.uploadPreviewCache.get(blob);
    const task = (async () => {
      const name = String(item.fileName || item.name || "File"), mime = String(item.mimeType || blob.type || "");
      let result = "";
      try {
        if (item.kind === "image" || /^image\//.test(mime)) result = await loadImage(blob);
        else if (item.kind === "video" || /^video\//.test(mime)) result = await videoStill(blob);
        else if (/\.exe$/i.test(name)) { const icon = await App.readExecutableIcon(blob); if (icon) result = await loadImage(icon); }
        else if (/\.pdf$/i.test(name) || mime === "application/pdf") result = await pdfStill(blob);
        else if (/^(text\/|application\/(?:json|xml))/.test(mime) || /\.(?:txt|md|csv|json|xml|html?|css|js|py)$/i.test(name)) {
          let body = await blob.slice(0, 16000).text();
          // HTML is reduced to inert text; scripts, remote resources and forms
          // never run just because someone attaches a page.
          if (/html/i.test(mime) || /\.html?$/i.test(name)) {
            const template = document.createElement("template");
            template.innerHTML = body;
            template.content.querySelectorAll("script,style,noscript,iframe,object,embed").forEach(node => node.remove());
            body = template.content.textContent || "";
          }
          result = documentStill(name, body);
        }
      } catch { /* Unrenderable or oversized files retain the type icon. */ }
      return App.isSafeUploadPreview(result) ? result : "";
    })();
    App.uploadPreviewCache.set(blob, task); return task;
  };
  App.paintUploadCard = function (card, file) {
    const progress = Math.min(99.99, Math.max(0, Number(file.uploadProgress) || 0));
    const meter = card.querySelector(".upload-meter"), label = card.querySelector(".upload-percent"), track = card.querySelector(".upload-track-fill");
    if (meter) meter.setAttribute("aria-valuenow", progress.toFixed(2));
    if (label) label.textContent = `${progress.toFixed(2)}%`;
    if (track) track.style.width = `${progress}%`;
    const value = App.isSafeUploadPreview(file.uploadPreview) ? file.uploadPreview : "";
    if (value && card.dataset.preview !== value) {
      card.dataset.preview = value;
      let img = card.querySelector(".upload-preview");
      if (!img) { img = document.createElement("img"); img.className = "upload-preview"; img.alt = ""; img.decoding = "async"; card.prepend(img); }
      img.src = value; card.classList.add("has-preview");
    }
  };
  App.createUploadCard = function (file, name) {
    const card = document.createElement("div"); card.className = "upload-card";
    const ext = (name.split(".").pop() || "FILE").toUpperCase().slice(0, 7);
    card.innerHTML = `<div class="upload-file-art" aria-hidden="true"><svg viewBox="0 0 64 76" fill="none"><path d="M10 2h28l16 16v54H10z M38 2v18h16" stroke="currentColor" stroke-width="2"/><path d="M21 35h22M21 43h22M21 51h14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg><span>${App.escapeHtml(ext)}</span></div><div class="upload-shade"></div><div class="upload-card-head"><span class="upload-head-spacer" aria-hidden="true"></span><span class="upload-name" title="${App.escapeAttr(name)}">${App.escapeHtml(name)}</span><span class="upload-meter" role="progressbar" aria-label="Uploading ${App.escapeAttr(name)}" aria-valuemin="0" aria-valuemax="100"><span class="upload-percent"></span><span class="upload-track"><span class="upload-track-fill"></span></span></span></div><div class="upload-card-foot"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 13V3m0 0L6 7m4-4 4 4M4 12v4h12v-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Uploading</span><span class="upload-size">${App.escapeHtml(App.htmlHubFileSizeText(App.getChatAttachmentByteSize(file)))}</span></div>`;
    App.paintUploadCard(card, file); return card;
  };
  App.patchMessageUploadCards = function (row, next, previous) {
    if (!previous || !Array.isArray(next.files) || !next.files.some(file => file.uploadPending)) return false;
    const stable = value => JSON.stringify(value, (key, item) => key === "uploadProgress" || key === "uploadPreview" ? undefined : item);
    if (stable(next) !== stable(previous)) return false;
    const items = row.querySelectorAll(".att-item");
    for (let index = 0; index < next.files.length; index++) if (next.files[index].uploadPending) {
      const card = items[index]?.querySelector(".upload-card"); if (!card) return false;
      App.paintUploadCard(card, next.files[index]);
    }
    return true;
  };
  App.register("media/upload-previews", function () {});
})(globalThis.ChatApp);
