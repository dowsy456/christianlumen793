/* rooms/open: methods register before ordered initialization. */
(function (App) {
  "use strict";
// Snapshot payloads are JSON values. Compare them without allocating another
// full copy of every inline attachment merely to detect unchanged messages.
App.messagePayloadsEqual = function equal(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every(key => Object.prototype.hasOwnProperty.call(b, key) && equal(a[key], b[key]));
};
let latestRoomRequest = 0;
App.openRoom = async function (roomId, {
  quiet = false
} = {}) {
  if (!App.currentUser) return;
  const id = App.sanitizeRoomCode(roomId);
  if (!id) return;
  const request = ++latestRoomRequest, accountGeneration = App.accountSessionGeneration;
  if (App.selectedGame?.roomActivityId && App.sanitizeRoomCode(App.selectedGame.roomActivityRoomId) !== id) {
    const sequence = App.roomLoadingSeq, account = App.currentUser.code;
    await App.closeGamesStage({
      preserve: false
    });
    if (request !== latestRoomRequest || App.roomLoadingSeq !== sequence || App.currentUser?.code !== account ||
        App.accountSessionGeneration !== accountGeneration) return;
  }

  // If a ping toast is currently pointing to this room, dismiss it.
  if (App.activePingToastRoomId === id) App.closeToast();
  App.stopAllChatAudio();

  // Do not create or restore membership from openRoom().
  // Membership is created only by explicit create/join/admin flows; this prevents a pending room-open transaction from re-adding a room after Leave.

  App.stopRoomPresence();
  App.detachOnlineIndicator();
  App.detachMessages();
  App.stopSchedulesHighlightTimer();
  App.currentRoomId = id;
  App.abortFirebaseUploadsForPlaceChange(`room:${id}`);
  App.setStoredPlace(`room:${id}`);
  App.syncDesktopNotificationPolicy?.();
  App.syncSidebarNavActive();
  App.syncSidebarRoomActiveStates();
  App.callResetRoomPreview?.();
  if (App.currentCallRoomId && App.sanitizeCallRoom(App.currentCallRoomId) === id) App.openCallMenu();else App.closeCallMenu();
  App.syncCallButton();
  App.setComposerEnabled(true);
  // Keep the member list available on desktop, but never force its mobile drawer
  // over a room immediately after navigation.
  App.membersListVisible = document.body.dataset.mobileUi !== "1";
  // An enlarged call/activity can restore its previous sidebar state later.
  // Entering a room establishes a fresh visible desktop roster for that restore.
  if (App.companionMembersBefore !== undefined) App.companionMembersBefore = App.membersListVisible;
  try {
    App.syncEmojiButtonVisibility();
  } catch {}
  // Reset composer bar when switching rooms/pages
  App.clearPendingPoll?.();
  try {
    App.clearPendingFiles({
      quiet: true
    });
  } catch {}
  try {
    App.closePingBar({
      quiet: true
    });
  } catch {}
  try {
    App.$("msg-input").value = "";
    App.$("msg-input").blur();
  } catch {}
  App.attachOnlineIndicator(id);
  App.startRoomPresence(id);
  App.suspendAutoScrollUntil = 0;
  App.suppressHistoryAutoLoadUntil = 0;
  App.chatScrollFollowing = !!App.autoScrollEnabled;
  App.chatScrollUserReading = false;
  App.chatScrollReadingAnchor = null;
  App.chatScrollLastMetrics = null;

  // The SDK reuses its live query cache; fresh sessions need only the indexed
  // tail, regardless of the room's total history size.
  App.msgHistoryRoomId = id;
  App.msgOldestKey = null;
  App.msgLoadingOlder = false;
  App.msgLoadingNewer = false;
  App.msgHasNewerHistory = false;
  App.msgLiveRevision = 0;
  App.msgAllHistoryLoaded = false;
  App.msgPrefetchLeft = 0;
  App.msgInitialTailPending = true;
  App.msgHistoryRevision = (App.msgHistoryRevision || 0) + 1;
  const thisRoomLoadSeq = ++App.roomLoadingSeq;
  App.beginRoomEntryScroll(thisRoomLoadSeq, id);
  const liveTailLimit = Math.max(1, App.MSG_LIVE_TAIL);
  const cachedTail = App.getLiveRoomOpeningTail?.(id) || [];
  const showingCachedTail = cachedTail.length > 0;
  App.messagesListEl.textContent = "";
  App.beginRoomLoading({
    seq: thisRoomLoadSeq,
    roomId: id,
    loaded: 0,
    total: null
  });
  App.bulkLoading = true;
  App.bulkMsgFrag = document.createDocumentFragment();
  if (App.bulkMsgFlushRaf) {
    try {
      cancelAnimationFrame(App.bulkMsgFlushRaf);
    } catch {}
    App.bulkMsgFlushRaf = 0;
  }
  if (thisRoomLoadSeq !== App.roomLoadingSeq || App.getStoredPlace() !== `room:${id}`) return;
  App.watchPinnedMessages?.(id);
  const messagesBaseRef = App.db.ref(`messages/${id}`);
  const liveTailRef = messagesBaseRef.orderByKey().limitToLast(liveTailLimit);
  // Reuse the SDK subscription for the initial snapshot. A parallel REST read
  // duplicates media downloads and can overwrite newer realtime updates.
  const sourcePayloadByKey = new Map();
  const liveTailKeys = new Set();
  const seenLiveKeys = new Set();
  const cachedKeys = new Set(cachedTail.map(item => item.key));
  const historyListeners = new Map();
  let disposed = false;
  let initialLoadFinished = false;
  let initialProbeResolved = false;
  let initialSnapshotReceived = false;
  let initialExpectedKeys = null;
  let initialTailSize = null;
  let roomLoadHardTimer = 0;
  let renderQueueRaf = 0;
  let openedToastShown = false;

  // Keep the latest payload for messages waiting on the next paint. Firebase can
  // deliver attachment child_changed events before requestAnimationFrame runs
  // (or while a background tab has rAF paused), so a Set is not sufficient.
  const queuedMsgByKey = new Map();
  const renderQueue = [];
  const isThisRoomLoadCurrent = () => !disposed && App.accountSessionGeneration === accountGeneration &&
    App.currentRoomId === id && thisRoomLoadSeq === App.roomLoadingSeq;
  const countExpectedRendered = () => {
    if (!initialExpectedKeys) return App.renderedMsgKeys.size;
    let count = 0;
    initialExpectedKeys.forEach(key => {
      if (App.renderedMsgKeys.has(key)) count += 1;
    });
    return count;
  };
  const progressTotal = () => {
    if (initialExpectedKeys) return initialExpectedKeys.size;
    return null;
  };
  const paintLiveRoomProgress = () => {
    if (!isThisRoomLoadCurrent() || initialLoadFinished || showingCachedTail) return;
    const total = progressTotal();
    const loaded = initialExpectedKeys ? countExpectedRendered() : App.renderedMsgKeys.size;
    App.paintRoomLoadingState({
      seq: thisRoomLoadSeq,
      roomId: id,
      loaded: total ? Math.min(loaded, total) : loaded,
      total
    });
  };
  const clearRoomLoadTimers = () => {
    if (roomLoadHardTimer) {
      clearTimeout(roomLoadHardTimer);
      roomLoadHardTimer = 0;
    }
    if (renderQueueRaf) {
      try {
        cancelAnimationFrame(renderQueueRaf);
      } catch {}
      renderQueueRaf = 0;
    }
  };
  const finishInitialRoomLoad = ({
    force = false
  } = {}) => {
    if (!isThisRoomLoadCurrent() || initialLoadFinished) return;
    const expectedRendered = countExpectedRendered();
    const expectedDone = initialProbeResolved && (!initialExpectedKeys || expectedRendered >= initialExpectedKeys.size);
    if (!force && !expectedDone) return;
    // Even a forced finish must respect the render budget. Synchronously
    // draining all pending rows here recreates the room-entry long task.
    if (force && renderQueue.length) scheduleRenderQueue();
    if (renderQueue.some(item => item.initialPhase)) return;
    initialLoadFinished = true;
    App.msgInitialTailPending = false;
    clearRoomLoadTimers();
    const finalLoaded = App.renderedMsgKeys.size;
    const finalTotal = initialExpectedKeys ? Math.max(initialExpectedKeys.size, finalLoaded) : finalLoaded;
    if (!showingCachedTail) App.paintRoomLoadingState({
      seq: thisRoomLoadSeq,
      roomId: id,
      loaded: finalTotal,
      total: finalTotal
    });
    // Sidebar message counts may lag behind the stream. Only a complete short
    // query result establishes that there is no earlier history to request.
    App.msgAllHistoryLoaded = initialTailSize !== null && initialTailSize < liveTailLimit && liveTailKeys.size < liveTailLimit;
    App.msgPrefetchLeft = 0;
    App.trimMessageWindow("oldest");
    if (App.bulkLoading && App.bulkMsgFrag && App.messagesListEl) {
      if (App.bulkMsgFrag.childNodes.length) App.flushBulkMessageRowsToList();
      App.bulkMsgFrag = null;
      App.bulkLoading = false;
    }

    // Clear the loader as soon as the final message fragment is mounted.
    // Mobile browsers can pause requestAnimationFrame while backgrounded or
    // during viewport changes, so loader cleanup must not wait for a frame.
    App.finishRoomLoading(thisRoomLoadSeq);
    App.finishRoomEntryScroll(thisRoomLoadSeq);
    requestAnimationFrame(() => {
      if (!isThisRoomLoadCurrent()) return;
      App.scheduleRoomEntryScroll();
      requestAnimationFrame(() => {
        if (!isThisRoomLoadCurrent()) return;
        if (App.isRoomActivelyRead(id)) App.scheduleLastSeenBump(id, {
          immediate: true
        });
        if (!quiet && !openedToastShown) {
          openedToastShown = true;
          App.showToast({
            title: "Room Opened",
            body: `You’re in ${App.roomDisplayName(id, App.roomsMetaCache.get(id) || null)}.`,
            duration: 2000
          });
        }
      });
    });
  };
  const renderQueuedMessage = item => {
    if (!isThisRoomLoadCurrent() || !item?.key || !item.value) return false;
    App.touchRoomEntryScroll(thisRoomLoadSeq);
    const k = String(item.key || "");
    const prev = App.msgDataByKey.get(k) || null;
    const v = App.mergeMessageMediaForDisplay({
      ...item.value,
      _key: k
    }, prev);
    if (App.renderedMsgKeys.has(k)) {
      App.replaceMessageRowByKey(v);
      App.refreshReplyPreviewDependents(k);
      if (App.messageHasPendingChunkedMedia(v)) App.scheduleMessageMediaRefresh(id, k, 120);else App.cancelMessageMediaRefresh(id, k);
      return true;
    }
    if (App.msgHasNewerHistory && !item.initialPhase) return true;
    if (!App.msgOldestKey || App.compareMessageKeys(k, App.msgOldestKey) < 0) App.msgOldestKey = k;
    App.renderedMsgKeys.add(k);
    try {
      App.appendMessageRow(v, item.initialPhase ? {
        suppressScroll: true
      } : null);
    } catch (error) {
      console.error(item.initialPhase ? "Failed to render message during room load" : "Failed to render live message", error);
    }
    if (App.messageHasPendingChunkedMedia(v)) App.scheduleMessageMediaRefresh(id, k, 120);else App.cancelMessageMediaRefresh(id, k);
    if (!item.initialPhase && App.isRoomActivelyRead(id)) {
      App.scheduleLastSeenBump(id);
    }
    return true;
  };
  const drainRenderQueue = () => {
    renderQueueRaf = 0;
    if (!isThisRoomLoadCurrent()) return;
    const start = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    const mobile = document.body.dataset.mobileUi === '1';
    const frameBudgetMs = mobile ? 4 : 6;
    while (renderQueue.length) {
      const item = renderQueue.shift();
      if (item?.key) queuedMsgByKey.delete(item.key);
      if (item) renderQueuedMessage(item);
      const now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
      if (now - start >= frameBudgetMs) break;
    }
    App.maintainLiveMessageWindow?.();
    if (renderQueue.length) {
      paintLiveRoomProgress();
      renderQueueRaf = requestAnimationFrame(drainRenderQueue);
      return;
    }
    finishInitialRoomLoad();
    App.maintainLiveMessageWindow?.();
  };
  const scheduleRenderQueue = () => {
    if (renderQueueRaf) return;
    renderQueueRaf = requestAnimationFrame(drainRenderQueue);
  };
  const enqueueMessagePayload = (key, value, {
    initialPhase = !initialLoadFinished
  } = {}) => {
    if (!isThisRoomLoadCurrent() || !key || !value) return false;
    const k = String(key || "");
    if (App.isValidChatMessageRecord && !App.isValidChatMessageRecord(value)) {
      removeMessage(k);
      return false;
    }
    if (App.messagePayloadsEqual(sourcePayloadByKey.get(k), value) && (queuedMsgByKey.has(k) || App.renderedMsgKeys.has(k))) return true;
    sourcePayloadByKey.set(k, value);
    const queued = queuedMsgByKey.get(k);
    if (queued) {
      queued.value = App.mergeMessageMediaForDisplay({
        ...value,
        _key: k
      }, queued.value);
      queued.initialPhase = !!(queued.initialPhase || initialPhase);
      return true;
    }
    // Changed rows share the same frame queue as new rows. A reconnect can
    // deliver dozens of edits together and must not rebuild them in one task.
    const item = {
      key: k,
      value: App.mergeMessageMediaForDisplay({
        ...value,
        _key: k
      }, App.msgDataByKey.get(k) || null),
      initialPhase: !!initialPhase
    };
    queuedMsgByKey.set(k, item);
    renderQueue.push(item);
    scheduleRenderQueue();
    return true;
  };
  const consumeInitialTailSnapshot = (keys = [], initialItems = []) => {
    if (!isThisRoomLoadCurrent() || initialSnapshotReceived) return false;
    initialSnapshotReceived = true;
    initialTailSize = keys.length;
    const safeKeys = Array.isArray(keys) ? keys.filter(key => key && (!seenLiveKeys.has(String(key)) || sourcePayloadByKey.has(String(key)))) : [];
    initialExpectedKeys = new Set(safeKeys);
    initialProbeResolved = true;
    if (initialLoadFinished) App.msgAllHistoryLoaded = initialTailSize < liveTailLimit && liveTailKeys.size < liveTailLimit;
    if (!safeKeys.length) {
      if (!initialLoadFinished) {
        if (!showingCachedTail) App.paintRoomLoadingState({ seq: thisRoomLoadSeq, roomId: id, loaded: 0, total: 0 });
        finishInitialRoomLoad({ force: true });
      }
      return true;
    }
    initialItems.forEach(item => {
      if (!item?.key || !item.value || seenLiveKeys.has(String(item.key))) return;
      enqueueMessagePayload(item.key, item.value, {
        initialPhase: !initialLoadFinished
      });
    });
    paintLiveRoomProgress();
    finishInitialRoomLoad();
    return true;
  };
  App.msgCb = childSnap => {
    if (!isThisRoomLoadCurrent() || !childSnap?.key) return;
    const v = childSnap.val();
    if (!v) return;
    App.msgLiveRevision += 1;
    App.messagePageCache?.clear();
    liveTailKeys.add(String(childSnap.key));
    if (liveTailKeys.size >= liveTailLimit) App.msgAllHistoryLoaded = false;
    seenLiveKeys.add(String(childSnap.key));
    const retainedToken = `key:${childSnap.key}`;
    const retained = historyListeners.get(retainedToken);
    if (retained) {
      retained.ref.off("value", retained.cb);
      historyListeners.delete(retainedToken);
    }
    enqueueMessagePayload(childSnap.key, v, {
      initialPhase: !initialLoadFinished
    });
  };
  App.msgChangedCb = childSnap => {
    if (!isThisRoomLoadCurrent() || !childSnap?.key) return;
    const k = childSnap.key;
    App.messagePageCache?.clear();
    const v = childSnap.val();
    if (!v) return;
    seenLiveKeys.add(String(k));
    enqueueMessagePayload(k, v, {
      initialPhase: !initialLoadFinished
    });
  };
  const removeMessage = key => {
    if (!isThisRoomLoadCurrent() || !key) return;
    const k = String(key);
    if (App.editState?.roomId === id && String(App.editState.key) === k) App.cancelEditMessage?.({ quiet: true, keepText: true });
    for (const scope of Array.from(App.activeFirebaseUploads?.values() || [])) {
      if (scope.type === "chat-message" && scope.place === `room:${id}` && scope.messageKey === k) scope.abort("Message removed");
    }
    App.messagePageCache?.clear();
    sourcePayloadByKey.delete(k);
    initialExpectedKeys?.delete(k);
    App.cancelMessageMediaRefresh(id, k);
    queuedMsgByKey.delete(k);
    for (let i = renderQueue.length - 1; i >= 0; i--) {
      if (String(renderQueue[i]?.key || "") === k) renderQueue.splice(i, 1);
    }
    try {
      App.msgElByKey.get(k)?.__stickerUnsubscribe?.();
    } catch {}
    try {
      App.releaseMessageMedia?.(App.msgElByKey.get(k));
      App.msgElByKey.get(k)?.remove();
    } catch {}
    App.msgElByKey.delete(k);
    App.msgDataByKey.delete(k);
    App.renderedMsgKeys.delete(k);
    if (App.msgOldestKey === k) App.msgOldestKey = Array.from(App.renderedMsgKeys).sort(App.compareMessageKeys)[0] || null;
    App.replyTargetPreviewCache.delete(`${id}:${k}`);
    if (App.replyState && String(App.replyState.key || "") === k) App.clearReplyState({
      quiet: true
    });
    App.refreshReplyPreviewDependents(k);
    App.scheduleRoomEmptyStateSync();
  };
  App.msgRemovedCb = childSnap => {
    if (!isThisRoomLoadCurrent() || !childSnap?.key) return;
    const key = String(childSnap.key);
    seenLiveKeys.add(key);
    liveTailKeys.delete(key);
    // child_removed on limitToLast also means eviction, not deletion. Keep
    // displayed history and observe only that retained message for changes.
    const token = `key:${key}`;
    if (historyListeners.has(token)) return;
    if (!App.renderedMsgKeys.has(key) && !queuedMsgByKey.has(key)) {
      sourcePayloadByKey.delete(key); seenLiveKeys.delete(key); return;
    }
    const ref = messagesBaseRef.child(key);
    const cb = snap => {
      if (!isThisRoomLoadCurrent() || historyListeners.get(token)?.cb !== cb) return;
      if (snap.exists()) enqueueMessagePayload(key, snap.val());
      else {
        removeMessage(key);
        ref.off("value", cb);
        historyListeners.delete(token);
        finishInitialRoomLoad();
      }
    };
    historyListeners.set(token, { ref, cb, keys: new Set([key]) });
    ref.on("value", cb);
  };
  App.watchMessageHistoryPage = items => {
    if (!isThisRoomLoadCurrent() || !items.length) return;
    const keys = items.map(item => String(item._key)).sort(App.compareMessageKeys);
    const token = `page:${keys[0]}:${keys.at(-1)}`;
    if (historyListeners.has(token)) return;
    const pageKeys = new Set(keys);
    for (const item of items) {
      const { _key, ...value } = item;
      sourcePayloadByKey.set(_key, value);
    }
    const ref = messagesBaseRef.orderByKey().startAt(keys[0]).endAt(keys.at(-1));
    const cb = snap => {
      if (!isThisRoomLoadCurrent() || historyListeners.get(token)?.cb !== cb) return;
      const present = new Set();
      snap.forEach(child => {
        present.add(String(child.key));
        if (App.renderedMsgKeys.has(String(child.key))) enqueueMessagePayload(child.key, child.val(), { initialPhase: false });
      });
      for (const key of pageKeys) if (!present.has(key)) removeMessage(key);
      pageKeys.clear();
      for (const key of present) pageKeys.add(key);
    };
    historyListeners.set(token, { ref, cb, keys: pageKeys });
    ref.on("value", cb);
  };
  App.releaseMessageWindowKeys = keys => {
    for (const key of keys) if (!liveTailKeys.has(key)) {
      sourcePayloadByKey.delete(key);
      seenLiveKeys.delete(key);
    }
    for (const [token, listener] of historyListeners) {
      if (Array.from(listener.keys || []).some(key => App.renderedMsgKeys.has(key))) continue;
      listener.ref.off("value", listener.cb); historyListeners.delete(token);
    }
  };
  let tailResetPending = false, tailResetTicket = 0;
  const reconcileClearedTail = snap => {
    if (!tailResetPending || !isThisRoomLoadCurrent()) return;
    tailResetPending = false;
    // A clear may leave pins outside the reader's historical window. Return to
    // the authoritative 50-row tail even when its query never became empty.
    for (const { ref, cb } of historyListeners.values()) ref.off("value", cb);
    historyListeners.clear();
    if (renderQueueRaf) cancelAnimationFrame(renderQueueRaf);
    renderQueueRaf = 0;
    renderQueue.length = 0;
    queuedMsgByKey.clear();
    sourcePayloadByKey.clear();
    liveTailKeys.clear();
    seenLiveKeys.clear();
    const items = [];
    snap.forEach(child => { if (child.key && child.val()) items.push({ key: String(child.key), value: child.val() }); });
    const keys = new Set(items.map(item => item.key));
    for (const key of Array.from(App.renderedMsgKeys)) if (!keys.has(key)) removeMessage(key);
    App.msgHasNewerHistory = false;
    App.msgAllHistoryLoaded = items.length < liveTailLimit;
    App.msgOldestKey = items[0]?.key || null;
    App.chatScrollFollowing = !!App.autoScrollEnabled;
    App.chatScrollUserReading = false;
    App.chatScrollReadingAnchor = null;
    App.beginRoomEntryScroll(thisRoomLoadSeq, id);
    if (!initialLoadFinished) {
      initialSnapshotReceived = true;
      initialProbeResolved = true;
      initialExpectedKeys = keys;
      initialTailSize = items.length;
    }
    for (const { key, value } of items) {
      liveTailKeys.add(key); seenLiveKeys.add(key);
      enqueueMessagePayload(key, value, { initialPhase: !initialLoadFinished });
    }
    finishInitialRoomLoad();
    if (initialLoadFinished) {
      App.finishRoomEntryScroll(thisRoomLoadSeq);
      App.queueReadReceiptSync?.();
    }
    App.scheduleRoomEmptyStateSync();
  };
  App.resetMessageWindowToTail = () => {
    if (!isThisRoomLoadCurrent()) return;
    tailResetPending = true;
    const ticket = ++tailResetTicket;
    // The clear's metadata may follow its message value event. A cached bounded
    // SDK read covers either delivery order without reopening the room.
    liveTailRef.once("value").then(snap => {
      if (ticket !== tailResetTicket || !isThisRoomLoadCurrent()) return;
      reconcileClearedTail(snap);
    }).catch(() => {});
  };
  App.msgValCb = snap => {
    if (!isThisRoomLoadCurrent()) return;
    if (tailResetPending) {
      // A live snapshot supersedes a once() result captured before this event.
      tailResetTicket += 1;
      reconcileClearedTail(snap);
    }
    if (snap.exists()) return;
    initialSnapshotReceived = true;
    initialTailSize = 0;
    App.msgHistoryRevision += 1;
    App.messagePageCache?.clear();
    App.msgLoadingOlder = false;
    App.msgLoadingNewer = false;
    App.msgHasNewerHistory = false;
    App.invalidateRecentRoomMessages?.(id);
    sourcePayloadByKey.clear();
    liveTailKeys.clear();
    for (const { ref, cb } of historyListeners.values()) ref.off("value", cb);
    historyListeners.clear();
    App.cancelMessageMediaRefreshesForRoom(id);
    if (renderQueueRaf) {
      try {
        cancelAnimationFrame(renderQueueRaf);
      } catch {}
      renderQueueRaf = 0;
    }
    renderQueue.length = 0;
    queuedMsgByKey.clear();
    for (const row of App.msgElByKey.values()) {
      row.querySelectorAll("audio,video").forEach(media => { try { media.pause(); media.removeAttribute("src"); media.load(); } catch {} });
      try { row.__stickerUnsubscribe?.(); } catch {}
      App.messageAvatarObserver?.unobserve(row);
    }
    App.messageAvatarRows?.clear();
    App.stopReadReceipts?.();
    App.messagesListEl.textContent = "";
    App.renderedMsgKeys.clear();
    App.msgElByKey.clear();
    App.msgDataByKey.clear();
    App.replyTargetPreviewCache.clear();
    App.replyTargetHydratePending.clear();
    App.msgOldestKey = null;
    App.msgAllHistoryLoaded = true;
    const clearedMeta = {
      ...(App.roomsMetaCache.get(id) || {}),
      lastMessageAt: null,
      lastMessagePreview: null,
      messageCount: 0
    };
    App.roomsMetaCache.set(id, clearedMeta);
    const memberRec = App.membershipMap.get(id);
    if (memberRec) {
      memberRec.lastSeenCount = 0;
      App.membershipMap.set(id, memberRec);
    }
    App.scheduleRoomsListCacheSave();
    App.updateRoomListItem(id);
    if (App.bulkLoading) {
      App.bulkMsgFrag = document.createDocumentFragment();
    }
    App.hardClearComposerAndOverlays();
    if (!initialLoadFinished) {
      App.paintRoomLoadingState({
        seq: thisRoomLoadSeq,
        roomId: id,
        loaded: 0,
        total: 0
      });
      finishInitialRoomLoad({
        force: true
      });
    } else {
      // A late empty-value event can arrive after the room has already opened
      // (for example immediately after messages are cleared). Never repaint
      // the loader in that state; just keep the empty-room UI synchronized.
      App.finishRoomLoading(thisRoomLoadSeq);
      App.scheduleRoomEmptyStateSync();
    }
    App.db.ref(`rooms/${id}`).once("value").then(roomSnap => {
      if (!isThisRoomLoadCurrent() || roomSnap.exists()) return;
      const displayName = App.roomDisplayName(id, App.roomsMetaCache.get(id) || null);
      App.hardClearComposerAndOverlays();
      App.showLoggedInHome();
      App.showToast({
        title: "Room Deleted",
        body: `${displayName} was deleted.`,
        duration: 2400
      });
    }).catch(() => {});
  };
  const cancelLoadCb = error => {
    if (!isThisRoomLoadCurrent()) return;
    if (/permission[_-]?denied/i.test(String(error?.code || ""))) {
      App.invalidateRecentRoomMessages?.(id);
      App.detachMessages();
      App.messagesListEl.replaceChildren();
      App.showLoggedInHome();
      return;
    }
    const detail = App.$("room-loading-detail");
    if (detail) detail.textContent = "Unable to Load Messages. Reopen This Room to Retry.";
    App.$("room-loading-state")?.setAttribute("aria-busy", "false");
  };
  App.cleanupRoomMessageLoad = () => {
    if (disposed) return;
    disposed = true;
    clearRoomLoadTimers();
    for (const { ref, cb } of historyListeners.values()) ref.off("value", cb);
    historyListeners.clear();
    renderQueue.length = 0;
    queuedMsgByKey.clear();
  };
  App.msgRef = liveTailRef;
  App.msgAddedRef = liveTailRef;
  App.msgAddedRef.on("child_added", App.msgCb, cancelLoadCb);
  App.msgRef.on("child_changed", App.msgChangedCb, cancelLoadCb);
  App.msgRef.on("child_removed", App.msgRemovedCb, cancelLoadCb);
  App.msgRef.on("value", App.msgValCb, cancelLoadCb);
  liveTailRef.once("value").then(snap => {
    if (!isThisRoomLoadCurrent() || initialSnapshotReceived && !cachedKeys.size) return;
    const keys = [];
    const initialItems = [];
    snap.forEach(child => {
      if (!child?.key) return;
      const key = String(child.key);
      if (seenLiveKeys.has(key)) {
        if (sourcePayloadByKey.has(key)) keys.push(key);
        return;
      }
      const v = child.val();
      if (!v || App.isValidChatMessageRecord && !App.isValidChatMessageRecord(v)) return;
      keys.push(child.key);
      initialItems.push({
        key: child.key,
        value: v
      });
    });
    if (initialSnapshotReceived) {
      const confirmed = new Set(keys);
      for (const key of cachedKeys) if (!confirmed.has(key) && !liveTailKeys.has(key)) removeMessage(key);
    } else consumeInitialTailSnapshot(keys, initialItems);
    cachedKeys.clear();
  }).catch(cancelLoadCb);
  roomLoadHardTimer = setTimeout(() => {
    if (!isThisRoomLoadCurrent() || initialLoadFinished) return;
    const detail = App.$("room-loading-detail");
    if (detail) detail.textContent = "Still Connecting. Waiting for Recent Messages…";
  }, 8000);
  if (showingCachedTail && !initialSnapshotReceived) {
    // The account already has an active subscription to this exact bounded
    // query. Reuse its complete snapshot, then reconcile the opening fence.
    const items = cachedTail.filter(item => !App.isValidChatMessageRecord || App.isValidChatMessageRecord(item.value));
    consumeInitialTailSnapshot(items.map(item => item.key), items);
    if (renderQueueRaf) {
      cancelAnimationFrame(renderQueueRaf);
      drainRenderQueue();
    }
  }
};

App.register("rooms/open", function initializeFeature() {

});
})(globalThis.ChatApp);
