# Windows 2.0.7

The Windows shell owns the wallpaper-matched title bar. Its launch diagnostic checks the computed divider width across two wallpaper colors and the default theme. The native tray uses the existing volume command to set 0% or restore the last positive level supplied by the shared player. Older shared revisions can receive that same command.

Windows screen capture retains the existing process-excluding system loopback. The shared code in `call-modules/shared-audio.js` mixes explicitly registered attachment and HTML playback into the outgoing screen track. Keep remote call playback, Music and notification sounds outside that registry. Preserve normal page origin and Content Security Policy restrictions on HTML. Verify the viewer end of a real WebRTC connection with distinguishable tones and exercise Windows loopback in addition to UI checks.

Use `desktop/scripts/publish-native.cjs` with the original private key stored outside this tree. Generate the manifest for the final portable bytes and tag-specific HTTPS URL. For future native builds, run the packaged Electron network diagnostic against the stable feed and confirm updater verification accepts the final owner-signed manifest. See RELEASE-INSTRUCTIONS.md for the publication order.

---

# Windows 2.0.6

Windows owns the title bar in a different renderer from the shared application. Electron forwards the active app view's theme color to the title bar. Retain the normal fallback when the wallpaper is cleared, the view is replaced or loading fails. Exercise the isolated wallpaper launch diagnostic with two distinctly colored images before releasing future host changes.

Continue to sign routine native releases with the original Ed25519 key. Run the packaged stable-feed network diagnostic, verify the final release executable against the signed manifest, and follow [RELEASE-INSTRUCTIONS.md](RELEASE-INSTRUCTIONS.md) for publication. The executable's Windows Authenticode status and the updater's signed release manifest are independent.

---

# Windows 2.0.5 and shared web 2026.11.21-1

The native host owns the Windows popup windows, their hit regions and the tray renderer. Test real Windows hit targets and actions after changing those components. A renderer-only click or opacity assertion cannot establish that the operating system will deliver the first mouse click to the intended window.

Use the packaged network diagnostic described below with its default stable feed. If a published manifest has a broken asset, save that failure separately. In a second isolated profile the same diagnostic supports `CHAT_APP_NETWORK_REFERENCE=1` to verify the fixed historical v2.0.2 manifest and executable through the shipping Electron transport. This switch only takes effect inside the explicitly enabled diagnostic. Neither diagnostic installs its download. The ordinary combined updater continues to use the configured manifest and its signed URL.

Keep the original verification key and the version-specific release URL paired with the exact shipped EXE. Follow the current owner instructions in RELEASE-INSTRUCTIONS.md.

## Earlier releases

# Windows 2.0.4 and shared web 2026.11.18-2

Version 2.0.3 disabled standalone Repeat in both the packaged tray renderer and its command handler. The new host enables that command for the owner of playback while retaining the individual-audio restrictions on Next, Previous and Shuffle and the Jam guest restrictions. The shared player owns repeat preference storage and looping. Keep those two native gates in sync when updating this feature. The existing native updater maintenance contract below continues to apply.

---

## Prior release

# Windows host 2.0.3 and shared web 2026.11.18-1

The native change updates the packaged tray renderer and its validated Music state and command bridge. On 2.0.3, the tray can seek the current track and display its cover and album. The shared player owns playback, Jam permissions, volume and position. Keep the artwork IPC scoped to a supported image and the current track when extending the tray.

The in-app updater baseline is 2.0.1. Keep the original verification key, the stable manifest feed, native-first ordering, successful-load gate for shared code, and existing data/portable-launch paths. Future native builds must exercise the documented packaged Electron network test against the public GitHub endpoint and sign the exact release binary. See RELEASE-INSTRUCTIONS.md for the owner’s upload order and VALIDATION.md for actual checks.

---

## Archived release record

# Shared web 2026.11.17-1 on Windows host 2.0.2

Publish the shared source using [RELEASE-INSTRUCTIONS.md](RELEASE-INSTRUCTIONS.md). The existing Windows host loads the shared Music player and passes native tray commands to it. The player enforces Jam listener controls for those commands. No EXE or native manifest is part of this release. The packaged transport test for the supplied 2.0.2 EXE is recorded in [VALIDATION.md](VALIDATION.md).

