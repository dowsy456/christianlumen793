# November 24, 2026 · Web 2026.11.24-2 · Windows 2.0.7

Built locally on Windows x64 on November 24 at **10:28:50 p.m. Eastern**. The exact UTC timestamp is in `build-info.json`. The supplied source contained 498 files. The supplied Windows portable identified itself as 2.0.6. The owner publishes the new shared code and native assets following RELEASE-INSTRUCTIONS.md.

## Room entry, scrolling and navigation

These measurements compare the supplied app and the revised app in local Chrome with mobile touch emulation. Room tests use the same synthetic data with 100 ms database latency. Cold values are individual runs. Warm values are medians of five runs. The large room first loads 50 messages.

| Measured operation | Supplied | Revised |
| --- | ---: | ---: |
| Cold open, 10 messages | 202 ms | 162 ms |
| Warm open, 10 messages | 185 ms | 50 ms |
| Cold open, 12,000 messages | 309 ms | 240 ms |
| Warm open, 12,000 messages | 345 ms | 145 ms |
| Load an older 50-message page in the large room | 157 ms | 130 ms |
| 200 offscreen read-receipt checks | 57 ms | 0.8 ms |
| Scroll frame, 95th percentile | 7.1 ms | 7.1 ms |

The older-page test retained the same anchor with 0 px drift. A held or reversing finger could continue scrolling variable-height rows without consuming more pages in the same gesture. Receipt checks on offscreen rows made zero paint-stack scans. HTTP, local file and mobile-emulated room tests covered the 150-row mounted window, live edits, pins, rapid switching, membership revocation, and messages arriving after sign-out. A separate two-account test verified that the destination room retained its new draft.

Seven-run median synchronous navigation-handler durations fell from 90.6 to 25.4 ms for Room to Schedules, 51.4 to 24.4 ms for Schedules to Home, 38.8 to 16.6 ms for Home to Calendar and 53.2 to 6.3 ms for Calendar to Schedules. The fixture had 75 messages at a 390 px viewport. Tests exercised rapid page changes, directory subscription cancellation and recovery, a late callback, active calls, ordinary room taps and slow swipes on room and member rows. Network conditions, attachments and device rendering costs affect actual times.

## Audio, polls and viewer controls

- A local Chrome WebRTC receiver measured distinct tones from the external system input, HTML Hub, a nested document, an inline room attachment, the boosted media player, a sandboxed chat HTML file and an embedded Office media element. Music and remote-voice reference tones stayed excluded. Stopping the permitted sources removed those tones. Disabling share audio removed the outgoing audio track. Third-party frames or protected players may prevent capture.
- A separate two-process Windows Electron 45.5.0 test used real Windows loopback with the production capture modules. The external test tone measured −43.6 dB, explicitly included application playback −43.5 dB and excluded application playback below −120 dB on the final run. The source track ended when sharing stopped. No physical phone, second PC, or live production call was used for these measurements.
- The viewer decoded a short synthetic video at desktop and 320/390 px mobile widths. Tests exercised all eight speed presets, typed custom speed validation, 200% volume, mute/restore and slider unmute. Both focused call tooltips opened and dismissed on touch. The speaker controls also passed across Music and a three-client Jam. Poll tests verified composer previews, sent replies, older stored fallback text, the poll question, and the rendered glow.
- All 873 tests in the local Node unit sweep passed. Browser suites additionally exercised activities, room entry/history, calendar and schedules, composer and roster behavior, media controls, and file sharing. Test fixtures and signal measurements do not measure production Internet performance.

## Native package and update verification

- Read the title-bar stylesheet in the runtime launched from the supplied portable and confirmed its 1 px divider. The final portable reported a 0 px bottom border for green and blue wallpaper and the default theme. Also passed the packaged Music tray mute/restore (8 Music checks), cached-runtime forwarding, and startup via the isolated Windows Start Menu shortcut.
- The updater left web 2026.11.24-2 pending under the supplied Windows 2.0.6 host when the fixture required 2.0.7. On launching the final portable, it loaded the local staged release, wrote its known-good marker and cleared the pending marker. The final portable’s Electron network path followed 3 real HTTPS redirects and verified the live **2.0.5** release without installing it. This predates publication of 2.0.7.
- Compared all 302 files inside the outer portable with its staged runtime, and all 224 shared runtime files and 52 packaged native sources/assets with the release source. The app’s own shared updater validated the full bundled web directory.
- The original public key verifies the owner-signed manifest for **159,410,176 bytes**, SHA-256 `ab7e95bda20f0c8254e9d7917ce791200c88634bd8f88f58ec296055eb47bd73`. The production verifier also rejected mutations to the size, version and download URL. Avast One scanner 26.11.11250.0 returned 0 for those exact bytes. Windows Authenticode reports `NotSigned`.

## GitHub browser upload audit

The included recursive audit reports **504 source files**. Every supplied source path is present. Generated dependencies, build directories, test captures and private signing material are excluded. The 1,522-byte color-bar video in the test fixtures is a synthetic input for future viewer checks.

| Upload selection | Files |
| --- | ---: |
| Loose root files | 23 |
| activities | 21 |
| activity-modules | 9 |
| assets | 13 |
| backend | 6 |
| call-modules | 20 |
| css | 45 |
| desktop | 100 |
| js | 91 |
| music | 10 |
| scripts | 6 |
| tests-music | 6 |
| tests-release | 53 |
| tests | 98 |
| vendor | 3 |

## Future checks

From the source root, install the two locked test toolchains with `npm ci` and `npm ci --prefix desktop`. Run `node scripts/audit-upload-folders.cjs` after adding files. Exercise `tests/room-loading.browser.cjs`, `tests-release/mobile-history.browser.cjs`, `tests-release/swipe-navigation.browser.cjs`, `tests-release/reply-previews.browser.cjs` and `tests-release/media-control-ui.browser.cjs` after a navigation or viewer change. Run each browser test with Node. CALLING.md lists selective-audio tests and capture limits. NATIVE-UPDATES.md covers packaged update checks. Compare the portable's bundled web files with the shared release source. Verify the signed manifest against the final portable bytes.

---

# November 24 release validation

Shared web **2026.11.24-1** (mobile revision **2026112401**) and Windows x64 **2.0.6** were prepared on Windows from the supplied 498-file source ZIP and 2.0.5 portable EXE. The final native build started at **2026-11-24 21:33:20 Eastern**. These are local release artifacts. Publication and production device delivery are separate steps.

## Windows and updater

- The supplied 2.0.5 EXE reproduced the fixed-color title bar with a decoded blue wallpaper. On the final 2.0.6 EXE, Windows reported the green tint `#0f240f`, blue tint `#0f0f24`, and restored default `#17212b`. The portable launcher, cached-runtime forwarding and isolated Windows shortcut passed. The packaged Music tray passed its control and state checks. All eight packaged notification checks passed after giving the fullscreen fixture focus on a repeat run. Windows verified the passthrough ring body, independent button and ping hit targets, and DND. The initial interrupted frame sample was excluded from performance results.
- The final portable contains Electron 45.5.0 and Chromium 156.0.8078.109. All 301 files embedded in the portable matched the staged build byte for byte. All 223 shared web files and 52 native source/asset files matched their packaged copies. The production shared updater accepted the bundled app. The supplied 2.0.5 host also launched all 223 new shared files from an isolated staged-release fixture and marked web 2026.11.24-1 known-good after successful startup.
- The final EXE followed three real GitHub HTTPS redirects through Electron's network stack and verified the published 2.0.5 executable from the stable feed in an isolated profile. The diagnostic staged its download without installing it. Separate automated replacement tests exercised the compiled helper's verify, replace, recovery and relaunch steps on Windows fixtures. The 2.0.6 files were prepared locally.
- The original Ed25519 public verification key matched the input ZIP byte for byte. The release owner's private key signed the exact version-specific 2.0.6 manifest. The production verifier accepted the 159,400,448-byte EXE with SHA-256 `a4c5e635228b3c076f9679869066516a16069f9e979cd5239e0e706d54ed63b4` and rejected edits to the signed size, URL and version. A scan for the supplied private key's contents across the source and portable payload found no copy.
- Avast One's targeted scanner 26.11.11250.0 exited 0 on those exact EXE bytes. Windows reports Authenticode status `NotSigned`.

## Calling

- On the same Windows machine, the supplied foreground desktop compositor repainted an unchanged 1280 × 720 source 30 times in one second. The updated compositor repainted it zero times during the equivalent interval. The drawing test checked appearance, expiry, resize and cleanup using actual outgoing video frames.
- Six Chrome clients established all 30 remote audio endpoints in 4.404 seconds. Five viewers received 1280 × 720 screen video in 2.296 seconds. A camera viewer reached 720p in 0.860 seconds. RTP continued through concurrent camera, screen and voice, peer recovery, and rapid leave/rejoin. Three clients also passed two simultaneous shares with independent screen audio, volume and deafen.
- These call measurements used real WebRTC, host ICE, synthetic media and isolated Firebase fixtures on one PC. Windows source enumeration, selected-monitor capture and track cleanup also ran on the native development runtime. Internet TURN paths, internet latency, physical Android/iOS devices and live production calls were outside these measurements.

## Whole-package and application checks

- All 866 baseline unit tests passed. All **873** updated unit tests passed, including **109** focused calling tests. Separately, Chromium exercised the real bundled Firebase SDK with a fixture transport, browser/file startup, live chat, mobile room history, recordings and file controls, account sign-in, media previews, activity loading, music, calendar sync, and shared-revision refresh from a retained HTTP cache. Representative document fixtures rendered real PDF pixels and PowerPoint and Word text.
- The three package manifests and lockfiles were refreshed against stable releases and checked with npm audit. Existing classic-script Three.js content keeps its compatible global fallback. On Windows, existing-format synthetic Spotify credentials decrypted using Electron's asynchronous storage API. The Node.js 24 calendar functions loaded locally. Production credentials and deployed functions were untouched.
- Every source JS/CommonJS file parsed and all JSON decoded as strict UTF-8. All 56 CSS files parsed, the six HTML documents were checked for duplicate IDs, and all PNG, ICO and JPEG assets decoded after the JPEG repair. Both built-in games ran under file and HTTP origins and requested scripts and styles with the active release revision. The Pages asset reference check passed.
- The historical external SVG browser test requires `chaptersauto.svg`, which was absent from the supplied ZIP. That test was unavailable in both baseline and updated runs. The bundled app's own startup, GitHub updater and native network checks are independent of that external file.

## GitHub browser upload audit

The ZIP retained all **498** original paths and contains **23 loose root files**. `index.html` is at the archive root. All folders below include their descendants. Source files were compared byte for byte with the ZIP after compression. Generated dependencies, dist directories, test captures and private signing material are excluded.

