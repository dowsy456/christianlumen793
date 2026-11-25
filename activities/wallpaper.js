// Built-in activity documents share the app's palette across the iframe boundary.
(() => {
  if (parent === window) return;
  let host;
  try { host = parent.document.documentElement; } catch { return; }
  const root = document.documentElement;
  function sync() {
    if (host.dataset.hasBg !== "1") {
      delete root.dataset.hasBg;
      return;
    }
    const palette = getComputedStyle(host);
    for (const name of ["--wallpaper-hue", "--wallpaper-chroma"]) {
      root.style.setProperty(name, palette.getPropertyValue(name));
    }
    root.dataset.hasBg = "1";
  }
  parent.addEventListener("chatapp:wallpaper-palette", sync);
  window.addEventListener("pagehide", () => parent.removeEventListener("chatapp:wallpaper-palette", sync), { once: true });
  sync();
})();