---

## Historical native release and updater maintenance

# Current package: shared web 2026.11.16-2 / native 2.0.2

This release changes the native host only to add Music state/commands to the existing tray UI. It preserves the original public verification key, portable launcher identity, sign-in/preferences/profile directories, combined update icon, native-first ordering and staged shared-code validation. The repaired in-app updater baseline is native 2.0.1; native 2.0.2 is a routine in-app release.

Publish the exact final EXE first and its matching signed manifest second in the normal latest v2.0.2 release. Keep the stable manifest setting unchanged. See [RELEASE-INSTRUCTIONS.md](RELEASE-INSTRUCTIONS.md) and [VALIDATION.md](VALIDATION.md). Locally prepared files do not prove publication.

The Music tray diagnostic requires `CHAT_APP_MUSIC_SELFTEST=1`, `CHAT_APP_OFFLINE=1`, and an absolute `CHAT_APP_TEST_PROFILE`. It seeds isolated tray state, uses the production validated IPC paths, stubs shared playback commands to avoid live account/database activity, captures the tray and exits. Real audio/control behavior is independently tested through browser fixtures. Omit these flags for normal use. Existing network and launch diagnostics retain their separate gates.

Read the historical maintenance contract below before any future updater/launcher change. The current host version is 2.0.2; older version numbers and release results below apply only to those historical builds.

---

## Historical content from the supplied package

The following statements apply only to their named older releases. Current release instructions and validation are above.

# Current package: shared web 2026.11.16-1 / native 2.0.1 unchanged

This package updates only shared web presentation and behavior. All 98 supplied desktop files and the original public verification key are unchanged. No EXE was launched, rebuilt or repackaged, no native manifest was created or changed, and no native-device or antivirus testing was performed. The locally prepared package is not evidence of publication. See [RELEASE-INSTRUCTIONS.md](RELEASE-INSTRUCTIONS.md) and [VALIDATION.md](VALIDATION.md) for the current release.

Use the existing shared GitHub updater. Leave both native/admin update URLs unchanged. The sign-in redesign preserves the existing Chat App password lookup, saved-session restoration, preferences and native window identity. It does not change native updater behavior, native-first sequencing, staging validation, the combined update icon, or protection for calls, drafts, recordings and uploads.

The native 2.0.1 release snapshot below is historical. Its maintenance contract remains applicable to future native work; its older shared-web version and native publishing/test statements are not the status of this package.

---

# Native update maintenance contract

Current native source version: **2.0.1**. Shared web **2026.11.13-5** preserves the latest poll/Update Log features and updates the optional migration link's native minimum/help. Version 2.0.1 fixes Windows resolving newly pinned Chat App windows through a stale Start Menu AppID registration. Assets are prepared locally, not published.

Taskbar maintenance: preserve app.chatapp.desktop, repair recognized per-user Start Menu registrations and existing taskbar pins BEFORE acquiring the instance lock or showing the window, and register the real portable EXE with the same app ID. Keep the portable EXE as the native update target and shell-readable icon. Preserve profile-specific cached-runtime recovery. Never terminate an older running host to repair its registration. Do not replace unrelated/custom shortcuts or add runtime shell scripts.

The 2.0.0 test missed a registered 1.7.2 Start Menu link: start with that stale registration and NO taskbar pin, start the new host, then create/launch a pin from the repaired registration. Cold-launch the registered app through Windows as well as directly through the EXE.

Future versions must retain this version-independent registration logic. A separately downloaded 2.0.2, 3.0.0 or later EXE opened from a new path becomes the registered native launcher; no in-app upgrade prerequisite exists. Exact AppID and bounded Chat App PE metadata recover existing outer-EXE registrations when the profile marker is missing. A deleted target is recoverable only with the exact AppID and canonical shortcut name. Preserve custom arguments and foreign identities. An older repaired launcher forwards only to a distinct, existing Chat App EXE whose actual native version confirms the saved newer release, preventing stale metadata or same-path loops. This metadata read establishes shortcut ownership; signed native-update verification must remain unchanged.

