# November 24, 2026 · Shared web 2026.11.24-2 · Windows 2.0.7

- Windows keeps the uploaded wallpaper tint across the title bar and removes the thin line beneath it.
- A reply to a poll shows its question in the composer and the conversation. Previously sent replies recover the question when the original is available. The vote count uses the Music song-title glow on hover and keyboard focus.
- The video viewer uses the app's theme, speaker button and volume slider. Its playback-speed menu offers eight presets and a typed custom rate. Tap the speaker in the viewer, Music controller or Windows Music tray to mute at 0%. Tap again to restore the previous level, or raise the slider to unmute.
- On a focused mobile screen share, In Call With is aligned with the other controls. Tap it to see participants, tap again to dismiss it, or tap Viewers to switch lists.
- When sharing a screen with audio in the Windows app, viewers can hear external system playback, supported HTML Hub audio and files playing in chat or its media viewer. Call voices and Music stay on the sharer's side. Browser restrictions on protected media and foreign embedded players still apply.
- A room begins fetching its newest 50 messages immediately. Reopening a room can use its current account's verified recent messages while the live query catches up. Expensive rows render in batches. A continuous upward swipe requests one older page and keeps the message under your finger in place.
- Mobile drawer swipes can begin over room and member rows. Page switches avoid repeated cleanup and layout work. The Schedules account list stays available across visits and recovers from a canceled network subscription.

---

# November 24, 2026 · Shared web 2026.11.24-1 · Windows 2.0.6

- The Windows title bar follows the tint sampled from the uploaded background. Changing or removing the image updates the title bar and window controls. Existing installs receive this part through the native updater.
- Screen sharing avoids repainting stationary desktop content continuously. The calling code also reduces repeated presence work, handles backpressure in the Android frame bridge and coordinates track changes on source switches. Voice, screen audio, camera, the existing source picker and ICE configuration use the same user-facing controls.
- The Windows host now ships Electron 45.5.0, including Chromium 156.0.8078.109. Spotify credentials use Electron's asynchronous encrypted storage with support for existing saved credentials. The embedded shared bundle includes the small-window layout's Chat App logo.
- The shared client now uses Firebase Web SDK 13.4.0. Existing Realtime Database paths and the compatible browser API are retained. PDF and PowerPoint previews use updated renderers. The backend now targets Node.js 24 with Firebase Admin 14.5.1 and Functions 7.4.0.
- Built-in games load their document, script and stylesheet with the same release revision as the app. Three missing bytes in the Bopl tan ball artwork's JPEG quantization table were restored. The compressed picture data was preserved.
- Clipboard actions use one implementation across the app. Copy failures now report what happened and selection-based copying restores focus. A live renderer that schedules itself yields to the next frame. Calendar cleanup aborts unchanged transactions and recurring notes skip directly between matching weekdays.

---

# Shared web 2026.11.21-7

The HTML activity menu now says **Download**. It saves the selected activity as an HTML file.

# Shared web 2026.11.21-6

Icon editors, artwork menus and file previews use Download and Copy Address where applicable. Room menus retain Download Icon and Copy Icon Address. Clear opens the existing message-removal confirmation. Sound settings, sticker creation and other single-purpose controls use shorter verbs.

# Shared web 2026.11.21-5

- The installed Android app can receive Music through its existing shared updater. Open the navigation drawer and tap the music note beside Settings.
- Dragging the Music playhead previews the selected time immediately. Releasing it performs one seek. If the destination audio is still downloading, the player silences the old position until the new one can play.
- Mobile chat keeps the reader's position while older messages load. Changing direction during a swipe or continuing to scroll after a pause works without snapping back.
- Room messages use available profile pictures on first paint. The members list reuses a recently visited room's index and fills in new members as their identities arrive. A short class name with no classmates has no tooltip. A clipped name expands on hover, classmates appear beside a group icon, and the overflow list always identifies hidden classes.
- The profile preview in Settings follows playback as songs change. Background controls use title case, and the image preview supports drag and arrow-key positioning without a caption. Password, Spotify and other clearly labeled settings use shorter action names.
- Vinny can edit another person's room message from its actions menu. The message keeps its author, original timestamp and reactions. In the mobile Update Log editor, Return inserts a new line and Save publishes the edit.