| Selection | Files | Selection | Files |
| --- | ---: | --- | ---: |
| Loose root files | 23 | desktop | 100 |
| tests | 98 | js | 91 |
| tests-release | 48 | css | 45 |
| activities | 21 | call-modules | 19 |
| assets | 13 | music | 10 |
| activity-modules | 9 | backend | 6 |
| scripts | 6 | tests-music | 6 |
| vendor | 3 | | |

Run `node scripts/audit-upload-folders.cjs` before each source release. For future native updates, repeat the packaged stable-feed test, sign the final EXE after building it, and verify the exact signed bytes before publishing.

---

# Shared web 2026.11.21-7

Keep the visible action label in activity-modules/library-ui.js aligned with the selected file context. Preserve the download action ID and verify the downloaded filename and contents when changing this menu.

# Shared web 2026.11.21-6

Contextual action labels use the existing action IDs. The source ZIP retains all 498 supplied source files. The upload audit counts 23 root files and 14 top-level folders, with desktop the largest at 100. Windows host 2.0.5 uses the shared web update. The UTC package timestamp is in build-info.json.

## Earlier validation

# Shared web 2026.11.21-5

The supplied source was shared web 2026.11.21-4. The installed Android package identifies itself as `app.chat.mobile`, version 2026.10.25, version code 20261025. The Windows source identifies its host as 2.0.5. The UTC source package time is in `build-info.json`.

## Local results

- Touch input in Chrome reproduced two scrolling failures on the supplied source. The repaired timeline kept the same visible message within two pixels as an older page arrived and continued scrolling under the same finger. Chat also accepted repeated scrolling after a pause. A separate 12,000-message fixture passed on HTTP, file and phone layouts with 50-message pages and a 150-row limit.
- Desktop and mobile Update Log tests verified published text stays unchanged while editing. Mobile Return and desktop Shift+Enter inserted new lines, and Save preserved them. Settings tests checked the shortened button labels, accessible names, background label capitalization and drag controls.
- With one user's network reads held back, the first available profile picture appeared in both chat and the roster. Reopening a known room populated its cached members and picture in the same room-open call. Late callbacks from the previous room were ignored. Class tooltip tests exercised the visible icon and text, clipped titles, classmates and the overflow indicator. Settings stayed open through an actual song end and displayed the next song while retaining a typed display-name draft.
- Vinny edited a peer's message through the desktop and touch actions menus. The original author, timestamp, reactions and previous text survived, and the editor was recorded. An ordinary member with the display name Vinny could not begin the same edit.
- The supplied APK's v2 and v3 signatures verified. Its bundled shared web predates Music. In a JVM harness with local repository and Android storage fixtures, its original compiled updater rejected bridge 2 and accepted bridge 1, extracted the shared release, activated it, and waited for readiness before confirming it. A separate Chrome test ran the staged app at the Android appassets origin with the host's bridge interface, opened Music from the drawer and exercised Android Back.
- On a touch-controlled, decoded MP3, the supplied player issued four decoder seeks during one backward drag. The updated player previewed intermediate positions and issued one decoder seek at release. When target bytes were withheld, the selected time remained visible and the old position remained muted. Supplying the missing bytes resumed the chosen position at the saved volume. Cross-client Jam, range loading and desktop and mobile player tests passed.
- The shared unit runner passed 584 tests and the release unit runner passed 63. Chrome also passed file and HTTP startup, mobile navigation, retained pins, room renaming, profile layouts, Spotify settings, attachment editing, and wallpaper appearance on desktop and phone layouts. The retained-browser-cache upgrade test and the shared static deployment packaging test passed. The existing Windows host's shared-directory validator accepted the release.

These checks used local fixtures. A first download of an image or uncached song range still depends on connectivity and decoding. Device speaker latency, a physical Android installation, a packaged Windows launch and a live GitHub update were outside this run. The release was prepared locally for the owner to publish.

## GitHub browser upload audit

The included audit counted **498 files**, including all **494** paths from the supplied ZIP. All 100 desktop files match the input byte for byte. Archive verification checked the CRCs and compared each extracted file with its release source. There are **23** loose root files. Each count below includes the folder's descendants.

| Folder | Files | Folder | Files |
| --- | ---: | --- | ---: |
| activities | 21 | activity-modules | 9 |
| assets | 13 | backend | 6 |
| call-modules | 19 | css | 45 |
| desktop | 100 | js | 91 |
| music | 10 | scripts | 6 |
| tests | 98 | tests-music | 6 |
| tests-release | 48 | vendor | 3 |

## Earlier validation

# Shared web 2026.11.21-4

The input was shared web 2026.11.21-3. The supplied package identifies its Windows host as 2.0.5. These checks used local source, Chrome and fixture accounts. The UTC package timestamp is in `build-info.json`.

## Appearance

- Chrome compared painted properties after applying warm and cool images in desktop and phone layouts. The checks cover Home, the chat header, navigation rails, composer, search filters, tooltips, profile, receipts, document and audio controls, Music, Jam confirmation, call layouts, time display and screenshot editor. Removing the image restored the original control colors. The editor's selected swatch retained its drawing color.
- Mouse, keyboard and browser touch input exercised image positioning. Portrait and landscape previews matched the corresponding full-screen crop after rotation. Legacy image, blur and zoom aliases were exercised through remote settings updates, reset, removal and reload.
- A 121-input blur gesture performed zero settings writes, image source replacements or palette samples during the gesture. Changes persisted on commit.
- With a static wallpaper and the editor closed, a two-second chat sample recorded zero changes to the wallpaper layer's attributes or children and zero canvas pixel reads.
- A paired check used the same 2,560 × 1,440 JPEG, 1,440 × 900 viewport and 80 blur inputs, one per animation frame, on the supplied and updated packages. Median synchronous input time fell from 11.5 to 0.1 ms. The 95th percentile fell from 13.8 to 0.2 ms. Median frame interval fell from 48.7 to 7.0 ms, and the 95th percentile from 62.7 to 13.9 ms. The longest updated interval was 48.7 ms. These are local browser timings.

## Music

- A Chromium audio element played a 23,040,044-byte WAV served from the app under a subdirectory. A forward seek to 1:45 completed while an earlier chunk was withheld. A backward seek worked, and a cached play after reload issued zero Firebase audio-part reads. The fixture also exercised requests across chunk boundaries, suffix ranges and invalid ranges.
- On a direct-file launch, a constant-bitrate MP3 with validated fixed-size frames jumped to 2:31 while six intermediate chunks were withheld, then sought backward. A test with a variable-rate header verified that the fixed-stride optimization stayed off.
- Music suites exercised decoded MP3 audio over local file and HTTP launches, playlist navigation, live seeking, three-client Jam synchronization and owner controls. Production network latency and physical audio output timing were outside these checks.
- In the final local music run, the MP3 fixture started in 34–56 ms while the last part was withheld. Its cached replay took 13–17 ms with zero Firebase part reads. The large WAV produced a browser playing event in 111 ms and a seeked event in 4 ms. The direct-file MP3 produced a seeked event in 6 ms. Each seek check also confirmed the playhead advanced at its destination. All 13 music data tests passed.

## Packaging and release

- The shared regression runner passed 584 tests and the release unit runner passed 63. Chrome passed the file and HTTP app smoke checks, settings synchronization, profile/settings layouts, shared controls, tooltip behavior, Home, screenshot editing and call-menu Escape behavior. Both built-in games ran with the theme on file and HTTP. The Pages packaging test resolved runtime references and round-tripped the static files.
- The complete source inventory and the bytes of all 100 desktop files were compared with the supplied ZIP. The existing Windows host's shared-update directory validator accepted the shared source. The source package has no enclosing directory, generated development dependencies, build outputs, test captures or private signing key.
- Local preparation only. Production Firebase, physical phones, a packaged Windows launch, and a native GitHub redirect/update run were outside this shared-source test. Earlier Windows and Avast results below belong to their named releases.

### GitHub browser upload counts

All 484 original source paths are present. The upload audit counts all descendants in each selection. The 494-file package has 23 loose root files. Complete folder counts are activities 21, activity-modules 9, assets 13, backend 6, call-modules 19, css 45, desktop 100, js 91, music 10, scripts 6, tests 98, tests-music 5, tests-release 45 and vendor 3.

## Historical validation

# Shared web 2026.11.21-1 and Windows 2.0.5

The inputs were shared web 2026.11.18-3 and the supplied Windows 2.0.4 portable executable. Both original packaged popup and Music diagnostics completed. The popup test in that build checked the visual hover effect without checking which application would receive a Windows click.

The Music and call changes were exercised with isolated Chrome clients, generated audio and Firebase fixtures. Checks included a continuous move from playlist position 36 to 1, touch reordering, delegated upload to an empty profile, cross-owner editing, three independent Jam volume levels, listening state during a stale cache refresh, Escape on preview/joined/expanded call panels, and cross-room navigation to an older mention.

On the live stable feed, the original EXE received GitHub redirects from latest to v2.0.3. The signed manifest in that release refers to version 2.0.4 and its version-specific EXE URL returned 404. The final source package records the shipping binary checks below.

### Final packaged checks on Windows

- The final AMD64 portable EXE reports version 2.0.5, length 159,180,800 bytes and SHA-256 `b9716c00f5c30cc5af96791d70f2caf75e23c52611681300836fba55dc614b63`. The build ran on November 21, 2026. The build used the project's pinned Electron 44.4.2 archive after checking its SHA-256 against the locked Electron package. Windows reports the outer EXE as Authenticode unsigned. The separately signed Ed25519 update manifest uses the existing release key.
- Against an ordinary fullscreen Windows fixture, both alert stacks stayed on top and the underlying window retained focus. Windows hit-testing at the ring body returned the underlying window. The Join and Decline centers returned the dedicated controls window. The mention card returned its own window. The native diagnostic dispatched both ring actions, restored the minimized app on a mention click, delivered its exact room and message, recovered a pending mention after a renderer crash, and exercised DND and dismissal.
- In one run with the popup renderers warm, the interval from publishing a ring and mention to observing both windows visible was **10.1 ms**. Over about 1.25 seconds each, the fullscreen fixture recorded 180 idle frame intervals and 181 around the two arrivals. Both samples had a 7.1 ms 95th percentile and a 7.2 ms maximum. These figures measure foreground Chromium animation timing on this Windows machine. Physical mouse latency, game frame time, cold alerts, mixed-DPI hardware, exclusive fullscreen games and secure desktops were outside this measurement.
- The packaged tray decoded the test avatar and artwork, displayed the participant, dispatched the Jam action, adjusted a guest's volume to 55%, and kept guest transport locked. The bundled player decoded a silent WAV, sought, paused, changed gain and repeated through the tray controls. A separate two-client test clicked Return and Leave in the tray, rang the recipient, clicked Join on the ring card and verified live fixture membership in the same call instance.
- The final portable executable and its isolated Windows Start Menu shortcut both cold-launched the shared renderer with the correct portable update target. The packaged native network diagnostic followed real GitHub HTTPS redirects. The stable feed retained the published 404 described above. A separate run against the signed v2.0.2 reference release followed both manifest and EXE redirects, verified its signature, AMD64 format, byte count and SHA-256, and staged the verified download in an isolated profile. The normal updater still uses the configured feed.
- Avast One's installed targeted scanner, `ashQuick.exe` 26.11.11250.0, ran against the exact final EXE and returned exit code 0. No detection was observed. No separate scan report or full-system scan was obtained.

