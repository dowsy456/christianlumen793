# Home, schedules and update log maintenance

Applies to shared web 2026.11.13-4. Native stays 2.0.0.

## Home hub

`js/rooms/home.js` and `css/home-dashboard.css` own the fitted Home canvas. Today shows current shared calendar notes; Reminders resolves only the signed-in account's reminder tags to their current shared notes. Open Polls collects open polls across joined rooms with To Vote / All Open filters. Clicking a row calls the existing jumpToRoomMessage path, opens its room and highlights the exact poll message; do not restore a separate Home vote modal. Recent Links deduplicates safe HTTP(S) links from the existing 50-message notification tail of each joined room, with cross-room search, open and copy actions. It is a recent-link shelf, not all-history search.

Live memberships authorize room data; a cached sidebar alone is insufficient. Home subscribes to the latest 40 activePolls index entries per room and the compact messages/<room>/<message>/poll leaves. Existing notification tails seed fast initial paint. The exact next poll-expiry timer removes expired polls without repeated network reads; visibility/focus also recomputes deadlines. Links reuse loaded notification tails without downloading attachments/history again. Keyed reconciliation preserves collection scroll and keyboard focus. Calendar, reminders and notification-tail subscriptions repaint affected Home data. Navigation/logout/member removal detaches listeners and timers; stale callbacks cannot repopulate another account's Home. Do not add a refresh button or periodic poll fetch loop.

The large layout displays four cards. Narrow or short workspaces expose the same tools through tabs. A ResizeObserver selects the compact layout. Each collection has its own keyboard/touch/wheel scroll area; the outer dashboard stays fitted. Preserve min-height:0 through the flex/grid chain. Do not restore pagers, subtitles, New Room, room tiles, room counts or room filters. Headings are Today, Reminders, Open Polls and Recent Links. Keep the Recent Links search placeholder unchanged. Noninteractive labels use a default cursor, actionable rows use a pointer, and only editable input text gets a caret/text-selection cursor.

## Live preferences and typing controls

core/session starts one account/generation-scoped settings subscription after verified manual or automatic login and detaches it at logout. Incoming settings merge with unsaved local leaves against the last server baseline, without writing incoming snapshots back. Async saves may only advance the baseline if no newer live snapshot has replaced it. The open Preferences UI updates controls in place, preserves unfinished drafts and caret selection, and lets pristine focused fields follow remote values. Keep account-generation guards on memberships/room metadata and any awaited work before mutating room UI.

Calendar, schedule, message, profile, reminder and membership data already have live listeners. The technical Admin database tree discovers entirely new arbitrary branches through bounded shallow 15-second refreshes; it deliberately avoids an unbounded full-root subscription that would load stored message/media bodies. Known scalar values and deletions update live, without discarding active edits. Do not claim zero network latency or full-tree streaming.

css/ui-controls.css owns the shared typing surface, including dynamically created inputs, textareas and contenteditable fields. Native resize grips must always be disabled. The required maintenance comment is in styles.css; do not introduce manually draggable/resizable typing fields in later prompts. Feature-owned automatic growth, scrolling, selection, keyboard editing and dimensions remain intact. Grouped composer/search fields use one surrounding surface, with transparent inner inputs. Screenshot annotation canvas text retains its selected font/color/scale to match the exported image; its toolbar fields use the shared surface. File pickers, sliders, checkboxes and embedded third-party pages are not app typing surfaces.

## Schedules and calendar

The schedules refresh keeps the original schedule data and editor. The horizontal person picker remains available in either Schedule or a person's agenda. Preview day, copy/edit and class details remain available. The day-type badge must not get a title or tooltip.

`css/schedules-calendar-refresh.css` loads after existing workspace, calendar and control styles. Month sizing in `js/calendar/render.js` uses the actual messages viewport and visualViewport bounds. Adding scrollTop back to the card's top keeps height stable while scrolling to the note editors below the calendar. Do not reintroduce the old 820px minimum month height. Month rows divide the measured remaining space; compact mode reduces metadata and very short layouts retain day navigation while hiding previews. Day pages and note editors still scroll normally.