# Shared web 2026.11.21-4

- An uploaded wallpaper now supplies colors for navigation, message controls, media and audio previews, Home, Music, profiles, calls, settings, the screenshot editor and other shared app surfaces. The editor's drawing colors and uploaded artwork keep their own colors.
- Settings → Appearance supports dragging the image to choose the crop and adjusting dimming, image saturation, accent strength and panel opacity alongside blur and zoom. Adjustments preview during the gesture. The selected values follow the account.
- Music can request the bytes at the selected playhead on supported hosts. Completed tracks can be replayed from a bounded local cache after a reload. Dragging the playhead updates the player directly, and the final position synchronizes with the Jam.

# Shared web 2026.11.21-3

Call microphone, output, participant and screen-share volume sliders move in five-percentage-point steps. The same spacing applies to media and activity volume bars and zoom sliders.

# Shared web 2026.11.21-2

The sign-in and account creation screens show GradeSort. Both screens and the default browser tab use the A+ artwork in `assets/gradesort.svg`. The default tab title is **Sign in to GradeSort**. To publish, upload the extracted source to the existing shared web repository. The existing Windows 2.0.5 host receives this release through its shared web updater. No admin change is required.

# Shared web 2026.11.21-1 and Windows 2.0.5

- Escape keeps the call preview and the joined call menu open, including the expanded layout. It can still dismiss a control's popover or leave a focused screen share.
- Incoming call cards pass clicks through to the app underneath, with dedicated clickable Join and Decline regions. Incoming calls and mentions can appear without taking keyboard focus. Clicking a mention brings Chat App forward and opens its room at the referenced message. The call overlay follows the active call and its settings.
- Home Audio collects uploads from all Music profiles. Each profile keeps its own library. Vinny can upload for another person or edit their audio. Drag a playlist track across multiple positions and scroll at the edge while dragging.
- The member list uses consistent listening information between roster updates. Every Jam participant controls their own volume. The Windows tray uses current player controls, title glow and a Jam roster with profile pictures.

Release owner instructions and actual checks are recorded in RELEASE-INSTRUCTIONS.md and VALIDATION.md.

## Earlier releases

# Shared web 2026.11.18-3

Music owner links and player titles glow around the letters on hover and keyboard focus. Publish the extracted source to the existing shared GitHub repository. Windows 2.0.4 receives the stylesheet through its shared updater. No admin changes are required.

---

# Shared web 2026.11.18-2 and Windows 2.0.4

- Repeat begins Off for a new listener. Existing saved settings carry forward. Repeat One and Repeat All work on standalone uploads in both Music players and the Windows tray. Either mode loops only the selected upload.
- Uploaded playlist covers now offer Download Icon and Copy Icon Address in the playlist grid, playlist heading and icon editor. The rest of a playlist card retains its playlist menu.
- Music titles and owner names use a tinted hover and focus state. The Music screen suppresses selection of display text and ordinary artwork drags. Search, editing, scrolling and intentional playlist reordering remain available.
- Participant, camera and screen tiles no longer show a tooltip when hovered. The viewer eye and individual call controls remain available. The class tooltip uses five pixels on either side of its divider.
- The package timestamp is in build-info.json. See RELEASE-INSTRUCTIONS.md for publication and VALIDATION.md for results.

---

## Prior release

# Shared web 2026.11.18-1 and Windows 2.0.3