### Shared and native regression coverage

- The shared unit runner passed 584 tests, the desktop runner passed 203, the release unit runner passed 63 and the Music data suite passed 12. The desktop suite includes compiled helper replacement, rollback and restart, activity guards, native-first sequencing and successful-load promotion of staged web code.
- Chrome passed the full Music suite with local file, HTTP, mobile emulation, mouse/touch, mock Firebase and three Jam clients. Shared app smoke checks passed over file and HTTP. The web packager verified runtime references and archive contents. Room ringing, native menu rendering, older-message navigation and the dedicated desktop/mobile Escape checks passed.
- The Windows development Electron tests exercised repeated focus changes, roster activity, hover fading, actionable notifications and expiration. The two-client overlay browser fixture had one timeout while waiting for a display-name and speaking update. Repeated runs through that assertion passed. Live signed-in production accounts, a production upgrade to 2.0.5 and physical phones were not exercised.
- Three broader browser checks also fail on the original ZIP on this machine. The call UI suite expects an older hover color, the audio controls suite flags input-menu geometry at a 230-pixel viewport height, and the asset-update suite looks for an admin control in a hidden section after passing its retained-cache update check. The standalone GitHub-launcher check separately requires `chaptersauto.svg`, which the supplied archive does not contain.

### Source upload audit

All 480 original file paths are present. The three additions are the foreground helper source, its compiled binary and the call-menu Escape regression. The source ZIP contains **483 files**. The loose root selection has 22. Complete top-level folder counts are activities 19, activity-modules 9, assets 12, backend 6, call-modules 19, css 44, desktop 100, js 90, music 8, scripts 6, tests 98, tests-music 4, tests-release 43 and vendor 3. Development dependencies, build directories and test captures are excluded. The original embedded public key was compared byte for byte.

## Historical test results

# Shared web 2026.11.18-3

Chrome Music UI and player tests passed on desktop and emulated mobile, including computed hover styles on both pictured links. The existing packaged Windows 2.0.4 network test followed real GitHub redirects and verified the published 2.0.2 asset. No physical phone test was performed.

Upload audit: root 22, activities 19, activity-modules 9, assets 12, backend 6, call-modules 19, css 44, desktop 99, js 90, music 8, scripts 5, tests 98, tests-music 4, tests-release 42, vendor 3. Total 480.

---

# Shared web 2026.11.18-2 and Windows 2.0.4

The supplied source was shared web 2026.11.18-1. The supplied Windows EXE identified itself as 2.0.3. Both release artifacts and the signed manifest were prepared locally. Publication and a production upgrade to 2.0.4 are pending.

### Shared app

- Automated checks passed across 584 shared tests, 203 desktop tests and 73 release/Music tests. The Pages packager checked local runtime references and round-tripped its archive.
- Chrome tested Music over HTTP and a local file, a phone-sized touch viewport and an admin fixture. The checks exercised uploaded playlist artwork on cards, headings and editor previews, the original-image icon actions, editable inputs, display-text selection rules, intentional playlist reordering and title hover styles.
- With decoded audio on desktop and phone-size Chrome, Repeat started Off, One and All looped the same standalone track at its real end, and Off stopped at its end. Account settings restored all three modes after restarting the playback session. A three-client Jam fixture verified that a guest followed the host through a standalone loop.
- Pointer checks covered participant avatars and names, watched screens and cameras, and available screen and camera offers. The dedicated viewer control still opened its roster. Focused call controls passed on desktop, expanded desktop and phone-size touch layouts. Shared tooltip and member-roster checks passed. Chrome measured 5 CSS pixels from the class name to the divider and 5 from the divider to In Class With.
- The broader call-menu browser suite still stops at its older roster-button hover-color assertion. The same assertion failed on a separate extraction of the supplied ZIP. The shared control stylesheet resolves to #222c38 after the transition. The old assertion expects #263240.

### Packaged Windows checks

- Ran music and real-network diagnostics on the supplied 2.0.3 EXE, then music, launch and real-network diagnostics on the final AMD64 2.0.4 EXE with isolated profiles. The launch check confirmed the shared renderer was ready, retained the portable update target, and exercised shortcut registration and repair using local fixtures.
- The final tray sent Repeat All, One and Off through the production IPC bridge to a standalone track. It also loaded uploaded artwork, sought in decoded WAV audio, applied volume in five-percent steps, paused, and kept playback alive when the main window was hidden.
- Both packaged Electron builds followed the live GitHub manifest and EXE redirects to release-assets.githubusercontent.com. The feed served version 2.0.2. The final host verified the manifest signature and the downloaded 159,089,664-byte executable's hash, size and AMD64 architecture. This diagnostic did not install an update.
- The final 159,118,848-byte EXE has SHA-256 `ee1d0fe90e8d0700ff8c7a016ff081959c081037cbd17f67d728233bb8a24aea`. The native publishing script signed the version-specific URL using the original release key. An independent check verified the final bytes and Ed25519 signature using the existing public key. Windows Authenticode reports NotSigned.
- The desktop updater integration test recompiles its helper in the source directory. For this tray-only native change, the release package restores the helper from the supplied ZIP after running that suite. Compare the packaged helpers to the input archive before signing future tray-only releases.
- Avast One's ashQuick scanner was invoked on the final EXE and returned exit code 0. No detection was observed. This was a targeted invocation. No full-system antivirus scan or physical phone test was performed. Browser and Jam checks used fixture accounts.

### Source upload audit

All 480 supplied source file paths are retained. The loose root contains 22 files. Counts include every nested file in each top-level folder.

| Folder | Files | Folder | Files |
| --- | ---: | --- | ---: |
| activities | 19 | js | 90 |
| activity-modules | 9 | music | 8 |
| assets | 12 | scripts | 5 |
| backend | 6 | tests | 98 |
| call-modules | 19 | tests-music | 4 |
| css | 44 | tests-release | 42 |
| desktop | 99 | vendor | 3 |

The archive has root-level source files and each folder is within GitHub's 100-file selection limit. Packaging excludes build output, dependencies, test captures and private signing material. Release instructions are in RELEASE-INSTRUCTIONS.md.

---

## Prior release

# Verification for shared web 2026.11.18-1 and Windows 2.0.3

The release owner publishes the shared source and native release assets separately. The provided baseline was shared web 2026.11.17-1 and Windows 2.0.2.

## Shared app

- The shared suite passed all 584 tests. The release suite passed all 63 tests. The Music data suite passed all 10 tests.
- Chromium used fixture accounts over HTTP and file URLs. Checks covered actual audio decoding, single-track completion, independent uploads, title/artist/album search, playlist destinations, original attribution, duplicate prevention, profile artwork, and controller interactions.
- Chrome started a cold MP3 while the last chunk was deliberately withheld. One desktop run started in 25 ms and mobile emulation in 36 ms. Cached replays took 14 ms and 12 ms and made zero additional part reads. These measurements used a local database fixture. First-play time on a real connection depends on buffering and browser codec support.
- Schedule tests clicked the avatar inside a selector, exercised class details by pointer and keyboard, and checked responsive schedules. The roster test exercised live menu visibility, a short and clipped class name with and without classmates, single-icon rendering, and touch navigation. Timestamp tests checked that hover exit stays mounted for the shared motion. Generic tooltip, shared UI control, media/receipts, and startup smoke checks passed.

## Windows and release integrity

- The supplied 2.0.2 EXE reproduced the old tray presentation in its isolated packaged diagnostic. All 203 desktop tests passed on the 2.0.3 source.
- The final AMD64 EXE launched on Windows. Its packaged Electron 44.4.2 diagnostic decoded an uploaded cover, displayed album details, checked the tray icon menu and Jam permissions, and exercised seeking, five-point volume changes, minimizing and restoring. The bundled shared player decoded a silent WAV and received a four-second seek, 85% volume, and pause from the tray.
- The repaired test Start Menu shortcut launched the final portable EXE. Starting its cached runtime forwarded to the correct portable host and loaded the shared bridge. Diagnostics used isolated profiles and shortcut fixtures.
- Both supplied and final packaged hosts exercised the shipping Electron network path. The v2.0.3 host followed the public latest-manifest redirect to v2.0.2 and then GitHub release-asset redirects for the JSON and EXE. It verified the signed public 159,089,664-byte release. The diagnostic performed a download and verification only.
- The locally prepared v2.0.3 EXE is 159,115,264 bytes. Its SHA-256 is `b5e6ed251d6db59c18b6e0f3cd649d446071629809447856adf5eb59220d803c`. The shipping verifier and an independent Ed25519 check verified the manifest against the final binary and the original public key. The signature covers the version-specific GitHub URL. Its SHA-256 digest is `4f95e8a702f0b105207f010206bf1e3f5410cb67bffa8b46c30cc790fd461b59` for the manifest file itself.
- Avast One’s installed targeted scanner, ashQuick.exe 26.11.11250.0, returned exit code 0 on the exact final EXE. No separate scan report was available. A full-system scan was not performed. Windows reports the EXE as Authenticode unsigned.
- The optional static Pages packager passed its local-reference and byte-preservation checks with 215 runtime files, including the Music folder.

## GitHub upload audit

The final ZIP retains all 478 original source files and adds two Music modules. All 480 file contents were read back and compared with the prepared source. Generated dependency/build directories, test captures and the private signing key are excluded. The loose root files sit directly at the ZIP root.

| Upload selection | Files | Upload selection | Files |
| --- | ---: | --- | ---: |
| Loose root files | 22 | js | 90 |
| activities | 19 | music | 8 |
| activity-modules | 9 | scripts | 5 |
| assets | 12 | tests | 98 |
| backend | 6 | tests-music | 4 |
| call-modules | 19 | tests-release | 42 |
| css | 44 | vendor | 3 |
| desktop | 99 | | |

## Environment

Windows diagnostics use isolated profiles. Music and identity fixtures avoid changes to live accounts. Mobile checks use touch and viewport emulation. A real account-to-account Jam, a physical phone and installation from the future published v2.0.3 feed were outside the local validation.

---

## Archived release verification

# Shared web 2026.11.17-1 verification

The locally prepared source uses Windows host **2.0.2**. The UTC build timestamp is in `build-info.json`.

## Functionality