## Update Log preview maintenance

Preview and automatic delivery both call openUpdateLogModal; never create a second preview renderer. previewUpdateLog parks the existing Admin Panel nodes in a hidden inert container so drafts, callbacks and in-flight saves survive. The modal onRequestClose hook restores those exact nodes, chrome, focus and scroll without running the suspended panel cleanup. Ordinary replacement/closing still invokes cleanup. Account/generation guards prevent restoring another account's panel. Preview uses the current field value, including empty and unsaved drafts, and never claims seen receipts or saves anything. The normal explicit close-button policy applies to both views.

## Update Log publishing and account behavior

Publish the complete shared source before saving its log. Sign into Vinny's account, open Admin Panel, scroll to the bottom, type in Update Log and click Save. On mobile, Return inserts a new line. On desktop, use Shift + Enter. Only the Save button publishes the draft. Paste remains plain text; files/drop content are rejected. Supported formatting includes `#`, `##`, `###`, `-#`, `**bold**` and `*italic*`. The modal uses escaped, noninteractive inline formatting. Clear the editor and Save to disable the log.

Save checks the existing numbered `dowsy456/christianlumen<N>` repository convention, reads build-info.json at an immutable commit, and binds the log to that published web version/asset revision. It also records the actual latest normal `dowsy456/chat-app-desktop` native release, which must contain Chat-App.exe and native-update.json. If GitHub cannot confirm the release, Save reports an error and does not overwrite the existing log. Do not save a future release's text before publishing that release, because Save binds the currently published versions.

A verified manual or automatic login reads `admin/updateLog`. The loaded web asset revision must match; an EXE must also match the recorded native version. An eligible unseen log is checked against current published versions before display. The modal waits at least 500ms after verified login, and waits longer for release verification, a hidden page, or another modal. Already-seen logs do not trigger GitHub discovery. Only release metadata has a short in-memory 60-second cache. Offline, rate-limited or denied verification/receipt writes leave the log unseen for a later login; no guessed/local-only popup is shown.

Receipts live in `users/<account>/updateLogSeen/<assetRevision>`. One transaction covers the same release across browser, mobile and EXE. The receipt includes a shared-web marker and native release claims. A later native-only release can notify the newly updated EXE without replaying the same web release in a browser. Text edits never reset receipts. Empty text consumes no receipt. A first installation of this feature shows a matching nonempty published log once. No popup is injected just because Vinny edits the text during an existing session. Keep account/database permissions consistent with the existing admin and account storage paths; this release adds no backend deployment or credential changes.

This feature does not install updates. Preserve the existing combined icon, staged-web known-good rule, native-first restart behavior, signature/hash verification and in-flight work protections. The native manifest setting and migration setting are unchanged. Read NATIVE-UPDATES.md before updater maintenance.

## Reply previews and pinned label

`formatReplyPreview` reuses the escaped inline parser, then clips the formatted DOM to a bounded preview. Parse before clipping so a long bold/italic span retains its closing marker. Saved reply fallbacks are compact escaped Markdown, never trusted HTML, and retain emphasis when the original message is not loaded. Composer and sent reply previews use the same path. Headings are flattened for previews. `.retained-pins-divider` and its children have user-select:none; surrounding message text stays selectable.

## Future releases

Bump package.json, the root package-lock version, build-info webVersion/assetRevision/mobileRevision, desktop-capabilities webRevision, and entry/dynamic-loader asset revision strings together. Keep native version and all desktop files unchanged for shared-only work. Keep the new CSS links at the end of index.html and the ui/update-log module before core/start.

Run `npm run test:live-home-inputs`, `npm test`, `node --test tests-release/*.test.cjs`, `npm run test:home-schedules-update-log`, `npm run test:browser`, and the affected calendar/UI browser suites. All browser tests use isolated database fixtures. Run `npm run audit:upload` and retain every supplied source path. Package only source; exclude node_modules, generated builds, captures and private signing material.