- Each Music profile and the Music home screen now have a searchable, alphabetical Audio section. Upload directly or inside a playlist. Audio plays one track at a time. Right-click tracks to add them to an eligible playlist of your own.
- Uploaded covers appear beside listening details. Right-click an audio cover to download the original or copy its address. The sidebar, Music screen and Windows tray share a seek timeline and 5% volume steps. The loading spinner sits next to the title.
- The player fetches chunks in parallel, streams supported formats as playable bytes arrive and preloads the next playlist track. See MUSIC.md for cache and format behavior.
- Jam controls show Start Jam, End Jam or In Jam With based on membership. Message timestamps and Jam tooltips use the shared hover and exit motion. Ordinary sliders across the app use the sidebar Music timeline style.
- Avatar menus respond to schedule assignments and available music. In the schedule strip, clicking a picture selects that schedule. Schedule class tooltips list classmates. Member rows use one schedule or group icon, reveal clipped class names, and show classmates when present.
- Windows tray playback supports scrubbing, uploaded artwork, Jam status and the shared player’s control restrictions. The existing combined update icon delivers the Windows and shared revisions.

The package timestamp is recorded in build-info.json. Publication steps are in RELEASE-INSTRUCTIONS.md.

---

## Archived release record

# Shared web 2026.11.17-1

- Music sits between Admin Panel and Settings in the account dock. Avatar menus and profile actions offer **Schedule** and **Music**. Music controls and profile Play icons are centered.
- Listening status uses the Music note, track title and optional artist in the member list and activity tooltip.
- Start a Jam beside Stop in either player. Join from the profile of the host or a listener, including while paused. The host controls playback. **In Jam With** lists the other participants. Switching Jams asks for confirmation, and ending one stops playback for its guests.
- Playlist owners and Vinny can order playlists. Vinny can also create, upload, edit and delete items in other people's libraries while preserving their ownership.
- **In Call With** and **Viewers** show a display name beside each picture.

Windows native version **2.0.2** receives this release through the shared web updater.

---

# Shared web 2026.11.16-2 / native 2.0.2

Prepared locally, not published. The native build is necessary for the requested tray Music controls. The app remains based on shared web source and existing shared updates continue across Windows, mobile and browsers.

- Added the bottom-rail Music button and full-screen Music surface, six-playlist preview with View All, and live A–Z user discovery by display name.
- Added public playlists, ownership-gated editing, the existing icon crop pattern, RTDB-only audio uploads, track metadata/icons, relative added dates, duration, right-click actions, deletion and reorder controls.
- Added one persistent player with sidebar/footer controls, shuffle, repeat, seek, Previous's four-second behavior, immediate local pause/stop, 0–200% gain, Media Session controls and next-track prefetch.
- Added profile listening progress and public Music profile entry. Connected Spotify and playing chat media interrupt Music; calls and navigation do not.
- Added native tray Music controls with validated IPC, stable user-data locations and unchanged updater verification/installation behavior.

See [MUSIC.md](MUSIC.md) for maintenance and practical playback/auth limits. No live account data, shared GitHub source, native release assets or production Firebase rules were changed.

---

## Historical content from the supplied package

The following statements apply only to their named older releases. Current release instructions and validation are above.

# Shared web 2026.11.16-1 / native 2.0.1 unchanged

Prepared locally, not published. See [VALIDATION.md](VALIDATION.md) for the current package timestamp, completed checks and final upload counts.

- Replaced the GradeSort landing, login and creation presentation with the video-reference sign-in card: Segoe UI, the four-color Microsoft mark plus Chat App wordmark, the supplied unchanged photo with a CSS dark overlay, sliding step transitions and loading dots. This continues to authenticate only Chat App passwords.
- Require one of the six configured addresses before entering an app password. All six are interchangeable local UI values; they do not prove ownership or grant server authorization, are not sent or persisted, and never choose the account. Existing saved sessions deliberately retain their normal automatic restoration.
- Show **Password not found** beneath the password field for an unknown app password. Route “Can't access your account?” to the matching account-creation screen. Remove the separate start-page marketing content, sign-in options and forgot-password text; no passkey/account suggestion is supplied by the app.
- Keep generated-password and other pre-login notices in a separate auth-only renderer, with a source maintenance note forbidding its use inside the regular app. Preserve normal in-app toasts. Suppress regular custom tooltips and popups on auth screens.
- Set the default browser tab title to **Sign in to your account** and use the requested favicon. Preserve account tab preferences after sign-in and the existing native window identity.
- Make Home Recent Links rows expand and wrap long domains/paths on narrow, desktop and short landscape layouts. Preserve the complete destination and copied URL.
- Simplify contextual labels to Pin/Unpin, Leave, Edit and Copy, with Name/Icon in the room Edit group. Keep distinct asset and destructive actions explicit.