- **584 shared unit tests**, **63 release unit tests** and **8 Music data tests** passed. The Music data tests cover owner and admin permissions, preserving ownership, playlist ordering, interrupted uploads and deletion.
- Chrome loaded the shared app from a local file and over HTTP. Desktop and phone-size fixtures verified the account dock, matching Music and Settings styling, the profile actions menu, access to the correct library, and public read-only views. The Vinny account fixture exercised another user's playlists and tracks, including creation, editing, uploading, deletion, and drag, menu and keyboard ordering.
- The Music player tests used decodable WAV audio. The sidebar, full Music controller and profile action tests measured the center of each SVG against its button. Playback, seek, repeat, shuffle, volume, Spotify/chat interruption, native command handling and asynchronous track replacement passed.
- Three separate signed-in Chromium clients shared an isolated realtime fixture. The Jam tests covered joining through the host and a guest, joining a paused song, host seek/track/volume changes, listening position within one second in the fixture, disabled guest commands including the tray bridge, named participant tooltips, delayed metadata, failed leave rollback, stale join links, keyboard focus, canceling and confirming a switch, leaving, and removal of every guest on end. A 390 × 844 touch-emulated listener also switched Jams from an open profile.
- Listening status, optional artist, paused-Jam visibility, expiry and the member tooltip passed on desktop and phone-size fixtures. Named **In Call With** and **Viewers** tooltips passed a focused call-panel check for avatar/name alignment, live updates and scrolling through 38 people. The broader call-panel suite still has a pre-existing assertion for the hover background color of its roster button. That assertion also fails on the supplied ZIP.
- The general file/HTTP app smoke test, desktop/mobile shared control and tooltip tests, context-menu placement at three viewport sizes, and Spotify playback browser regression passed.

## Windows and deployment

- The **supplied** packaged Windows EXE followed GitHub's live HTTPS redirects for both the latest manifest and its version-specific EXE. It verified the signature, AMD64 architecture, size and SHA-256 of the published **2.0.2** download in an isolated profile. The verified 159,089,664 bytes matched the supplied EXE. This diagnostic did not install the download.
- In a separate offline test profile, the supplied **2.0.2** EXE loaded the new shared runtime as a trial update. Electron reported the shared app ready and recorded the staged identity as known-good after loading it. This exercised local staging and launch on Windows.
- The package retains all **476** input files, including all **99** byte-identical desktop files. The two new files are the Jam module and its multi-client test. The native binary, native manifest and signing key were not used to build the source ZIP.
- Shared source publication remains with the release owner. Jam synchronization and admin permissions were exercised with fixture accounts. Production database permissions, a live shared rollout, and physical iOS/Android playback were not exercised. No dedicated Avast scan was run.

## GitHub browser upload audit

The included `npm run audit:upload` script counts each top-level folder recursively. The source ZIP contains **478 files** with **22 loose root files**. The uploaded source begins at the ZIP root.

| Upload selection | Files |
| --- | ---: |
| Loose root files | 22 |
| activities | 19 |
| activity-modules | 9 |
| assets | 12 |
| backend | 6 |
| call-modules | 19 |
| css | 44 |
| desktop | 99 |
| js | 90 |
| music | 6 |
| scripts | 5 |
| tests | 98 |
| tests-music | 4 |
| tests-release | 42 |
| vendor | 3 |

---

## Archived verification from earlier releases

# Validation — shared web 2026.11.16-2 / native 2.0.2

Source/build preparation timestamp: **2026-11-17T03:32:11.565Z**. Source ZIP packaged: **2026-11-17T03:42:27.590Z**. These files are prepared locally only. No shared GitHub source, native release assets or production Firebase data/rules were published or changed.

## Completed checks

- **584/584 shared unit tests**, **63/63 release unit tests**, **202/202 desktop unit tests**, and **5/5 Music data tests** passed. Desktop coverage includes real compiled update-helper replacement, cancel and recovery scenarios. The native tray mocks were updated to model visibility/bounds used by the new resizing behavior.
- Music browser tests passed local file desktop, HTTP desktop and mobile 390×844 layouts with actual generated WAV audio and the offline Firebase fixture. Covered required metadata, RTDB chunk round-trip, cleanup/account revocation, ownership guards, concurrent reorder/deletion, crop zoom/drag/reset, modal stacking, live profile names/pictures, A–Z ordering, six-playlist preview, View All, context menus, drag/keyboard reorder, and timestamps updated without replacing keyed rows.
- Playback tests passed actual audio decode/play/pause, four-second Previous behavior, next/shuffle/repeat controls, seek, volume state/gain controls, screen persistence, Spotify block/unblock, no automatic resume, chat-media interruption, native command bridge, live profile progress, deletion during playback and stale-download/pause races. Footer geometry and desktop/mobile screenshots were checked visually.
- Shared control and tooltip browser suites passed desktop/mobile/short layouts. Existing Spotify tests passed all 29 unit cases and desktop/web/mobile browser flows. Existing call-volume lifetime browser regression passed.
- Main application smoke passed both file and HTTP: startup, sign-in, room messages, poll compose/vote/end, profile links, settings, schedules and Home. The original smoke fixture's sign-in focus race reproduced on the supplied ZIP; the fixture now waits for the existing sign-in transition before pressing its shortcut. No sign-in runtime change was made.
- Current sign-in regression passed five viewport sizes, account creation, cached sessions, keyboard input, duplicate submits, bad passwords, logout and auth/main toast isolation.
- The supplied native **2.0.1** EXE was exercised with isolated network and notification/tray diagnostics. The exact delivered **2.0.2** EXE passed its packaged Electron network diagnostic: real GitHub HTTPS redirects, public manifest signature verification and full EXE hash/size/AMD64 verification. The live feed still points to published **2.0.1**; this verified transport against that real release and did not install an update or publish 2.0.2.
- The exact final EXE passed isolated launch/registration and cached-runtime forwarding diagnostics, reporting native 2.0.2, updater support and loaded shared bridge. It passed the Music tray diagnostic, including transport/volume commands, stale/foreign sender protection, dynamic resize, and closing to tray while retaining the renderer and a running silent AudioContext. The native diagnostic uses stub shared playback commands to avoid production account activity; actual audio playback is separately covered by the browser suite.
- The original public verification-key bytes are unchanged. The native manifest signature, final EXE size and SHA-256 were independently verified. The private key was read only by the publisher signing tool and is absent from source, ZIP and runtime.
- All **466 supplied source paths** remain. Final source audit passes, no enclosing chat folder, no generated dependencies/dist/test captures, and no private PEM or private-key payload. The exact packaged Music runtime files match the final shared source.

## Remaining limitations and observed baseline issue

- The existing audio-controls browser test passes its desktop checks but fails its very-short (230px-high) microphone-menu bounds assertion in both the supplied original ZIP and this package. This existing call-menu issue was not changed by Music. No Music feature test remains failing.
- No production-account end-to-end test, physical iOS/Android test, real multi-device call+Music test, or published in-app upgrade to this unpublished 2.0.2 release was performed. Mobile results are Chrome emulation. Windows checks ran the packaged EXE on this computer with isolated test profiles.
- Avast remained enabled and no exclusions or security bypasses were added. A dedicated Avast full scan was not performed. The EXE is not Authenticode signed; its Ed25519 update manifest signature is valid. No claim is made that unsigned releases cannot receive antivirus false positives.
- Audio must use a device-supported codec and be at most 100 MiB. First uncached playback needs RTDB transfer time; browser/OS sleep/suspension and Spotify detection latency cannot be eliminated. See MUSIC.md.
- App editing controls and data transactions enforce owner IDs within the existing Chat App session model. The supplied app has no Firebase Authentication integration or deployable RTDB rules. Server-enforced ownership against modified clients/direct database access is not established by these client checks. No production rules were inspected or modified. See MUSIC.md before treating this as a server authorization guarantee.

## Upload audit

**476 files total; every top-level folder and the loose-root selection is at most 100 files.** Upload each complete top-level folder separately, including music and tests-music. Preserve the existing layout.

| GitHub browser upload selection | Recursive file count |
| --- | ---: |
| Loose root files | 22 |
| activities | 19 |
| activity-modules | 9 |
| assets | 12 |
| backend | 6 |
| call-modules | 19 |
| css | 44 |
| desktop | 99 |
| js | 90 |
| music | 5 |
| scripts | 5 |
| tests-music | 3 |
| tests-release | 42 |
| tests | 98 |
| vendor | 3 |

## Exact native artifact

- Version: **2.0.2**
- Filename: **Chat-App.exe**
- Size: **159089664 bytes**
- SHA-256: `1998bcd0c6dd26b9c2cbe72ef13d215a6ae3e8052c529d3b1189068438e7f569`
- Signed future release URL: `https://github.com/dowsy456/chat-app-desktop/releases/download/v2.0.2/Chat-App.exe`
- Stable manifest URL: `https://github.com/dowsy456/chat-app-desktop/releases/latest/download/native-update.json`

Publish the EXE first, then its matching native-update.json in a normal latest v2.0.2 release; publish all shared source. No required admin URL change. See RELEASE-INSTRUCTIONS.md. The current signed URL is the owner's version-specific publication destination, not evidence that the release already exists.

---

## Historical validation retained from the supplied package

# Validation: shared web 2026.11.16-1 / native 2.0.1 unchanged

Package preparation timestamp: **2026-11-16T23:20:57Z**. The same UTC build/package timestamp is in `build-info.json`. Prepared locally only: no shared source or native release assets were published, and no admin settings were changed.

## Scope and source preservation

Started from the newly supplied Downloads/chat.zip (462 source files). All 462 original paths remain. Four files were added: the unchanged supplied background image, the isolated sign-in UI module, and two focused browser regressions. All 98 files under desktop/ remain byte-identical to that ZIP, including the original public update-verification key and existing helper binaries. Supplied Chat-App.exe metadata reports 2.0.1.0; it was not launched, rebuilt, repackaged or modified. No native-update.json was created or changed. The separately supplied private signing key was not opened, copied or used.

The full 16.10-second reference-video timeline was reviewed using extracted frames, with dense 100 ms frame sequences around Next and Sign in. The supplied illustration image is byte-identical in assets/sign-in-background.png; darkening is a CSS overlay. The reference card, type, email/password transitions and loading dots were recreated for Chat App, with the requested removals and account-creation route. The animation respects reduced-motion preferences and network completion, so actual network wait length is not fixed to the recording.

## Completed checks

