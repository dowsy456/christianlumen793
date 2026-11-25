# Presence, unread counts and retained pins

This revision uses the existing RTDB `appPresence/<user>/<session>` branch and original disconnect cleanup. No rules or backend deployment is needed. Each tab/device owns only its own record. Cleanup is acknowledged before publishing; reconnect generations invalidate pending read receipts. Current records include `v:2`, `platform`, `idle`, notification policy/expiry and a server timestamp. DND is effective only on native clients and is displayed only while a live native session advertises it. A closed EXE's saved preference cannot mute a browser or make a browser-only user appear DND.

Input, desktop focus, window blur, visibility and cloak transitions update measured activity. Five minutes without input is Idle. Background web sessions are Idle while their lease remains alive. Heartbeats run every 15 seconds; version-2 active/native records expire after 45 seconds and idle web/legacy records after 90 seconds. The longer web/legacy window tolerates one-minute browser timer throttling and older clients' 30-second heartbeat. Frozen mobile tabs, crashes or lost networks eventually become Offline; no client can prove an abrupt disconnection instantaneously. Normal disconnect removes the session through RTDB `onDisconnect`. A timer expires remote leases/DND deadlines without waiting for a new database event. Resume renews presence before receipts are allowed.

Receipts and unread-read watermarks require visible, unobstructed content in an active focused window and a recently acknowledged non-idle session. Idle status is checked at use time, so a delayed idle timer cannot accidentally mark a message read. Previously saved Seen indicators remain historical evidence after a reader becomes Idle/Offline; status changes do not erase a real earlier read.

Badges on the room list, web app and native host share `getRoomMissedCount`. It counts existing incoming records after the read watermark/clear epoch. The existing 50-message tail is sufficient for short gaps. Longer gaps attach an indexed key query from the last read/join/clear boundary and detach it after reading catches up. Large unread backlogs therefore require downloading their still-unread message records; the initial unknown count is not guessed from stale metadata. Deletes, own messages and pre-clear pins cannot inflate this count. Keep notification listener setup/cleanup hooks to `syncUnreadRoomSubscriptions`, `reconcileUnreadRoomTail` and `stopUnreadRoomSubscriptions` together when changing notification code.

Clearing now records `retainedMessageCount` alongside the existing count and clear epoch for compatibility. Retained pins do not need a read receipt to stop being unread. The timeline divider is derived from pinned records at/before the clear epoch, not the current general pin list; pins created after the clear stay in normal position. Removing/unpinning the final retained pin removes the divider. Its mutation reconciliation compares node order before moving anything and preserves message/media elements.

Verification commands:

```
node --test tests-release/presence-unread-v2.test.cjs tests/presence-receipts.test.cjs tests/unread-read-state.test.cjs tests/notifications-status.test.cjs
node tests-release/presence-pins.browser.cjs
node tests/unread-read-state.browser.cjs
node tests/app-presence.browser.cjs
```

These tests use local transaction/database fixtures and Chrome at desktop/mobile viewport sizes. They are not evidence of a live multi-device Firebase test or physical mobile testing.
