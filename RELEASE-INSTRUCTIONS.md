# Publish Windows 2.0.7 and shared web 2026.11.24-2

1. In `dowsy456/chat-app-desktop`, prepare a normal release for tag `v2.0.7`. Attach the supplied `Chat-App.exe` first, then the matching `native-update.json`. Publish it as the latest release. The manifest signature covers the exact executable bytes and [this version-specific URL](https://github.com/dowsy456/chat-app-desktop/releases/download/v2.0.7/Chat-App.exe).
2. Extract `chat.zip` into an empty folder. In the existing shared GitHub source repository, upload the loose root files as one selection, including `.nojekyll` and `_headers`. Upload each top-level folder as a separate selection. Stage on one branch and merge the complete revision together. Verify `build-info.json` reports web `2026.11.24-2` and mobile revision `2026112402`.
3. Existing admin settings apply. Keep **Native update manifest URL** on the [stable signed JSON feed](https://github.com/dowsy456/chat-app-desktop/releases/latest/download/native-update.json). The optional **Older EXE download URL** is for users before 2.0.1. If you change it, use the newly published shared admin panel after both assets and shared source are live. This incremental release uses the current backend.
4. On a 2.0.1-or-newer Windows install, use the combined in-app update button when a call, draft, upload or recording is no longer in progress. With both updates pending, the native host updates first and tries the staged shared release after restart. A successful load sets the known-good shared version. Browser and mobile clients receive the shared revision through their existing update paths.

The test results in VALIDATION.md describe the locally prepared files. Production delivery can be checked after publication by comparing the downloaded EXE SHA-256 and by opening the update from an existing install.

---

# Publish Windows 2.0.6 and shared web 2026.11.24-1

1. Create a normal GitHub release for tag `v2.0.6` in `dowsy456/chat-app-desktop`. Attach the delivered `Chat-App.exe` first and its matching `native-update.json` second. Publish the two together as the latest release. Keep the names exactly as shown. The signed executable URL includes the tag and must resolve to these exact bytes.
2. Extract `chat.zip` and upload its loose root files together, including `.nojekyll` and `_headers`, to the root of the existing shared GitHub repository. Upload each complete top-level folder separately. Stage the complete revision on one branch and merge it together. The upload groups and local test results are in [VALIDATION.md](VALIDATION.md). Verify `build-info.json` shows web `2026.11.24-1` and mobile revision `2026112401`.
3. To put the backend changes live, run `firebase deploy --only functions:calendar --project chatappv6-e9da9` from the extracted `backend` folder with the release owner's Firebase CLI session. Install its locked dependencies first with `npm ci --prefix functions`. The existing calendar codebase uses Node.js 24. The shared-source upload and desktop release each have their own delivery path.
4. Existing Admin Panel settings are sufficient. The stable **Native update manifest URL** is [the latest signed JSON](https://github.com/dowsy456/chat-app-desktop/releases/latest/download/native-update.json). The **Older EXE download URL** is optional for migration from pre-2.0.1 builds. If you choose to update it, use the newly published shared admin panel after both releases are public.

On an existing 2.0.1-or-later Windows install, finish any call, upload, recording or draft and use the combined update button. When both updates are ready, the native host installs first, then loads the staged shared release after restarting. Confirm both version numbers and apply two different wallpapers in Settings. Browser and mobile clients obtain the shared changes through their existing paths.

---

# Shared web 2026.11.21-7

Publish the extracted root files and each complete top-level folder to the existing shared web repository. Merge the complete revision together. The existing Windows 2.0.5 host uses its shared updater. Existing admin settings are sufficient.

# Shared web 2026.11.21-6

Upload the extracted loose root files together and each complete top-level folder separately to the shared GitHub repository. Merge the complete revision together. The existing Windows 2.0.5, Android and browser clients receive the shared update. Existing admin settings are sufficient.

# Publish shared web 2026.11.21-5

1. Extract `chat.zip` and upload the 23 loose root files together and each of the 14 complete top-level folders separately. Use the existing shared GitHub source repository. Keep `index.html` and `build-info.json` at the repository root. Stage the uploads on a branch and merge the whole revision to the default branch so clients see a complete update.
2. The installed Windows 2.0.5 host receives this revision through the combined update control. Browser clients load the published shared app. On Android, open the existing Chat App while online and let it finish checking for the shared release. The supplied APK discovers numbered `dowsy456/christianlumen` repositories. Its updater stages the revision and activates it when safe or on the next launch. Finish active work before reopening the app.
3. Check for shared web **2026.11.21-5** and mobile revision **2026112105** in the published `build-info.json`. In the Android navigation drawer, tap the music note next to Settings. In a room, scroll up through older messages and open a message's actions. Use the existing Admin Panel settings as configured. This release needs only the shared web upload.

## Previous release instructions

# Publish shared web 2026.11.21-4

1. Extract `chat.zip` and upload its contents to the existing shared web repository. Select each complete top-level folder separately, including its descendants. Select the loose root files together and keep `index.html` at the repository root. If the browser uploader creates multiple commits, stage them on a branch and merge the completed branch.
2. After publishing, use the existing shared update control on Windows, mobile and browser clients. The Windows host version for this source is **2.0.5**. This release needs **zero Admin Panel changes** and only the shared source upload.
3. Verify the published revision in `build-info.json`. In Settings → Appearance, upload a picture with a recognizable color, move the crop, change the controls and reopen Settings. In Music, play a track and seek well ahead, then back. [VALIDATION.md](VALIDATION.md) records local coverage.

## Earlier releases

# Publish shared web 2026.11.21-3

Extract chat.zip and upload the loose root files together and each complete top-level folder separately to the existing shared web repository. Stage multi-commit uploads on a branch and merge the complete revision together. The existing Windows 2.0.5 host, mobile app and browser receive the published shared release through their usual update paths. No admin setting change is required.

# Publish shared web 2026.11.21-2

Extract `chat.zip` and upload its contents to the existing shared web repository. Upload the loose root files together and each top-level folder separately, preserving paths. If this takes several commits, stage them on a branch and merge the complete revision together. This branding update uses the existing shared updater and requires no admin setting changes.

## Previous release instructions

# Publish Windows 2.0.5 and shared web 2026.11.21-1

1. In the public [Windows release repository](https://github.com/dowsy456/chat-app-desktop/releases), create a regular release with the exact tag **v2.0.5**. Upload **Chat-App.exe** first and **native-update.json** second. Publish the release as latest with both assets present. The signature binds the EXE bytes to the [v2.0.5 asset URL](https://github.com/dowsy456/chat-app-desktop/releases/download/v2.0.5/Chat-App.exe). A different tag or asset filename breaks that URL.
2. Extract **chat.zip**. Upload the complete contents to the existing shared web source repository, preserving paths. Select each top-level folder as one upload and the loose root files as another. If the uploads take multiple commits, stage them on a branch and merge the complete source together. Desktop, browser and mobile receive this shared revision through their existing update systems.
3. **No admin setting change is required.** Keep the existing [stable native manifest URL](https://github.com/dowsy456/chat-app-desktop/releases/latest/download/native-update.json). The feed must serve the supplied signed JSON. The optional **Older EXE download URL** is for one-time migrations from before 2.0.1. To change it intentionally, wait until both releases are published, then set the v2.0.5 EXE URL from the updated shared Admin Panel to record the right minimum.
4. Confirm the stable feed serves version **2.0.5**, follow its EXE URL and compare the size and SHA-256 to the signed JSON. On an existing supported installation, use the combined update icon once active calls, drafts, recordings and uploads are finished. With both updates pending, the native host installs first and the staged web revision becomes known-good after loading successfully.

During local validation, GitHub's latest tag was v2.0.3 while its manifest targeted a missing v2.0.4 EXE. Publishing the matched v2.0.5 pair under its own tag repairs that mismatch for users of the stable feed.

## Previous release instructions

# Shared web 2026.11.18-3

Music owner links and player titles glow around the letters on hover and keyboard focus. Publish the extracted source to the existing shared GitHub repository. Windows 2.0.4 receives the stylesheet through its shared updater. No admin changes are required.

---

# Publish shared web 2026.11.18-2 and Windows 2.0.4

1. Create a normal latest release tagged **v2.0.4** in [dowsy456/chat-app-desktop](https://github.com/dowsy456/chat-app-desktop). Upload **Chat-App.exe first**, then upload its matching **native-update.json**. Keep both filenames and publish the supplied bytes. The signed EXE URL is [the v2.0.4 release asset](https://github.com/dowsy456/chat-app-desktop/releases/download/v2.0.4/Chat-App.exe).
2. Extract **chat.zip** and publish its complete contents to the existing shared-web repository. Each complete top-level folder is one browser upload. Select the loose root files together. Stage on a branch if multiple commits are needed and merge the complete source.
3. **No admin setting change is required.** Keep the [stable native manifest URL](https://github.com/dowsy456/chat-app-desktop/releases/latest/download/native-update.json) and the existing shared source setting. Only if intentionally updating the optional pre-updater migration link, do that from the updated shared Admin Panel after both publications.
4. After publication, apply the combined in-app update on a supported existing Windows installation. With native and shared updates pending, the host updates first and staged shared code is validated on successful load. Finish active calls, drafts, recordings and uploads before applying. Browser and mobile continue through their shared update flow.

---

## Prior release

# Publish shared web 2026.11.18-1 and Windows 2.0.3

1. In the public **dowsy456/chat-app-desktop** repository, use tag **v2.0.3** for a normal latest release. Upload **Chat-App.exe** first. The signed download destination is [the version-specific executable](https://github.com/dowsy456/chat-app-desktop/releases/download/v2.0.3/Chat-App.exe).
2. Upload the supplied **native-update.json** to the same release after the EXE and mark it latest. Publish the delivered files byte for byte. The app reads signed JSON from [the stable manifest feed](https://github.com/dowsy456/chat-app-desktop/releases/latest/download/native-update.json).
3. Extract **chat.zip** and upload each complete top-level folder separately to your existing shared web repository, then the loose root files together. Keep paths intact. If using multiple commits, stage them on one branch and merge once complete.
4. No Admin Panel setting changes are required. Keep the shared source and the stable manifest URL. If you choose to update the optional migration link for pre-updater EXEs, set Older EXE download URL to the v2.0.3 EXE from the updated shared Admin Panel after publishing both releases.
5. After publishing, verify the combined in-app update on a 2.0.1 or 2.0.2 installation. Finish active calls, drafts, recordings and uploads, then apply the update. The native host updates first when both revisions are staged, and the app validates loaded shared code after restarting. Browser and mobile use the existing shared update flow.
6. Check two real accounts on your deployment for standalone uploads, album-art copy/download, playlist additions, Jam playback and live schedule changes. The private signing key belongs with the release owner and must stay outside repositories, uploads and release assets.

See VALIDATION.md for the checks completed before publication.

---

## Archived release record

# Publish shared web 2026.11.17-1

The locally prepared deliverable is **chat.zip**. Windows host **2.0.2** already supports this shared release.

1. Extract the ZIP and publish its contents to the existing shared-web GitHub repository, including the updated `music` folder. Select one complete top-level folder per browser upload, then select the loose root files together. Preserve the paths shown in the ZIP. If staging the uploads across commits, publish from the completed branch after all files are present.
2. Browser, mobile and Windows clients can pick up the published shared revision through their usual update flow. This release requires zero Admin Panel setting changes and zero native release uploads. The existing Native update manifest URL is `https://github.com/dowsy456/chat-app-desktop/releases/latest/download/native-update.json`.
3. To verify a deployment, have one account play and start a Jam, a second join and a third join through the second person's profile. Pause, seek, inspect the participant list, and end the Jam. Check a playlist edit from Vinny's account. Current validation used local fixture accounts. Production Firebase permissions apply to `music/jams`, `music/playlistOrder`, and the existing library and profile records.

See [VALIDATION.md](VALIDATION.md) for upload counts and test results, and [MUSIC.md](MUSIC.md) for data paths and maintenance.

---

## Archived instructions for earlier releases

# Release owner: shared web 2026.11.16-2 / native 2.0.2

The deliverables are prepared locally. Publication remains your step. Use these current instructions; older instructions below are history.

1. In public repository **dowsy456/chat-app-desktop**, publish a normal latest release tagged **v2.0.2**. Upload **Chat-App.exe first**, at `https://github.com/dowsy456/chat-app-desktop/releases/download/v2.0.2/Chat-App.exe`.
2. Upload the matching **native-update.json** to that same release. Use these exact filenames. Do not modify/rebuild the EXE after its manifest is signed. Do not use a draft or prerelease. Never upload the private signing key.
3. Extract **chat.zip** and publish its complete contents through the existing shared-web GitHub source. Upload each whole top-level folder separately, including new **music/** and **tests-music/**, then the loose root files as a separate selection. Every selection is at most 100 files. Do not add an enclosing chat folder or omit existing folders.
4. **No required admin-setting change.** Leave Native Update Manifest URL at `https://github.com/dowsy456/chat-app-desktop/releases/latest/download/native-update.json`. It must serve raw signed JSON. Keep the existing shared source setting. The optional Older EXE Download URL can stay unchanged; only if intentionally updating the one-time migration link, change it from the updated Admin Panel to the v2.0.2 EXE URL after both native assets and shared code are published.
5. Test the published release from an existing 2.0.1 installation using the combined in-app update icon. When both updates are pending, native installation still happens first, and staged shared code is loaded/validated after restart. Finish calls, drafts, recordings and uploads before applying. The isolated local tests do not constitute this future published-device update test.
6. Verify a real owner and a second account on your devices: playlist uploads, ownership controls, public listening, live names/pictures, RTDB access and Spotify interruption. This task used fixture accounts and did not access production RTDB rules. [MUSIC.md](MUSIC.md) describes the existing client-account permission boundary; no new permissive database rule is required or supplied.

The Ed25519 update signature is separate from Windows Authenticode signing. The delivered EXE remains Authenticode unsigned. Avast stayed enabled; the validation report names the actual native checks and does not claim a completed Avast full scan or guaranteed false-positive immunity.

---

## Historical content from the supplied package

The following statements apply only to their named older releases. Current release instructions and validation are above.

# Release owner: shared web 2026.11.16-1 / native 2.0.1 unchanged

The updated `chat.zip` is prepared locally and has not been published. Its package timestamp and final upload audit are in [VALIDATION.md](VALIDATION.md).

1. Extract `chat.zip` and publish its complete contents to the existing shared-web GitHub source. Upload each complete top-level folder separately, including its descendants, then upload the loose root files as a separate selection. Preserve the existing layout; do not add an enclosing `chat` folder. The included upload audit verifies that each selection stays at or below 100 files.
2. Let the complete shared release become available. Existing Windows EXEs, mobile clients and browser versions receive it through their existing shared web update systems. No new EXE, native release asset, native manifest or backend deployment is part of this release.
3. Leave the Admin Panel's Native update manifest URL and optional Older EXE download URL unchanged. The stable native manifest setting remains `https://github.com/dowsy456/chat-app-desktop/releases/latest/download/native-update.json`. Do not republish an old EXE or change its manifest for this shared-only package.
4. After publication, verify the entry flow and account creation, an allowed email followed by the real Chat App password, inline **Password not found**, logout, restored saved sessions, and long Recent Links on the devices you use. The entered email is only a local presentation gate; it is not stored, transmitted, verified, or mapped to an account. Saved sessions intentionally continue to restore without re-entering that email.
5. If you want to announce the release with the existing Update Log, publish shared source first, then save the announcement in the Admin Panel. This is optional and does not require changing an update URL.

The auth-only notice must remain confined to start/sign-in/create screens. The four-color Microsoft mark is paired with **Chat App** text; passwords are Chat App credentials. No Microsoft authentication endpoint or email ownership verification is introduced. The supplied background image is retained unchanged and darkened by CSS. The regular app retains its own controls, tooltips and toast renderer.

All 98 desktop source files and the public verification key remain unchanged; native version is 2.0.1. No EXE was launched, rebuilt or repackaged, and no native-device or antivirus test was performed for this release. The private signing key was not needed and must never be uploaded. Read [NATIVE-UPDATES.md](NATIVE-UPDATES.md) before any future native updater work; its combined update icon, verified native-first sequencing and live-work protections remain unchanged.

---

## Historical release instructions retained from the supplied source

**Do not perform the native publishing steps below for 2026.11.16-1.** They are retained only for the older named releases and future maintenance context. Their build, signing and testing claims do not describe this shared-only package.

# Release owner: native 2.0.1 / shared web 2026.11.13-5

Prepared locally, not published. The Ed25519-signed native manifest matches the exact delivered EXE and the unchanged original public key. The EXE is not Authenticode signed.

1. In public repository dowsy456/chat-app-desktop, create a normal release tagged v2.0.1. Upload Chat-App.exe first at https://github.com/dowsy456/chat-app-desktop/releases/download/v2.0.1/Chat-App.exe.
2. Upload its matching native-update.json to the same release, and make this the latest release. Do not use a draft or prerelease. Do not modify the EXE after signing its JSON, rename either asset, or upload the private signing key.
3. Publish the complete contents of chat.zip through the existing shared GitHub source workflow. Upload one complete top-level folder per selection, then the loose root files. There is no enclosing chat folder; all original source paths are preserved. This continues updating native, mobile and browser clients through their shared web systems.
4. Keep Native Update Manifest URL unchanged: https://github.com/dowsy456/chat-app-desktop/releases/latest/download/native-update.json. It must serve raw signed JSON, never an EXE or Drive preview.
5. After both native assets and shared web code are published, change the optional Older EXE Download URL from the updated Admin Panel to https://github.com/dowsy456/chat-app-desktop/releases/download/v2.0.1/Chat-App.exe if you want the one-time migration/default download to use 2.0.1. Saving a newly changed link from this version records minimum 2.0.1. Existing capable 1.7.8+ hosts use the combined native updater, not repeated external downloads.
6. After publication, verify the latest manifest endpoint and a real update to 2.0.1. Both pending updates still install the native host first, then load safely staged shared code after restart; staged code is not known-good until it loads.

## First run and taskbar repair

Open the real 2.0.1 EXE once from its permanent writable location. Before its window is shown, it updates recognized stale Start Menu entries bearing Chat App's native identity and repairs known stale taskbar links. This is necessary because Windows may select the registered Start Menu app when you pin a running window. Keep the EXE at this path so subsequent in-app replacements preserve the pin target.

An already-running older host is not terminated, protecting calls and unsaved work. Finish that work and Quit the older app once; then use the repaired pin. A custom shortcut with arguments or a conflicting app ID is preserved and may need one-time replacement. Do not pin a file inside LocalAppData/Chat App/runtime. If Windows retains a stale pin in its shell cache, unpin that old entry once and pin the running 2.0.1 window after its first launch.

This repair is not limited to version 2.0.1. Future builds retaining this source can also be downloaded separately into another folder: open the newer EXE once and it updates the registered native target and recognized pins. Tests cover separate 2.0.2 and 3.0.0 release identities, missing profile markers and deleted prior downloads. A retained older repaired launcher prefers an existing verified newer Chat App launcher instead of changing registration back. In-app updates still replace the current EXE at the same path.

## Future maintenance

Read NATIVE-UPDATES.md. Preserve the app ID and user-data paths, repair the registered Start Menu source before window display, and test the sequence with no existing taskbar link followed by a newly made pin. A taskbar-only fixture does not cover this bug. Do not suppress the shared migration gate to hide an incorrectly launched older binary.

Build a higher three-part native version only when native changes require it. Keep the original public key, and run desktop/scripts/publish-native.cjs with --exe <final-exe> --url <version-specific-public-https-url> --key <original-private-key-outside-source> --out <manifest>. Publish EXE first and JSON second; keep the stable manifest setting. Shared-only changes must not rebuild native artifacts.

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

Packaged 2026-11-14T01:02:31Z (November 13, 2026, 08:02:31 PM EST). These files are locally prepared. No shared source or native assets were published by this task.

1. Extract chat.zip and publish its complete contents through the existing numbered shared-web GitHub release workflow. There is no enclosing chat folder. Upload each whole top-level folder separately and the loose root files as another selection, preserving all paths. Every selection is below 100 files.
2. The existing desktop, mobile and browser shared updaters deliver this release. No EXE, native manifest, backend deployment or admin URL change is required. Keep Native update manifest URL and Older EXE download URL unchanged. The stable native feed remains https://github.com/dowsy456/chat-app-desktop/releases/latest/download/native-update.json.
3. After the complete source is published, Vinny can save this release's Update Log at the bottom of Admin Panel. Shift + Escape adds a line; # / ## / ### / -# and **bold** / *italic* are supported. Save binds to the verified published versions. Empty text plus Save disables the popup. Editing an already-seen release's text does not replay it.
4. After publication, check Home poll creation/edit/deletion from another session, click a poll to confirm the room/message jump, resize the window, and check a signed-in second device's preferences. The local tests used isolated data; actual published-device behavior is a separate check.

Native source remains 2.0.0. All 98 supplied desktop files, including desktop/native-update-key.json, are byte-identical. No EXE was launched, rebuilt or repackaged and no native manifest was changed. The private signing key was not opened or copied. Preserve the existing combined updater, native-first sequencing, staging validation and live-work protections. Read NATIVE-UPDATES.md for future native releases.

## Upload audit

462 source files. All 458 supplied source paths remain at their original paths. Four regression files were added; no source was moved or deleted. Dependencies, generated builds, test captures and private signing material are excluded. Existing checked-in native helper binaries are retained unchanged.

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

See VALIDATION.md for completed checks and HOME-SCHEDULES-UPDATE-LOG.md for maintenance.

---

## Previous instructions (historical)

# Shared web 2026.11.13-2 / native 2.0.0 unchanged

Packaged 2026-11-14T00:22:21Z (November 13, 2026, 07:22:21 PM EST). Prepared locally; no shared source or native assets were published during this task.

1. Extract chat.zip. There is no enclosing chat folder. Publish all source contents to the next existing numbered shared-web GitHub release, preserving the paths and normal update workflow. Upload each complete top-level folder separately, then the loose root files. Include new CSS, JS, tests and HOME-SCHEDULES-UPDATE-LOG.md. All selections stay under the 100-file limit.
2. Let the complete shared release become available, then open the latest app as Vinny. At the very bottom of Admin Panel, enter Update Log and click Save. Shift + Escape adds a line. Use # / ## / ### / -# and **bold** / *italic*. Save binds the text to verified published versions. Empty text plus Save disables it; editing the same release does not replay it to accounts that already saw it.
3. No native release or backend deployment is required by this package. Keep the current Native update manifest URL and Older EXE migration setting unchanged. The stable native manifest URL remains https://github.com/dowsy456/chat-app-desktop/releases/latest/download/native-update.json. Do not upload a new native manifest or repackage the EXE for these changes.
4. After publication, verify Home, schedules, calendar and one unseen account's Update Log on the actual devices. The modal requires the latest published shared code; an EXE also needs the latest published native version recorded when saving the log. GitHub/database verification must succeed. It starts about 500ms after verified login, or later while verification/another modal is pending.

The supplied EXE's file/product metadata reports 2.0.0.0; desktop/package.json stays 2.0.0. All 98 supplied desktop files, including the public verification key, are byte-identical. No EXE was built, repackaged or launched, and no native manifest was created or changed. The supplied private signing key was not opened, copied or packaged. Working 1.7.8+ hosts retain their existing in-app native updater; 1.7.7's prior one-time migration requirement is unchanged. Shared UI updates continue through the existing shared updater.

## Upload audit

458 source files. All 447 supplied source paths are retained. No paths moved or deleted. Dependencies, generated builds, test captures and private signing material are excluded. Original checked-in source helper binaries are retained unchanged.

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

See VALIDATION.md for tests/limits and HOME-SCHEDULES-UPDATE-LOG.md for future maintenance.

---

## Previous release instructions (historical)

# Release owner: native 2.0.0 and shared web 2026.11.13-1

These files are locally prepared, not published. The native manifest is signed for the exact delivered EXE using the existing verification key and its original matching private key. The EXE itself is not Authenticode signed.

1. In the public `dowsy456/chat-app-desktop` repository, create a normal release with tag `v2.0.0`; do not mark it draft or prerelease. Upload `Chat-App.exe` first. Its permanent download URL must be `https://github.com/dowsy456/chat-app-desktop/releases/download/v2.0.0/Chat-App.exe`.
2. Upload the matching `native-update.json` to that same release after the EXE. Mark it the latest release. Do not rename either asset or modify the EXE after signing the JSON. Do not upload the private signing key.
3. Publish the contents of `chat.zip` to the existing shared-web GitHub source, keeping the existing repository layout. Upload each complete top-level folder separately and the loose root files as a separate selection. There is no enclosing `chat` folder. See VALIDATION.md for final per-folder counts. This supplies shared web 2026.11.13-1 to desktop, mobile and browser through their existing update paths.
4. Keep the Admin Panel's **Native update manifest URL** at `https://github.com/dowsy456/chat-app-desktop/releases/latest/download/native-update.json`. This must resolve to raw signed JSON, never an EXE or Google Drive preview.
5. Only after both native assets and shared web code are published, use the updated Admin Panel to change the optional **Older EXE download URL** to `https://github.com/dowsy456/chat-app-desktop/releases/download/v2.0.0/Chat-App.exe` if you want a one-time repair/migration link. Saving the changed URL from this shared version records minimum 2.0.0. Leave it empty to permit older EXEs. Do not keep a 1.7.8 EXE link while recording minimum 2.0.0.
6. Test the stable manifest endpoint and an actual 1.7.8+ in-app update after publication. With both updates pending, the native host installs first and safely staged shared code loads after restart. The combined icon protects calls, drafts, recordings and uploads and does not mark staged web code known-good until it loads.

## Taskbar migration

Open the real portable EXE in its permanent writable location. A working 1.7.8+ host can install 2.0.0 through its existing combined update icon after publication; no recurring manual download is needed. If the old taskbar pin opens the wrong cached copy, open the original EXE once from Explorer to perform this upgrade, or open the release-owner-provided 2.0.0 file once. Version 2.0.0 repairs recognized Chat App runtime pins and sets the correct pin/relaunch target. Windows pins cannot execute a repair before the repaired version has first run. If Windows retains a stale shell pin, unpin it once and pin the running 2.0.0 app. A pin to a separately retained pre-2.0 outer EXE also needs replacement of that exact file or one-time repinning; those older hosts never recorded their original location. Future native replacements preserve the same EXE path.

Do not pin files inside `%LOCALAPPDATA%\Chat App\runtime`, rename/move the pinned EXE after pinning, or publish a version under another version's asset URL. No administrator privileges, runtime scripts or antivirus exclusions are required.

## Future native maintenance

Read NATIVE-UPDATES.md. Keep the original public key unchanged. Build a higher three-part version, test the packaged Electron HTTPS path and shortcut recovery, then use `desktop/scripts/publish-native.cjs --exe <final-exe> --url <version-specific-public-https-url> --key <private-key-outside-source> --out <manifest>` to sign the final bytes. A changed build requires a new manifest. Publish EXE first, JSON second; retain the stable manifest setting. Web-only work uses the shared updater without rebuilding native artifacts.

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

## Publish the shared source

Extract chat.zip; it has no enclosing chat folder. In the existing shared GitHub repository, upload each complete top-level folder as one selection, then upload loose root files as a separate selection. Replace matching paths and complete the existing shared publication workflow. Include new CSS, JS, tests and maintenance files. No backend deployment is required.

No admin settings change is required. Keep the native manifest URL `https://github.com/dowsy456/chat-app-desktop/releases/latest/download/native-update.json` and optional Older EXE migration URL unchanged. Do not create a native release for this package. No shared source or native assets were published during this task.

## Upload audit

445 files. All 435 supplied paths are retained; all 96 desktop files are byte-identical. Every complete top-level folder and loose-root selection is at most 100 files. No paths moved or deleted. Dependencies, generated builds, test captures and private signing material are excluded. Original checked-in helper binaries remain unchanged.

| Selection | Recursive file count |
| --- | ---: |
| Loose root files | 20 |
| activities | 19 |
| activity-modules | 9 |
| assets | 11 |
| backend | 6 |
| call-modules | 19 |
| css | 41 |
| desktop | 96 |
| js | 88 |
| scripts | 5 |
| tests-release | 30 |
| tests | 98 |
| vendor | 3 |

Maintenance: `UPLOAD-AUTH-TABS.md`. Verification and existing test limitations: `VALIDATION.md`.