- Main shared unit suite: **584/584 passed** (`npm test`). Release unit suite: **63/63 passed** (`node --test tests-release/*.test.cjs`). The 55 account/calendar tests were rechecked after the final stale-request busy-state guard.
- Auth browser regression: five viewport sizes (1440×900, 768×900, 390×844, 320×640, 844×390), email validation, exact `Password not found`, all six allowed emails resolving the same password-selected account, duplicate-submit protection, cancellation of the intermediate Next transition without delayed navigation, Enter-key submission, aligned/dimmed loading state, creation/avatar controls, password copy, auth-only notice isolation, logout reset and cached-session reload. Screenshots were visually inspected, including narrow and landscape layouts. Browser data is the isolated Firebase fixture, not a production account.
- Home/menu browser regression: six viewport sizes (1440×900, 768×600, 390×844, 320×568, 740×390, 390×320), long domains/paths wrap inside growing rows, destination/copy fidelity, and Pin/Unpin/Leave/Edit labels and actions.
- Browser tab identity regression passed: requested defaults, cached startup, per-account custom name/icon, reload/logout and native guards. The requested favicon URL returned HTTPS 200 with image/x-icon during preparation.
- Existing password-session regression passed: password change, stale-session revocation and relogin/cache on desktop/mobile layouts.
- Existing ui-controls, text-inputs and people-settings browser regressions passed. Main-app controls, typing/editors, settings/member flows, and cloak behavior remain covered; auth styling is an explicit isolated exception.
- Legacy browser login fixtures now explicitly enter an allowed test email before Next. Updated test files passed syntax checking. These fixture updates do not prefill the app itself; the full historical browser collection was not rerun.
- All local index.html script/stylesheet/asset links and module-manifest entries resolve to packaged files. Upload audit passed; all original source files and desktop bytes were checked against the supplied ZIP.

No physical iOS/Android device, packaged-EXE, antivirus scan or production-account test was performed. Browser checks used headless Chrome with desktop/touch/mobile viewport emulation. Native updater HTTPS behavior was not retested because its source and executable are unchanged. Nothing was published; these local results do not claim a live release.

## Upload audit

**466 source files total. Every complete top-level folder and the loose root selection stays within 100 files.** No enclosing chat/ folder. Generated node_modules, builds, test captures/logs and private signing material are excluded.

| GitHub browser upload selection | Recursive file count |
| --- | ---: |
| Loose root files | 21 |
| activities | 19 |
| activity-modules | 9 |
| assets | 12 |
| backend | 6 |
| call-modules | 19 |
| css | 44 |
| desktop | 98 |
| js | 90 |
| scripts | 5 |
| tests-release | 42 |
| tests | 98 |
| vendor | 3 |

## Owner publication and maintenance

Upload the complete ZIP contents through the existing shared GitHub web workflow, one top-level folder at a time, then the loose root files. Existing desktop, mobile and browser clients receive the shared update through their current systems. No EXE upload, native release, backend deployment, Native update manifest URL change or Older EXE download URL change is required. See RELEASE-INSTRUCTIONS.md and UPLOAD-AUTH-TABS.md.

The email list is a local presentation gate, not verified email ownership or server authorization. It is not stored, sent, or bound to an account. The existing Chat App password remains the only account selector; existing saved sessions intentionally restore normally. The dedicated auth notice will NEVER be used inside the signed-in app; app.js and accounts/sign-in-ui.js document this boundary.

---

## Historical validation retained from the supplied source

The following reports concern earlier named releases only. Their EXE, device, signing, publication and antivirus claims do not describe this shared-only task.

# Validation: native 2.0.1 / shared web 2026.11.13-5

Final package report: 2026-11-14T02:13:21Z. Native build timestamp is recorded in build-info.json. Files are prepared locally; no shared source or native 2.0.1 release assets were published by this task.

## Reproduction and cause

Reviewed the full 28.17-second recording timeline: normal EXE launch at the beginning; pinning around 12.5-14.5 seconds; tray Quit around 17.5-18.5 seconds; pinned launch around 21.5 seconds; Update Required from around 25.5 seconds through the end. All 845 video frames were decoded, the complete timeline was visually reviewed in half-second frames, and the entire audio stream was verified silent. The resupplied Downloads video has the same SHA-256 as the original: 6971441302d673a02aab6296dfdc92454d258bf94ef6d212bab59faf8b6f862e.

The supplied EXE is the actual 2.0.0 build (SHA-256 7ac30fafac787e8cdd36c6dd1ff50d0522ad55ae66e0684c1250eca8219ac76c). The actual Windows Start Menu Chat App.lnk carried app.chatapp.desktop but pointed to a cached 1.7.2.0 runtime. Its preload exposes nativeVersion but lacks nativeUpdates/configureNativeUpdate. Launching the registered app reproduced the exact Update Required screen and v2.0.0 link from the recording, while the supplied portable EXE correctly identified itself as 2.0.0. The shared migration gate was behaving correctly for the old host.

Version 2.0.0 repaired existing taskbar links but did not repair the Start Menu registration Windows could reuse when creating a new pin. Version 2.0.1 repairs the registered source before singleton acquisition or window creation, then repairs recognized taskbar links. No running older instance is terminated by the repair.

## Future separate downloads

The repair is version-independent. Tests use separately downloaded 2.0.2 and 3.0.0 launcher identities at different paths, missing/reset profile markers, deleted old downloads, and failed-write retry. Existing outer EXE registrations are recognized through exact AppID and bounded Chat App PE version metadata; deleted canonical entries require the exact AppID and canonical shortcut name. Unrelated files, conflicting IDs and custom arguments remain untouched. Retained older repaired launchers forward only when the distinct saved EXE is an actual newer Chat App release. Same-path updates and malformed/stale markers cannot create forwarding loops. No 2.0.2 or 3.0.0 release is being delivered or claimed published; those are test scenarios.

## Completed validation

- Shared unit suite: 584/584 passed. Latest Update Log/poll tests: 12/12 passed. Browser cache/admin tests and Update Log preview/Shift+Enter tests passed, preserving the latest supplied 2026.11.13-4 features.
- Final desktop unit suite: 199/199 passed, including 20 focused launcher/registration tests. Signature/hash checks, native-first staging, live-work deferral, helper safe replacement/restart and recovery remain covered.
- Native development integration passed: shared boot, installed version bridge, unread overlay, Spotify, clipboard helper, same document/live audio track retained in background, selected screen capture and cleanup.
- Combined update UI browser checks passed: shared/native/both icon, progress, check errors/retry, current-version clearing, stable feed settings, legacy repair and desktop/mobile layouts.
- Exact final packaged EXE reports 2.0.1.0 and AMD64. Its launch diagnostic used the actual stale 1.7.2 shortcut in an isolated profile with NO preexisting taskbar pin. The same production pre-lock branch repaired it before shared content loaded, and reported native updater supported plus bridge ready.
- A new real Windows .lnk copied from the repaired registration was cold-launched through Windows after the first app process exited. It opened the exact final EXE and passed the packaged diagnostic.
- The final EXE was copied into another folder and the isolated saved launcher marker removed. It recovered the existing registered outer-EXE shortcut and both fixture pins using their identity, then a cold launch through the repaired new pin opened that separate copy successfully. No actual user shortcut was pointed to the scratch copy.
- The actual per-user Start Menu entry was repaired by a normal app launch. A fresh Windows-registered Chat App launch subsequently started the native 2.0.1 runtime, preserved the signed-in profile, and displayed the normal Home screen without Update Required. This registered-app test was repeated on the exact final build. The user's real Start Menu shortcut now targets the delivered outputs/2.0.1/Chat-App.exe; opening a moved/downloaded 2.0.1 copy once will retarget it to that location. Idle test instances were closed after inspection. No messages, calls, drafts or uploads were created or submitted.
- Exact final packaged Electron 44.4.2 network diagnostic passed real GitHub HTTPS 302 redirects and verified the currently published 2.0.0 manifest signature, EXE size, SHA-256 and AMD64. It downloaded only, never installed the fetched release. The public feed did not contain 2.0.1 during validation.
- Final manifest independently verified against the unchanged original public key and exact delivered EXE: size 158,666,752 bytes; SHA-256 a105df9ed17ac811447c9a5a85caedd68c0de701deae8b8e1ce60b1c7abc6486; URL https://github.com/dowsy456/chat-app-desktop/releases/download/v2.0.1/Chat-App.exe.

An initial candidate launch/network check was interrupted while Windows command/UI tools became unresponsive; the network request timed out without a response. After the host recovered, sequential reruns and the final rebuilt EXE passed. No security settings were changed to resolve that interruption.

## Limits and antivirus

Actual native tests ran on this Windows machine. Windows-registered cold launches and real shortcut launches were tested; the taskbar right-click/pin UI itself and a reboot cycle were not automated. No separate physical/mobile device or published in-app installation of 2.0.1 was tested; publication is still required. Future higher versions were covered by registration/version regression fixtures, plus the actual final EXE at a different path.

Avast remained installed; no detection or quarantine was observed during successful final builds/launches, and available FileSystemShield/BehaviorShield report tails showed no new detection. No full Avast on-demand scan or external malware upload was performed. No exclusions, security changes or quarantine restoration were used. The EXE is not Authenticode signed. Its native-update manifest is Ed25519 signed with the original key; unsigned EXEs cannot be promised immunity from future false positives.

## Source and upload audit

Input ZIP SHA-256: b21841cbbca1e62d20ae18aa67569a0b720e93cebaeca35c4c0ea7f6784de784. Every original source file remains at its original path. Original public verification key is byte-identical; private signing material is absent. No source reorganization or enclosing chat folder was introduced. Generated node_modules, desktop/dist and test captures are excluded.

Total source files: 462. Loose root selection: 21. Each folder count includes all descendants.

| Selection | Files |
| --- | ---: |
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

All selections are at or below 100 files. See RELEASE-INSTRUCTIONS.md for asset publication order, stable manifest setting, migration/default link, and future native maintenance.

---

## Previous validation history

# Validation: shared web 2026.11.13-4 / native 2.0.0 unchanged

Packaged 2026-11-14T01:15:24Z (November 13, 2026 at 08:15:24 PM EST). Started from the latest supplied Downloads/chat.zip (web 2026.11.13-3). All 462 source paths are retained, with no added/deleted paths. All 98 desktop files and the public verification key remain byte-identical. ZIP contents and integrity are checked during packaging.

- Full shared unit suite: 584/584 passed. Release unit suite: 63/63 passed.
- Expanded Update Log browser suite passed at desktop/mobile sizes: manual/automatic verified login and timing, receipt/version gating, all six requested formatting markers, safe HTML, shared preview markup, saved/unsaved/empty drafts, close-and-return with preserved draft/scroll, unchanged database/receipts after preview, native Shift+Enter and plain Enter behavior, save and clear.
- Home browser suite passed at eight viewports, preserving live polls, exact room navigation, scrolling, focus, cursor and account cleanup behavior.
- File and HTTP smoke tests passed with zero page errors.
- Preview screenshots were reviewed; generated captures/dependencies are excluded.
- Upload audit passed: 462 source files. Counts below are recursive and all selections are below 100.

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

No production data writes, GitHub publication, native builds/launches, physical-device or Avast checks were performed. No security settings changed. Shared-only delivery preserves native files without claiming new native-device verification. Release instructions and maintenance guidance are included; older entries below describe historical work only.

---

## Previous validation (historical)

# Validation: shared web 2026.11.13-3 / native 2.0.0 unchanged

Package timestamp: 2026-11-14T01:02:31Z (November 13, 2026, 08:02:31 PM EST). All work is local. No shared GitHub source, native assets or production database changes were published.

## Source preservation

