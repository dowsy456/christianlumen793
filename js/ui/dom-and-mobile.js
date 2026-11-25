/* ui/dom-and-mobile: methods register before ordered initialization. */
(function (App) {
  "use strict";
App.copyTextToClipboard = async function (text) {
  const value = String(text ?? "");
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    return;
  } catch {
    // Some direct-file and embedded clients only offer selection-based copying.
  }
  const previousFocus = document.activeElement;
  const selection = document.getSelection();
  const ranges = Array.from({ length: selection?.rangeCount || 0 }, (_, i) => selection.getRangeAt(i).cloneRange());
  const field = document.createElement("textarea");
  field.value = value;
  field.readOnly = true;
  field.style.cssText = "position:fixed;left:-9999px;top:0";
  document.body.appendChild(field);
  try {
    field.focus({ preventScroll: true });
    field.select();
    if (!document.execCommand("copy")) throw new Error("Clipboard access is unavailable.");
  } finally {
    field.remove();
    previousFocus?.focus?.({ preventScroll: true });
    if (selection && ranges.length) {
      selection.removeAllRanges();
      for (const range of ranges) selection.addRange(range);
    }
  }
};
App.syncMobileUiMode = function () {
  const wasMobile = document.body.dataset.mobileUi === "1";
  const enabled = App.mobileUserAgent || App.mobileUiMedia.matches;
  document.body.dataset.mobileUi = enabled ? "1" : "0";
  document.body.dataset.mobilePlatform = /Android/i.test(navigator.userAgent || "") ? "android" : App.mobileUserAgent ? "ios" : "web";
  if (!enabled) document.body.dataset.mobileNav = "0";
  if (!wasMobile && enabled && App.membersListVisible) {
    App.membersListVisible = false;
    App.syncEmojiButtonVisibility?.();
  }
  if (wasMobile && !enabled && App.currentRoomId) {
    App.membersListVisible = true;
    if (App.companionMembersBefore !== undefined) App.companionMembersBefore = true;
  }
  // Reconcile the hidden attribute when resizing back from the mobile drawer.
  if (wasMobile !== enabled && App.COMPOSER_OPTIONAL_TOOL_IDS && App.views?.chat) App.syncEmojiButtonVisibility?.();
  const viewport = window.visualViewport;
  const viewportHeight = Math.round(viewport?.height || window.innerHeight || 0);
  const viewportWidth = Math.round(viewport?.width || window.innerWidth || 0);
  const viewportTop = Math.max(0, Math.round(viewport?.offsetTop || 0));
  const editing = document.activeElement?.matches?.("input, textarea, [contenteditable='true']");
  const viewportKey = `${viewportWidth}:${viewportHeight}:${viewportTop}`;
  if (App.mobileViewportKey !== viewportKey) {
    // Capture before the keyboard changes the layout. A browser's automatic
    // focus scroll is not a request to start reading an older message.
    if (enabled) {
      App.composerLayoutUntil = Date.now() + 800;
      App.suppressHistoryAutoLoadUntil = App.composerLayoutUntil;
      if (!App.chatScrollFollowing && !App.chatScrollReadingAnchor) App.captureChatReadingAnchor?.();
    }
    if (viewportHeight) document.documentElement.style.setProperty("--mobile-viewport-height", `${viewportHeight}px`);
    if (viewportWidth) document.documentElement.style.setProperty("--mobile-viewport-width", `${viewportWidth}px`);
    document.documentElement.style.setProperty("--mobile-viewport-top", `${viewportTop}px`);
    App.mobileViewportKey = viewportKey;
    App.syncChatScrollAfterLayout?.({ reason: "mobile-viewport" });
  }
  if (!editing || !App.mobileViewportRestHeight) App.mobileViewportRestHeight = Math.max(viewportHeight, window.innerHeight || 0);
  document.body.dataset.mobileKeyboard = enabled && editing && Math.max(window.innerHeight || 0, App.mobileViewportRestHeight || 0) - viewportHeight > 120 ? "1" : "0";

  App.scheduleMobileChromeSync?.();
  App.syncMobileWelcome?.(enabled);
};
App.getMobileContextHoldTarget = function (e) {
  const path = typeof e?.composedPath === "function" ? e.composedPath() : [];
  const eventTarget = path.find(node => node instanceof Element) || e?.target;

  // Preserve the emoji grid button for the shared long-press Copy action.
  const insideEmojiPicker = path.some(node => node instanceof Element && node.id === "emoji-picker");
  if (insideEmojiPicker) {
    const emojiButton = path.find(node => node instanceof HTMLButtonElement);
    return emojiButton ? {
      anchor: emojiButton,
      dispatchTarget: emojiButton
    } : null;
  }
  if (!(eventTarget instanceof Element)) return null;
  const anchor = eventTarget.closest(App.MOBILE_CONTEXT_MENU_SELECTOR);
  return anchor ? {
    anchor,
    dispatchTarget: eventTarget
  } : null;
};
App.cancelMobileContextHold = function () {
  const hold = App.mobileContextHold;
  if (!hold) return;
  clearTimeout(hold.timer);
  clearTimeout(hold.feedbackTimer);
  hold.anchor?.classList?.remove("mobile-context-hold-target");
  App.mobileContextHold = null;
};
App.rafThrottle = function (fn) {
  let raf = 0;
  let lastThis = null;
  let lastArgs = null;
  return function (...args) {
    lastThis = this;
    lastArgs = args;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      fn.apply(lastThis, lastArgs);
    });
  };
};
App.syncPreciseRangeVisual = function (range) {
  if (!(range instanceof HTMLInputElement) || range.type !== "range") return;
  const min = Number(range.min || 0);
  const max = Number(range.max || 100);
  const val = Number(range.value || 0);
  const pct = Number.isFinite(min) && Number.isFinite(max) && Number.isFinite(val) && max > min ? Math.max(0, Math.min(100, (val - min) / (max - min) * 100)) : 0;
  range.style.setProperty("--range-pct", `${pct}%`);
};
// Chat App uses the same logged-out identity and accessible markup at every
// viewport width. Keep this hook for existing mobile initialization callers.
App.syncMobileWelcome = function () {};

