// Every new UI must match the user's uploaded background. Use the shared wallpaper palette for surfaces, text, borders, controls and interaction states.
/* The photographed image is painted only on the wallpaper and its crop preview.
 * UI colors come from one small pixel sample per image, never from input events. */
(function (App) {
  "use strict";
  let activeSource = null;
  let current = null;
  let screen = null;
  let preview = null;
  let sourceSize = null;
  let palette = null;
  let lastPalette = "";
  let decodedUpload = null;
  let chromeColor = null, defaultChromeColor = "";
  const neutral = { hue: 0, secondary: 0, chroma: 0, lightness: 50 };

  // Vote by hue family, ignoring transparent pixels and giving vivid regions
  // more weight. A circular neighborhood keeps reds on either side of 0° together.
  function samplePalette(image) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 40;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return neutral;
    try {
      ctx.drawImage(image, 0, 0, 40, 40);
      const { data } = ctx.getImageData(0, 0, 40, 40);
      const votes = new Float64Array(36);
      let count = 0, totalLight = 0, totalColor = 0;
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3] / 255;
        if (!alpha) continue;
        const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
        const hi = Math.max(r, g, b), lo = Math.min(r, g, b), spread = hi - lo;
        count += alpha;
        totalLight += alpha * (hi + lo) / 2;
        totalColor += alpha * spread;
        if (spread < 0.025) continue;
        const sector = hi === r ? (g - b) / spread : hi === g ? (b - r) / spread + 2 : (r - g) / spread + 4;
        const bin = (Math.round(sector * 6) + 36) % 36;
        const weight = alpha * spread;
        votes[bin] += weight;
        votes[(bin + 1) % 36] += weight * 0.4;
        votes[(bin + 35) % 36] += weight * 0.4;
      }
      if (!count) return neutral;
      let first = 0, second = -1;
      for (let i = 1; i < votes.length; i++) if (votes[i] > votes[first]) first = i;
      for (let i = 0; i < votes.length; i++) {
        const distance = Math.abs(i - first);
        if (distance >= 4 && distance <= 32 && (second < 0 || votes[i] > votes[second])) second = i;
      }
      const chroma = totalColor / count;
      return {
        hue: first * 10,
        secondary: second >= 0 && votes[second] > votes[first] * 0.18 ? second * 10 : first * 10,
        chroma: chroma < 0.025 ? 0 : Math.min(88, Math.round(Math.sqrt(chroma) * 95)),
        lightness: Math.round(totalLight / count * 100)
      };
    } catch {
      // Remote legacy addresses can display even if their server disallows pixel reads.
      return neutral;
    }
  }
  function setRootValue(name, value) {
    const style = document.documentElement.style;
    if (style.getPropertyValue(name) !== value) style.setProperty(name, value);
  }
  function publishPalette() {
    const { hue, secondary, chroma, lightness } = palette || neutral;
    const strength = Math.min(100, Math.round(chroma * current.accent / 100));
    const signature = [hue, secondary, strength, lightness, current.panels].join("/");
    if (signature === lastPalette) return;
    lastPalette = signature;
    setRootValue("--wallpaper-hue", String(hue));
    setRootValue("--wallpaper-secondary-hue", String(secondary));
    setRootValue("--wallpaper-chroma", strength + "%");
    setRootValue("--wallpaper-lightness", lightness + "%");
    setRootValue("--wallpaper-panel-opacity", String(current.panels / 100));
    if (chromeColor) {
      const color = `hsl(${hue}, ${Math.round(strength * 0.48)}%, 10%)`;
      if (chromeColor.content !== color) chromeColor.content = color;
    }
    window.dispatchEvent(new Event("chatapp:wallpaper-palette"));
  }

  function measure(frame) {
    frame.width = frame.box.clientWidth;
    frame.height = frame.box.clientHeight;
  }
  function observe(box, image) {
    const frame = { box, image };
    measure(frame);
    frame.observer = new ResizeObserver(() => {
      measure(frame);
      if (frame === screen) sizePreview();
      paint(frame);
    });
    frame.observer.observe(box);
    return frame;
  }
  function sizePreview() {
    if (!preview || !screen?.width || !screen.height) return;
    const ratio = screen.width / screen.height;
    preview.box.style.aspectRatio = String(ratio);
    preview.box.style.width = `min(100%, 680px, ${Math.round(ratio * 295)}px)`;
  }
  function geometry(frame, state) {
    const fit = Math.max(frame.width / sourceSize.width, frame.height / sourceSize.height);
    const width = sourceSize.width * fit, height = sourceSize.height * fit;
    return { width, height, travelX: frame.width - width * state.zoom, travelY: frame.height - height * state.zoom };
  }
  function paint(frame) {
    if (!frame || !frame.width || !frame.height || !current || !sourceSize) return;
    const { width, height, travelX, travelY } = geometry(frame, current);
    const style = frame.image.style;
    const x = travelX * current.x / 100, y = travelY * current.y / 100;
    style.width = width + "px";
    style.height = height + "px";
    style.transform = `translate3d(${x}px, ${y}px, 0) scale(${current.zoom})`;
    // Use viewport pixels for the full-size blur. Account for the preview and zoom
    // so the crop in Settings matches the screen. The isolated image owns the filter.
    const blur = current.blur * (frame === preview ? frame.width / screen.width : 1) / current.zoom;
    style.filter = `blur(${blur}px) saturate(${current.saturation}%)`;
    style.opacity = String(1 - current.dim / 100);
  }
  function releaseScreen() {
    if (screen) {
      screen.image.onload = null;
      screen.observer.disconnect();
      screen.box.remove();
      screen = null;
    }
    if (preview) preview.image.removeAttribute("src");
    sourceSize = palette = null;
  }
  function useSource(url) {
    releaseScreen();
    activeSource = url;
    const root = document.documentElement;
    if (!url) {
      delete root.dataset.hasBg;
      delete document.body.dataset.hasBg;
      for (const key of ["hue", "secondary-hue", "chroma", "lightness", "panel-opacity", "dim"]) root.style.removeProperty("--wallpaper-" + key);
      lastPalette = "";
      if (chromeColor) chromeColor.content = defaultChromeColor;
      window.dispatchEvent(new Event("chatapp:wallpaper-palette"));
      return;
    }
    if (!chromeColor) {
      chromeColor = document.querySelector('meta[name="theme-color"]');
      defaultChromeColor = chromeColor?.content || "";
    }
    root.dataset.hasBg = document.body.dataset.hasBg = "1";
    const box = document.createElement("div");
    box.className = "app-wallpaper";
    box.setAttribute("aria-hidden", "true");
    const prepared = decodedUpload?.url === url ? decodedUpload.image : null;
    const image = prepared || document.createElement("img");
    image.alt = "";
    image.draggable = false;
    image.decoding = "async";
    box.appendChild(image);
    document.body.prepend(box);
    screen = observe(box, image);
    sizePreview();
    const ready = () => {
      if (screen?.image !== image || !image.naturalWidth || !image.naturalHeight) return;
      image.onload = null;
      sourceSize = { width: image.naturalWidth, height: image.naturalHeight };
      palette = samplePalette(image);
      publishPalette();
      paint(screen);
      paint(preview);
    };
    if (prepared) ready();
    else {
      image.onload = ready;
      image.src = url;
    }
    if (preview) preview.image.src = url;
  }
  App.renderWallpaper = function (state) {
    current = state;
    if (state.dataURL !== activeSource) useSource(state.dataURL);
    if (!activeSource) return;
    publishPalette();
    setRootValue("--wallpaper-dim", String(state.dim / 100));
    paint(screen);
    paint(preview);
  };

  function valueText(key, value) {
    const { scale, unit } = App.wallpaperControls[key];
    return Number((value * scale).toFixed(1)) + unit;
  }
  App.wallpaperEditorHTML = function () {
    const sliders = Object.entries(App.wallpaperControls).map(([key, c]) => `
      <div class="settings-slider-row">
        <label class="settings-slider-label" for="settings-bg-${key}">${c.label}</label>
        <input id="settings-bg-${key}" data-wallpaper-control="${key}" type="range"
               min="${c.min}" max="${c.max}" step="${c.step}" value="${c.initial}">
        <output class="settings-slider-val" id="settings-bg-${key}-val" for="settings-bg-${key}">${valueText(key, c.initial)}</output>
      </div>`).join("");
    return `<div class="wallpaper-editor-layout">
      <div class="wallpaper-editor-source">
        <div class="settings-background-preview" id="settings-bg-preview" data-has-image="0" role="group"
                   aria-label="Background position" aria-description="Use the arrow keys to position the background." tabindex="-1">
          <img id="settings-bg-preview-layer" alt="" draggable="false" decoding="async">
          <div class="settings-background-preview-empty">No background image selected</div>
        </div>
        <div class="settings-action-row">
          <button class="btn tiny" id="btn-bg-upload" type="button" aria-label="Upload Image">Upload</button>
          <button class="btn tiny" id="btn-bg-download" type="button" hidden aria-label="Download Image">Download</button>
          <button class="btn tiny" id="btn-bg-copy-address" type="button" hidden aria-label="Copy Image Address">Copy Address</button>
          <button class="btn tiny danger" id="btn-bg-remove" type="button" hidden aria-label="Remove Image">Remove</button>
          <input id="settings-bg-file" type="file" accept="image/*" hidden>
        </div>
      </div>
      <div class="settings-control-card" id="settings-bg-controls" hidden>
        ${sliders}
        <div class="settings-action-row">
          <button class="btn tiny" id="btn-bg-center" type="button" aria-label="Center Image">Center</button>
          <button class="btn tiny" id="btn-bg-reset" type="button" aria-label="Reset Adjustments">Reset</button>
        </div>
      </div>
    </div>`;
  };

  App.mountWallpaperEditor = function () {
    const box = App.$("settings-bg-preview"), fileInput = App.$("settings-bg-file");
    const controls = Array.from(App.$("settings-bg-controls").querySelectorAll("input"));
    const image = App.$("settings-bg-preview-layer");
    const session = App.accountSessionGeneration;
    let draft = {}, baseSource = null, raf = 0, drag = null, readId = 0;
    let loaded = false;
    preview = observe(box, image);
    if (activeSource) image.src = activeSource;
    sizePreview();
    function state() { return { ...App.appBgCommitted, ...draft }; }
    function repaint() {
      raf = 0;
      App.renderWallpaper(state());
    }
    function stage(changes) {
      Object.assign(draft, changes);
      if (!raf) raf = requestAnimationFrame(repaint);
    }
    function commit() {
      if (!Object.keys(draft).length) return;
      cancelAnimationFrame(raf);
      raf = 0;
      const next = state();
      draft = {};
      if (session === App.accountSessionGeneration) App.applyAppBackground(next);
    }
    function discard() {
      cancelAnimationFrame(raf);
      raf = 0;
      draft = {};
      drag = null;
      delete box.dataset.dragging;
    }
    function sync() {
      if (baseSource !== App.appBgCommitted.dataURL) {
        discard();
        baseSource = App.appBgCommitted.dataURL;
      }
      const model = state(), has = !!model.dataURL;
      if (!loaded || box.dataset.hasImage !== (has ? "1" : "0")) {
        loaded = true;
        box.dataset.hasImage = has ? "1" : "0";
        box.tabIndex = has ? 0 : -1;
        for (const id of ["btn-bg-remove", "btn-bg-download", "btn-bg-copy-address", "settings-bg-controls"]) App.$(id).hidden = !has;
      }
      for (const input of controls) {
        const key = input.dataset.wallpaperControl;
        input.value = model[key];
        App.syncPreciseRangeVisual(input);
        App.$(input.id + "-val").firstChild.data = valueText(key, model[key]);
      }
      App.renderWallpaper(model);
    }
    App.wallpaperEditor = {
      sync,
      close() {
        readId++;
        commit();
        discard();
        preview.observer.disconnect();
        preview.image.removeAttribute("src");
        preview = null;
        App.wallpaperEditor = null;
      }
    };
    for (const input of controls) {
      const key = input.dataset.wallpaperControl, output = App.$(input.id + "-val");
      input.addEventListener("input", () => {
        output.firstChild.data = valueText(key, Number(input.value));
        stage({ [key]: Number(input.value) });
      });
      // Keyboard auto-repeat also produces one native change per step. Treat a
      // held arrow like a single drag and save its final value on release.
      let keyEditing = false;
      input.addEventListener("keydown", event => {
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(event.key)) keyEditing = true;
      });
      input.addEventListener("change", () => { if (!keyEditing) commit(); });
      const releaseKey = () => { keyEditing = false; commit(); };
      input.addEventListener("keyup", releaseKey);
      input.addEventListener("blur", releaseKey);
    }
    box.addEventListener("pointerdown", event => {
      if (!sourceSize || !event.isPrimary || event.button !== 0) return;
      measure(preview);
      const model = state();
      const { travelX, travelY } = geometry(preview, model);
      drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: model.x, y: model.y, travelX, travelY };
      box.focus({ preventScroll: true });
      box.setPointerCapture(event.pointerId);
      box.dataset.dragging = "1";
      event.preventDefault();
    });
    function pan(position, delta, travel) {
      if (Math.abs(travel) < 0.5) return position;
      return Math.round(App.clampBg(position + delta / travel * 100, 0, 100) * 1000) / 1000;
    }
    box.addEventListener("pointermove", event => {
      if (event.pointerId !== drag?.id) return;
      stage({ x: pan(drag.x, event.clientX - drag.startX, drag.travelX), y: pan(drag.y, event.clientY - drag.startY, drag.travelY) });
    });
    function endPan(event) {
      if (event.pointerId !== drag?.id) return;
      drag = null;
      delete box.dataset.dragging;
      commit();
    }
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) box.addEventListener(type, endPan);
    box.addEventListener("keydown", event => {
      if (!sourceSize) return;
      const distance = event.shiftKey ? 20 : 4;
      const delta = { ArrowLeft: [-distance, 0], ArrowRight: [distance, 0], ArrowUp: [0, -distance], ArrowDown: [0, distance] }[event.key];
      if (!delta) return;
      event.preventDefault();
      const model = state(), g = geometry(preview, model);
      stage({ x: pan(model.x, delta[0], g.travelX), y: pan(model.y, delta[1], g.travelY) });
    });
    box.addEventListener("keyup", commit);
    box.addEventListener("blur", commit);
    App.$("btn-bg-center").onclick = () => App.applyAppBackground({ ...state(), x: 50, y: 50 });
    App.$("btn-bg-reset").onclick = () => App.applyAppBackground({ ...App.APP_BG_DEFAULT, dataURL: activeSource });
    App.$("btn-bg-remove").onclick = () => { readId++; App.clearAppBackground(); };
    App.$("btn-bg-download").onclick = () => activeSource && App.downloadFileViaObjectURL(activeSource, `background.${App.inferImageExt(activeSource)}`);
    App.$("btn-bg-copy-address").onclick = () => activeSource && App.copyImageAddress(activeSource);
    App.$("btn-bg-upload").onclick = () => fileInput.click();
    fileInput.onchange = async () => {
      const file = fileInput.files?.[0];
      fileInput.value = "";
      if (!file) return;
      const id = ++readId;
      try {
        if (!file.type.startsWith("image/")) throw new Error("Please select an image file.");
        const url = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Could not read that file."));
          reader.readAsDataURL(file);
        });
        const check = new Image();
        check.src = url;
        await check.decode();
        if (readId !== id || session !== App.accountSessionGeneration) return;
        decodedUpload = { url, image: check };
        try { App.applyAppBackground({ ...App.appBgCommitted, dataURL: url, x: 50, y: 50, zoom: 1 }); }
        finally { decodedUpload = null; }
      } catch (error) {
        if (readId === id && session === App.accountSessionGeneration) App.showToast({ title: "Background", body: error.name === "EncodingError" ? "This image could not be opened." : error.message, duration: 2500 });
      }
    };
    sync();
  };
  App.register("settings/wallpaper", function initializeWallpaper() {});
})(globalThis.ChatApp);