Started by inspecting the latest supplied Downloads/chat.zip, shared web 2026.11.13-2 / native 2.0.0. Input ZIP SHA-256: ef37bf0e525ceb45a24f8522bfd1fbe248ba6e7266d39b8369b157a37baab999. All 458 original source paths remain; four regression files were added for live settings, session races and shared typing controls. No source was moved or deleted. All 98 desktop files and the public native verification key are byte-identical to that ZIP. The separate private signing key was not opened, copied or packaged. No native manifest or EXE was built, changed or repackaged.

## Completed checks

- Full shared unit suite: 584/584 passed.
- All release unit tests: 63/63 passed, including live account settings/echo merging and stale membership/room/admin callbacks.
- Home browser suite passed at eight viewports, including 390x320: fitted outer canvas, independently scrollable collections, live poll addition/edit/vote/deletion/expiry, exact original-message navigation/highlight, scroll and keyboard-focus retention, no refresh/paging controls, heading/subtitle/cursor behavior and account/member cleanup.
- Two-session settings browser test passed: remote runtime and open-control updates, focused pristine title/icon with caret retention, unfinished draft preservation and local commit, and account-switch isolation.
- Shared input browser suite passed: login, composer, search, admin, settings, schedules, notepad, screenshot toolbar/annotation saving, dynamic textarea/contenteditable, mobile, native controls and iframe isolation. An attempted native resize drag leaves the Update Log field dimensions unchanged.
- Existing image-editor text suite passed at 1440, 390 and 320px widths, including exported text, outlines, arrow/draw pixels and coordinates. On-image text remains faithful to the saved image.
- Existing UI-editing browser regression passed for desktop/mobile: composer/search surface parity, HTML search, media zoom, editor controls, save/discard, redaction, undo/redo and crop.
- Shared control/tooltip suites passed at desktop, portrait and short landscape sizes, including keyboard/touch and protected editable text.
- Home/schedules/update-log regression command passed: Schedule labels and person selection, day preview/copy routing, no day-type tooltip, month fit at six sizes and 4/5/6-week months, scrolling day notes, verified login/update-log timing and receipts, Admin editor/Shift+Escape, safe markdown, formatted reply previews and nonselectable pinned labels.
- File and HTTP startup smoke tests passed with zero captured page errors.
- Desktop/mobile Home and Admin/screenshot-input captures were visually inspected. Tests used isolated browser/database fixtures; captures and dependencies are outside the source package.
- Included upload-folder audit passed: 462 files, root selection 21, largest folder selection 98. ZIP integrity, exact packaged bytes and all source paths are checked during final packaging.

## Limits and maintenance

The regular Home/calendar/reminder/schedule/message/profile/membership/room views use live database subscriptions. Account preferences also synchronize live. Network delay or disconnection still delays delivery. The technical Admin database explorer deliberately uses bounded shallow 15-second discovery for completely new arbitrary branch keys, avoiding a full-root listener that would load all stored messages/media. Already loaded scalar edits and deletions update live, while active drafts are retained.

Recent Links covers existing 50-message notification tails per joined room, not all room history. Home polls retain the existing bound of 40 indexed entries per joined room. The Update Log still requires successful latest-version verification and account receipt writes; it may wait longer than 500ms or retry at a later login if verification is unavailable.

No production sign-in/data edits, GitHub publication, physical phone/tablet tests, EXE launches, packaged Electron download/replacement tests or Avast scan were performed for this shared-only revision. No antivirus settings, exclusions or quarantine were changed. Existing native updater/launch behavior was preserved by byte equality, not retested on a native device. Published-device verification remains a release-owner step.

The no-manual-resize maintenance rule is a comment in styles.css; shared typing surfaces are in css/ui-controls.css. See HOME-SCHEDULES-UPDATE-LOG.md for listener lifecycles and draft handling. Run npm run test:live-home-inputs plus the existing shared/UI tests when maintaining these features.

## Final upload counts

| Upload selection | Recursive file count |
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

No source is wrapped in an extra chat folder. node_modules, generated builds, test captures and private signing material are excluded. Existing checked-in native helper binaries remain unchanged.

---

## Previous validation (historical)

# Validation: shared web 2026.11.13-2

Packaged 2026-11-14T00:22:21Z (November 13, 2026, 07:22:21 PM EST). Native 2.0.0 is unchanged. These checks used local source and isolated database/GitHub fixtures; they are not evidence of production publication or physical-device operation.

## Passed

- `npm test`: 584/584 tests.
- `node --test tests-release/*.test.cjs`: 54/54 tests.
- `npm run test:home-schedules-update-log`: all 12 focused unit tests and all four browser suites passed against the final source.
- Home: 1918x866, 1366x768, 1024x600, 720x460, 390x844, 390x500, 390x320 and 740x390. All four tools remain reachable without page scrolling. Dense 17-note pagination verifies rows are reachable and not clipped. Tested live shared notes, personal reminders, poll voting/filtering, recent-link search/edit refresh, unjoined-room exclusion, membership removal, account switching, navigation cleanup and ownership of async modal completions.
- Schedules/calendar: six viewport sizes, four-/five-/six-week months, viewport fit, compact short-screen behavior, schedule day/person selection, copy/edit/class details, no day-type tooltip, selected chip visibility and nine-period density. Existing full calendar browser and calendar-layout-scroll suites passed; day editor scrolling and conflict/reminder behavior retained. Calendar cleanup/recurrence unit checks passed.
- `node tests/smoke.browser.cjs`: both file:// and HTTP passed with zero page errors. Login, room loading, sending, poll composing/voting/end, system logs, settings, schedule editing, live row identity and Home passed.
- `node tests-release/ui-editing.browser.cjs`: desktop/mobile shared search styling, media/editor controls and schedule class accessibility passed. Its Home search step now selects Recent links on compact layouts.
- Update Log: manual and automatic login, minimum 500ms delay, exact current/published version gates, old log suppression after newer publication, empty text, safe headings/emphasis, editor at Admin Panel bottom, Shift+Escape, Save/Clear, account-wide concurrent receipts across browser/EXE, later native-only update, same-release edits, delayed modals and cancelled-session rollback. Already-seen logs skip GitHub lookup.
- Replies: composer and sent reply previews, nested bold/italic, hostile HTML staying text, saved fallbacks before hydration, and emphasis ending beyond 5,000 characters. Preview DOM is bounded after formatting. A real pointer drag cannot select the retained-pin label.
- Visual review of generated desktop/mobile Home, schedule, calendar, Update Log and Admin Panel screenshots.
- Upload audit: 458 source files, every folder/root selection <=100. All 447 supplied paths retained; all 98 desktop files and public native key unchanged. ZIP preservation/integrity rechecked during packaging.

## Scope and limitations

No production Firebase writes, GitHub uploads or releases occurred. No physical phone/tablet checks were performed. The supplied Windows EXE was inspected for file/product version only (2.0.0.0); it was not launched or rebuilt. Packaged Electron GitHub redirect/download tests and native replacement tests were not rerun because native code/downloading did not change. No Avast scan or antivirus clearance test was performed, and no antivirus settings were changed. No private signing material was accessed.

Update Log can wait longer than 500ms when GitHub/database verification is slow or another modal is open. It intentionally waits until a later verified login if latest-version verification fails; an API failure never guesses eligibility or consumes a receipt. Recent links cover already-loaded recent room tails, not complete historical room messages. Poll discovery is bounded to 40 indexed entries per joined room. Actual publication/device behavior still requires the release owner's post-publication check.

## Final upload counts

| Upload selection | Recursive file count |
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
| tests-release | 36 |
| tests | 98 |
| vendor | 3 |

## Maintenance

Use HOME-SCHEDULES-UPDATE-LOG.md and RELEASE-INSTRUCTIONS.md. Older validation entries below are historical and are not the current release's test results. Two stale calendar test label expectations were corrected to match existing title case, and the obsolete 100px minimum-row expectation was replaced by a viewport-fit assertion. The schedules smoke expectation now uses Bell schedule for the persistent picker.

---

## Previous validation (historical)

# Validation: native 2.0.0 / shared web 2026.11.13-1

Package report timestamp: 2026-11-13T23:30:32Z. Build metadata timestamp is in build-info.json. All work was local; neither the shared source nor the native 2.0.0 release assets have been published by this task.

## Input and source integrity

- Started from the supplied Downloads/chat.zip: SHA-256 d64843b367cfd943fbc7a2fb9932dfdebce1ea3e9fce0402054adc3c6885ba10.
- Supplied Chat-App.exe reports 1.7.11.0: SHA-256 fb7bfb4d76750f15d5effcdbcc19c74f95e194ba7f20d074ebfab8514f783845.
- Preserved all 445 original source files at their original paths; added desktop/native-launch.cjs and desktop/tests/native-launch.test.cjs. No source reorganization or deletion.
- Original desktop/native-update-key.json is byte-identical. The original private key was used only by publish-native.cjs outside the source tree, and is absent from all deliverables.

## Root cause and repair

The supplied EXE normally launches a cached Electron child under LocalAppData/Chat App/runtime/<hash>. Its actual packaged native-updater module reports supported=true with the portable launch path, and supported=false without it. The source had no persistent recovery for direct cached-runtime launches. The exact production Update required modal was not reproduced in an authenticated production session; baseline inspection/launch and isolated policy tests established the missing-target failure path without touching production user data.

Native2.0.0 saves the original EXE path in the existing profile, uses it for native updates and taskbar relaunch/icon, forwards direct cached launches through that EXE before the single-instance lock, and repairs matching legacy runtime .lnk pins. A moved/renamed launcher retains the previous path only for exact shortcut repair; forwarding still requires an existing local file. Custom arguments, unrelated targets and conflicting App IDs are skipped.

## Completed checks