This release changes shared web source only. All 98 supplied desktop files, including the native public key, are byte-identical. Native version remains 2.0.1. No EXE was launched, rebuilt or repackaged, no signed native manifest was created or changed, and no native-device or antivirus tests were performed. No shared source or native assets were published by this work. Existing desktop/mobile/browser update paths and admin update URLs remain unchanged.

Maintenance: keep the six-address gate and auth notices in `js/accounts/sign-in-ui.js`; keep auth styling scoped in `css/auth-refresh.css`; preserve the existing password/session logic and main-app toast boundary. See [UPLOAD-AUTH-TABS.md](UPLOAD-AUTH-TABS.md) for detailed ownership and regression instructions.

---

## Historical release notes retained from the supplied source

The release descriptions and test/publication statements below apply only to their named older versions.

# Native 2.0.1 / shared web 2026.11.13-5

Prepared locally November 13, 2026. Publication remains the release owner's step.

This release fixes the remaining taskbar bug demonstrated in the full 28.17-second recording. Windows had registered Chat App's AppUserModelID to a Start Menu shortcut targeting the old 1.7.2 runtime. Pinning the running 2.0.0 window could reuse that registration and later launch 1.7.2, whose lack of in-app updating correctly triggered the shared Update Required screen. Version 2.0.0 repaired existing taskbar links but missed this Start Menu registration.

Version 2.0.1 repairs recognized Start Menu registrations and existing taskbar pins before acquiring the single-instance lock or displaying a window, and maintains a shortcut to the real portable EXE. It preserves calls/drafts in any already-running instance rather than terminating it. Cached-runtime recovery, the stable app ID, profile paths, sign-in, preferences, verification and the combined update icon remain intact. The latest 2026.11.13-4 Home poll and Update Log features are retained. New migration links saved by this shared version record native minimum 2.0.1; the migration gate is not suppressed.

Open 2.0.1 once from a permanent writable folder to repair the registered app entry. If an older host is still open, finish its work and Quit it before the next cold launch. Future native updates replace the same portable EXE through the combined icon. See RELEASE-INSTRUCTIONS.md and VALIDATION.md.

---

## Previous release history

# Shared web 2026.11.13-4 / native 2.0.0 unchanged

Packaged 2026-11-14T01:15:24Z (November 13, 2026 at 08:15:24 PM EST). Prepared locally, not published.

- Home poll filters now read To Vote and All Open.
- Update Log uses native Shift + Enter newline editing, preserving text selection and undo. Plain Enter remains suppressed; Shift + Escape is no longer the newline shortcut.
- Preview sits immediately left of Save and displays the current saved or unsaved draft through the exact same modal renderer as delivered update logs. Closing returns to the retained Admin Panel draft and scroll position. Preview performs no save, release lookup or seen-receipt write.
- Headings # / ## / ###, small text -#, bold ** and italic * render identically in preview and delivery. HTML stays escaped.

Publish the complete ZIP contents through the existing shared GitHub release workflow, one top-level folder at a time followed by the loose root files. No enclosing folder, backend deployment, native release or admin URL change is required. Existing EXEs receive these changes through their shared web updater. To publish an Update Log, publish the shared source first, then save its text in Admin Panel. Preview does not publish it.

No EXE was launched, rebuilt or repackaged; no native manifest or verification key changed. No signing material was accessed. No native-device or antivirus tests were performed. No GitHub source/assets were published by this task.

