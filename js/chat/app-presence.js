/* App presence is independent of the room being viewed. Each tab owns only its
 * own connection record, so closing one tab never signs out another device. */
(function (App) {
  "use strict";
  App.APP_PRESENCE_HEARTBEAT_MS = 15000;
  App.APP_PRESENCE_TTL_MS = 90000;
  App.APP_ACTIVE_PRESENCE_TTL_MS = 45000;
  App.getAppPresenceLeaseMs = value => value?.v === 2 && !(value.platform === "web" && value.idle === true)
    ? App.APP_ACTIVE_PRESENCE_TTL_MS : App.APP_PRESENCE_TTL_MS;
  App.appPresenceNow = function () {
    // Presence timestamps come from Firebase, not the device or the display clock.
    return Date.now() + (Number(App.appPresenceServerOffsetMs) || 0);
  };
  App.getLiveAppPresenceSessions = function (connections, now = App.appPresenceNow()) {
    return Object.values(connections || {}).filter(value => {
      if (!value || typeof value !== "object" || typeof value.idle !== "boolean") return false;
      const timestamp = Number(value.updatedAt);
      const lease = App.getAppPresenceLeaseMs(value);
      return Number.isFinite(timestamp) && timestamp > 0 &&
        timestamp <= now + lease && now - timestamp < lease;
    });
  };
  App.getAppPresenceStatus = function (connections, now = App.appPresenceNow()) {
    const sessions = App.getLiveAppPresenceSessions(connections, now);
    if (!sessions.length) return "offline";
    if (sessions.some(session => session.platform === "desktop" && session.notificationStatus === "dnd" &&
        (!Number(session.notificationStatusExpiresAt) || Number(session.notificationStatusExpiresAt) > now))) return "dnd";
    return sessions.some(session => session.idle === false) ? "online" : "idle";
  };
  App.isAppIdleNow = function () {
    // hasFocus() is unreliable on touch browsers and when focus enters a game
    // frame. Visibility plus observed input works consistently on those devices.
    const desktop = globalThis.chatDesktopRings?.version === 1 || globalThis.chatDesktopOverlay?.version === 1;
    const unfocused = desktop && (typeof App.desktopPresenceFocused === "boolean"
      ? !App.desktopPresenceFocused : document.hasFocus?.() === false);
    const cloaked = document.getElementById?.("__shift_z_blackout__")?.classList.contains("on");
    return !!cloaked || document.hidden || unfocused || !!App.appWindowBlurred || Date.now() - App.lastAppInputAt >= App.ROOM_IDLE_MS;
  };
  App.setDesktopPresenceFocus = function (focused) {
    App.desktopPresenceFocused = focused === true;
    if (focused) App.appWindowBlurred = false;
    if (focused) App.lastAppInputAt = Date.now();
    App.pulseAppPresence();
    App.syncDesktopNotificationPolicy?.();
  };
  App.syncAppIdle = function () {
    if (!App.currentUser || !App.appPresenceSession) return;
    const idle = App.isAppIdleNow();
    const changed = App.myRoomIdle !== idle;
    App.myRoomIdle = idle;
    clearTimeout(App.appIdleTimer);
    App.appIdleTimer = null;
    if (!idle) App.appIdleTimer = setTimeout(App.syncAppIdle, Math.max(100, App.ROOM_IDLE_MS - (Date.now() - App.lastAppInputAt)));
    if (changed) {
      void App.writeAppPresence();
      if (App.myPresenceRef && App.roomPresenceSession?.ready) App.myPresenceRef.update({ idle, typing: idle ? false : App.myTyping }).catch(() => {});
      if (idle) App.setMyTyping(false);
      App.queueReceiptVisibilityCheck?.();
    }
    App.refreshAppPresenceStatuses();
    App.syncSidebarDock?.();
  };
  App.markAppInputActive = function () {
    if (!App.currentUser || document.hidden || App.desktopPresenceFocused === false || App.appWindowBlurred ||
        document.getElementById?.("__shift_z_blackout__")?.classList.contains("on")) return;
    // Mouse movement must not create database traffic or constantly reset timers.
    const now = Date.now();
    if (now - App.lastAppInputAt < 1000 && !App.myRoomIdle) return;
    App.lastAppInputAt = now;
    App.syncAppIdle();
    App.queueReceiptVisibilityCheck?.();
    if (now - (App.appPresenceSession?.lastWriteAt || 0) >= App.APP_PRESENCE_HEARTBEAT_MS) App.pulseAppPresence();
  };
  App.observeAppPresenceInputs = function (inputDocument) {
    // Input does not bubble out of an iframe. Watch accessible frame documents
    // too, so playing a game or using an HTML activity is still app activity.
    // No messages from remote/opaque frames are trusted as user input.
    const inputEvents = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"];
    const frames = new Map();
    let disposed = false;
    for (const event of inputEvents) inputDocument.addEventListener(event, App.markAppInputActive, { capture: true, passive: true });
    const reconcileFrames = () => {
      if (disposed) return;
      const connected = new Set(inputDocument.querySelectorAll?.("iframe") || []);
      for (const [frame, cleanup] of frames) {
        if (!connected.has(frame)) { cleanup(); frames.delete(frame); }
      }
      for (const frame of connected) {
        if (frames.has(frame)) continue;
        let cleanupDocument = null;
        const bindDocument = () => {
          cleanupDocument?.();
          cleanupDocument = null;
          try {
            const childDocument = frame.contentDocument;
            if (childDocument && childDocument !== inputDocument) cleanupDocument = App.observeAppPresenceInputs(childDocument);
          } catch {} // Cross-origin and sandboxed opaque documents stay isolated.
        };
        frame.addEventListener("load", bindDocument);
        frames.set(frame, () => {
          frame.removeEventListener("load", bindDocument);
          cleanupDocument?.();
          cleanupDocument = null;
        });
        bindDocument();
      }
    };
    const containsFrame = node => node.nodeType === 1 && (node.tagName === "IFRAME" || node.querySelector?.("iframe"));
    const observer = typeof MutationObserver === "function" ? new MutationObserver(mutations => {
      // Most mutations are chat/profile UI; scan frames only when a frame or a
      // subtree containing one actually enters or leaves this document.
      if (mutations.some(mutation => [...mutation.addedNodes, ...mutation.removedNodes].some(containsFrame))) reconcileFrames();
    }) : null;
    observer?.observe(inputDocument, { childList: true, subtree: true });
    reconcileFrames();
    return () => {
      if (disposed) return;
      disposed = true;
      observer?.disconnect();
      for (const event of inputEvents) inputDocument.removeEventListener(event, App.markAppInputActive, true);
      for (const cleanup of frames.values()) cleanup();
      frames.clear();
    };
  };
  App.startAppPresenceInputTracking = function () {
    if (!App.appPresenceInputCleanup) App.appPresenceInputCleanup = App.observeAppPresenceInputs(document);
  };
  App.stopAppPresenceInputTracking = function () {
    App.appPresenceInputCleanup?.();
    App.appPresenceInputCleanup = null;
  };
  App.writeAppPresence = async function () {
    const session = App.appPresenceSession;
    if (!session?.ready || !session.connected || globalThis.navigator?.onLine === false || !App.currentUser || session.code !== App.currentUser.code) return;
    // A suspended/offline connection must not accumulate queued heartbeat writes.
    if (session.writing) { session.writeAgain = true; return; }
    session.writing = true;
    const generation = session.generation;
    try {
      const idle = !!App.myRoomIdle;
      const desktop = App.statusSelectionAvailable?.() === true;
      const notificationStatus = desktop && App.isDoNotDisturb?.() ? "dnd" : "online";
      const notificationStatusExpiresAt = notificationStatus === "dnd" ? Number(App.currentUser.notificationStatusExpiresAt) || 0 : 0;
      const policy = `${desktop}:${notificationStatus}:${notificationStatusExpiresAt}`;
      const unchanged = session.lastPublishedIdle === idle && (!session.lastPublishedPolicy || session.lastPublishedPolicy === policy);
      if (unchanged && Date.now() - (session.lastWriteAt || 0) < App.APP_PRESENCE_HEARTBEAT_MS) return;
      // Focus/input/visibility events can arrive together. Publish a change
      // once; a lease renewal only needs the timestamp leaf.
      const updatedAt = App.firebase.database.ServerValue.TIMESTAMP;
      if (unchanged) await session.ref.update({ updatedAt });
      else await session.ref.set({ v: 2, idle, updatedAt, platform: desktop ? "desktop" : "web", notificationStatus, notificationStatusExpiresAt });
      session.lastPublishedIdle = session.connected && session.generation === generation ? idle : undefined;
      session.lastPublishedPolicy = policy;
      session.lastWriteAt = Date.now();
      // A logout while an asynchronous write was pending must not leave a ghost.
      if (App.appPresenceSession !== session) await session.ref.remove();
      else { App.refreshAppPresenceStatuses(); App.queueReceiptVisibilityCheck?.(); }
    } catch (error) {
      console.warn("App presence could not be updated", error?.code || error?.message || "connection unavailable");
    } finally {
      session.writing = false;
      if (session.writeAgain && App.appPresenceSession === session) {
        session.writeAgain = false;
        void App.writeAppPresence();
      }
    }
  };
  App.refreshAppPresenceStatuses = function () {
    const previous = App.appPresenceCache || new Map();
    const next = new Map();
    const all = { ...(App.appPresenceConnections || {}) };
    if (App.appPresenceSession?.code) all[App.appPresenceSession.code] ||= {};
    let nextExpiry = Infinity;
    const now = App.appPresenceNow();
    for (const [code, connections] of Object.entries(all)) {
      const session = App.appPresenceSession;
      const effective = { ...connections };
      if (session?.code === code && session.id) {
        const acknowledgedAge = Date.now() - Number(session.lastWriteAt || 0);
        const localLease = App.statusSelectionAvailable?.() || !App.myRoomIdle ? App.APP_ACTIVE_PRESENCE_TTL_MS : App.APP_PRESENCE_TTL_MS;
        if (session.connected && session.ready && session.lastPublishedIdle !== undefined && acknowledgedAge >= 0 && acknowledgedAge < localLease && globalThis.navigator?.onLine !== false) effective[session.id] = {
          ...effective[session.id], v: 2, idle: App.myRoomIdle, updatedAt: App.appPresenceNow() - acknowledgedAge,
          platform: App.statusSelectionAvailable?.() ? "desktop" : "web",
          notificationStatus: App.isDoNotDisturb?.() ? "dnd" : "online",
          notificationStatusExpiresAt: Number(App.currentUser?.notificationStatusExpiresAt) || 0
        };
        else delete effective[session.id];
      }
      next.set(code, App.getAppPresenceStatus(effective, now));
      for (const record of App.getLiveAppPresenceSessions(connections, now)) {
        nextExpiry = Math.min(nextExpiry, Number(record.updatedAt) + App.getAppPresenceLeaseMs(record));
        if (Number(record.notificationStatusExpiresAt) > now) nextExpiry = Math.min(nextExpiry, Number(record.notificationStatusExpiresAt));
      }
    }
    clearTimeout(App.appPresenceExpiryTimer);
    App.appPresenceExpiryTimer = Number.isFinite(nextExpiry) ? setTimeout(App.refreshAppPresenceStatuses, Math.max(25, nextExpiry - now + 1)) : null;
    const changed = next.size !== previous.size || [...next].some(([code, state]) => previous.get(code) !== state);
    if (!changed) return;
    App.appPresenceCache = next;
    App.renderOnlineIndicator?.();
    App.renderRoomActivitiesParticipants?.();
    App.refreshOpenUserProfilePresence?.();
    App.syncSidebarDock?.();
  };
  App.armAppPresence = async function (session = App.appPresenceSession) {
    if (!session || App.appPresenceSession !== session || !session.connected || session.ready || session.arming) return;
    const generation = session.generation;
    session.arming = generation;
    try {
      // Firebase requires cleanup to be acknowledged before publishing presence.
      await session.ref.onDisconnect().remove();
      if (App.appPresenceSession !== session || session.generation !== generation || !session.connected) return;
      session.ready = true;
      session.lastPublishedIdle = undefined;
      session.lastPublishedPolicy = undefined;
      App.myRoomIdle = App.isAppIdleNow();
      await App.writeAppPresence();
    } catch (error) {
      console.warn("App presence connection unavailable", error?.code);
      // Retrying on the next pulse also recovers transient registration failures
      // on devices which never emit a second .info/connected event.
    } finally {
      if (session.arming === generation) session.arming = 0;
    }
  };
  App.pulseAppPresence = function () {
    const session = App.appPresenceSession;
    if (!session) return;
    App.syncAppIdle();
    if (session.ready) void App.writeAppPresence(); else void App.armAppPresence(session);
    // Expire crashed clients even when no new database value event arrives.
    App.refreshAppPresenceStatuses();
  };
  App.startAppPresence = function () {
    const code = String(App.currentUser?.code || "");
    if (!code || !App.db) return;
    App.initializeNotificationStatus?.();
    if (App.appPresenceSession?.code === code) return;
    App.stopAppPresence();
    App.startNotificationStatusSync?.();
    App.lastAppInputAt = Date.now();
    App.appWindowBlurred = globalThis.matchMedia?.("(pointer: fine)")?.matches === true && document.hasFocus?.() === false;
    App.myRoomIdle = App.isAppIdleNow();
    const sessionId = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const session = { code, id: sessionId, ref: App.db.ref(`appPresence/${code}/${sessionId}`), ready: false, connected: false, generation: 0 };
    App.appPresenceSession = session;
    App.startRoomMemberDirectory?.();
    App.startSchedulesPeopleListener?.();
    App.appPresenceRef = App.db.ref("appPresence");
    App.appPresenceCb = snap => {
      if (App.appPresenceSession !== session) return;
      App.appPresenceConnections = snap.val() || {};
      // An admin can clear an ephemeral branch while a client stays online.
      // Rebuild the tiny record on the next pulse instead of renewing a lease
      // with no idle flag, which other clients would correctly ignore.
      if (typeof App.appPresenceConnections[code]?.[sessionId]?.idle !== "boolean") session.lastPublishedIdle = undefined;
      App.refreshAppPresenceStatuses();
    };
    App.appPresenceRef.on("value", App.appPresenceCb, error => console.warn("App presence listener unavailable", error?.code));
    session.offsetRef = App.db.ref(".info/serverTimeOffset");
    session.offsetCb = snap => {
      if (App.appPresenceSession !== session) return;
      App.appPresenceServerOffsetMs = Number(snap.val()) || 0;
      App.refreshAppPresenceStatuses();
    };
    session.offsetRef.on("value", session.offsetCb);
    session.connectionRef = App.db.ref(".info/connected");
    session.connectionCb = snap => {
      if (App.appPresenceSession !== session) return;
      ++session.generation;
      session.ready = false;
      session.connected = snap.val() === true;
      session.arming = 0;
      App.scheduleReceiptRead?.();
      if (session.connected) void App.armAppPresence(session);
      App.refreshAppPresenceStatuses();
    };
    session.connectionRef.on("value", session.connectionCb);
    session.heartbeat = setInterval(App.pulseAppPresence, App.APP_PRESENCE_HEARTBEAT_MS);
    App.syncAppIdle();
  };
  App.stopAppPresence = function () {
    App.stopRoomMemberDirectory?.();
    App.clearRoomRosterSnapshots?.();
    App.resetSchedulesPeopleDirectory?.();
    App.stopNotificationStatusSync?.();
    const session = App.appPresenceSession;
    App.appPresenceSession = null;
    clearTimeout(App.appIdleTimer);
    clearTimeout(App.appPresenceExpiryTimer);
    if (session) {
      session.ready = false;
      session.connected = false;
      ++session.generation;
      clearInterval(session.heartbeat);
      session.connectionRef?.off("value", session.connectionCb);
      session.offsetRef?.off("value", session.offsetCb);
      // Keep onDisconnect armed if removing the record cannot reach the server.
      session.ref.remove().then(() => session.ref.onDisconnect().cancel()).catch(() => {});
    }
    if (App.appPresenceRef && App.appPresenceCb) App.appPresenceRef.off("value", App.appPresenceCb);
    App.appPresenceRef = App.appPresenceCb = null;
    App.appPresenceConnections = {};
    App.appPresenceCache?.clear();
  };
  App.register("chat/app-presence", function () {
    App.appPresenceCache = new Map();
    App.appPresenceSession = null;
    App.appPresenceConnections = {};
    App.appPresenceServerOffsetMs = 0;
    App.lastAppInputAt = Date.now();
    if (typeof globalThis.chatDesktopRings?.onVisibility === "function") {
      globalThis.chatDesktopRings.onVisibility?.(state => App.setDesktopPresenceFocus(state?.focused));
      Promise.resolve(globalThis.chatDesktopRings.getVisibility?.()).then(state => {
        if (state) App.setDesktopPresenceFocus(state.focused);
      }).catch(() => {});
    }
    App.startAppPresenceInputTracking();
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) App.lastAppInputAt = Date.now();
      App.pulseAppPresence();
    });
    window.addEventListener("focus", () => { App.appWindowBlurred = false; App.lastAppInputAt = Date.now(); App.pulseAppPresence(); });
    window.addEventListener("blur", () => {
      // A visible desktop browser window behind another app is idle. Entering
      // an iframe keeps document.hasFocus true and does not trip this flag.
      App.appWindowBlurred = document.hasFocus?.() === false;
      App.syncAppIdle();
    });
    window.addEventListener("pagehide", () => { App.stopAppPresence(); App.stopAppPresenceInputTracking(); });
    window.addEventListener("pageshow", () => {
      App.startAppPresenceInputTracking();
      if (App.currentUser) App.startAppPresence();
      App.pulseAppPresence();
    });
    window.addEventListener("online", App.pulseAppPresence);
    window.addEventListener("offline", () => { App.refreshAppPresenceStatuses(); App.queueReceiptVisibilityCheck?.(); });
    document.addEventListener("resume", App.pulseAppPresence);
  });
})(globalThis.ChatApp);