- Shared unit suite: 584/584 passed.
- Complete final desktop unit suite: 187/187 passed, including 8 new launch tests, signature/hash/version policy, native-first shared staging, live-work deferral, helper safe replacement/restart and recovery. An earlier overlapping helper compile produced a file-in-use error; sequential reruns passed.
- Chrome shared asset-cache/admin test passed, including 1.7.8, 1.7.11 and 2.0.0 receiving the signed native feed without a forced-download gate, 2.0.0 help text and saving migration minimum 2.0.0.
- Combined update UI browser suite passed: shared/native/both icon, download progress, check-error retry, same-version clearing, independent manifest setting, one-time legacy repair and desktop/mobile layouts. Updated two stale title-case assertions to the already-existing UI labels.
- Development Electron native integration passed: native/shared versions and frozen bridge, shared app boot, unread overlay IPC, Spotify bridge, same document/audio track retained in background, and selected screen capture with cleanup.
- Final portable AMD64 EXE reports 2.0.0.0 and launched normally on this Windows machine in an isolated offline profile; the latest supplied shared UI loaded successfully.
- Packaged launch diagnostic passed on the exact final EXE: native 2.0.0, shared bridge ready, updater supported, quoted portable relaunch target and shell-readable EXE icon.
- A real Windows .lnk fixture pointing to the cached runtime was repaired and reread through Electron's Windows shell API. Target, icon and AppUserModelID matched the portable EXE; description was preserved. The fixture stayed in an isolated profile, not the user's taskbar.
- Directly starting the final cached runtime with no PORTABLE_* variables passed: it recorded recovered-runtime forwarding, reopened the real EXE, retained the same isolated profile and supported updater, and loaded shared content. No repeated forced-download popup appeared in these isolated launches.
- The supplied 1.7.11 EXE and exact final 2.0.0 EXE both passed their shipping Electron network diagnostics against the real public GitHub feed: HTTPS 302 redirects, Ed25519 signature, exact size, SHA-256 and AMD64. The feed currently offers 1.7.11; the downloaded published file matched the supplied EXE. The diagnostics downloaded only, never installed it.
- Final 2.0.0 manifest independently verified with the original public key against the exact delivered EXE. URL: https://github.com/dowsy456/chat-app-desktop/releases/download/v2.0.0/Chat-App.exe. Size: 158,625,792 bytes. SHA-256: 7ac30fafac787e8cdd36c6dd1ff50d0522ad55ae66e0684c1250eca8219ac76c.
- Build used Electron 44.4.2 and the existing production security fuses. A build dependency certificate error was resolved by using Node's Windows system trust store (--use-system-ca); certificate checking remained enabled.

## Device and antivirus limits

Tests ran on this Windows machine with isolated app profiles. No production sign-in, calls, drafts, uploads, settings or taskbar pins were modified. Actual Windows shortcut APIs and packaged launches were exercised; a manual taskbar pin/click/reboot cycle was not performed because the taskbar was not exposed by the available UI control. No separate physical device, mobile device or published 1.7.8-to2.0.0 update was tested. The latter needs owner publication first.

Avast Antivirus was registered with Windows Security Center. Builds and packaged launches completed without an observed detection/quarantine; available FileSystemShield/BehaviorShield report tails showed no new build detection. No full Avast on-demand scan or VirusTotal scan was performed. No security settings, exclusions or quarantine were changed. The EXE is not Authenticode signed; the update manifest is Ed25519 signed. An unsigned EXE cannot be promised free of future false positives.

## GitHub browser upload audit

Final count: 447 source files. Loose root selection: 20. Each top-level folder below includes all descendants and is at or below 100 files.

| Selection | Files |
| --- | ---: |
| activities | 19 |
| activity-modules | 9 |
| assets | 11 |
| backend | 6 |
| call-modules | 19 |
| css | 41 |
| desktop | 98 |
| js | 88 |
| scripts | 5 |
| tests-release | 30 |
| tests | 98 |
| vendor | 3 |

Excluded generated node_modules, desktop/dist, test captures and private signing material. Source ZIP has no enclosing chat folder. Every original source path remains present.

## Publication and migration

See RELEASE-INSTRUCTIONS.md. Publish Chat-App.exe then its matching native-update.json as the normal latest v2.0.0 release. Publish shared web source. Keep the stable manifest URL. Only then change the optional Older EXE download URL from the updated admin panel to the v2.0.0 EXE if migration is desired. A pre-2.0 taskbar pin cannot run the repair until the repaired host has opened once; an unrelated retained old outer EXE may require one-time replacement or repinning. Future routine native updates retain the same EXE path.

---

## Previous validation history

# Shared web 2026.11.10-1 / native 1.7.11 unchanged

Packaged 2026-11-10T22:45:11Z (November 10, 2026, 05:45 PM EST). Prepared locally; not published.

## Checks completed for this revision

- Final shared unit suite: 583 passed. Final release unit suite: 42 passed, including 5 browser-tab and 6 upload regressions. Total: 625 passed, zero unit failures.
- GradeSort browser suite passed at 1440, 768, 390 and 320px: all three screens, navigation, validation, avatar file/zoom/center/reset/default controls, password visibility and Enter login, without page errors or horizontal overflow. Desktop and phone captures visually reviewed.
- Tab identity checks passed login, room/home navigation, account-scoped cache/reload, custom title/icon handling, delayed validation versus clear/preset/logout, relogin/default reset and native guards. Unit tests cover delayed startup settings versus newer local edits. Existing password-session checks passed desktop/mobile browser fixtures.
- Upload unit/browser checks passed coalesced progress, stopped/deleted/committed transaction guards, pending-state merging, bounded preview validation, malformed PE rejection, separate sender/receiver progress, stable row/thumbnail, completion, inert HTML and actual supplied EXE icon decode. The EXE was only read as data; no execution occurred.
- Existing edit-attachment and media/receipt browser suites passed. Focused voice/file/embed checks passed web and desktop bridge fixtures. Spotify controls passed web, mobile and desktop bridge fixtures. Reader/profile interactions passed desktop, iPhone and Android browser emulations.
- Shared UI control suite passed desktop, portrait phone and short landscape (566 mounted controls). Final file:// and HTTP smoke checks passed startup, sign-in, rooms, sending, polls, settings, schedules and home with no page errors.
- The cache-retention/deployment portion of asset-update.browser.cjs passed: updated CSS/dynamic JS load through the shared revision without an EXE change. Entry/style/runtime revisions are aligned.
- All changed/new JavaScript passed syntax checks. Packaging verifies original source path retention, unchanged desktop hashes, folder counts, ZIP CRC and entry bytes.

## Existing test limitations

- asset-update.browser.cjs later fails its legacy native-migration assertion at line 196 (`1.7.8` versus expected `1.7.11`). The untouched input ZIP fails identically. Shared asset-cache assertions pass; native migration behavior was not changed.
- Full chat-files-sounds.browser.cjs stops at its earlier unread-while-scrolled assertion at line 171 (`0` versus `1`). The untouched input ZIP fails identically. Focused file/voice tests pass.
- github-launcher.browser.cjs cannot start because chaptersauto.svg is absent from the supplied source ZIP. That legacy launcher was not recreated or changed.

## Scope and practical limits

No production Firebase/object-store upload or live cross-device session was performed. Sender/receiver synchronization used isolated database fixtures. Unsupported/unrenderable files use a type icon; HTML uses inert text/document artwork. Remote favicon loading depends on the network. No EXE launch/build/repackage, physical Windows-native-device test, physical phone test, antivirus scan, production write, shared source publication or native release publication was performed. No detection was observed or security setting changed. Browser bridge mocks and emulated devices do not establish packaged-native or physical-device behavior.

---

## Prior validation (historical)

# Shared web 2026.11.09-5 / native source 1.7.11 unchanged

Packaged 2026-11-10T03:26:02.568Z (November 09, 2026, 10:26 PM EST). Prepared locally; not published.

## Checks completed for this revision

- npm test: 583 passed, zero failed.
- Targeted refinement browser test passed at 1440px and 390px: identical room plus/arrow styling, transparent requested controls and nonempty hover feedback, green call state, equal sidebar centers, close/file/sticker tooltip exclusions, preserved download tooltip and accessible names, and real image-editor zoom tooltip.
- Existing tooltip suite passed at desktop/mobile sizes. Existing shared control suite passed at 1440x900, 390x844 and 740x390 (565 mounted controls plus states/focus/geometry).
- Existing interface checks passed at desktop/mobile/short landscape; existing UI editing suite passed at desktop/mobile, including rich class tooltips, media zoom, editor save/cancel, crop and undo/redo.
- Desktop/mobile screenshots were reviewed. Changed JavaScript passed syntax checks. All supplied source paths are retained and all 96 desktop files remain byte-identical. The final ZIP is CRC-checked and every entry compared with staged bytes.

No EXE was launched, built or repackaged. No native manifest was changed and no private signing key was opened. No antivirus scan, physical native-device test or physical phone test was performed. Browser emulation does not establish physical-device behavior. No security settings, live account data, shared source or native release assets were changed or published. The prior unrelated native-migration test mismatch is retained in historical validation; native update behavior was not modified or retested here.

---

## Prior validation (historical; not rerun unless listed above)

# Shared web 2026.11.09-4 / native source 1.7.11 unchanged

Package timestamp: 2026-11-10T03:05:30.765Z (November 09, 2026 at 10:05 PM EST). Prepared locally; not published.

## Checks completed for this revision

- Shared unit suite: 583 passed, zero failed. Release unit suite: 31 passed, zero failed. Four exact text expectations were updated for the requested capitalization; no assertions were weakened.
- New shared control suite: desktop 1440x900, phone 390x844 and landscape 740x390. Checked hundreds of real mounted controls, app-font consistency, common radius, no glow, stable hover geometry, keyboard focus, semantic colors, selected states, split-control corners, compact icon centering and intentional editor/font-preview typefaces.
- New tooltip suite: desktop and phone viewport, actual composer, newly inserted icon/text controls, hidden text, single-letter glyphs, disabled hover, keyboard focus, Escape, touch dismissal, dynamic labels, viewport bounds, preserved ARIA descriptions and unchanged user/filename casing.
- Existing app smoke passed with file:// and HTTP loading: startup, sign-in, rooms, sending, polls, settings, schedules and home, without page errors.
- Existing interface tests passed at desktop, phone and short landscape sizes. Calendar layout/scrolling tests passed at four viewport sizes. Composer edit layouts passed in room/call panels at four sizes.
- Existing rich class tooltip and UI editing checks passed on desktop/mobile. Image editor checks passed at 1440, 390 and 320px, including save, cancel, crop, text and undo/redo. Media/receipts checks passed, including touch/wheel zoom and embedded-document isolation.
- Context-menu tests passed for definition lookup, viewport placement, submenu expansion, neutral menu hover, controls and call/companion interactions. The hover-color test now waits for animation completion before comparing colors instead of sampling two unfinished transition frames.
- Current desktop and mobile captures were visually reviewed. All changed JavaScript passed syntax checks. Local entry and module references resolve.
- All 429 input paths are retained, with five new files. All 96 desktop files and the public native verification key are byte-identical to the supplied ZIP. Final ZIP entries are compared byte-for-byte to staged source and inspected for forbidden generated/private files.

## Existing unrelated test mismatch

The shared-cache part of `tests/asset-update.browser.cjs` passed: scripts and styles refresh under the new common asset revision through a retained browser cache without an EXE change. Its later native-migration assertion expects 1.7.11 but the supplied migration minimum is 1.7.8. An untouched fresh extraction of the supplied ZIP reproduced the identical assertion at line 196. Updater behavior and the native migration setting were not changed; only short display headings were capitalized. This UI release is not evidence of native publication or delivery.

## Scope and limitations

No EXE was launched, rebuilt, repackaged or published; the native version is from supplied source. No native manifest was generated or changed, and the private signing key was not opened. No real GitHub Electron redirect test was needed or run for this shared-only UI change. No antivirus scan or physical Windows/mobile-device check was performed. Browser mobile viewport/touch emulation is not physical-device testing. No security software or settings were changed.