| Selection | Files |
| --- | ---: |
| Loose root files | 21 |
| activities | 19 |
| activity-modules | 9 |
| assets | 11 |
| backend | 6 |
| call-modules | 19 |
| css | 44 |
| desktop | 98 |
| js | 89 |
| scripts | 5 |
| tests-release | 40 |
| tests | 98 |
| vendor | 3 |

---

## Previous release (historical)

# Shared web 2026.11.13-3 / native 2.0.0 unchanged

Packaged 2026-11-14T01:02:31Z (November 13, 2026, 08:02:31 PM EST). Prepared locally, not published. The existing EXE receives this release through its shared web updater. No native build, manifest or admin URL change is required.

- Home polls use live room-index and poll subscriptions, including new polls, edits, votes, deletion and expiry. Refresh Polls is removed. Clicking a poll opens its room and highlights the exact original message.
- Each Home collection scrolls independently with its position and keyboard focus retained during live updates. The dashboard still fits the available window and uses tabs in compact layouts. Removed card paging and the Today/Reminders subtitles. Headings now read Today, Reminders, Open Polls and Recent Links; the link-search placeholder is unchanged.
- Home labels use ordinary UI cursors and cannot be selected; the search field remains editable.
- Typing fields share the composer/search surface across login, admin, settings, schedules, notepad and screenshot tools. Manual resizing is disabled, including dynamically created fields. Annotation text retains its chosen on-image appearance. The maintenance rule is a comment in styles.css.
- Account preferences update across signed-in sessions without echo writes or loss of unfinished drafts/carets. Room membership and metadata listeners reject stale callbacks after account changes. Room search uses the next render frame.
- Both schedules labels now read Schedule. Existing calendar sizing, Update Log eligibility and reply formatting are retained.

Regular calendar, reminder, schedule, message, profile, membership and room metadata views already use database subscriptions. The technical Admin database inspector retains bounded 15-second shallow discovery for entirely new arbitrary branches; loaded scalar changes/deletions update live. Network availability still governs delivery.

See HOME-SCHEDULES-UPDATE-LOG.md for maintenance, RELEASE-INSTRUCTIONS.md for publication, and VALIDATION.md for checks and limits.

---

## Previous release (historical)

# Shared web 2026.11.13-2 / native 2.0.0 unchanged

Packaged 2026-11-14T00:22:21Z (November 13, 2026, 07:22:21 PM EST). This release is prepared locally. It has not been published. The existing EXE receives these changes through its shared web updater; no EXE or native manifest is generated for this package.

- Home is an app hub for today's shared calendar notes, personal reminders, open polls and recent shared links. It replaces the secondary room list and removes New Room. Its layout follows the available workspace; compact layouts use tabs and paging instead of a scrolling dashboard.
- Schedules uses a persistent person picker, weekday tabs and a clean agenda. The day-type badge has no Admin Panel tooltip.
- The entire month calendar fits the visible workspace, including four-, five- and six-week months. Day pages and editors retain their normal scrolling.
- Vinny can save formatted release notes at the bottom of the Admin Panel. A verified, updated account sees Update Log once, after login. Empty logs show nothing.
- Reply previews render bold/italic safely in both the composer and sent replies. The retained-pin divider cannot be selected by dragging.

See HOME-SCHEDULES-UPDATE-LOG.md for behavior and maintenance, RELEASE-INSTRUCTIONS.md for publication, and VALIDATION.md for actual checks and limits.

---

## Previous release history

# Native 2.0.0 / shared web 2026.11.13-1

Prepared locally on November 13, 2026. Publication is a separate release-owner step.

The Windows host now retains the real portable EXE as its taskbar relaunch and native-update target. A direct launch of a 2.0.0 cached runtime recovers that EXE before taking the single-instance lock. Existing taskbar shortcuts that identify this app's legacy versioned runtime are repaired when 2.0.0 opens normally. The taskbar icon references the shell-readable EXE. Sign-in, preferences, shared web updater, user-data paths, calls and the single combined update button are retained.

