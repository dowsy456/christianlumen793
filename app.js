/* index.html remains the entry point. No router or HTML redirects.
 * AUTH-ONLY NOTICE CONTRACT: accounts/sign-in-ui.js is solely for the start,
 * sign-in and create-account screens. Its notice will NEVER be used within
 * the regular app; ui/toasts.js remains the regular app notification system. */
(() => {
  "use strict";
  async function boot() {
    performance.mark("chatapp:boot-start");
    await Promise.all([
      (async () => {
        if (globalThis.firebase?.initializeApp && globalThis.firebase?.database) return;
        await ChatRuntime.loadScript("vendor/firebase-app-compat.js");
        await ChatRuntime.loadScript("vendor/firebase-database-compat.js");
      })(),
      ChatRuntime.loadAll(ChatAppModules)
    ]);
    ChatApp.installMobileRuntime();
    ChatApp.initialize(ChatAppModules);
    ChatApp.mobileReady?.();
    performance.mark("chatapp:boot-end");
    performance.measure("chatapp:boot", "chatapp:boot-start", "chatapp:boot-end");
  }
  boot().catch(error => {
    console.error("Application startup failed", error);
    globalThis.ChatAppBootError = error.message;
    document.documentElement.dataset.appReady = "error";
    const notice = document.createElement("div");
    notice.className = "boot-error";
    notice.setAttribute("role", "alert");
    const title = document.createElement("strong");
    title.textContent = "Unable to start the app";
    const detail = document.createElement("span");
    detail.textContent = "Keep index.html and all folders together. " + error.message;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Reload";
    button.addEventListener("click", () => location.reload());
    notice.append(title, detail, button);
    document.body.appendChild(notice);
  });
})();
