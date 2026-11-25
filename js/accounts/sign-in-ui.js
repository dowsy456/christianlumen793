/* AUTHENTICATION UI ONLY.
 * showAuthNotice will NEVER be used inside the regular app. It exists only for
 * the start/sign-in/create screens; ui/toasts remains the signed-in renderer.
 * These email strings are a local UI gate, not verified email ownership or
 * authorization. Never persist them, send email, or bind them to a user record.
 * Only the existing Chat App credential lookup selects an account. */
(function (App) {
  "use strict";
  const emails = new Set([
    "vincenzo.brogna@students.pittstonarea.com",
    "caden.roberts@students.pittstonarea.com",
    "giuseppe.rodeghiero@students.pittstonarea.com",
    "santino.rodeghiero@students.pittstonarea.com",
    "thomas.craig@students.pittstonarea.com",
    "william.lykins@students.pittstonarea.com"
  ]);
  let transition = 0;
  let noticeTimer;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  App.authEmail = "";
  App.authBusy = false;
  App.isAllowedSignInEmail = email => emails.has(String(email || "").trim().toLowerCase());
  App.isAuthScreen = () => document.body.dataset.mode !== "chat";
  App.setAuthBusy = function (busy, name) {
    App.authBusy = !!busy;
    const views = name ? [App.$(`view-${name}`)] : [...document.querySelectorAll('.auth-view')];
    for (const view of views) {
      if (!view) continue;
      if (busy) view.querySelector('.auth-step')?.classList.remove('auth-slide-in');
      view.dataset.busy = String(!!busy);
      view.setAttribute("aria-busy", String(!!busy));
      view.querySelector('.auth-progress').hidden = !busy;
      view.querySelectorAll('button, input, summary').forEach(el => {
        if (busy) {
          el.dataset.authWasDisabled = el.disabled ? "1" : "0";
          if (el.tagName !== "SUMMARY") el.disabled = true;
        } else if (el.hasAttribute('data-auth-was-disabled')) {
          if (el.tagName !== "SUMMARY") el.disabled = el.dataset.authWasDisabled === "1";
          delete el.dataset.authWasDisabled;
        }
      });
    }
  };
  App.closeAuthNotice = function () {
    clearTimeout(noticeTimer);
    const notice = App.$("auth-notice");
    if (notice) notice.hidden = true;
    if (App.$("auth-notice-code")) App.$("auth-notice-code").textContent = "";
  };
  App.showAuthNotice = function (opts = {}) {
    // Hard boundary: callers cannot accidentally use this renderer in chat.
    if (!App.isAuthScreen()) return false;
    if (typeof opts === "string") opts = { body: opts };
    App.closeAuthNotice();
    App.$("auth-notice-title").textContent = opts.title || "Chat App";
    App.$("auth-notice-body").textContent = opts.body || "";
    App.$("auth-notice-code").textContent = opts.code || "";
    App.$("auth-notice-code").hidden = !opts.code;
    App.$("auth-notice-copy").hidden = !opts.code || !opts.showCopy;
    App.$("auth-notice-copy").textContent = "Copy";
    App.$("auth-notice").hidden = false;
    // A newly generated password must not disappear before it can be saved.
    if (!opts.code) noticeTimer = setTimeout(App.closeAuthNotice, opts.duration || 5000);
    return true;
  };
  App.resetSignIn = function () {
    ++transition;
    App.setAuthBusy(false);
    App.authEmail = "";
    App.$("login-email").value = "";
    App.$("auth-login-email").textContent = "";
    App.$("login-code").value = "";
    App.$("login-code").disabled = true;
    App.$("btn-toggle-eye").hidden = true;
    App.loginHidden = true;
    App.syncEye();
  };
  App.syncAuthView = function (name) {
    ++transition;
    App.setAuthBusy(false);
    App.hideAppTooltip?.();
    document.querySelectorAll('.auth-step').forEach(el => el.classList.remove('auth-slide-in', 'auth-slide-out'));
    App.$("auth-email-step").hidden = false;
    App.$("auth-next-working").hidden = true;
    if (name === "chat") {
      App.closeAuthNotice();
      App.resetSignIn();
      return;
    }
    App.closeMsgMenu?.(true);
    if (App.modalEl && !App.modalEl.hidden) App.closeModal?.();
    if (name === "home") {
      App.authEmail = "";
      App.$("auth-login-email").textContent = "";
      App.$("login-code").value = "";
      App.$("login-code").disabled = true;
      App.$("btn-toggle-eye").hidden = true;
      App.loginHidden = true;
      App.syncEye();
      App.hideError("email");
    }
    const step = App.$(`view-${name}`)?.querySelector('.auth-step');
    if (step && App.authHasShownView && !reducedMotion()) step.classList.add('auth-slide-in');
    App.authHasShownView = true;
  };
  App.advanceSignInEmail = async function () {
    if (App.authBusy || App.$("view-home").dataset.active !== "true") return;
    App.hideError("email");
    const email = App.$("login-email").value.trim().toLowerCase();
    if (!App.isAllowedSignInEmail(email)) {
      App.setError("email", email ? "Enter an allowed email address." : "Enter your email address.");
      App.$("login-email").focus();
      return;
    }
    const token = ++transition;
    App.setAuthBusy(true, "home");
    await wait(reducedMotion() ? 0 : 450);
    if (token !== transition) return;
    App.$("view-home").querySelector('.auth-step').classList.add('auth-slide-out');
    await wait(reducedMotion() ? 0 : 200);
    if (token !== transition) return;
    const working = App.$("auth-next-working");
    App.$("auth-email-step").hidden = true;
    working.hidden = false;
    working.classList.add('auth-slide-in');
    App.$("btn-auth-cancel").disabled = false;
    await wait(reducedMotion() ? 0 : 380);
    if (token !== transition) return;
    working.classList.remove('auth-slide-in');
    working.classList.add('auth-slide-out');
    await wait(reducedMotion() ? 0 : 170);
    if (token !== transition) return;
    App.setAuthBusy(false, "home");
    App.authEmail = email;
    App.$("auth-login-email").textContent = email;
    App.$("login-code").disabled = false;
    App.showView("login");
    App.$("login-code").focus({ preventScroll: true });
  };
  App.authLoadingDelay = () => wait(reducedMotion() ? 0 : 850);
  App.register("accounts/sign-in-ui", function () {
    document.querySelectorAll('.auth-step').forEach(step => step.addEventListener('animationend', event => {
      if (event.animationName === 'auth-in') step.classList.remove('auth-slide-in');
    }));
    App.$("auth-email-form").addEventListener("submit", event => { event.preventDefault(); void App.advanceSignInEmail(); });
    App.$("btn-auth-cancel").addEventListener("click", () => {
      App.showView("home");
      App.$("login-email").focus({ preventScroll: true });
    });
    App.$("auth-password-form").addEventListener("submit", event => { event.preventDefault(); App.$("btn-login").click(); });
    App.$("auth-create-form").addEventListener("submit", event => { event.preventDefault(); App.$("btn-create-account").click(); });
    // Click handlers own submission, preventing native form navigation.
    for (const id of ["btn-login", "btn-create-account"]) App.$(id).type = "button";
    App.$("login-email").addEventListener("input", () => App.hideError("email"));
    App.$("login-code").addEventListener("input", () => {
      App.hideError("login");
      App.$("btn-toggle-eye").hidden = !App.$("login-code").value;
    });
    App.$("auth-notice-close").addEventListener("click", App.closeAuthNotice);
    App.$("auth-notice-copy").addEventListener("click", async () => {
      const code = App.$("auth-notice-code").textContent;
      try { await App.copyTextToClipboard(code); }
      catch {
        App.$("auth-notice-copy").textContent = "Copy";
        App.$("auth-notice-body").textContent = "Select the password and copy it to save it.";
        return;
      }
      App.$("auth-notice-copy").textContent = "Copied";
    });
  });
})(globalThis.ChatApp);