The Admin Panel's Older EXE download help now describes the 2.0.0 taskbar and updater repair. A newly changed migration URL records native minimum 2.0.0. Working 1.7.8+ hosts continue updating in-app. An old pin still executes its old code until 2.0.0 has opened once; open the existing portable EXE and update in-app, or open the new 2.0.0 EXE once for migration.

See RELEASE-INSTRUCTIONS.md for publication order and settings, VALIDATION.md for evidence and limits, and NATIVE-UPDATES.md before maintaining the updater. Keep the portable EXE in a writable folder at a stable path after pinning it. No Google Drive download is required for routine signed native releases.

---

## Previous release history

# Shared web 2026.11.10-1 / native 1.7.11 unchanged

Packaged 2026-11-10T22:45:11Z (November 10, 2026, 05:45 PM EST). Prepared locally; not published.

- Spotify's sidebar player uses the shared blue progress accent, shared control colors, and refined spacing/artwork corners.
- Pending uploads have a centered filename, top-right percentage/bar, and one heavily blurred still. Removed the old preparing-preview surface and center percentage overlay.
- Upload progress and thumbnails synchronize through the room database for receivers. Updates are coalesced; no repeated capture or video playback is used.
- Home, create-workspace and login have new responsive GradeSort layouts, no blue dot, and consistent shared controls and branding across screen sizes.
- Reader receipts say exactly `Seen by`.
- Browser title/icon share one lifecycle: cached account identity applies at startup/login, navigation cannot overwrite it, stale async responses are ignored, and logout immediately restores GradeSort defaults. Native window handling is excluded.

This is a shared-web-only release. Existing Windows, mobile and browser clients receive it through their existing shared web update systems after publication. The supplied EXE reports product version 1.7.11.0; desktop/package.json remains 1.7.11. No EXE was built, repackaged or launched. All 96 desktop files and the public verification key remain byte-identical. No private signing key was opened, copied or packaged. No native manifest or admin setting change is required.

Maintenance: `UPLOAD-AUTH-TABS.md`. Publishing: `RELEASE-INSTRUCTIONS.md`. Actual checks/limitations: `VALIDATION.md`.

---

## Previous release documentation (historical)

# Shared web 2026.11.09-5 / native source 1.7.11 unchanged

Packaged 2026-11-10T03:26:02.568Z (November 09, 2026, 10:26 PM EST). Prepared locally; not published.

- Screenshot editor zoom now says “Scroll to Zoom · Click to Reset,” using the shared tooltip.
- Chat file/sticker surfaces and close/dismiss/X controls no longer show tooltips. Accessible labels remain; file-download and playback controls keep their tooltips.
- Room plus and arrow controls match. Highlighted room-toolbar, composer-tool and admin/settings buttons have transparent resting backgrounds and retain hover feedback. Send stays blue. The ordinary call icon matches adjacent icons; green call states stay green.
- Sidebar navigation uses equal centered targets and block SVGs to fix uneven icon placement.

Shared web only: the existing EXE receives this release through its shared web updater after publication. No EXE, native manifest, native version, signing key or admin setting change is needed.

Maintenance: see UI-CONTROLS.md; run npm run test:ui-refinements and npm run test:ui-consistency.

---

## Previous release documentation (historical)

# Shared web 2026.11.09-4 / native source 1.7.11 unchanged

Package timestamp: 2026-11-10T03:05:30.765Z (November 09, 2026 at 10:05 PM EST). Prepared locally; not published.

- Unified the shared app's action buttons around one font, 10px shape, border, hover, pressed, disabled and keyboard-focus treatment.
- Removed the blue/green button glow and gradients; preserved primary, destructive, saved, selected and call-state meanings.
- Extended the existing composer tooltip portal across app controls. Icon actions receive meaningful labels; self-explanatory text buttons lose redundant tooltips and native title duplicates.
- Matched ordinary and rich tooltip surfaces while keeping classmates, member status and timestamp behavior.
- Standardized app-owned short labels to natural Title Case, preserving acronyms, small connecting words, sentence descriptions and all user-written content.
- Added future-maintenance guidance and desktop/mobile regression checks for controls, states, tooltip behavior and accessibility.

