/* rooms/home: methods register before ordered initialization. */
(function (App) {
  "use strict";
App.formatESTShortDate = function (date) {
  return App.getDateTimeFormatter("en-US", {
    timeZone: App.EST_TZ,
    year: "2-digit",
    month: "numeric",
    day: "numeric"
  }).format(date);
};
App.formatESTLongDate = function (date) {
  return App.getDateTimeFormatter("en-US", {
    timeZone: App.EST_TZ,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(date);
};
App.formatESTTimestampTime = function (date, {
  includeSeconds = false
} = {}) {
  return App.getDateTimeFormatter("en-US", {
    timeZone: App.EST_TZ,
    hour: "numeric",
    minute: "2-digit",
    ...(includeSeconds ? {
      second: "2-digit"
    } : {}),
    hour12: true
  }).format(date);
};
App.isSameESTDay = function (a, b) {
  const ap = App.getESTParts(a);
  const bp = App.getESTParts(b);
  return ap.year === bp.year && ap.month === bp.month && ap.day === bp.day;
};
App.formatChatTimestampParts = function (ts, {
  nowDate = App.getAccurateNow()
} = {}) {
  try {
    const d = new Date(ts ?? Date.now());
    if (!Number.isFinite(d.getTime())) return {
      short: "",
      full: ""
    };
    const timeText = App.formatESTTimestampTime(d);
    const short = App.isSameESTDay(d, nowDate) ? timeText : `${App.formatESTShortDate(d)} ${timeText}`;
    const full = `${App.formatESTLongDate(d)} ${App.formatESTTimestampTime(d, {
      includeSeconds: true
    })}`;
    return {
      short,
      full
    };
  } catch {
    return {
      short: "",
      full: ""
    };
  }
};
App.installTimestampTooltipSurface = function (doc = document, win = window) {
  if (!doc || !win) return null;
  const tip = doc.createElement("div");
  tip.id = "timestamp-tooltip";
  tip.className = "app-tooltip timestamp-tooltip";
  tip.hidden = true;
  tip.setAttribute("role", "tooltip");
  try {
    (doc.body || doc.documentElement).appendChild(tip);
  } catch {
    return null;
  }
  let activeTarget = null;
  function position(target) {
    if (!target?.isConnected) return hide();
    const text = String(target.getAttribute?.("data-tooltip") || "").trim();
    if (!text) return hide();
    tip.textContent = text;
    App.setTooltipVisible(tip, true, "visible");
    const margin = 8;
    const gap = 8;
    const vw = Math.max(doc.documentElement?.clientWidth || 0, win.innerWidth || 0);
    const vh = Math.max(doc.documentElement?.clientHeight || 0, win.innerHeight || 0);
    tip.style.maxWidth = `${Math.max(80, vw - margin * 2)}px`;
    tip.style.left = "0px";
    tip.style.top = "0px";
    const r = target.getBoundingClientRect();
    const tr = tip.getBoundingClientRect();
    let left = r.left + r.width / 2 - tr.width / 2;
    left = Math.max(margin, Math.min(left, vw - tr.width - margin));
    const above = r.top - tr.height - gap;
    const below = r.bottom + gap;
    let top = above >= margin ? above : below;
    if (top + tr.height > vh - margin && above >= margin) top = above;
    top = Math.max(margin, Math.min(top, vh - tr.height - margin));
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
  }
  function show(target) {
    if (!target?.isConnected) return hide();
    activeTarget = target;
    App.activeTimestampTooltipTarget = target;
    position(target);
  }
  function hide() {
    activeTarget = null;
    App.activeTimestampTooltipTarget = null;
    App.setTooltipVisible(tip, false, "visible");
  }
  // Delegated cleanup survives message rerenders and works for timestamps in
  // menus/logs as well as message rows, including moves between nested nodes.
  doc.addEventListener("pointerout", event => {
    if (activeTarget?.contains(event.target) && !activeTarget.contains(event.relatedTarget)) hide();
  }, true);
  doc.addEventListener("pointermove", event => {
    if (activeTarget && !activeTarget.contains(event.target)) hide();
  }, true);
  doc.addEventListener("focusout", event => {
    if (activeTarget?.contains(event.target) && !activeTarget.contains(event.relatedTarget)) hide();
  }, true);
  doc.documentElement?.addEventListener?.("pointerleave", hide);
  if (typeof win.MutationObserver === "function") {
    new win.MutationObserver(() => {
      if (activeTarget && (!activeTarget.isConnected || !activeTarget.getClientRects().length)) hide();
    }).observe(doc.body || doc.documentElement, { childList:true, subtree:true });
  }
  doc.addEventListener("pointerdown", hide, true);
  doc.addEventListener("pointercancel", hide, true);
  doc.addEventListener("touchstart", hide, {
    capture: true,
    passive: true
  });
  doc.addEventListener("wheel", hide, {
    capture: true,
    passive: true
  });
  win.addEventListener?.("scroll", hide, true);
  win.addEventListener?.("resize", hide);
  win.addEventListener?.("blur", hide);
  doc.addEventListener?.("visibilitychange", () => {
    if (doc.hidden) hide();
  });
  doc.addEventListener("fullscreenchange", hide);
  return {
    show,
    hide,
    position
  };
};
App.positionTimestampTooltipFor = function (target) {
  App.mainTooltipController?.position?.(target);
};
App.showTimestampTooltipFor = function (target) {
  App.mainTooltipController?.show?.(target);
};
App.hideTimestampTooltip = function () {
  App.mainTooltipController?.hide?.();
};
App.updateLiveMessageTimestamps = function () {
  if (document.visibilityState === "hidden") return;
  const now = App.getESTParts(App.getAccurateNow());
  const dateKey = now.year + "-" + now.month + "-" + now.day;
  // A timestamp's clock time and full-date tooltip are fixed. Only the date
  // prefix changes at midnight. Newly rendered/edited rows refresh themselves.
  if (App.messageTimestampDateKey !== dateKey) {
    App.messageTimestampDateKey = dateKey;
    document.querySelectorAll(".bubble-time").forEach(el => {
      try {
        el._refreshTimestamp?.();
      } catch {}
    });
  }
  if (App.activeTimestampTooltipTarget) App.positionTimestampTooltipFor(App.activeTimestampTooltipTarget);
};
App._minutesESTAt = function (ts) {
  try {
    const d = new Date(typeof ts === "number" ? ts : Date.now());
    const parts = App.getDateTimeFormatter("en-US", {
      timeZone: "America/New_York",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit"
    }).formatToParts(d);
    const h = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);
    const m = parseInt(parts.find(p => p.type === "minute")?.value || "0", 10);
    return h * 60 + m;
  } catch {
    return null;
  }
};
App._resolveSchedulePersonKey = function (dayType, username) {
  const u = String(username || "").trim().replace(/^@+/, "");
  if (!u) return "";
  return App._findConfiguredScheduleUsername(u) || u;
};
App._getActiveScheduleBlockKeyAt = function (dayType, person, minutes, weekdayOverride = App.getESTScheduleDay()) {
  const dt = App._normalizeScheduleType(dayType || "full");
  for (const b of App.getScheduleRows(dt, person, weekdayOverride)) {
    const r = App._parseRangeMinutes(b.time || "");
    if (!r) continue;
    if (minutes >= r.start && minutes < r.end) return b.key;
  }
  return null;
};
App._getESTWeekdayIndexAt = function (ts) {
  try {
    const short = App.getDateTimeFormatter("en-US", {
      timeZone: "America/New_York",
      weekday: "short"
    }).format(new Date(ts)).slice(0, 3).toLowerCase();
    return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(short);
  } catch {
    return -1;
  }
};
App._getClassForBlockAt = function (dayType, person, blockKey, weekdayOverride, ts) {
  const weekday = App._normalizeScheduleWeekday(weekdayOverride === undefined ? App.getESTScheduleDay(new Date(ts)) : weekdayOverride);
  const record = App.getScheduleRows(dayType, person, weekday).find(row => row.key === blockKey);
  if (record && typeof record === "object") {
    return {
      className: record.className ?? "",
      teacher: record.teacher ?? "",
      room: record.room ?? ""
    };
  }
  return {
    className: "",
    teacher: "",
    room: ""
  };
};
App.getClassRecordAtTimestamp = function (ts, {
  username,
  dayType,
  weekdayOverride
} = {}) {
  const minutes = App._minutesESTAt(ts);
  if (minutes === null) return null;
  const estParts = App.getESTParts(new Date(ts));
  const weekdayIndex = new Date(Date.UTC(estParts.year, estParts.month - 1, estParts.day)).getUTCDay();
  if (weekdayIndex === 0 || weekdayIndex === 6) return null;
  const dt = App._normalizeScheduleType(dayType || "full");
  const person = App._resolveSchedulePersonKey(dt, username);
  if (!person) return null;
  const key = App._getActiveScheduleBlockKeyAt(dt, person, minutes, weekdayOverride || App.getESTScheduleDay(new Date(ts)));
  if (!key) return null;
  const c = App._getClassForBlockAt(dt, person, key, weekdayOverride, ts);
  const record = {
    key,
    className: String(c?.className || "").trim(),
    teacher: String(c?.teacher || "").trim(),
    room: String(c?.room || "").trim()
  };
  return record.className ? record : null;
};
App.getClassNameAtTimestamp = function (ts, options = {}) {
  return App.getClassRecordAtTimestamp(ts, options)?.className || "";
};
// Home is a bounded, account-scoped view of existing app data. It does not
// create memberships, scan room history, download attachments, or mark reads.
App.homeIcon = function (name) {
  const paths = {
    today: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18M8 15h3"/>',
    reminders: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    polls: '<path d="M5 20V10m7 10V4m7 16v-7M3 20h18"/>',
    links: '<path d="m10 13 4-4M8 15l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 3 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(1 0)"/>',
    left: '<path d="m14 6-6 6 6 6"/>', right: '<path d="m10 6 6 6-6 6"/>',
    copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v13h5"/>',
    check: '<path d="m5 12 4 4L19 6"/>'
  };
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ""}</svg>`;
};
App.stopHomePollRoom = function (state, roomId) {
  const room = state?.pollRooms?.get(roomId);
  if (!room) return;
  state.pollRooms.delete(roomId);
  room.ref.off("value", room.callback);
  for (const entry of room.entries.values()) entry.ref.off("value", entry.callback);
  room.entries.clear();
};
App.stopHomeDashboardSession = function () {
  const state = App.homeDashboardState;
  // Revoke ownership before detaching so queued Firebase callbacks are inert.
  App.homeDashboardState = null;
  if (state?.membersRef && state.memberCallback) state.membersRef.off("value", state.memberCallback);
  for (const roomId of state?.pollRooms?.keys() || []) App.stopHomePollRoom(state, roomId);
  state?.observer?.disconnect();
  state?.mountObserver?.disconnect();
  clearTimeout(state?.expiryTimer);
  if (state?.foreground) {
    window.removeEventListener("focus", state.foreground);
    document.removeEventListener("visibilitychange", state.foreground);
  }
};
App.homeDashboardActive = function (state = App.homeDashboardState) {
  return !!state && App.homeDashboardState === state && String(App.currentUser?.code || "") === state.code;
};
App.syncHomePollState = function (state = App.homeDashboardState) {
  if (!App.homeDashboardActive(state)) return;
  clearTimeout(state.expiryTimer); state.expiryTimer = null;
  const polls = [];
  let pending = !state.membersReady, failed = state.memberError;
  for (const [roomId, room] of state.pollRooms) {
    if (!state.members.has(roomId)) continue;
    pending ||= !room.ready;
    failed ||= room.error;
    for (const [key, entry] of room.entries) {
      pending ||= !entry.ready;
      failed ||= entry.error;
      const poll = entry.poll;
      if (!entry.error && poll && typeof poll.question === "string" && Array.isArray(poll.options) && Number.isFinite(Number(poll.endsAt)) && !App.isPollEnded(poll)) polls.push({ roomId, key, poll });
    }
  }
  state.polls = polls.sort((a, b) => Number(a.poll.endsAt) - Number(b.poll.endsAt) || a.key.localeCompare(b.key));
  state.pollStatus = failed ? "error" : pending ? "loading" : "ready";
  // A deadline timeout changes the UI at the next expiry. It never reads the
  // network; live subscriptions handle all additions, edits, votes and deletes.
  if (polls.length) {
    const delay = Math.max(1, Math.min(2147483647, Number(polls[0].poll.endsAt) - App.pollNow() + 10));
    state.expiryTimer = setTimeout(() => App.syncHomePollState(state), delay);
  }
  App.renderHomeDashboardData();
};
App.syncHomePollSubscriptions = function (state = App.homeDashboardState) {
  if (!App.homeDashboardActive(state)) return;
  for (const roomId of state.pollRooms.keys()) if (!state.members.has(roomId)) App.stopHomePollRoom(state, roomId);
  if (!state.membersReady) { App.syncHomePollState(state); return; }
  for (const roomId of state.members) {
    if (state.pollRooms.has(roomId)) continue;
    const room = { ref: App.db.ref(`activePolls/${roomId}`).orderByKey().limitToLast(40), entries: new Map(), ready: false, error: false };
    state.pollRooms.set(roomId, room);
    const current = () => App.homeDashboardActive(state) && state.members.has(roomId) && state.pollRooms.get(roomId) === room;
    room.callback = snapshot => {
      if (!current()) return;
      room.ready = true; room.error = false;
      const keys = new Set(Object.keys(snapshot.val() || {}).filter(key => !!key && !/[.#$\[\]/\u0000-\u001f\u007f]/.test(key)));
      for (const [key, entry] of room.entries) {
        if (keys.has(key)) continue;
        room.entries.delete(key);
        entry.ref.off("value", entry.callback);
      }
      for (const key of keys) {
        if (room.entries.has(key)) continue;
        // An already-downloaded tail makes the first paint immediate. The
        // authoritative poll leaf then reconciles it without fetching media.
        const entry = { ref: App.db.ref(`messages/${roomId}/${key}/poll`), ready: false, error: false, poll: App.notificationRoomTails?.get(roomId)?.get(key)?.poll || null };
        room.entries.set(key, entry);
        entry.callback = snap => {
          if (!current() || room.entries.get(key) !== entry) return;
          entry.poll = snap.val(); entry.ready = true; entry.error = false;
          App.syncHomePollState(state);
        };
        entry.ref.on("value", entry.callback, () => {
          if (!current() || room.entries.get(key) !== entry) return;
          entry.ready = true; entry.error = true; entry.poll = null;
          App.syncHomePollState(state);
        });
      }
      App.syncHomePollState(state);
    };
    room.ref.on("value", room.callback, () => {
      if (!current()) return;
      room.ready = true; room.error = true;
      for (const [key, entry] of room.entries) { room.entries.delete(key); entry.ref.off("value", entry.callback); }
      App.syncHomePollState(state);
    });
  }
  App.syncHomePollState(state);
};
App.ensureHomeDashboardSession = function () {
  const code = String(App.currentUser?.code || "");
  if (!code) { App.stopHomeDashboardSession(); return null; }
  if (App.homeDashboardState?.code === code) return App.homeDashboardState;
  App.stopHomeDashboardSession();
  const state = App.homeDashboardState = {
    code, members: new Set(), membersReady: false, memberError: false,
    tab: "today", polls: [], pollRooms: new Map(), pollStatus: "loading", pollOnlyPending: true, linkQuery: ""
  };
  // Never authorize from the sidebar's cached memberships.
  state.membersRef = App.db.ref(`memberships/${code}`);
  state.memberCallback = snapshot => {
    if (!App.homeDashboardActive(state)) return;
    state.members = new Set(Object.entries(snapshot.val() || {}).filter(([, v]) => v === true || !!v && typeof v === "object").map(([id]) => App.sanitizeRoomCode(id)).filter(Boolean));
    state.membersReady = true; state.memberError = false;
    App.syncHomePollSubscriptions(state);
  };
  state.membersRef.on("value", state.memberCallback, () => {
    if (!App.homeDashboardActive(state)) return;
    state.memberError = true; state.membersReady = false; state.members.clear();
    App.syncHomePollSubscriptions(state);
  });
  state.foreground = () => { if (App.homeDashboardActive(state) && document.visibilityState !== "hidden") App.syncHomePollState(state); };
  window.addEventListener("focus", state.foreground);
  document.addEventListener("visibilitychange", state.foreground);
  return state;
};
App.getHomeRecentLinks = function () {
  const state = App.homeDashboardState;
  if (!App.homeDashboardActive(state) || !state.membersReady) return [];
  const links = new Map();
  // The app already keeps a live 50-message notification tail for joined
  // rooms. Reuse it: Home must not trigger another media/history download.
  for (const roomId of state.members) {
    const tail = App.notificationRoomTails?.get(roomId);
    if (!tail) continue;
    const epoch = Number(App.roomsMetaCache?.get(roomId)?.messagesClearedAt) || 0;
    for (const [key, message] of tail) {
      if (!message || message.deleted || Number(message.createdAt) <= epoch || typeof message.text !== "string") continue;
      for (const match of message.text.matchAll(/(?:https?:\/\/|www\.)[^\s<>`]+/gi)) {
        let raw = match[0];
        while (/[.,!?;:"'*]$/.test(raw) || /[)\]}]$/.test(raw) && [...raw].filter(c => c === raw.at(-1)).length > [...raw].filter(c => c === ({")":"(","]":"[","}":"{"})[raw.at(-1)]).length) raw = raw.slice(0, -1);
        const url = App.normalizeMessageURL(raw); if (!url) continue;
        const at = Number(message.createdAt) || App.firebasePushKeyTimestamp?.(key) || 0;
        if (!links.has(url) || links.get(url).at < at) links.set(url, { url, roomId, key, at, text: message.text });
      }
    }
  }
  return [...links.values()].sort((a, b) => b.at - a.at);
};
App.openHomePoll = function (roomId, key) {
  const state = App.homeDashboardState;
  if (!App.homeDashboardActive(state) || !state.members.has(roomId)) return;
  const item = state.polls.find(p => p.roomId === roomId && p.key === key);
  if (!item || App.isPollEnded(item.poll)) return;
  return App.jumpToRoomMessage(key, { roomId });
};
App.reconcileHomeCollection = function (container, items, template, keyFor, emptyHTML) {
  const existing = new Map([...container.children].map(node => [node.dataset.homeKey, node]));
  const beforeTop = container.scrollTop;
  const top = container.getBoundingClientRect().top;
  const anchor = [...container.children].find(node => node.getBoundingClientRect().bottom > top + 1);
  const anchorKey = anchor?.dataset.homeKey, anchorOffset = anchor ? anchor.getBoundingClientRect().top - top : 0;
  const focused = document.activeElement;
  const focusedRow = container.contains(focused) ? focused.closest("[data-home-key]") : null;
  const focusedKey = focusedRow?.dataset.homeKey;
  const focusSelector = focused?.classList.contains("home-link-copy") ? ".home-link-copy" : focused?.tagName === "A" ? "a" : null;
  const records = items.length ? items.map(item => ({ key: keyFor(item), html: template(item) })) : [{ key: "__empty__", html: emptyHTML }];
  let cursor = container.firstChild;
  const keep = new Set();
  for (const { key, html } of records) {
    let node = existing.get(key);
    if (!node || node.__homeMarkup !== html) {
      const fragment = document.createElement("template"); fragment.innerHTML = html;
      const replacement = fragment.content.firstElementChild;
      replacement.dataset.homeKey = key; replacement.__homeMarkup = html;
      if (node) { if (cursor === node) cursor = replacement; node.replaceWith(replacement); }
      node = replacement;
    }
    if (node !== cursor) container.insertBefore(node, cursor);
    cursor = node.nextSibling;
    keep.add(node);
  }
  for (const node of [...container.children]) if (!keep.has(node)) node.remove();
  const nextAnchor = [...container.children].find(node => node.dataset.homeKey === anchorKey);
  container.scrollTop = nextAnchor ? container.scrollTop + nextAnchor.getBoundingClientRect().top - container.getBoundingClientRect().top - anchorOffset : beforeTop;
  if (focusedKey && !focused.isConnected) {
    const next = [...container.children].find(node => node.dataset.homeKey === focusedKey);
    (focusSelector ? next?.querySelector(focusSelector) : next)?.focus?.({ preventScroll: true });
  }
};
App.renderHomeDashboardData = function () {
  const state = App.homeDashboardState, dash = document.querySelector(".home-dashboard");
  if (!App.homeDashboardActive(state) || !dash || dash.dataset.account !== state.code || App.getStoredPlace() !== "home") return;
  const calendar = App.calendarState || {}, today = calendar.today || App.calendarDateKey();
  const esc = App.escapeHtml;
  const dayLabel = date => date === today ? "Today" : new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const roomLabel = id => App.roomDisplayName(id, App.roomsMetaCache?.get(id));
  dash.dataset.tab = state.tab;
  dash.querySelectorAll("[data-home-tab]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.homeTab === state.tab)));
  dash.querySelector("#home-hub-date").textContent = new Date(`${today}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const noteItems = App.getCalendarNoteEntries(calendar.notes?.[today]).map(([id, note]) => ({ id, date: today, text: note.text }));
  const reminders = [];
  for (const [date, entries] of Object.entries(calendar.reminders || {})) {
    if (date < today) continue;
    for (const [id, reminder] of Object.entries(entries || {})) {
      const text = reminder.noteId ? calendar.notes?.[date]?.[reminder.noteId]?.text : reminder.text;
      if (typeof text === "string" && text.trim()) reminders.push({ id, date, text });
    }
  }
  reminders.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const polls = state.polls.filter(item => state.members.has(item.roomId) && !App.isPollEnded(item.poll) && (!state.pollOnlyPending || !(item.poll.votes?.[state.code]?.options?.length)));
  const allLinks = App.getHomeRecentLinks();
  const query = state.linkQuery.toLowerCase();
  const links = allLinks.filter(item => !query || `${item.url} ${roomLabel(item.roomId)}`.toLowerCase().includes(query));
  const rows = { today: noteItems, reminders, polls, links };
  const status = {
    today: calendar.error ? "Calendar unavailable" : !calendar.ready ? "Loading calendar…" : "No notes today",
    reminders: calendar.remindersError || calendar.error ? "Reminders unavailable" : !calendar.ready || !calendar.remindersReady ? "Loading reminders…" : "No upcoming reminders",
    polls: state.memberError || state.pollStatus === "error" ? "Polls unavailable" : !state.membersReady || state.pollStatus === "loading" ? "Loading polls…" : state.pollOnlyPending ? "You're all caught up" : "No open polls",
    links: state.memberError ? "Links unavailable" : !state.membersReady || [...state.members].some(id => !App.notificationRoomTails?.has(id)) ? "Loading recent links…" : query ? "No matching links" : "No links in recent messages"
  };
  const noteRow = item => `<button type="button" class="home-hub-row home-note-row" data-home-calendar="${item.date}"><span class="home-row-mark">${App.homeIcon("today")}</span><span class="home-row-copy"><strong>${esc(item.text)}</strong>${item.date !== today ? `<small>${esc(dayLabel(item.date))}</small>` : ""}</span><span class="home-row-arrow">${App.homeIcon("right")}</span></button>`;
  const templates = {
    today: noteRow,
    reminders: item => `<button type="button" class="home-hub-row" data-home-calendar="${item.date}"><span class="home-reminder-date"><span>${esc(dayLabel(item.date))}</span></span><span class="home-row-copy"><strong>${esc(item.text)}</strong></span><span class="home-row-arrow">${App.homeIcon("right")}</span></button>`,
    polls: item => `<button type="button" class="home-hub-row" data-home-poll="${esc(item.key)}" data-home-room="${esc(item.roomId)}"><span class="home-row-mark">${App.homeIcon("polls")}</span><span class="home-row-copy"><strong>${esc(item.poll.question)}</strong><small>${esc(roomLabel(item.roomId))} · ${item.poll.votes?.[state.code]?.options?.length ? "Voted" : "Awaiting your vote"}</small></span><span class="home-row-arrow">${App.homeIcon("right")}</span></button>`,
    links: item => { const url = new URL(item.url); return `<div class="home-hub-row home-link-row"><span class="home-row-mark">${App.homeIcon("links")}</span><a class="home-row-copy" href="${App.escapeAttr(item.url)}" target="_blank" rel="noopener noreferrer"><strong>${esc(url.hostname.replace(/^www\./, ""))}</strong><small>${esc(url.pathname === "/" ? roomLabel(item.roomId) : `${roomLabel(item.roomId)} · ${url.pathname}`)}</small></a><button class="home-icon-button home-link-copy" type="button" data-home-copy="${App.escapeAttr(item.url)}" aria-label="Copy link">${App.homeIcon("copy")}</button></div>`; }
  };
  const keys = { today: item => `${item.date}/${item.id}`, reminders: item => `${item.date}/${item.id}`, polls: item => `${item.roomId}/${item.key}`, links: item => item.url };
  for (const type of Object.keys(rows)) {
    const list = rows[type], container = dash.querySelector(`#home-${type}-items`);
    App.reconcileHomeCollection(container, list, templates[type], keys[type], `<div class="home-tool-empty"><span>${App.homeIcon(type)}</span><p>${esc(status[type])}</p></div>`);
    dash.querySelector(`#home-${type}-count`).textContent = String(list.length);
  }
  dash.querySelectorAll("[data-home-poll-filter]").forEach(button => button.setAttribute("aria-pressed", String((button.dataset.homePollFilter === "pending") === state.pollOnlyPending)));
};
App.clearMessagesToHome = function () {
  const state = App.ensureHomeDashboardSession();
  if (!state) return;
  const existing = App.messagesListEl.querySelector(".home-dashboard");
  if (existing?.dataset.account === state.code) { App.renderHomeDashboardData(); return; }
  state.observer?.disconnect(); state.mountObserver?.disconnect();
  const types = [["today", "Today"], ["reminders", "Reminders"], ["polls", "Open Polls"], ["links", "Recent Links"]];
  App.messagesListEl.innerHTML = `<div class="home-dashboard" data-account="${App.escapeAttr(state.code)}" data-tab="${state.tab}">
    <header class="home-dashboard-header"><div><h1>Home</h1><p id="home-hub-date"></p></div><nav class="home-tool-tabs" aria-label="Home tools">${types.map(([type, label]) => `<button type="button" data-home-tab="${type}" aria-pressed="${state.tab === type}">${App.homeIcon(type)}<span>${type === "reminders" ? "Reminders" : label}</span></button>`).join("")}</nav></header>
    <div class="home-tool-grid">${types.map(([type, label]) => `<section class="home-tool-card" data-home-tool="${type}" aria-labelledby="home-${type}-title">
      <header class="home-card-title"><span class="home-card-icon">${App.homeIcon(type)}</span><h2 id="home-${type}-title">${label}</h2><span class="home-card-count" id="home-${type}-count">0</span></header>
      ${type === "polls" ? '<div class="home-poll-filters" aria-label="Filter polls"><button type="button" data-home-poll-filter="pending" aria-pressed="true">To Vote</button><button type="button" data-home-poll-filter="all" aria-pressed="false">All Open</button></div>' : type === "links" ? '<label class="home-link-search app-search-field"><input id="home-search" class="app-search-input" type="search" aria-label="Search recent links" placeholder="Search links across your rooms" autocomplete="off"></label>' : ""}
      <div class="home-card-list" id="home-${type}-items" role="region" aria-label="${label}" tabindex="0"></div>
    </section>`).join("")}</div>
  </div>`;
  const dash = App.messagesListEl.querySelector(".home-dashboard");
  dash.querySelector("#home-search").value = state.linkQuery;
  dash.querySelector("#home-search").addEventListener("input", event => { state.linkQuery = event.target.value; App.renderHomeDashboardData(); dash.querySelector("#home-links-items").scrollTop = 0; });
  dash.addEventListener("click", async event => {
    const button = event.target.closest("button"); if (!button || !App.homeDashboardActive(state)) return;
    const d = button.dataset;
    if (d.homeTab) { state.tab = d.homeTab; App.renderHomeDashboardData(); resize(); }
    if (d.homeCalendar) App.showCalendarDay(d.homeCalendar);
    if (d.homePoll) App.openHomePoll(d.homeRoom, d.homePoll);
    if (d.homePollFilter) { state.pollOnlyPending = d.homePollFilter === "pending"; App.renderHomeDashboardData(); dash.querySelector("#home-polls-items").scrollTop = 0; }
    if (d.homeCopy) {
      try { await App.copyTextToClipboard(d.homeCopy); }
      catch { if (App.homeDashboardActive(state)) App.showToast({ title: "Copy link", body: "Could not copy the link. Try again.", duration: 2500 }); return; }
      if (button.isConnected) { button.innerHTML = App.homeIcon("check"); setTimeout(() => { if (button.isConnected) button.innerHTML = App.homeIcon("copy"); }, 1200); }
    }
  });
  const resize = () => {
    if (!dash.isConnected) return;
    const r = dash.getBoundingClientRect();
    dash.dataset.compact = r.width < 680 || r.height < 500 ? "1" : "0";
  };
  state.observer = new ResizeObserver(resize);
  state.observer.observe(dash);
  // Stop network/timer work as soon as another page replaces Home.
  state.mountObserver = new MutationObserver(() => { if (!dash.isConnected && App.homeDashboardState === state) App.stopHomeDashboardSession(); });
  state.mountObserver.observe(App.messagesListEl, { childList: true });
  App.renderHomeDashboardData(); requestAnimationFrame(resize);
};
App.showLoggedInHome = function () {
  if (App.selectedGame?.roomActivityId) void App.closeGamesStage({ preserve: false });
  App.prepareNonRoomPage("home");
  App.clearMessagesToHome();
};

App.register("rooms/home", function initializeFeature() {
App.mainTooltipController = null;
App.activeTimestampTooltipTarget = null;
App.mainTooltipController = App.installTimestampTooltipSurface(document, window);
});
})(globalThis.ChatApp);
