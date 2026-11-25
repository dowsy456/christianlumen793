/* rooms/collections: methods register before ordered initialization. */
(function (App) {
  "use strict";
App.pinnedRoomsPath = function (code = App.currentUser?.code) {
  return code ? `users/${code}/prefs/pinnedRooms` : "";
};
App.readLegacyPinnedRoomSet = function () {
  try {
    const raw = localStorage.getItem(App.LS.PINS);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return new Set();
    const cleaned = arr.filter(x => typeof x === "string").map(x => App.sanitizeRoomCode(x)).filter(Boolean);
    localStorage.setItem(App.LS.PINS, JSON.stringify(cleaned));
    return new Set(cleaned);
  } catch {
    return new Set();
  }
};
App.setPinnedRoomSetLocal = function (set, {
  persistLegacy = true
} = {}) {
  App.pinnedRoomIds = new Set(Array.from(set || []).map(x => App.sanitizeRoomCode(x)).filter(Boolean).slice(0, 200));
  if (!persistLegacy) return;
  try {
    localStorage.setItem(App.LS.PINS, JSON.stringify(Array.from(App.pinnedRoomIds)));
  } catch {}
};
App.refreshRoomCollectionsUI = function () {
  App.renderRoomsList();
  const placeNow = App.getStoredPlace() || "home";
  if (!App.currentRoomId && App.views.chat.dataset.active === "true" && placeNow === "home") {
    App.clearMessagesToHome();
  }
};
App.stopPinnedRoomsSync = function () {
  if (App.pinnedRoomsRef && App.pinnedRoomsCb) {
    try {
      App.pinnedRoomsRef.off("value", App.pinnedRoomsCb);
    } catch {}
  }
  App.pinnedRoomsRef = null;
  App.pinnedRoomsCb = null;
  App.pinnedRoomIds = new Set();
  App.pendingPinnedRoomWrites.clear();
};
App.attachPinnedRoomsSync = function () {
  if (!App.currentUser?.code) return;
  App.stopPinnedRoomsSync();
  const legacyPins = App.readLegacyPinnedRoomSet();
  if (legacyPins.size) {
    App.setPinnedRoomSetLocal(legacyPins, {
      persistLegacy: false
    });
    App.refreshRoomCollectionsUI();
  }
  const ref = App.db.ref(App.pinnedRoomsPath());
  App.pinnedRoomsRef = ref;
  App.pinnedRoomsCb = snap => {
    const raw = snap.exists() ? snap.val() || {} : {};
    const remote = new Set();
    const invalidRemotePins = {};
    const acceptPin = (roomId, value) => {
      if (!value) return;
      const id = App.sanitizeRoomCode(String(roomId || ""));
      if (!id) {
        invalidRemotePins[roomId] = null;
        return;
      }
      remote.add(id);
    };
    if (Array.isArray(raw)) {
      raw.forEach(roomId => acceptPin(roomId, true));
    } else if (raw && typeof raw === "object") {
      Object.entries(raw).forEach(([roomId, value]) => acceptPin(roomId, value));
    }
    if (Object.keys(invalidRemotePins).length) {
      ref.update(invalidRemotePins).catch(() => {});
    }
    const nextLocal = App.pendingPinnedRoomWrites.size ? App.getPinnedRoomSet() : remote;
    App.pendingPinnedRoomWrites.forEach((pending, roomId) => {
      if (!pending) return;
      if (pending.value) nextLocal.add(roomId);else nextLocal.delete(roomId);
    });
    App.setPinnedRoomSetLocal(nextLocal);
    App.scheduleRoomsListCacheSave();
    App.refreshRoomCollectionsUI();
  };
  ref.on("value", App.pinnedRoomsCb);
};
App.getPinnedRoomSet = function () {
  return new Set(App.pinnedRoomIds);
};
App.togglePinnedRoom = async function (roomId) {
  const id = App.sanitizeRoomCode(roomId);
  if (!id || !App.currentUser?.code) return false;
  const set = App.getPinnedRoomSet();
  const next = !set.has(id);
  if (next) set.add(id);else set.delete(id);
  const seq = ++App.pinnedRoomWriteSeq;
  App.pendingPinnedRoomWrites.set(id, {
    value: next,
    seq
  });
  App.setPinnedRoomSetLocal(set);
  App.scheduleRoomsListCacheSave();
  App.refreshRoomCollectionsUI();
  try {
    const updates = {};
    for (const pinnedId of set) {
      updates[pinnedId] = true;
    }
    updates[id] = next ? true : null;
    await App.db.ref(App.pinnedRoomsPath()).update(updates);
    const pending = App.pendingPinnedRoomWrites.get(id);
    if (pending && pending.seq === seq) App.pendingPinnedRoomWrites.delete(id);
  } catch {
    const pending = App.pendingPinnedRoomWrites.get(id);
    if (pending && pending.seq === seq) App.pendingPinnedRoomWrites.delete(id);
  }
  return next;
};
App.roomPinBadgeSVG = function () {
  return `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9.2 4.5h5.6l.55 4.3 2.15 2.15v1.1H6.5v-1.1l2.15-2.15.55-4.3Z" fill="currentColor" opacity=".96"/>
      <path d="M12 12.1v7.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
  `;
};
App.formatNewMessagesLabel = function (count) {
  const n = Math.max(0, Math.trunc(Number(count) || 0));
  return `${n.toLocaleString("en-US")} new message${n === 1 ? "" : "s"}`;
};
// Badges are derived from existing messages, never from a sender-maintained
// counter. The bounded notification tail handles most rooms; an unread query
// starts at this reader's watermark for longer gaps (including deleted sends).
App.unreadRoomSubscriptions = new Map();
App.unreadSubscriptionsStarted = false;
App.hasCompleteUnreadTail = function (id, boundary) {
  const tail = App.notificationRoomTails?.get(id);
  return !!tail && (tail.size < 50 || !!boundary.start && [...tail.keys()].sort()[0] <= boundary.start);
};
App.unreadPushKeyFloor = function (timestamp) {
  let value = Math.max(0, Math.floor(Number(timestamp) || 0));
  const alphabet = "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz";
  let prefix = "";
  for (let i = 0; i < 8; i++) { prefix = alphabet[value % 64] + prefix; value = Math.floor(value / 64); }
  return prefix + "------------";
};
App.getRoomReadBoundary = function (roomId, membership = App.membershipMap.get(roomId)) {
  const epoch = Number(App.roomsMetaCache.get(roomId)?.messagesClearedAt) || 0;
  const sameEpoch = Number(membership?.lastSeenEpoch || 0) === epoch;
  const key = sameEpoch ? String(membership?.lastSeenMessageKey || "") : "";
  const at = key ? epoch : Math.max(epoch, Number(membership?.lastSeenAt) || 0, Number(membership?.joinedAt) || 0);
  return { epoch, key, at, start: key || (at ? App.unreadPushKeyFloor(at) : "") };
};
App.isUnreadRoomMessage = function (key, message, boundary) {
  if (!message || message.deleted || message.__stub || String(message.userCode || "") === String(App.currentUser?.code || "")) return false;
  if (boundary.key && key <= boundary.key) return false;
  const at = Number(message.createdAt) || App.firebasePushKeyTimestamp?.(key) || 0;
  if (boundary.epoch && at <= boundary.epoch) return false;
  if (!boundary.key && boundary.at && at && at <= boundary.at) return false;
  return true;
};
App.stopUnreadRoomSubscriptions = function () {
  for (const state of App.unreadRoomSubscriptions.values()) state.ref.off("value", state.callback);
  App.unreadRoomSubscriptions.clear();
  App.unreadSubscriptionsStarted = false;
};
App.syncUnreadRoomSubscriptions = function () {
  App.unreadSubscriptionsStarted = true;
  const code = String(App.currentUser?.code || "");
  for (const [id, state] of App.unreadRoomSubscriptions) {
    const boundary = App.getRoomReadBoundary(id, App.mergePendingRoomRead?.(id, App.membershipMap.get(id)) || App.membershipMap.get(id));
    if (code === state.code && App.membershipMap.has(id) && state.start === boundary.start && state.epoch === boundary.epoch && !App.hasCompleteUnreadTail(id, boundary)) continue;
    state.ref.off("value", state.callback); App.unreadRoomSubscriptions.delete(id);
  }
  if (!code || !App.db) return;
  for (const [id, record] of App.membershipMap) {
    if (App.unreadRoomSubscriptions.has(id)) continue;
    const boundary = App.getRoomReadBoundary(id, App.mergePendingRoomRead?.(id, record) || record);
    // Wait for the existing 50-message stream before allocating another query.
    // Most rooms and every just-read room need no extra subscription at all.
    if (!App.notificationRoomTails?.has(id) || App.hasCompleteUnreadTail(id, boundary)) continue;
    let ref = App.db.ref(`messages/${id}`).orderByKey();
    if (boundary.start) ref = ref.startAt(boundary.start);
    const state = { ...boundary, code, ref, ready: false, messages: new Map(), callback: null };
    App.unreadRoomSubscriptions.set(id, state);
    state.callback = snap => {
      if (App.unreadRoomSubscriptions.get(id) !== state || App.currentUser?.code !== code) return;
      const messages = new Map();
      snap.forEach(child => messages.set(String(child.key), child.val()));
      state.messages = messages; state.ready = true;
      App.updateRoomListItem?.(id); App.syncUnreadTaskbarBadge?.();
    };
    ref.on("value", state.callback, error => console.warn("Unread messages unavailable", error?.code));
  }
};
App.reconcileUnreadRoomTail = function (id) {
  App.syncUnreadRoomSubscriptions();
  const state = App.unreadRoomSubscriptions.get(id), tail = App.notificationRoomTails?.get(id);
  if (!state?.ready || !tail) return;
  const oldest = [...tail.keys()].sort()[0] || "";
  for (const key of state.messages.keys()) if ((tail.size < 50 || key >= oldest) && !tail.has(key)) state.messages.delete(key);
  for (const [key, message] of tail) if (!state.start || key >= state.start) state.messages.set(key, message);
};
App.getRoomMissedCount = function (roomId, {
  includeActiveRoom = false
} = {}) {
  const id = App.sanitizeRoomCode(roomId);
  if (!id) return 0;
  const meta = App.roomsMetaCache.get(id) || null;
  const membership = App.mergePendingRoomRead?.(id, App.membershipMap.get(id)) || App.membershipMap.get(id) || null;
  const total = Number(meta?.messageCount) || 0;
  const seen = App.getMembershipSeenCount(id, membership);
  const isProvisionalRestore = !App.restoreDone && !!membership && !Number(membership?.joinedAt) && !Number(membership?.lastSeenAt) && !Number(membership?.lastSeenCount);
  if (isProvisionalRestore) return 0;
  const count = Math.max(0, total - seen);
  const tail = App.notificationRoomTails?.get(id);
  const boundary = App.getRoomReadBoundary(id, membership);
  const exact = App.unreadRoomSubscriptions.get(id);
  const records = App.hasCompleteUnreadTail(id, boundary) ? tail : exact?.ready && exact.epoch === boundary.epoch ? exact.messages : null;
  if (records) return [...records].reduce((sum, [key, message]) => sum + Number(App.isUnreadRoomMessage(key, message, boundary)), 0);
  // On startup/reconnection do not publish cached numerical guesses while the
  // first authoritative unread snapshot is still loading.
  if (App.unreadSubscriptionsStarted && (!exact || !exact.ready)) return 0;
  if (tail) {
    if (!tail.size) return 0;
    const epoch = Number(meta?.messagesClearedAt) || 0;
    const key = Number(membership?.lastSeenEpoch || 0) === epoch ? String(membership?.lastSeenMessageKey || "") : "";
    if (key) {
      // Counts are sender-maintained and can lag, or retain deleted/failed
      // sends. A confirmed tail watermark records exactly what was read.
      let remaining = 0;
      for (const [messageKey, message] of tail) if (App.isUnreadRoomMessage(messageKey, message, boundary)) remaining++;
      if (String(App.notificationRoomHeads?.get(id) || "") <= key) return 0;
      if (key >= Array.from(tail.keys()).sort()[0]) return remaining;
      return Math.max(remaining, count);
    }
  }
  return count;
};
App.getMembershipSeenCount = function (roomId, membership) {
  const epoch = Number(App.roomsMetaCache.get(roomId)?.messagesClearedAt) || 0;
  // Clearing resets counts for everyone immediately through the room's epoch,
  // without downloading or rewriting the global membership tree. Older clients
  // that lack lastSeenEpoch remain compatible through their server read time.
  const readEpoch = Number(membership?.lastSeenEpoch) || 0;
  if (epoch && readEpoch !== epoch && (readEpoch || Number(membership?.lastSeenAt || 0) < epoch)) return Math.max(0, Number(App.roomsMetaCache.get(roomId)?.retainedMessageCount) || 0);
  return Math.max(0, Number(membership?.lastSeenCount) || 0);
};
App.publishUnreadBadge = function (count) {
  try { window.chatDesktopNotifications?.setUnreadCount?.(count); } catch {}
  try {
    const result = count ? navigator.setAppBadge?.(count) : navigator.clearAppBadge?.();
    result?.catch?.(() => {});
  } catch {}
};
App.syncUnreadTaskbarBadge = function () {
  let total = 0;
  if (App.currentUser) for (const roomId of App.membershipMap.keys()) total += App.getRoomMissedCount(roomId, { includeActiveRoom: true });
  total = Math.max(0, Math.trunc(total));
  if (App.lastTaskbarUnreadCount === total) return total;
  App.lastTaskbarUnreadCount = total;
  App.publishUnreadBadge(total);
  return total;
};
App.getSortedRoomEntries = function () {
  const pinned = App.getPinnedRoomSet();
  const rooms = [];
  for (const roomId of App.membershipMap.keys()) {
    const meta = App.getRoomDisplayMeta?.(roomId) || App.roomsMetaCache.get(roomId) || null;
    const displayName = App.roomDisplayName(roomId, meta);
    const lastAt = Number(meta?.lastMessageAt) || 0;
    const preview = meta?.lastMessagePreview ? String(meta.lastMessagePreview) : "";
    const missedCount = App.getRoomMissedCount(roomId);
    rooms.push({
      roomId,
      displayName,
      lastAt,
      preview,
      missedCount,
      unread: missedCount > 0,
      pinned: pinned.has(roomId)
    });
  }
  rooms.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.lastAt !== b.lastAt) return b.lastAt - a.lastAt;
    return String(a.displayName || a.roomId).localeCompare(String(b.displayName || b.roomId));
  });
  return rooms;
};
App.isRoomActivelyRead = function (roomId) {
  const id = App.sanitizeRoomCode(roomId);
  const placeNow = App.getStoredPlace() || "";
  if (!(id && App.currentUser && App.views.chat.dataset.active === "true" && App.currentRoomId === id && placeNow === `room:${id}` && !document.hidden) || App.myRoomIdle || App.isAppIdleNow?.() || App.hasLiveReceiptConnection?.() === false) return false;
  const key = App.notificationRoomHeads?.get(id) || App.getLatestReceiptMessage?.()?._key;
  return !!key && !!App.canSeeMessage?.(id, key);
};
App.pendingRoomReads = new Map();
App.clearPendingRoomReads = function () {
  for (const state of App.pendingRoomReads.values()) clearTimeout(state.timer);
  App.pendingRoomReads.clear();
};
App.mergePendingRoomRead = function (id, record) {
  const state = App.pendingRoomReads.get(id);
  if (!state) return record;
  const epoch = Number(App.roomsMetaCache.get(id)?.messagesClearedAt) || 0;
  if (!record || state.code !== App.currentUser?.code || state.epoch !== epoch || state.joinedAt !== (Number(record.joinedAt) || 0)) {
    clearTimeout(state.timer);
    App.pendingRoomReads.delete(id);
    return record;
  }
  // Membership events may contain older counts while another room updates or
  // this write awaits confirmation. Do not undo a read that already happened.
  return { ...(typeof record === "object" ? record : {}),
    lastSeenAt: Math.max(Number(record.lastSeenAt) || 0, state.at),
    lastSeenEpoch: state.epoch,
    lastSeenCount: Math.max(App.getMembershipSeenCount(id, record), state.count),
    lastSeenMessageKey: [Number(record.lastSeenEpoch || 0) === epoch ? String(record.lastSeenMessageKey || "") : "", state.key || ""].sort().at(-1) };
};
App._writeLastSeen = async function (roomId, countAtRead, expectedCode = App.currentUser?.code, state = null) {
  if (!App.currentUser || App.currentUser.code !== expectedCode) return;
  const id = App.sanitizeRoomCode(roomId);
  if (!id) return;
  const totalCount = Math.max(0, Number(countAtRead) || 0);
  return App.db.ref(`memberships/${expectedCode}/${id}`).transaction(current => {
    if (App.currentUser?.code !== expectedCode || !App.membershipMap.has(id)) return;
    if (state && (App.pendingRoomReads.get(id) !== state || state.epoch !== (Number(App.roomsMetaCache.get(id)?.messagesClearedAt) || 0))) return;
    // A cold Firebase cache is not proof that membership was deleted. Let
    // the server compare/retry null without recreating an absent membership.
    if (current === null) return null;
    if (!current || state && (Number(current.joinedAt) || 0) !== state.joinedAt) return;
    return { ...(typeof current === "object" ? current : {}), lastSeenAt: App.firebase.database.ServerValue.TIMESTAMP,
      lastSeenEpoch: Number(App.roomsMetaCache.get(id)?.messagesClearedAt) || 0,
      lastSeenMessageKey: [Number(current.lastSeenEpoch || 0) === (state?.epoch || 0) ? String(current.lastSeenMessageKey || "") : "", state?.key || ""].sort().at(-1),
      lastSeenCount: Math.max(App.getMembershipSeenCount(id, current), totalCount) };
  }, undefined, false);
};
App.flushPendingRoomRead = async function (id) {
  const state = App.pendingRoomReads.get(id);
  if (!state || state.writing) return;
  App.mergePendingRoomRead(id, App.membershipMap.get(id));
  if (App.pendingRoomReads.get(id) !== state) return;
  clearTimeout(state.timer); state.timer = null;
  const count = state.count;
  const key = state.key;
  state.writing = true;
  let saved = false;
  try {
    const result = await App._writeLastSeen(id, count, state.code, state);
    if (result?.committed && result.snapshot?.val() == null) {
      if (App.pendingRoomReads.get(id) === state) App.pendingRoomReads.delete(id);
      return;
    }
    saved = !!result?.committed && Number(result.snapshot?.val()?.lastSeenCount) >= count;
  } catch (error) {
    // Preserve the local read and retry after a transient connection failure
    // or Firebase's cancellation of a transaction by another local write.
  } finally { state.writing = false; }
  if (App.pendingRoomReads.get(id) !== state) return;
  if (saved) {
    state.failures = 0;
    if (state.count <= count && state.key === key) { App.pendingRoomReads.delete(id); return; }
    void App.flushPendingRoomRead(id);
  } else {
    state.failures = (state.failures || 0) + 1;
    state.timer = setTimeout(() => { state.timer = null; void App.flushPendingRoomRead(id); }, Math.min(5000, 250 * 2 ** Math.min(state.failures - 1, 5)));
  }
};
App.scheduleLastSeenBump = function (roomId, {
  immediate = false
} = {}) {
  if (!App.currentUser) return;
  const id = App.sanitizeRoomCode(roomId);
  if (!id) return;
  if (!App.isRoomActivelyRead(id)) return;
  const liveCount = Math.max([...App.msgDataByKey.values()].filter(message => !message.__stub).length, Number(App.roomsMetaCache.get(id)?.messageCount) || 0);
  if (!liveCount) return;
  const head = String(App.notificationRoomHeads?.get(id) || App.getLatestReceiptMessage?.()?._key || "");
  const expectedCode = App.currentUser.code;

  // Optimistic local update so unread badges clear instantly after the room is actually read.
  const rec = App.mergePendingRoomRead(id, App.membershipMap.get(id));
  if (!rec) return;
  let state = App.pendingRoomReads.get(id);
  if (App.getMembershipSeenCount(id, rec) >= liveCount && String(rec.lastSeenMessageKey || "") >= head) {
    if (state && !state.writing && (!state.timer || immediate)) void App.flushPendingRoomRead(id);
    return;
  }
  if (!state) {
    state = { code: expectedCode, joinedAt: Number(rec.joinedAt) || 0, epoch: Number(App.roomsMetaCache.get(id)?.messagesClearedAt) || 0, count: 0, at: 0 };
    App.pendingRoomReads.set(id, state);
  }
  state.count = Math.max(state.count, liveCount);
  state.key = [state.key || "", head].sort().at(-1);
  state.at = Date.now();
  App.membershipMap.set(id, App.mergePendingRoomRead(id, rec));
  if (App.unreadSubscriptionsStarted) App.syncUnreadRoomSubscriptions();
  App.updateRoomListItem(id);
  App.syncUnreadTaskbarBadge();
  const placeNow = App.getStoredPlace() || "home";
  if (!App.currentRoomId && App.views.chat.dataset.active === "true" && placeNow === "home") {
    App.clearMessagesToHome();
  }
  // Start now, coalescing only writes already in flight for this room. Reads
  // in another room cannot replace or postpone this room's pending save.
  if (!state.timer || immediate) void App.flushPendingRoomRead(id);
};
App.applyHomeFilters = function () {
  const dash = document.querySelector(".home-dash");
  if (!dash) return;
  const q = String(App.homeState?.query || "").trim().toLowerCase();
  const filter = String(App.homeState?.filter || "public");
  dash.querySelectorAll("[data-home-filter]").forEach(btn => {
    const f = btn.getAttribute("data-home-filter") || "all";
    btn.classList.toggle("primary", f === filter);
  });
  const rows = Array.from(dash.querySelectorAll(".home-room-row"));
  const total = rows.length;
  let shown = 0;
  for (const row of rows) {
    const rid = row.getAttribute("data-roomid-lower") || "";
    const prev = row.getAttribute("data-preview-lower") || "";
    const unread = row.getAttribute("data-unread") === "1";
    const pinned = row.getAttribute("data-pinned") === "1";
    const privateRoom = row.getAttribute("data-private") === "1";
    let ok = true;
    if (filter === "public" && privateRoom) ok = false;
    if (filter === "private" && !privateRoom) ok = false;
    if (filter === "pinned" && !pinned) ok = false;
    if (filter === "unread" && !unread) ok = false;
    if (q && !(rid.includes(q) || prev.includes(q))) ok = false;
    row.hidden = !ok;
    if (ok) shown++;
  }
  const empty = dash.querySelector("#home-empty");
  if (empty) empty.hidden = shown !== 0 || total === 0;
  const hint = dash.querySelector("#home-searchhint");
  if (hint) {
    const labels = {
      public: "Public Rooms",
      private: "Private Rooms",
      pinned: "Pinned Rooms",
      all: "All Rooms",
      unread: "Unread Rooms"
    };
    const label = labels[filter] || "All Rooms";
    hint.textContent = `${label} • Showing ${shown} of ${total}` + (q ? ` • Search: "${App.homeState.query}"` : "");
  }
};

App.register("rooms/collections", function initializeFeature() {
App.homeState = {
  filter: "public",
  query: ""
};
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  const activeId = App.sanitizeRoomCode(App.currentRoomId);
  if (activeId && App.isRoomActivelyRead(activeId)) App.scheduleLastSeenBump(activeId, {
    immediate: true
  });
});
});
})(globalThis.ChatApp);