This is shared web only. The existing EXE receives the changes after publication through its existing shared web updater. No EXE build, native version bump, signed manifest, backend deployment or admin setting change is required. All 96 supplied desktop files remain byte-identical. No private signing key was opened.

## Maintenance

Read `UI-CONTROLS.md` for the shared style tokens, component conventions, tooltip policy and label casing rules. Keep `css/ui-controls.css` after feature styles and before `css/scrollbars.css`; keep `ui/tooltips` immediately after `ui/sidebar` in the module manifest. Add controls to the shared system rather than introducing feature-specific visual overrides. Test selected, disabled, danger, call, saved and compact states as well as default appearance.

Run `npm run test:ui-consistency`, `npm test`, `npm run test:browser`, the affected feature's browser tests and `npm run audit:upload`. Tests use isolated fixtures. Source packaging excludes dependencies, build output, captures and private material. Read `NATIVE-UPDATES.md` before future updater work.

---

## Previous release documentation (historical)

# Shared web 2026.11.09-3 / native 1.7.11 unchanged

Package timestamp: 2026-11-10T02:38:57.585Z. Prepared locally; not published.

- Day details are left aligned with the same modest page gutter as the month calendar.
- Each saved note card fits its own text and controls, stays within the viewport, and resizes after edits.
- Short note lists use normal native page scrolling, with no one-frame scripted scroll jumps.
- Overflowing lists contain scrolling at both boundaries; only the note list scrolls while the pointer is over it.
- Month title and controls align with the calendar edges, including compact/short windows. The grid itself is unchanged.

This is shared web only. No EXE, native manifest, updater code, backend deployment or admin setting change is required. Existing desktop/mobile/browser clients receive the update through their existing shared update systems.

## Maintenance

Calendar maintenance: keep the shared gutter on .calendar-page. Day cards use intrinsic width, bounded for readable long text and narrow screens; never center the day column or stretch saved cards across it. Editing has a usable bounded editor width, and saved cards recalculate their own width from content/actions. The final .calendar-page .calendar-toolbar rule cancels horizontal compact-mode padding without moving the grid. Preview ResizeObserver measurements add is-scrollable only for real overflow. Nonoverflowing previews use overflow:clip and native ancestor scrolling; overflowing previews use overflow-y:auto and overscroll-behavior-y:contain. Do not reintroduce a wheel handler or assign scrollTop for page handoff. Observe new previews, unobserve removed month cells and disconnect on page teardown. Keep css/scrollbars.css last for shared scrollbar defaults. Run npm run test:calendar-layout, npm run test:calendar, npm run test:calendar-order and npm run audit:upload after relevant changes.

---

## Historical release notes

# Shared web 2026.11.09-2 / native 1.7.11 unchanged

Package timestamp: 2026-11-10T02:18:23.571Z. Prepared locally; not published.

- Repeat replaces Repeat Event and uses the identical compact checkbox switch as Remind me. It still resets off after adding a note. Repeating Notes uses the same switch style.
- The calendar, Add Notes and Repeating Notes share a modest responsive 10–20 px gutter on each side, retaining calendar information space.
- Day details use a centered, bounded content column with aligned headings, note cards and actions. Order controls sit beside the author, and long note text wraps within the card.
- A shared slim rounded blue-gray scrollbar replaces per-panel variants, including the Windows arrow buttons. It is the default for current and future shared app scrollers and bundled first-party game documents. Standard scrollbar styling provides a fallback for browsers without WebKit pseudo-elements; touch platforms retain their platform rendering where custom scrollbars are unsupported.
- Short note lists pass wheel input to the calendar page. Overflowing lists scroll only over their previews; their boundaries pass scrolling back to the page. The day heading and remaining cell space scroll the page normally. Ctrl/Shift/horizontal wheel gestures retain their existing behavior.