// Mobile uses the same room, call, message, and menu actions as the desktop.
// Only navigation and touch affordances are different; no second chat state.
App.setMobileDrawer = function (drawer, { focus = false } = {}) {
  if (document.body.dataset.mobileUi !== "1") return;
  const members = drawer === "members" && App.isActiveChatRoomForMembersToggle?.();
  if (drawer && document.activeElement?.matches?.("input, textarea, [contenteditable='true']")) document.activeElement.blur();
  document.body.dataset.mobileNav = drawer === "navigation" ? "1" : "0";
  App.membersListVisible = !!members;
  App.syncEmojiButtonVisibility?.();
  App.closeComposerMoreMenu?.({ immediate: true });
  App.cancelMobileContextHold();
  App.syncMobileChrome();
  if (focus) requestAnimationFrame(() => {
    const target = drawer === "navigation" ? document.querySelector(".sidebar-mobile-close") : members ? App.$("btn-mobile-members-close") : App.$("btn-mobile-nav");
    target?.focus({ preventScroll: true });
  });
};
App.addMobileMessageActions = function (row) {
  if (!row.dataset.msgkey || row.dataset.mobileActions || row.classList.contains("system-message")) return;
  row.dataset.mobileActions = "1";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mobile-message-actions";
  button.setAttribute("aria-label", "Message Actions");
  button.setAttribute("aria-haspopup", "menu");
  button.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
  row.appendChild(button);
};
App.syncMobileChrome = function () {
  const mobile = document.body.dataset.mobileUi === "1";
  const inRoom = !!App.currentRoomId && document.body.dataset.roomView === "1";
  const nav = document.querySelector(".sidebar:not(.members-sidebar)");
  const members = App.$("members-sidebar");
  const navOpen = mobile && document.body.dataset.mobileNav === "1";
  const membersOpen = mobile && document.body.dataset.membersSidebar === "1";
  // Keep a closed drawer mounted for the slide animation. Rewriting its ARIA
  // state on unrelated focus/viewport events makes tooltips rescan its children.
  if (mobile && members?.hidden) members.hidden = false;
  for (const [drawer, open] of [[nav, navOpen], [members, membersOpen]]) {
    if (!drawer) continue;
    const inert = mobile && !open;
    if (drawer.inert !== inert) drawer.inert = inert;
    if (mobile) {
      const hidden = String(inert);
      if (drawer.getAttribute("aria-hidden") !== hidden) drawer.setAttribute("aria-hidden", hidden);
    } else {
      drawer.removeAttribute("aria-hidden");
    }
  }
  App.$("btn-mobile-nav")?.setAttribute("aria-expanded", String(navOpen));
  App.$("btn-mobile-nav")?.setAttribute("aria-controls", nav?.id || "sidebar-nav-surface");
  const roomName = inRoom ? App.roomDisplayName?.(App.currentRoomId, App.roomsMetaCache?.get(App.currentRoomId) || null) || App.currentRoomId : "Chat App";
  const title = App.$("mobile-room-title");
  if (title && title.textContent !== roomName) title.textContent = roomName;
  const subtitle = App.$("mobile-room-subtitle");
  const copy = inRoom ? "Messages" : "Your rooms & conversations";
  if (subtitle && subtitle.textContent !== copy) subtitle.textContent = copy;
  // Rows rendered before a switch to the narrow layout need controls once.
  if (mobile && !App.mobileMessageActionsEnabled) {
    for (const bubble of document.querySelectorAll(".msg-row[data-msgkey]:not([data-mobile-actions]) > .bubble")) {
      App.addMobileMessageActions(bubble.parentElement);
    }
  }
  App.mobileMessageActionsEnabled = mobile;
};
App.bindMobileChrome = function () {
  const anchor = document.querySelector(".mobile-nav-anchor");
  if (!anchor || anchor.dataset.mobileChrome === "1") return;
  anchor.dataset.mobileChrome = "1";
  anchor.setAttribute("aria-label", "Conversation Navigation");
  const copy = document.createElement("div");
  copy.className = "mobile-room-heading";
  copy.innerHTML = '<strong id="mobile-room-title">Chat App</strong><span id="mobile-room-subtitle">Your rooms &amp; conversations</span>';
  anchor.appendChild(copy);
  const button = (id, label, path) => {
    const el = document.createElement("button");
    el.id = id; el.type = "button"; el.className = "mobile-header-action";
    el.setAttribute("aria-label", label);
    el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">${path}</svg>`;
    return el;
  };
  const memberHead = document.createElement("div");
  memberHead.className = "mobile-members-head";
  const label = document.createElement("strong"); label.textContent = "Room Members";
  memberHead.appendChild(label);
  const close = button("btn-mobile-members-close", "Close Room Members", '<path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>');
  close.addEventListener("click", () => { App.setMobileDrawer(""); App.$("btn-members")?.focus({ preventScroll: true }); });
  memberHead.appendChild(close);
  App.$("members-sidebar")?.prepend(memberHead);
  App.scheduleMobileChromeSync = App.rafThrottle(App.syncMobileChrome);
  const observer = new MutationObserver(App.scheduleMobileChromeSync);
  observer.observe(document.body, { attributes: true, attributeFilter: ["data-mobile-ui", "data-mobile-nav", "data-members-sidebar", "data-room-view", "data-mode"] });
  document.addEventListener("click", event => {
    const target = event.target?.closest?.(".mobile-message-actions");
    if (!target || document.body.dataset.mobileUi !== "1") return;
    event.preventDefault(); event.stopPropagation();
    const row = target.closest(".msg-row");
    const rect = target.getBoundingClientRect();
    row?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, composed: true, clientX: rect.left, clientY: rect.bottom, button: 2 }));
  });
  App.syncMobileChrome();
};
App.bindMobileSwipes = function () {
  let gesture = null;
  let frame = 0;
  const clearDrag = () => {
    cancelAnimationFrame(frame); frame = 0;
    document.body.style.removeProperty("--mobile-drag-x");
    delete document.body.dataset.mobileDragging;
  };
  const reset = () => { gesture = null; clearDrag(); };
  const paint = () => {
    frame = 0;
    if (!gesture?.locked) return;
    document.body.dataset.mobileDragging = gesture.side;
    document.body.style.setProperty("--mobile-drag-x", `${gesture.position}px`);
  };
  const hasSelection = () => !!window.getSelection?.()?.toString();
  document.addEventListener("touchstart", event => {
    reset();
    if (document.body.dataset.mobileUi !== "1" || document.body.dataset.mode !== "chat" || event.touches.length !== 1 || hasSelection()) return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest(".modal:not([hidden]), #music-screen, .music-player, [role=slider], .msg-menu, .user-profile-popover, .emoji-popover, .sticker-popover, .voice-popover, input, textarea, select, [contenteditable], video, audio, canvas, iframe, .call-view-body")) return;
    const touch = event.touches[0];
    const drawer = document.body.dataset.mobileNav === "1" ? "navigation" : document.body.dataset.membersSidebar === "1" ? "members" : "";
    // In companion mode, members are a full-width overlay above that chat.
    if (document.body.dataset.companionChat === "1") return;
    const width = Math.min((window.visualViewport?.width || window.innerWidth) - 52, 360);
    gesture = { target, x: touch.clientX, y: touch.clientY, dx: 0, position: drawer === "navigation" ? width : drawer === "members" ? -width : 0, width, locked: false, started: performance.now(), drawer };
  }, { passive: true });
  document.addEventListener("touchmove", event => {
    if (!gesture) return;
    if (event.touches.length !== 1 || hasSelection()) { reset(); return; }
    const dx = event.touches[0].clientX - gesture.x;
    const dy = event.touches[0].clientY - gesture.y;
    if (!gesture.locked) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { reset(); return; }
      if (Math.abs(dx) < 18 || Math.abs(dx) < Math.abs(dy) * 1.7) return;
      if (!gesture.drawer && dx < 0 && !App.isActiveChatRoomForMembersToggle?.()) { reset(); return; }
      // Keep horizontal input with local scrollers such as the schedule account strip.
      for (let el = gesture.target; el && el !== document.body; el = el.parentElement) {
        if (el.scrollWidth > el.clientWidth + 1 && /^(auto|scroll)$/.test(getComputedStyle(el).overflowX)) { reset(); return; }
      }
      gesture.locked = true;
      gesture.side = gesture.drawer || (dx > 0 ? "navigation" : "members");
      App.cancelMobileContextHold();
    }
    gesture.dx = dx;
    const start = gesture.drawer === "navigation" ? gesture.width : gesture.drawer === "members" ? -gesture.width : 0;
    gesture.position = gesture.side === "navigation" ? Math.max(0, Math.min(gesture.width, start + dx)) : Math.min(0, Math.max(-gesture.width, start + dx));
    if (!frame) frame = requestAnimationFrame(paint);
    // The chat scroller declares pan-y. Track a horizontal drawer gesture
    // passively so a busy history render cannot block native vertical motion.
  }, { passive: true });
  document.addEventListener("touchend", event => {
    const swipe = gesture;
    if (!swipe?.locked || hasSelection()) { reset(); return; }
    const elapsed = performance.now() - swipe.started;
    const quick = Math.abs(swipe.dx) > 30 && elapsed < 250;
    const opening = swipe.side === "navigation" ? swipe.dx > 0 : swipe.dx < 0;
    // The distance required to close an open drawer matches the distance to open it.
    const threshold = swipe.width * (swipe.drawer ? .65 : .35);
    const open = quick ? opening : Math.abs(swipe.position) >= threshold;
    // Only a committed horizontal gesture consumes the compatibility click.
    if (event.cancelable) event.preventDefault();
    App.setMobileDrawer(open ? swipe.side : "");
    reset();
  }, { passive: false });
  document.addEventListener("touchcancel", reset, { passive: true });
};

