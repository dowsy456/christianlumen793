/* chat/message-surface: methods register before ordered initialization. */
(function (App) {
  "use strict";
App.syncRoomEmptyState = function () {
  App.syncRetainedPinsSeparator();
  const emptyState = App.$("room-empty-state");
  if (!emptyState || !App.messagesListEl) return;
  const place = App.getStoredPlace() || "";
  const inRoom = !!App.currentRoomId && place === `room:${App.currentRoomId}` && App.views.chat.dataset.active === "true";
  const loadingNode = App.messagesListEl.querySelector("#room-loading-state, .room-loading-state");
  const loading = !!App.roomLoadingActive || !!(loadingNode && !loadingNode.hidden && loadingNode.dataset.roomLoading === "1");
  const hasMessages = !!App.messagesListEl.querySelector(".msg-row");
  emptyState.hidden = !(inRoom && !loading && !hasMessages);
};
App.isRetainedChatPin = function (message, key, roomId = App.currentRoomId) {
  const epoch = Number(App.roomsMetaCache?.get(roomId)?.messagesClearedAt) || 0;
  const createdAt = Number(message?.createdAt) || App.firebasePushKeyTimestamp?.(key) || 0;
  return !!(epoch && message?.pinned && !message.__stub && createdAt > 0 && createdAt <= epoch);
};
App.syncRetainedPinsSeparator = function () {
  const list = App.messagesListEl;
  if (!list) return;
  const existing = list.querySelector(".retained-pins-divider");
  const inRoom = App.currentRoomId && App.getStoredPlace() === `room:${App.currentRoomId}`;
  const rows = Array.from(list.children).filter(row => row.classList.contains("msg-row"));
  const pins = inRoom ? rows.filter(row => App.isRetainedChatPin(App.msgDataByKey?.get(row.dataset.msgkey), row.dataset.msgkey)) : [];
  if (!pins.length) { existing?.remove(); return; }
  const retained = new Set(pins);
  const current = rows.filter(row => !retained.has(row));
  let divider = existing;
  if (!divider) {
    divider = document.createElement("div"); divider.className = "retained-pins-divider";
    divider.setAttribute("role", "separator"); divider.setAttribute("aria-label", "Pinned messages from before this chat was cleared");
    const label = document.createElement("span"); label.textContent = "Pinned from Earlier Messages"; divider.append(label);
  }
  divider.classList.toggle("is-only-pins", !current.length);
  // Compare before moving nodes: media keeps its state and the observer never
  // feeds back into itself. New pins remain in the current-message group.
  const ordered = [...pins, divider, ...current];
  const actual = Array.from(list.children).filter(row => row === divider || row.classList.contains("msg-row"));
  if (ordered.some((row, index) => actual[index] !== row)) {
    const anchor = actual[0] || null;
    if (!actual.includes(divider)) list.insertBefore(divider, anchor);
    // Moving backwards keeps loading/history controls outside this timeline.
    let before = current.at(-1)?.nextSibling || pins.at(-1)?.nextSibling || null;
    if (ordered.includes(before)) before = null;
    for (let i = ordered.length - 1; i >= 0; i--) { if (ordered[i].nextSibling !== before) list.insertBefore(ordered[i], before); before = ordered[i]; }
  }
};
App.scheduleRoomEmptyStateSync = function () {
  if (App.roomEmptyStateRaf) return;
  App.roomEmptyStateRaf = requestAnimationFrame(() => {
    App.roomEmptyStateRaf = 0;
    App.syncRoomEmptyState();
  });
};
App.bindNoDragSelectHomeSchedules = function () {
  if (App.noDragSelectHomeSchedulesBound || !App.messagesListEl) return;
  App.noDragSelectHomeSchedulesBound = true;
  const shouldBlock = e => {
    const place = App.getStoredPlace() || "";
    if (place !== "home" && place !== "schedules") return false;
    const t = e.target;
    if (t instanceof HTMLElement) {
      // Allow normal text selection/caret in inputs/textareas/contenteditable only.
      if (t.closest("input, textarea, [contenteditable='true'], [contenteditable='']")) return false;
    }
    return true;
  };
  App.messagesListEl.addEventListener("pointerdown", e => {
    if (shouldBlock(e)) e.preventDefault();
  }, {
    passive: false
  });
  App.messagesListEl.addEventListener("selectstart", e => {
    if (shouldBlock(e)) e.preventDefault();
  }, {
    passive: false
  });
};

App.register("chat/message-surface", function initializeFeature() {
App.messagesEl = App.$("messages");
App.messagesListEl = App.$("messages-inner");
if (!App.messagesListEl && App.messagesEl) {
  App.messagesListEl = document.createElement("div");
  App.messagesListEl.id = "messages-inner";
  App.messagesListEl.className = "messages-inner";
  while (App.messagesEl.firstChild) App.messagesListEl.appendChild(App.messagesEl.firstChild);
  App.messagesEl.appendChild(App.messagesListEl);
}
App.messagesListEl = App.messagesListEl || App.messagesEl;
if (App.messagesListEl && App.messagesListEl !== App.messagesEl) {
  App.messagesListEl.style.display = "flex";
  App.messagesListEl.style.flexDirection = "column";
  App.messagesListEl.style.gap = "6px";
  App.messagesListEl.style.minHeight = "100%";
  App.messagesListEl.style.willChange = "auto";
  App.messagesListEl.style.transform = "";
  App.messagesListEl.style.transition = "";
}
App.roomEmptyStateRaf = 0;
if (App.messagesListEl && typeof MutationObserver !== "undefined") {
  new MutationObserver(App.scheduleRoomEmptyStateSync).observe(App.messagesListEl, {
    childList: true
  });
}
App.scheduleRoomEmptyStateSync();
App.noDragSelectHomeSchedulesBound = false;
App.bindNoDragSelectHomeSchedules();
});
})(globalThis.ChatApp);