No shared source, native asset, Firebase data, admin setting, backend function or storage service was published or changed on a live account. All application tests used local fixtures. Release-owner publication and checking the received shared update on actual devices remain separate steps.

---

## Previous validation supplied with the input (historical)

# Shared web 2026.11.09-3 / native 1.7.11 unchanged

Package timestamp: 2026-11-10T02:38:57.585Z. Prepared locally; not published.

- Day details are left aligned with the same modest page gutter as the month calendar.
- Each saved note card fits its own text and controls, stays within the viewport, and resizes after edits.
- Short note lists use normal native page scrolling, with no one-frame scripted scroll jumps.
- Overflowing lists contain scrolling at both boundaries; only the note list scrolls while the pointer is over it.
- Month title and controls align with the calendar edges, including compact/short windows. The grid itself is unchanged.

This is shared web only. No EXE, native manifest, updater code, backend deployment or admin setting change is required. Existing desktop/mobile/browser clients receive the update through their existing shared update systems.

## Current validation

- Shared unit suite: 583 passed, zero failures.
- Four-viewport Chrome regression: 1440x900, 1920x1080, 390x844 and 740x390. Checked real wheel input on short lists, overflowing lists and both boundaries; short lists have no scroll container or scripted handoff. Checked equal gutters, header edge alignment, independent note widths shrinking after a saved edit, long text wrapping, matching toggles and shared scrollbar styles. No page errors. Desktop and mobile captures were reviewed.
- Existing full calendar, two-client ordering and recurring-note browser suites passed against isolated Firebase fixtures. No live database changes.
- Final source ZIP audit preserves all 429 supplied source paths; no new paths or deleted source. All 96 desktop files, including the public verification key and original helper binaries, remain byte-identical. ZIP entries are compared byte-for-byte against staged source.
- No EXE was launched or built; no private signing key was opened; no native manifest was changed. No antivirus scan, native-device test or physical mobile/touch test was performed for this shared-web revision. No security settings changed.
- No shared source, native asset, database setting or function was published. Browser scrolling follows browser/OS input preferences, including reduced-motion settings.

The prior package's unrelated native migration-version test mismatch (1.7.8 configured minimum versus 1.7.11 expected by that test) remains unchanged; no updater code was touched or native update delivery retested. The historical report below is retained for context, not a claim those checks were rerun.

---

## Historical validation

# Validation — shared web 2026.11.09-2

Package timestamp: 2026-11-10T02:18:23.571Z. Source native version: 1.7.11, unchanged. Started from the latest supplied Downloads/chat.zip (SHA-256 cabbc82edad7222a79cb33c0054efc757bc56b5f036b7dd76ebf0b92dc84932a). All checks used local source and isolated fixtures; no production data or deployment was changed.

## Current passing checks

- npm test: **583 passed, 0 failed**.
- Calendar recurrence unit and static Pages packaging/reference checks: **6 passed, 0 failed**. The static package includes the new shared stylesheet and all referenced assets.
- Four-viewport Chrome integration (1440x900, 1920x1080, 390x844, 740x390): identical Repeat/Remind me switch geometry and checked styles; shared 10–20 px month/form gutters; bounded aligned day notes; long text wrapping; real browser wheel input over short lists, overflowing lists, list boundaries and day headings; shared scrollbar appearance in calendar, chat, settings and newly inserted textarea elements; bundled game stylesheet injection; no page errors. Desktop and mobile viewport captures were visually inspected.
- Existing full calendar browser suite, two-client ordering suite, and repeating-note browser suite passed. Reminders, authors, editing/deletion, duplicate checks, pause/resume and month behavior retain their coverage.
- Existing shared app smoke passed on desktop and mobile fixtures with no page errors. Both bundled activities passed under direct file and HTTP/blob loading.
- The shared-cache portion of tests/asset-update.browser.cjs passed: scripts and styles refresh under one new asset revision through a retained browser cache without an EXE change.
- JavaScript syntax checks passed for the changed renderer, activity loader and new regression test.
- Source upload audit: 429 files; root 18; largest folder tests 98. All recursive top-level selections remain below 100. The final ZIP is compared against every original source path and every staged byte; native source and verification key must remain identical. See RELEASE-INSTRUCTIONS.md for all folder counts.

## Baseline issues distinguished from this update

The supplied ZIP failed 11 existing storage-worker unit tests because README.md no longer contained their marked deployable worker source. An untouched extraction reproduced all 11 failures. The exact marked block from the earlier supplied 2026.11.08-5 source was recovered into README.md (SHA-256 41df3d952209b87215b74356f2d162f890f7ffeb4fb9cb55b03ed5e12e980810). The entire 583-test suite then passed. This restores documentation/source only; no Worker code runs as part of this UI update and no service was deployed.

The full asset-update browser suite still stops at its separate native migration-setting assertion: the existing js/core/config.js NATIVE_RELEASE_VERSION is 1.7.8 while that test expects desktop/package.json version 1.7.11. The untouched supplied ZIP reproduces the identical failure. Neither the updater/migration implementation nor the test was changed in this shared UI release. The preceding shared-cache update checks pass. Do not change the optional older-EXE migration link based on this release; future native publication should reconcile the migration setting with its actually published EXE as specified in NATIVE-UPDATES.md.

One full calendar run timed out while dismissing a toast as it animated out. A fresh run of the unchanged test passed, as did its untouched-baseline run; no product code was changed to accommodate that timing race.

## Actual test and publication scope

This revision is shared-web-only. No EXE was launched, rebuilt or repackaged; no native manifest was generated and no private key was opened. No antivirus scan or native-device check was performed for this revision. No security protections were changed. Browser viewport emulation is not physical-phone testing. Firefox/Safari-specific scrollbar fallback and physical touch gestures were not tested. Platform-native scrollbar rendering remains subject to browser/OS support.

No shared source, native release asset, Firebase function or admin setting was published. Verify the shared update after the release owner publishes it. The historical input report below describes the previous release only and is not a claim of new native testing or publication for this package.

---

## Historical validation supplied in the input ZIP (not rerun as native checks)

# Validation — 2026.11.09-1 / 1.7.11

Build timestamp: 2026-11-10T01:33:49.092Z. Checks completed locally on Windows with the supplied original ZIP/EXE as the baseline. No live production data was changed.

## Automated checks

- Shared unit suite: 583 passed, 0 failed (npm test).
- Native unit suite: 179 passed, 0 failed (node --test --test-concurrency=1 desktop/tests/*.test.cjs).
- Release unit suite: 31 passed, 0 failed (node --test tests-release/*.test.cjs).
- Static Pages packaging/reference checks: 3 passed, 0 failed.
- Existing app browser smoke: desktop and mobile fixtures, no page errors; sign-in, room/send, polls, settings, schedules and home.
- Calendar: recurrence integration, full existing calendar suite and shared ordering browser suite passed. Coverage includes atomic duplicate races, month/year rollover, pause/resume, all-series/current-month and per-date actions, authors/reminders, tooltip scroll dismissal and desktop/mobile geometry.
- Presence/unread: existing unread browser, app/iframe presence browser and new retained-pin/idle-read browser suites passed at desktop/mobile sizes. Remote DND changes and expiry, legacy session leases and large unread query coverage are tested with fixtures.
- Library desktop/mobile layout, native menu renderer, notification and ringing browser checks passed. Development Electron rings/pings integration passed.

## Actual supplied and final Windows executables

The supplied Chat-App.exe was 1.7.10 (SHA-256 eedeb1185e21057502c5109a359271003ab511acb8fe2fcc1a1443999e57bb6f). It launched with an isolated offline profile and its expected landing UI was inspected. Its real Electron network diagnostic followed GitHub HTTPS redirects and verified the signed published 1.7.10 download, matching the supplied EXE exactly.

The final portable AMD64 Chat-App.exe reports 1.7.11. Its packaged diagnostic passed:

- Online call and same-room ping show above an ordinary fullscreen window without activation; stacks do not overlap.
- Ring body animates to 30% opacity; Join and Decline restore 100%; no mouse-input mode polling.
- SVG X dismisses without opening the app; duplicate transport ID cannot replay after dismissal.
- DND hides outstanding surfaces and rejects new pings.
- Renderer crash recreates the ping surface without losing the pending mention.
- Actual taskbar badge accepts absolute nine and clears to zero.
- Tray labels are Open and Quit.

The packaged popup screenshots were reviewed. The crash log entry is intentional: the diagnostic crashes only its own ping renderer and checks recovery. Ordinary fullscreen placement is checked through real native window state/focus, with Chromium-generated pointer input; physical pointer clicking and exclusive-fullscreen games were not tested.

The final packaged Electron network diagnostic also passed against the real stable GitHub feed: HTTPS redirects, Ed25519 signature, architecture, exact size and SHA-256 of the currently published 1.7.10 EXE. It downloaded only into the isolated diagnostic profile, never installed it, and did not claim this new 1.7.11 release was published.

The final manifest signature, exact EXE digest/size/URL, original embedded public key and AMD64 PE header were independently verified. Production fuses disable RunAsNode, NODE_OPTIONS and CLI inspection and enable ASAR integrity/ASAR-only loading. All 190 shared runtime files in the packaged EXE were compared byte-for-byte with the final source tree.

## Build and antivirus scope

Electron 44.4.2 and the existing x64 portable launcher/build process were retained. A redundant builder download encountered a local Node certificate-chain error; packaging used the already installed matching Electron distribution and Node's system CA support. Certificate validation was not disabled. An overlapping development-helper test briefly hit Windows' executable file lock; the full native suite was rerun sequentially and passed. Neither was an antivirus detection.

Windows Security Center reported Avast Antivirus enabled. No detection or quarantine alert was observed during builds and executable tests; existing Avast shield reports showed no new task-time entries. No full/on-demand Avast scan was performed. No antivirus exclusions or protection changes were made. The EXE is not Authenticode signed, and future false positives cannot be ruled out. The signed update manifest authenticates release bytes but does not Authenticode-sign the EXE.

## Not verified or published

- Physical phones/tablets, a live multi-user/multi-device Firebase session, production database permissions and unattended scheduled-function execution.
- Windows secure desktop, every exclusive-fullscreen game, physical pointer behavior in every application, or zero performance impact.
- Publication of shared GitHub source, new native assets, Firebase worker or admin setting changes. The release owner must publish/deploy as described in RELEASE-INSTRUCTIONS.md.
- Abrupt disconnects cannot be instantaneous: active/native sessions expire within a 45-second lease and background-web/legacy sessions within 90 seconds if disconnect cleanup has not arrived sooner. Historical Seen markers remain historical after users become Idle/Offline.

## Maintenance checks

Use npm run test:presence-calendar for the new behavior. Before every release run npm run audit:upload and compare all original source paths. Keep backend/functions/calendar-recurrence.js in both the module manifest and the exact Pages runtime allowlist. Deploy materializeRepeatingCalendar for generation while every client is closed. Read NATIVE-UPDATES.md before updater work; preserve the public key and combined native-first update flow.
