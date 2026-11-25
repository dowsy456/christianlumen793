# Current sign-in, upload and tab maintenance: shared web 2026.11.21-2

## Sign-in ownership

`js/accounts/sign-in-ui.js` owns the email step, transitions, loading state and dedicated auth notice. `css/auth-refresh.css` owns only logged-out presentation. Keep the reference-style white card, Segoe UI font stack, A+ icon with the GradeSort wordmark, and `assets/sign-in-background.png`. The image contains the original supplied pixels; its dark effect belongs to CSS.

The six allowed email strings are a local UI gate only. Matching trims whitespace and ignores case. Do not persist or send the entered email, send mail, attach it to user records, or claim that it verifies identity or authorization. Any allowed string permits the password step, and the existing `loginWithCode` credential lookup alone selects the account. Keep that lower-level lookup usable by restored sessions: bypassing the email prompt for an existing saved session is deliberate, preserving the normal launch, sign-in and preferences experience.

Next moves between email/password steps with sliding and loading feedback, including the brief “Trying to sign you in” panel from the recording. Cancel invalidates that pending transition and returns to the email step. Sign in holds the loading indicator while the existing lookup completes. Unknown passwords show exactly **Password not found** below the password input. “Can't access your account?” opens account creation, preserving its existing username/avatar/account-creation controls and generated Chat App password. Do not add passkey/account suggestions, sign-in options or forgot-password text.

`showAuthNotice` will NEVER be used inside the regular app. Keep its explicit source note and runtime guard. It is only for start/sign-in/create feedback, including the generated password and Copy button; generated passwords remain available until dismissed. The main app must continue using `js/ui/toasts.js`. Keep regular app custom tooltips, message menus and modals suppressed on auth screens without weakening their behavior after sign-in. Do not introduce a second in-app notification style.

## Browser identity

The logged-out/default title is **Sign in to GradeSort**. Keep the default icon URL aligned in `js/ui/tab-bootstrap.js` and `js/core/session.js`:

`./assets/gradesort.svg`

Bootstrap still runs before app initialization and validates cached account identity against the project. Preserve the saved browser title/icon preferences after sign-in, stale-response guards, logout reset and the distinction between browser tab settings and native window identity. The previous GradeSort title, default SVG and branding instructions in the historical section below are superseded.

## Home and contextual menus

Keep `.home-link-row` height automatic and its URL text wrapping at every height breakpoint. Long unbroken domains/paths must stay inside the original row; the complete destination and copied URL must remain unchanged. Other Home tools retain their compact row heights. `js/chat/message-menu.js` owns concise Pin/Unpin, Leave, Edit and Copy labels, with Name/Icon inside Edit. Do not remove words needed to distinguish separate asset or destructive actions.

## Verification and publication

Run the focused `node tests-release/auth-signin.browser.cjs` and `node tests-release/home-links-menus.browser.cjs` regressions plus affected browser-tab/unit checks and `npm run audit:upload`. Use local database fixtures and keep captures outside the packaged source. See [VALIDATION.md](VALIDATION.md) for checks actually completed, timestamp and final per-folder counts.

Refresh entry/dynamic cache revisions, shared package versions, `build-info.json` and `desktop-capabilities.json` web revision together. Preserve all original source files. Exclude generated dependencies, build output, captures and signing material. Publish the full ZIP contents through the existing shared GitHub workflow, one top-level folder at a time, with loose root files separately and no enclosing folder. Native 2.0.1 and all 98 desktop files remain unchanged; no native artifact or admin update URL change is needed. Prepared files have not been published, and no native-device or antivirus tests were performed.

The upload-card implementation described below remains unchanged. The old auth/GradeSort identity guidance is retained as historical context, not current behavior.

---

## Historical maintenance notes retained from the supplied source

# Upload, GradeSort and browser tab maintenance

## Upload cards and live progress

`js/media/upload-previews.js` registers after `media/uploads`. `css/upload-progress.css` loads after media-fixes; shared control and scrollbar styles retain their final position. Keep the filename centered and the progress meter at the header's right. Do not restore the old preparing-preview surface or centered percentage. The static background uses `blur(10px)`, matching the call menu's unwatched screen preview.

Generate each preview once per Blob, in parallel with object upload. Images and the first decodable video frame are rasterized. PDF uses its first page through the existing PDF loader. HTML/text uses inert document/text artwork, never executing attached HTML or requesting its resources. EXE previews read bounded PE icon resources as data without executing the file. Generic file icons cover unsupported, encrypted, unavailable-codec, oversized or unrenderable previews. This is a best-effort still preview, not a universal document renderer. PDF reading is capped at 32MiB and timed out; PE headers/resources have explicit bounds checks. Preserve object-URL cleanup, PDF cancellation and late-loader expiry checks.

Output is 128x72 JPEG with a maximum 4096-character data URL. Downscale at encoding; the source document canvas can be larger. A WeakMap memoizes Blob work. Do not add screenshot loops, live video elements, remote HTML embeds or repeated decoding. Preview generation adds small bounded work; no claim of zero CPU/network overhead is made.

`createMessageUploadReporter` coalesces progress at 800ms (1000ms retry) and updates only existing pending attachment slots through guarded transactions. Values are monotonic and capped below 100 until descriptor publication. Whole-message transactions preserve existence and concurrent fields, so thumbnails must remain tiny. Stop immediately invalidates the reporter; never wait indefinitely for an offline metadata transaction on cancel. Late callbacks/retries must no-op for stopped, deleted or committed files. Final descriptor publication removes transient upload metadata. Keep the existing storage provider, cleanup index and cancellation/commit ownership rules.

`patchMessageUploadCards` takes the fast path only when all non-progress/preview message fields are identical. It patches percent and bar in place, reusing the decoded thumbnail. Text edits, reactions, final descriptors and other changes use the normal renderer. Sender/receiver tests must use separate contexts and transfer only database snapshots, never the sender's Blob or local callback.

## Browser identity

`js/ui/tab-bootstrap.js` runs synchronously after the static title in the head. Its `data-project` must match `App.firebaseConfig.projectId`; tests enforce alignment. Only a matching saved account/bootstrap record may supply cached identity. `core/session` owns resolved identity thereafter. Keep the default favicon SVG identical in bootstrap and session. Use an explicit default icon rather than removing the link and letting the browser retain a stale icon.

Preserve native bridge guards: these preferences are browser-only. Remote icon URLs still depend on network availability; setting a URL synchronously cannot guarantee remote image delivery. Do not restore the obsolete unscoped title read in showView. Invalidate older image validation on edits, clears, presets, account changes and logout. Keep the startup tab-settings revision guard so delayed server responses cannot overwrite newer local edits.

## GradeSort and shared styling

Auth markup keeps all existing control IDs for navigation, avatar selection/cropping and login. Auth styles are scoped to logged-out views; ui-controls.css continues to own shared buttons. Keep GradeSort branding on mobile; do not reinstate the former mobile-only Chat App replacement. The receipt label is deliberately sentence case: `Seen by`. Spotify progress, focus and selected controls use shared blue/control tokens.

## Verification and publication

Run `npm run test:upload-auth-tabs`, `npm test`, `node --test tests-release/*.test.cjs`, affected media/settings browser suites, and `npm run audit:upload`. Focused tests use isolated database fixtures. Refresh entry and dynamic asset revisions together, with build-info.json, package versions and desktop-capabilities.json webRevision. Native version/source stays unchanged for shared-only changes. Read NATIVE-UPDATES.md before updater work. See VALIDATION.md for actual checks and existing test limitations.