// Android asks the web app first. A canceled event means this press was handled;
// an uncanceled event lets the native Activity move into the background.
App.handleMobileNativeBack = function (event) {
  if (event.defaultPrevented || document.body.dataset.mobileUi !== "1") return;
  const visible = selector => Array.from(document.querySelectorAll(selector)).some(element => {
    if (element.hidden || !element.getClientRects().length) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  });
  const consume = action => { event.preventDefault(); action?.(); };
  // Close only the top menu layer, keeping its underlying profile/modal open.
  const menus = [
    ["#music-context-menu", () => App.closeContextMenu?.(App.$("music-context-menu"), { immediate: true })],
    ["#profile-status-menu", () => App.closeProfileStatusMenu?.(true)],
    [".calendar-date-picker-pop", () => App.closeCalendarDatePicker?.()],
    ["#sticker-context-menu", () => App.closeStickerContextMenu?.(true, true)],
    ["#emoji-ctx-menu", () => App.closeEmojiCtxMenu?.(true)],
    [".html-hub-menu", () => App.closeHtmlHubContextMenu?.(true, true)],
    ["#call-input-settings-menu, #call-output-settings-menu", () => App.closeCallAudioSettings?.({ immediate: true, restoreFocus: true })],
    ["#call-screen-context-menu", () => App.closeCallScreenContextMenu?.(true)],
    ["#call-user-context-menu", () => App.closeCallUserContextMenu?.(true)],
    ["#msg-text-menu", () => App.closeMsgTextMenu?.(true)],
    ["#msg-menu", () => App.closeMsgMenu?.(true)]
  ];
  for (const [selector, close] of menus) {
    if (visible(selector)) { consume(close); return; }
  }
  if (App.userProfileOpen && visible("#user-profile-popover")) {
    consume(() => App.closeUserProfile?.(true)); return;
  }
  if (visible("#modal")) {
    // The existing close handler preserves its busy guard and cleanup hooks.
    consume(() => App.closeModal?.()); return;
  }
  if (visible("#emoji-popover, #sticker-popover, #voice-popover, #composer-more-menu, #poll-popover, .room-activities-menu")) {
    consume(() => App.dismissChatPopovers?.()); return;
  }
  if (App.musicScreenOpen && visible("#music-screen")) { consume(() => App.closeMusic?.()); return; }
  if (document.body.dataset.mobileNav === "1" || document.body.dataset.membersSidebar === "1") {
    consume(() => App.closeMobileDrawers?.()); return;
  }
  if (App.isTimeDisplayExpanded?.()) {
    consume(() => App.collapseTimeDisplay?.()); return;
  }
  if (App.selectedGame && visible(".games-stage-overlay")) {
    consume(() => { void App.closeGamesStage?.(); }); return;
  }
  if (App.callFocusedShareCode) {
    consume(() => App.closeShareView?.()); return;
  }
  if (App.callMenuExpanded) {
    consume(() => App.setCallMenuExpanded?.(false)); return;
  }
  if (App.callMenuOpen) {
    consume(() => App.closeCallMenu?.({ dismiss: true })); return;
  }
  if (App.currentUser && (App.currentRoomId || App.getStoredPlace?.() !== "home")) {
    // Home changes the visible page only. The active call/session is retained.
    consume(() => App.showLoggedInHome?.()); return;
  }
  if (!App.currentUser && (App.views?.login?.dataset.active === "true" || App.views?.create?.dataset.active === "true")) {
    consume(() => App.showView?.("home"));
  }
};