1. Read this before changing the update system. Keep the single combined update icon for shared, native, or both updates. Shared GitHub code must continue to reach desktop/mobile/browser. Preserve sign-in, preferences, user-data paths and normal launch.
2. Native 1.7.8 repaired Electron's GitHub redirect/download behavior. A 1.7.7 host needs a one-time manual move to 1.7.8; subsequent routine native releases use the in-app updater. Do not present a shared-web package as a native release.
3. When a native change is necessary, increment the three-part version, build and validate the final EXE, and preserve `desktop/native-update-key.json` exactly. Sign with the matching original private key using `desktop/scripts/publish-native.cjs`; read that script's actual CLI before invoking it. Never generate a replacement key during routine updates.
4. The public repository is `dowsy456/chat-app-desktop`. Keep asset filenames `Chat-App.exe` and `native-update.json`. Use a version-specific EXE URL, e.g. `https://github.com/dowsy456/chat-app-desktop/releases/download/v1.7.9/Chat-App.exe` only for an actual 1.7.9 build. The stable manifest setting remains `https://github.com/dowsy456/chat-app-desktop/releases/latest/download/native-update.json`.
5. Publish the exact EXE first, then its matching signed manifest in a normal latest release, not draft/prerelease. The manifest URL must serve raw signed JSON. If the original private key or final real HTTPS download URL is unavailable, complete build/tests and request what is missing; never sign a placeholder or claim delivery is live.
6. Test real GitHub HTTPS redirects through the packaged Electron network path when changing native downloading. Node-only mocks do not verify that behavior. Preserve download signature/hash verification, safe replacement/restart, protection for calls/drafts/recordings/uploads, and native-first installation when both update types are pending. Do not mark staged web code known-good until it loads successfully.
7. The Older EXE download URL is only an optional one-time migration link. Change it from the updated shared admin panel only after publishing matching native and shared releases, so the correct native minimum is recorded.
8. Never package private signing material in source ZIPs, release assets, GitHub, Firebase or the app. Do not introduce runtime PowerShell, batch, command-shell/downloaded scripts, antivirus bypasses or exclusions. Investigate any actual detection without disabling protection or blindly restoring quarantine. Report the native-device and antivirus tests actually completed.

For the earlier native 1.7.9 release only, publish the version-specific v1.7.9 EXE first, then its matching signed manifest. Keep the stable manifest URL unchanged. Leave the optional Older EXE migration link unchanged unless intentionally migrating older clients after both releases are published. Native publication is separate from shared source publication; locally prepared files are not evidence of either.

The release-owner network diagnostic runs only with both CHAT_APP_NETWORK_SELFTEST=1 and an absolute CHAT_APP_TEST_PROFILE directory. It fetches the fixed public release manifest through the shipping Electron net transport, follows real HTTPS redirects, verifies the signed EXE into that isolated profile, writes native-network-selftest.json and exits. It never installs the fetched EXE, enables remote debugging, changes certificate verification or accepts arbitrary URLs. Omit both flags for normal launches.

The release-owner launch diagnostic requires CHAT_APP_LAUNCH_SELFTEST=1, CHAT_APP_OFFLINE=1 and an absolute CHAT_APP_TEST_PROFILE. Run the final portable EXE first, then the runtime execPath reported in native-launch-selftest.json without PORTABLE_EXECUTABLE_FILE/PORTABLE_EXECUTABLE_DIR. The second report must include forwardedFrom and the same portable target/profile, native 2.0.1, supported updater and loaded shared bridge. It creates/repairs Windows shortcut fixtures only inside the isolated profile, never changes real taskbar pins, and never installs an update. Normal launches omit these flags.

For the launch selftest, pre-seed profile/start-menu-fixtures/Chat App.lnk with a stale registered runtime target and optionally profile/pin-fixtures with old pins. The same pre-lock production registration branch runs against only those fixture directories when the triple diagnostic gate is active. native-launch-selftest.json includes startupRegistration and verifies that the registered entry was corrected before shared content loaded. Tests must launch the repaired Windows .lnk after the first process exits, not only inspect its fields.
