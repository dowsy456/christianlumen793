/* Theme-matched, local controls for screenshot annotation styles. */
(function (App) {
  "use strict";
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const hexColor = value => {
    const raw = String(value || "").trim().replace(/^#/, "");
    if (/^[\da-f]{3}$/i.test(raw)) return `#${[...raw].map(c => c + c).join("").toLowerCase()}`;
    return /^[\da-f]{6}$/i.test(raw) ? `#${raw.toLowerCase()}` : null;
  };
  function toHsv(hex) {
    const [r, g, b] = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    let h = 0;
    if (delta) h = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    return { h: (h * 60 + 360) % 360, s: max ? delta / max : 0, v: max };
  }
  function fromHsv({ h, s, v }) {
    const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
    const rgb = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return `#${rgb.map(value => Math.round((value + m) * 255).toString(16).padStart(2, "0")).join("")}`;
  }
  App.createImageEditorToolPanel = function ({ mount, onChange, onEditText } = {}) {
    const styles = {
      text: { color: "#ef3737", strokeColor: "#000000", size: 32, width: 3, strokeWidth: 1 },
      arrow: { color: "#ef3737", strokeColor: "#000000", size: 32, width: 3, strokeWidth: 1 },
      pen: { color: "#ef3737", strokeColor: "#000000", size: 32, width: 3, strokeWidth: 1 }
    };
    let selectedStyle = null;
    const currentStyle = () => selectedStyle || styles[tool];
    let tool = "pan", colorField = null, hsv = toHsv(styles.text.color), hideTimer = 0, openFrame = 0, disposed = false, pointer = null;
    const panel = document.createElement("section");
    panel.className = "image-editor-options"; panel.hidden = true; panel.inert = true;
    panel.setAttribute("aria-label", "Drawing Tool Options"); panel.setAttribute("aria-hidden", "true");
    const colors = ["#ef3737", "#ff9d32", "#f6db48", "#51c98b", "#5da7ff", "#b28aff", "#ffffff", "#000000"];
    panel.innerHTML = `<div class="image-editor-options-title"></div>
      <p class="image-editor-select-hint" hidden>Click text, an arrow or a drawing to edit it.</p><div class="image-editor-style-fields"><div class="image-editor-color-fields">${[["color", "Color"], ["strokeColor", "Outline"]].map(([key, label]) => `<div class="image-editor-color-field" data-color-field="${key}"><span>${label}</span><button class="image-editor-color-button" type="button" data-image-color="${key}" aria-label="Choose ${label}" aria-expanded="false"><span class="image-editor-color-chip" aria-hidden="true"></span><span class="image-editor-color-value"></span><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>`).join("")}</div>
      <label class="image-editor-size-row"><span>Text Size</span><span class="image-editor-size-field"><input data-image-size type="text" inputmode="decimal" autocomplete="off" spellcheck="false" aria-label="Text Size" aria-description="Enter a size from 8 to 200" value="32" maxlength="6"></span></label>
      <label class="image-editor-width-row image-editor-size-row"><span>Line Width</span><span class="image-editor-size-field"><input data-image-width type="text" inputmode="decimal" aria-label="Line Width" aria-description="Enter a width from 1 to 30" value="3" maxlength="5"></span></label>
      <label class="image-editor-stroke-row image-editor-size-row"><span>Outline Width</span><span class="image-editor-size-field"><input data-image-stroke-width type="text" inputmode="decimal" aria-label="Outline Width" aria-description="Enter a width from 0 to 10" value="1" maxlength="5"></span></label>
      <button class="chat-icon-button image-editor-edit-text" type="button" aria-label="Edit Text" hidden><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 19h4.2L18.6 9.6a2 2 0 0 0 0-2.8l-1.4-1.4a2 2 0 0 0-2.8 0L5 14.8V19Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M13.5 6.3l4.2 4.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      <div class="image-editor-color-picker" hidden>
        <div class="image-editor-palette" aria-label="Color Palette">${colors.map(color => `<button type="button" data-color-swatch="${color}" style="--swatch:${color}" aria-label="Use ${color}" aria-pressed="false"></button>`).join("")}</div>
        <div class="image-editor-color-spectrum" data-color-spectrum tabindex="0" role="slider" aria-label="Color Saturation and Brightness" aria-description="Left and right change saturation. Up and down change brightness. Hold Shift for larger steps." aria-valuemin="0" aria-valuemax="100"><span class="image-editor-spectrum-cursor" aria-hidden="true"></span></div>
        <input class="image-editor-color-hue" data-color-hue type="range" min="0" max="359" step="1" aria-label="Color Hue">
        <label class="image-editor-hex-row"><span>Hex</span><input class="image-editor-hex-input" data-color-hex type="text" inputmode="text" autocomplete="off" spellcheck="false" maxlength="7" aria-label="Hex Color" aria-description="Enter a 3 or 6 digit hexadecimal color" value="#ef3737"></label>
      </div></div><span class="image-editor-options-announcement" role="status"></span>`;
    mount.appendChild(panel);
    const title = panel.querySelector(".image-editor-options-title"), colorButtons = [...panel.querySelectorAll("[data-image-color]")];
    const outline = panel.querySelector('[data-color-field="strokeColor"]'), sizeRow = panel.querySelector(".image-editor-size-row"), size = panel.querySelector("[data-image-size]");
    const picker = panel.querySelector(".image-editor-color-picker"), spectrum = panel.querySelector("[data-color-spectrum]"), cursor = panel.querySelector(".image-editor-spectrum-cursor"), hue = panel.querySelector("[data-color-hue]"), hex = panel.querySelector("[data-color-hex]"), announce = panel.querySelector(".image-editor-options-announcement");
    const widthRow = panel.querySelector(".image-editor-width-row"), strokeRow = panel.querySelector(".image-editor-stroke-row");
    const widthInput = panel.querySelector("[data-image-width]"), strokeInput = panel.querySelector("[data-image-stroke-width]");
    const editTextButton = panel.querySelector(".image-editor-edit-text");
    editTextButton.onclick = () => onEditText?.();
    const getStyle = name => ({ ...(selectedStyle && name === tool ? selectedStyle : styles[name] || styles.pen) });
    function emit() { if (!disposed && currentStyle()) onChange?.(tool, getStyle(tool)); }
    function syncColors() {
      if (!currentStyle()) return;
      for (const button of colorButtons) {
        const value = currentStyle()[button.dataset.imageColor];
        button.querySelector(".image-editor-color-chip").style.backgroundColor = value;
        button.querySelector(".image-editor-color-value").textContent = value.toUpperCase();
        button.setAttribute("aria-expanded", String(button.dataset.imageColor === colorField));
      }
      const value = colorField && currentStyle()[colorField];
      for (const swatch of panel.querySelectorAll("[data-color-swatch]")) swatch.setAttribute("aria-pressed", String(swatch.dataset.colorSwatch === value));
    }
    function syncSpectrum({ keepHex = false } = {}) {
      spectrum.style.setProperty("--picker-hue", `hsl(${hsv.h} 100% 50%)`);
      cursor.style.left = `${hsv.s * 100}%`; cursor.style.top = `${(1 - hsv.v) * 100}%`;
      spectrum.setAttribute("aria-valuenow", String(Math.round(hsv.s * 100)));
      spectrum.setAttribute("aria-valuetext", `Saturation ${Math.round(hsv.s * 100)} percent, brightness ${Math.round(hsv.v * 100)} percent`);
      hue.value = String(Math.round(hsv.h)); hue.setAttribute("aria-valuetext", `${Math.round(hsv.h)} degrees`);
      if (!keepHex && colorField) hex.value = currentStyle()[colorField].toUpperCase();
      syncColors();
    }
    function applyColor(value, { preserveHsv = false, keepHex = false } = {}) {
      if (!colorField || !currentStyle()) return;
      const next = hexColor(value); if (!next) return;
      currentStyle()[colorField] = next;
      if (!preserveHsv) hsv = toHsv(next);
      hex.removeAttribute("aria-invalid"); announce.textContent = "";
      syncSpectrum({ keepHex }); emit();
    }
    function closePicker() {
      colorField = null; picker.hidden = true; pointer = null; panel.classList.remove("color-open"); syncColors();
    }
    function openPicker(field) {
      if (field === colorField) { closePicker(); return; }
      colorField = field; hsv = toHsv(currentStyle()[field]); picker.hidden = false;
      picker.setAttribute("aria-label", field === "strokeColor" ? "Outline Color" : "Drawing Color");
      panel.classList.add("color-open"); hex.removeAttribute("aria-invalid"); announce.textContent = ""; syncSpectrum();
    }
    colorButtons.forEach(button => button.addEventListener("click", () => openPicker(button.dataset.imageColor)));
    panel.querySelectorAll("[data-color-swatch]").forEach(button => button.addEventListener("click", () => applyColor(button.dataset.colorSwatch)));
    function spectrumPoint(event) {
      const box = spectrum.getBoundingClientRect();
      hsv.s = clamp((event.clientX - box.left) / Math.max(1, box.width), 0, 1);
      hsv.v = 1 - clamp((event.clientY - box.top) / Math.max(1, box.height), 0, 1);
      applyColor(fromHsv(hsv), { preserveHsv: true });
    }
    spectrum.addEventListener("pointerdown", event => {
      if (event.pointerType !== "touch" && event.button !== 0) return;
      event.preventDefault(); pointer = event.pointerId; spectrum.setPointerCapture(pointer); spectrum.focus({ preventScroll: true }); spectrumPoint(event);
    });
    spectrum.addEventListener("pointermove", event => { if (event.pointerId === pointer) spectrumPoint(event); });
    const releasePointer = event => { if (event.pointerId === pointer) pointer = null; };
    spectrum.addEventListener("pointerup", releasePointer); spectrum.addEventListener("pointercancel", releasePointer); spectrum.addEventListener("lostpointercapture", releasePointer);
    spectrum.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation(); const step = event.shiftKey ? .1 : .01;
      if (event.key === "ArrowLeft") hsv.s = clamp(hsv.s - step, 0, 1);
      if (event.key === "ArrowRight") hsv.s = clamp(hsv.s + step, 0, 1);
      if (event.key === "ArrowUp") hsv.v = clamp(hsv.v + step, 0, 1);
      if (event.key === "ArrowDown") hsv.v = clamp(hsv.v - step, 0, 1);
      if (event.key === "Home") hsv.s = 0; if (event.key === "End") hsv.s = 1;
      applyColor(fromHsv(hsv), { preserveHsv: true });
    });
    hue.addEventListener("input", () => { hsv.h = Number(hue.value); applyColor(fromHsv(hsv), { preserveHsv: true }); });
    hex.addEventListener("input", () => { if (hexColor(hex.value)) applyColor(hex.value, { keepHex: true }); });
    function commitHex() {
      const valid = hexColor(hex.value);
      if (valid) applyColor(valid);
      else { hex.setAttribute("aria-invalid", "true"); announce.textContent = "Use a 3 or 6 digit hexadecimal color."; if (colorField) hex.value = currentStyle()[colorField].toUpperCase(); }
    }
    hex.addEventListener("change", commitHex); hex.addEventListener("blur", commitHex);
    function numberField(input, key, minimum, maximum) {
      const commit = (final = false) => {
        const value = Number(input.value.trim()), style = currentStyle();
        if (!style) return;
        if (input.value.trim() && Number.isFinite(value)) {
          style[key] = Math.round(clamp(value, minimum, maximum) * 10) / 10;
          input.removeAttribute("aria-invalid"); if (final) input.value = String(style[key]); emit();
        } else if (final) { input.value = String(style[key]); announce.textContent = `Enter a number from ${minimum} to ${maximum}.`; }
      };
      input.addEventListener("input", () => commit());
      input.addEventListener("change", () => commit(true)); input.addEventListener("blur", () => commit(true));
      input.addEventListener("keydown", event => {
        if (event.key === "Enter") { event.preventDefault(); commit(true); input.blur(); }
        if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        input.value = String(clamp(currentStyle()[key] + (event.key === "ArrowUp" ? 1 : -1), minimum, maximum)); commit(true);
      });
    }
    numberField(size, "size", 8, 200); numberField(widthInput, "width", 1, 30); numberField(strokeInput, "strokeWidth", 0, 10);
    panel.addEventListener("keydown", event => {
      // Color/size input undo and arrows belong to their fields, never canvas history.
      if (event.key !== "Tab") event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); const field = colorField; closePicker(); if (field) panel.querySelector(`[data-image-color="${field}"]`)?.focus(); }
      if (event.key === "Enter" && event.target === hex) { event.preventDefault(); commitHex(); }
    });
    const placement = event => { if (event.target.closest?.(".image-editor-viewport, .image-editor-text-entry")) closePicker(); };
    mount.addEventListener("pointerdown", placement, true);
    function selectTool(next, selected = null) {
      if (disposed) return;
      clearTimeout(hideTimer); cancelAnimationFrame(openFrame); closePicker(); tool = String(next || "pan"); selectedStyle = selected ? { ...selected } : null; panel.dataset.tool = tool;
      const visible = !!currentStyle() || tool === "select"; panel.inert = !visible; panel.setAttribute("aria-hidden", String(!visible));
      if (!visible) {
        if (panel.contains(document.activeElement)) mount.querySelector(`[data-image-tool="${tool}"]`)?.focus({ preventScroll: true });
        panel.classList.remove("is-visible"); hideTimer = setTimeout(() => { panel.hidden = true; }, 150); return;
      }
      title.textContent = (selectedStyle ? "Selected " : "") + (tool === "text" ? "Text" : tool === "arrow" ? "Arrow" : tool === "select" ? "Select" : "Draw");
      panel.querySelector(".image-editor-select-hint").hidden = tool !== "select";
      panel.querySelector(".image-editor-style-fields").hidden = tool === "select";
      outline.hidden = tool === "pen"; sizeRow.hidden = tool !== "text";
      widthRow.hidden = !["pen", "arrow"].includes(tool); strokeRow.hidden = tool === "pen";
      editTextButton.hidden = !(selectedStyle && tool === "text");
      const style = currentStyle();
      if (style) { size.value = String(style.size); widthInput.value = String(style.width); strokeInput.value = String(style.strokeWidth); }
      size.removeAttribute("aria-invalid"); announce.textContent = ""; syncColors();
      panel.hidden = false; openFrame = requestAnimationFrame(() => panel.classList.add("is-visible"));
    }
    return { selectTool, getStyle, destroy() { if (disposed) return; disposed = true; clearTimeout(hideTimer); cancelAnimationFrame(openFrame); mount.removeEventListener("pointerdown", placement, true); panel.remove(); } };
  };
  App.register("media/image-editor-tools", function () {});
})(globalThis.ChatApp);