App.register("ui/dom-and-mobile", function initializeFeature() {
App.$ = id => document.getElementById(id);
App.mobileUiMedia = window.matchMedia("(max-width: 820px)");
App.mobileUserAgent = !!globalThis.ChatAppNativeInfo || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "") || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
App.syncMobileUiMode();
const syncMobileViewport = App.rafThrottle(App.syncMobileUiMode);
if (App.mobileUiMedia.addEventListener) App.mobileUiMedia.addEventListener("change", App.syncMobileUiMode);else App.mobileUiMedia.addListener?.(App.syncMobileUiMode);
window.addEventListener("orientationchange", () => { App.mobileViewportRestHeight = 0; syncMobileViewport(); });
window.addEventListener("resize", syncMobileViewport, { passive: true });
document.addEventListener("focusin", syncMobileViewport);
document.addEventListener("focusout", () => requestAnimationFrame(App.syncMobileUiMode));
window.visualViewport?.addEventListener("resize", syncMobileViewport);
window.visualViewport?.addEventListener("scroll", syncMobileViewport);
document.addEventListener("contextmenu", e => {
  if (!e.target?.closest?.(".msg-menu")) return;
  e.preventDefault();
  e.stopPropagation();
}, {
  capture: true,
  passive: false
});
App.MOBILE_CONTEXT_MENU_SELECTOR = [".msg-row", ".sched-avatar[data-usercode]", ".reply-preview-avatar", ".message-seen-avatar", ".calendar-author-button:not(:disabled)", ".tip-ava", ".online-ava-img", ".members-sidebar .online-ava.member-row[data-usercode]", ".call-participant[data-usercode]", ".call-screen-tile[data-share-code]", "[data-call-audio-context]", "[data-call-audio-settings]", ".html-hub-card[data-html-hub-id]", ".home-room-row[data-roomid]", ".room-row[data-room-row]", ".user-profile-avatar", ".me-pill-dock"].join(",");
App.mobileContextHold = null;
App.mobileContextClickBlock = null;
document.addEventListener("pointerdown", e => {
  if (document.body.dataset.mobileUi !== "1" || e.pointerType !== "touch" || !e.isPrimary) return;
  if (e.target?.closest?.(".msg-menu, .bubble-text, .reply-preview-snippet, .mobile-message-actions, input, textarea, select, [contenteditable='true'], [contenteditable='']") || window.getSelection?.()?.toString()) return;
  const hit = App.getMobileContextHoldTarget(e);
  if (!hit) return;
  App.cancelMobileContextHold();
  const hold = {
    pointerId: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    anchor: hit.anchor,
    dispatchTarget: hit.dispatchTarget,
    feedbackTimer: 0,
    timer: 0
  };
  hold.feedbackTimer = setTimeout(() => {
    if (App.mobileContextHold === hold) hold.anchor?.classList?.add("mobile-context-hold-target");
  }, 180);
  hold.timer = setTimeout(() => {
    if (App.mobileContextHold !== hold || !hold.dispatchTarget?.isConnected) {
      App.cancelMobileContextHold();
      return;
    }
    const contextEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: hold.x,
      clientY: hold.y,
      button: 2,
      buttons: 0
    });
    hold.dispatchTarget.dispatchEvent(contextEvent);
    const handled = contextEvent.defaultPrevented;
    App.cancelMobileContextHold();
    if (handled) {
      App.mobileContextClickBlock = {
        anchor: hold.anchor,
        until: Date.now() + 800
      };
      try {
        navigator.vibrate?.(12);
      } catch {}
    }
  }, 520);
  App.mobileContextHold = hold;
}, {
  capture: true,
  passive: true
});
document.addEventListener("pointermove", e => {
  const hold = App.mobileContextHold;
  if (!hold || e.pointerId !== hold.pointerId) return;
  if (Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 12) App.cancelMobileContextHold();
}, {
  capture: true,
  passive: true
});
document.addEventListener("pointerup", App.cancelMobileContextHold, {
  capture: true,
  passive: true
});
document.addEventListener("pointercancel", App.cancelMobileContextHold, {
  capture: true,
  passive: true
});
document.addEventListener("contextmenu", e => {
  if (e.isTrusted) App.cancelMobileContextHold();
  // Let an initial touch hold select text natively. A physical mouse at a
  // narrow viewport, or an already selected phrase, can use Copy/Search/Define.
  if (document.body.dataset.mobileUi === "1" && e.isTrusted && e.pointerType === "touch" && !window.getSelection?.()?.toString().trim() && e.target?.closest?.(".bubble-text, .reply-preview-snippet")) e.stopImmediatePropagation();
}, {
  capture: true,
  passive: true
});
document.addEventListener("click", e => {
  const block = App.mobileContextClickBlock;
  if (!block) return;
  if (Date.now() > block.until) {
    App.mobileContextClickBlock = null;
    return;
  }
  const target = e.target;
  const sameSurface = target instanceof Node && (block.anchor === target || block.anchor?.contains?.(target) || target.contains?.(block.anchor));
  if (!sameSurface) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  App.mobileContextClickBlock = null;
}, true);
App.sleep = (ms = 0) => new Promise(resolve => {
  setTimeout(resolve, Math.max(0, Number(ms) || 0));
});
App.nextPaint = () => new Promise(resolve => {
  requestAnimationFrame(resolve);
});
App.preciseRangeDragState = null;
App.bindMobileChrome();
App.bindMobileSwipes();
window.addEventListener("chatapp:nativeback", App.handleMobileNativeBack);
});
})(globalThis.ChatApp);


