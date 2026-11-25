/* ui/page-buttons: methods register before ordered initialization. */
(function (App) {
  "use strict";

// Home, Schedules and Calendar share the same hidden composer. A real room
// exit must detach listeners and release its UI once, including an in-flight load.
App.prepareNonRoomPage = function (place) {
  const detached = !App.currentRoomId && !App.roomLoadingActive && !App.msgRef &&
    document.body.classList.contains("composer-hidden-page") && document.body.dataset.roomView === "0";
  const calendar = place === "calendar" || place.startsWith("calendar:");
  App.closeCallMenu();
  if (place === "home" && (App.pendingPoll || App.$("poll-popover")?.hidden === false || App.$("poll-draft-bar"))) App.clearPendingPoll();
  if (place !== "schedules") App.stopSchedulesHighlightTimer();
  if (!detached) {
    App.stopAllChatAudio();
    App.stopRoomPresence();
    App.detachOnlineIndicator();
    App.detachMessages(); // Also cancels editing and clears the reply target.
    App.bulkLoading = false;
    App.bulkMsgFrag = null;
    App.clearPendingFiles({ quiet: true });
    App.closePingBar({ quiet: true });
    App.currentRoomId = null;
    if (calendar) App.membersListVisible = false;
    App.scheduleRoomEmptyStateSync?.();
  } else {
    // Invalidate a room entry that may still be awaiting an activity teardown.
    App.roomLoadingSeq++;
  }
  const input = App.$("msg-input");
  if (!calendar && input) {
    if (input.value) input.value = "";
    if (document.activeElement === input) input.blur();
  }
  App.abortFirebaseUploadsForPlaceChange(place);
  App.setStoredPlace(place);
  App.syncSidebarNavActive();
  if (!detached) {
    App.syncSidebarRoomActiveStates();
    App.setComposerEnabled(false);
    App.syncEmojiButtonVisibility();
  }
  if (!detached || App.currentCallRoomId || App.callJoinPending || App.callLeavePending) App.syncCallButton();
  if (App.messagesEl) App.messagesEl.scrollTop = 0;
  if (!calendar) window.scrollTo(0, 0);
};

App.prepareCalendarPage = function (requestedPlace = "calendar") {
  if (!App.currentUser) return;
  const place = /^calendar:\d{4}-\d{2}-\d{2}$/.test(requestedPlace) ? requestedPlace : "calendar";
  App.closeUserProfile?.(true);
  if (App.timeDisplayStage || App.isTimeDisplayExpanded?.()) App.collapseTimeDisplay?.({ silent: true });
  App.closeModal();
  if (App.selectedGame) void App.closeGamesStage({ preserve: false });
  App.closeMobileDrawers?.();
  App.prepareNonRoomPage(place);
};

App.register("ui/page-buttons", function initializeFeature() {
App.$("btn-side-calendar")?.addEventListener("click", e => {
  e.preventDefault();
  e.stopPropagation();
  if (App.currentUser) App.showCalendarPage();
});
App.btnSidePanel = App.$("btn-side-panel");
if (App.btnSidePanel) App.btnSidePanel.addEventListener("click", e => {
  e.preventDefault();
  e.stopPropagation();
  if (!App.isVinny()) return;
  App.openAdminPanel();
});
App.btnSideSchedules = App.$("btn-side-schedules");
if (App.btnSideSchedules) App.btnSideSchedules.addEventListener("click", e => {
  e.preventDefault();
  e.stopPropagation();
  if (!App.currentUser) return;

  // Make sure this navigation always works even if an overlay/modal is partially open
  try {
    App.closeGamesStage();
  } catch {}
  try {
    App.closeModal();
  } catch {}
  App.showSchedulesPage();
});
});
})(globalThis.ChatApp);