The missing marked storage-worker appendix has also been restored verbatim to README.md from the earlier supplied source so its existing integration tests and maintenance source remain available. No storage service was redeployed.

This is entirely a shared-web release. No EXE, native manifest, native source, updater behavior, account storage, Firebase data or recurrence scheduling changes are required. Upload the complete source through the existing shared GitHub update workflow. The existing EXE receives this release through its shared web updater. No admin setting needs changing.

See README.md for maintenance, RELEASE-INSTRUCTIONS.md for upload details, and VALIDATION.md for current checks. The previous release record below is historical, not a claim that its native or backend artifacts have been published.

---

# 2026.11.09-1 / native 1.7.11

Build/package timestamp: 2026-11-10T01:33:49.092Z. Prepared locally for the release owner.

## Messages, unread badges and presence

- Web badges and the Windows taskbar use the same actual unread incoming-message set. Deleted messages, old retained pins and stale sender-maintained counters no longer inflate it. A bounded existing message stream serves normal reads, with an exact query for larger unread gaps.
- Read updates require a visible, active session and an acknowledged online presence write. Idle/background windows cannot advance seen markers. Reactivating and reading clears unread without sending a message.
- Every tab/device owns its connection record and disconnect cleanup. Reconnects arm cleanup before publishing presence. Server-adjusted expiry removes abandoned sessions; active/native leases expire after 45 seconds, background-web/legacy leases after 90 seconds. Normal closes use immediate best-effort removal and server disconnect cleanup. Crash/network detection is bounded, not instantaneous.
- DND is available only in the EXE. Displayed DND requires a live native session; a stale account setting cannot make a browser-only user DND. Remote policy changes and deadlines refresh the roster. Existing DND expiry behavior is preserved.
- Pins retained from before the latest clear are grouped above a thin labeled blue divider. New pins stay in their normal timeline positions until a later clear. Removing the last retained pin removes the divider.

## Calendar and library

- Repeat Event uses the Settings toggle and resets off after an addition. It creates the selected weekday's remaining occurrences through the real current month. Future months are generated as they begin, using the creator's saved time zone.
- Repeating Notes shows original authors and supports pause/resume, current-month series editing, deleting all linked occurrences, and viewing/editing/deleting individual current-month occurrences. Individual deletion records an exclusion so it stays deleted. Pause preserves existing notes; resume generates from today forward.
- Atomic per-day duplicate checks normalize capitalization, Unicode and whitespace. Concurrent clients cannot create the same normalized note twice.
- Calendar, Add Notes and Repeating Notes share a full-width layout. Day cells show scrollable note previews instead of the previous two-note cutoff. Truncated text uses the existing custom tooltip and dismisses on scroll.
- The HTML library removes the redundant sidebar heading, adopts Settings-style buttons and places search beside the modal title.

## Windows host

- Online native rings and pings are delivered even when their room is focused. DND suppresses them. Existing push-notification preference is respected for pings.
- Nonactivating top-right popup windows maintain topmost placement, use disjoint ring/ping areas, recover crashed renderers, and retain unseen burst overflow. No high-frequency mouse polling or runtime shell scripts were added.
- Ring body hover animates to 30% opacity; Join/Decline buttons restore full opacity. Pings have an accessible SVG close button and app-matching layout. Tray labels are Open and Quit.
- Windows secure desktop and exclusive-fullscreen applications can prevent ordinary desktop overlays. Ordinary fullscreen placement and no focus theft are tested; universal coverage and zero performance impact cannot be guaranteed.

## Delivery

Native changes require 1.7.11. Shared GitHub updates still reach the browser, mobile and native hosts. Original update verification key, verification and safe native-first replacement/restart remain intact. The new Firebase scheduled calendar function is prepared but must be deployed to generate new months while every client is closed; active clients also reconcile automatically.
