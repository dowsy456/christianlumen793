# Chat App

This package contains shared web **2026.11.24-2** and the source for Windows host **2.0.7**. The package timestamp is in `build-info.json`.

Open Music beside Settings in the sidebar account dock. Audio on Home and on Music profiles lists each uploader’s tracks. Profile actions and avatar menus offer Schedule for assigned schedules and Music for people who have uploaded audio or have playlists. Start a Jam from either Music controller and join from a participant's profile. Vinny can manage another person's library from their Music profile.

Read [MUSIC.md](MUSIC.md) for architecture, format/network/background limits and the existing account model's authorization boundary. Read [RELEASE-INSTRUCTIONS.md](RELEASE-INSTRUCTIONS.md) for the exact owner publishing steps and [VALIDATION.md](VALIDATION.md) for completed tests and upload counts. The original public update key and combined native/shared update system remain intact.

---

## Historical content from the supplied package

The following statements apply only to their named older releases. Current release instructions and validation are above.

# Shared web 2026.11.16-1 / native 2.0.1 unchanged

Prepared locally for the release owner; this package has not been published. The current package timestamp, completed checks and final upload counts are recorded in [VALIDATION.md](VALIDATION.md) and `build-info.json`.

The start, sign-in and account-creation screens now use a white sign-in card, Segoe UI typography, the A+ icon with the **GradeSort** wordmark, and the supplied photograph darkened through CSS. This is Chat App's own credential flow. Next moves from the email step to the password step with sliding/loading feedback; Sign in shows loading feedback before opening the regular app. Unknown app passwords display **Password not found** below the password field. “Can't access your account?” opens account creation. Sign-in options, forgot-password text, account suggestions and passkey UI are absent.

The six addresses in `js/accounts/sign-in-ui.js` are interchangeable, local UI-only entries. They are neither verified identities nor an authorization boundary, and they do not select an account. The entered email stays in page memory: it is not stored, sent to a server, mailed, or attached to an account record. The existing Chat App password lookup still chooses the actual account. Restoring an existing saved session deliberately bypasses the email step to preserve sign-in and preferences.

Account notices, including the generated password and its Copy button, use the dedicated auth-only renderer. It will never be reused inside the regular app; the main app retains its existing toast renderer. Auth screens suppress the regular app's custom tooltips, menus and modals. Default browser identity is **Sign in to GradeSort** with the requested favicon; saved browser tab preferences still work after login, and native window identity is unchanged.

Home's Recent Links rows now grow to wrap long domains and paths inside the same row. Message/room menus use concise Pin, Unpin, Leave, Edit and Copy labels; the Edit group contains Name and Icon. Existing actions remain intact.

Publish the complete contents of `chat.zip` through the existing shared GitHub source workflow. Upload one complete top-level folder per selection, then the loose root files. There is no enclosing `chat` folder. See [RELEASE-INSTRUCTIONS.md](RELEASE-INSTRUCTIONS.md) for the current release steps. Existing EXEs receive these changes through their shared web updater after publication. No admin URL change, native manifest, new EXE or backend deployment is required.

All 98 supplied desktop files remain unchanged, including the public verification key. No EXE was launched, built or repackaged for this shared-only release, and no native-device or antivirus testing was performed. Prior native testing recorded below belongs to its original release. The private signing key is not part of this source package.

---

## Historical release notes retained from the supplied source

The material below describes earlier releases, not additional publication steps or testing for 2026.11.16-1.

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

## Development and maintenance

Install shared test dependencies with npm ci. Run npm test for the shared suite. Calendar maintenance: keep the shared gutter on .calendar-page. Day cards use intrinsic width, bounded for readable long text and narrow screens; never center the day column or stretch saved cards across it. Editing has a usable bounded editor width, and saved cards recalculate their own width from content/actions. The final .calendar-page .calendar-toolbar rule cancels horizontal compact-mode padding without moving the grid. Preview ResizeObserver measurements add is-scrollable only for real overflow. Nonoverflowing previews use overflow:clip and native ancestor scrolling; overflowing previews use overflow-y:auto and overscroll-behavior-y:contain. Do not reintroduce a wheel handler or assign scrollTop for page handoff. Observe new previews, unobserve removed month cells and disconnect on page teardown. Keep css/scrollbars.css last for shared scrollbar defaults. Run npm run test:calendar-layout, npm run test:calendar, npm run test:calendar-order and npm run audit:upload after relevant changes.

Keep every source path; exclude generated dependencies/builds, captures and private signing material from chat.zip. Read NATIVE-UPDATES.md before future updater work. RELEASE-INSTRUCTIONS.md has publication and upload counts; VALIDATION.md records actual checks.

## Retained storage-worker source

The latest supplied ZIP omitted this appendix while its storage integration tests still required it. This exact code block was recovered from the earlier supplied source (shared web 2026.11.08-5), preserved in this workspace. It is retained for maintenance and local tests; this calendar release does not change, publish or redeploy the Worker, B2 or Firebase configuration. Worker secrets remain external settings and are not embedded here. Keep this marked block when editing release documentation.

<!-- BEGIN STORAGE WORKER -->

```javascript

// Paste this entire module into a Cloudflare Workers Free worker.

// B2_KEY_ID and B2_APP_KEY are Worker secrets, never browser configuration.

const encoder = new TextEncoder();

const DEFAULT_FILE_LIMIT_MB = 100;

const FILE_LIMIT_URL = 'https://chatappv6-e9da9-default-rtdb.firebaseio.com/admin/fileUploadLimitMB.json';

async function readFileLimit() {

  let value;

  try {

    const response = await fetch(FILE_LIMIT_URL, {cache:'no-store', headers:{'Cache-Control':'no-cache'}});

    if (!response.ok) throw new Error('Firebase settings unavailable.');

    value = await response.json();

  } catch {

    throw Object.assign(new Error('The File Upload Limit could not be loaded. Please retry.'), {status:503});

  }

  const text = typeof value === 'number' || typeof value === 'string' ? String(value).trim() : '';

  const number = /^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text) ? Number(text) : NaN;

  const bytes = Math.floor(number * 1024 * 1024);

  const megabytes = Number.isFinite(number) && number > 0 && Number.isSafeInteger(bytes) && bytes >= 1 ? number : DEFAULT_FILE_LIMIT_MB;

  return {megabytes, bytes:Math.floor(megabytes * 1024 * 1024)};

}

const encode = value => encodeURIComponent(value).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

const hex = value => [...new Uint8Array(value)].map(byte => byte.toString(16).padStart(2, '0')).join('');

const validKey = key => typeof key === 'string' && key.length <= 400 && /^(attachments|html)\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\/?$/.test(key);

const decodeXML = value => String(value || '').replace(/&(?:amp|lt|gt|quot|apos);/g, entity => ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"})[entity]);

const xmlValue = (xml, name) => decodeXML(xml.match(new RegExp('<' + name + '>([\\s\\S]*?)</' + name + '>'))?.[1]);

async function hmac(key, text) {

  const imported = await crypto.subtle.importKey('raw', typeof key === 'string' ? encoder.encode(key) : key, {name:'HMAC',hash:'SHA-256'}, false, ['sign']);

  return crypto.subtle.sign('HMAC', imported, encoder.encode(text));

}

let keyCache;

async function signS3(env, method, key = '', query = {}, contentType = '') {

  const now = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');

  const day = now.slice(0, 8), scope = `${day}/${env.B2_REGION}/s3/aws4_request`;

  const endpoint = `https://s3.${env.B2_REGION}.backblazeb2.com`;

  const pathname = '/' + encode(env.B2_BUCKET) + '/' + key.split('/').map(encode).join('/');

  const signedHeaders = contentType ? 'content-type;host' : 'host';

  const params = { ...query, 'X-Amz-Algorithm':'AWS4-HMAC-SHA256', 'X-Amz-Credential':`${env.B2_KEY_ID}/${scope}`,

    'X-Amz-Date':now, 'X-Amz-Expires':'7200', 'X-Amz-SignedHeaders':signedHeaders };

  const canonicalQuery = Object.entries(params).map(([k,v]) => [encode(k),encode(String(v))]).sort((a,b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0).map(pair => pair.join('=')).join('&');

  const canonicalHeaders = (contentType ? `content-type:${contentType}\n` : '') + `host:s3.${env.B2_REGION}.backblazeb2.com\n`;

  const canonical = [method, pathname, canonicalQuery, canonicalHeaders, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n');

  const hash = hex(await crypto.subtle.digest('SHA-256', encoder.encode(canonical)));

  if (!keyCache || keyCache.day !== day || keyCache.id !== env.B2_KEY_ID || keyCache.secret !== env.B2_APP_KEY || keyCache.region !== env.B2_REGION) {

    const dateKey = await hmac('AWS4' + env.B2_APP_KEY, day);

    const regionKey = await hmac(dateKey, env.B2_REGION);

    const serviceKey = await hmac(regionKey, 's3');

    keyCache = { day, id:env.B2_KEY_ID, secret:env.B2_APP_KEY, region:env.B2_REGION, key:await hmac(serviceKey, 'aws4_request') };

  }

  const signature = hex(await hmac(keyCache.key, `AWS4-HMAC-SHA256\n${now}\n${scope}\n${hash}`));

  return `${endpoint}${pathname}?${canonicalQuery}&X-Amz-Signature=${signature}`;

}

async function storageFailure(response, method) {

  // Error pages are untrusted and can be large. Read only enough to classify

  // the provider failure; never return its raw body, URL or request details.

  let text = '', size = 0;

  const reader = response.body?.getReader(), decoder = new TextDecoder();

  if (reader) {

    try {

      while (size < 16384) {

        const {value, done} = await reader.read();

        if (done) break;

        const bytes = value.subarray(0, 16384 - size);

        size += bytes.length;

        text += decoder.decode(bytes, {stream:true});

      }

      text += decoder.decode();

    } catch {} finally { try { await reader.cancel(); } catch {} }

  }

  let code = xmlValue(text, 'Code'), message = xmlValue(text, 'Message');

  if (!code && text.trim().startsWith('{')) {

    try { const value = JSON.parse(text); code = String(value.code || ''); message = String(value.message || ''); } catch {}

  }

  const quota = /^(?:cap_exceeded|transaction_cap_exceeded|storage_cap_exceeded|download_cap_exceeded|usage_cap_exceeded|quota_exceeded)$/i.test(code) ||

    /\b(?:usage |transaction |storage |download )?cap (?:has been )?exceeded\b|\bexceeded (?:the |your )?(?:daily |usage |transaction |storage |download )?cap\b/i.test(message);

  const dailyQuota = /transaction_cap_exceeded|download_cap_exceeded/i.test(code) || /\b(?:daily|transaction|download)\b/i.test(message);

  let status = response.status, failureCode = 'B2_REQUEST_FAILED', retryable = status === 408 || status === 429 || status >= 500;

  let detail = `Backblaze returned ${status}. Please retry if the service is temporarily unavailable.`;

  let retryAfter;

  if (quota) {

    status = 429; failureCode = 'B2_ACCOUNT_CAP'; retryable = false;

    detail = 'Backblaze account usage cap reached. Check Caps & Alerts; extra buckets do not increase the account allowance.';

    if (dailyQuota) {

      retryAfter = Math.max(1, Math.ceil((86400000 - Date.now() % 86400000) / 1000));

      detail = 'Backblaze daily account cap reached. It resets at 00:00 UTC. Extra buckets do not increase this allowance.';

    }

  } else if (status === 401 || status === 403) {

    status = 403; failureCode = 'B2_FORBIDDEN'; retryable = false;

    detail = method === 'HEAD'

      ? 'Backblaze blocked the file check (403). Check account Caps & Alerts and application-key permissions.'

      : 'Backblaze denied this request (403). Check application-key permissions and account Caps & Alerts.';

    if (/^(?:SignatureDoesNotMatch|InvalidAccessKeyId|ExpiredToken|InvalidToken|unauthorized|bad_auth_token|expired_auth_token)$/i.test(code)) {

      failureCode = 'B2_AUTH_FAILED';

      detail = 'Backblaze rejected the storage credentials or signature. Check the Worker application key and region.';

    }

  } else if (status === 404) {

    failureCode = 'B2_NOT_FOUND'; retryable = false;

    detail = 'This file is no longer in storage.';

  } else if (status === 429) {

    failureCode = 'B2_RATE_LIMIT';

    detail = 'Backblaze is receiving requests too quickly. Please retry shortly.';

    const seconds = Number(response.headers.get('Retry-After'));

    if (Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 86400) retryAfter = seconds;

  } else if (status >= 500) {

    status = 502;

    detail = 'Backblaze is temporarily unavailable. Please retry.';

  }

  return Object.assign(new Error(detail), {status, code:failureCode, providerStatus:response.status, retryable, ...(retryAfter ? {retryAfter} : {})});

}

async function storage(env, method, key = '', query = {}, headers = {}, body) {

  const response = await fetch(await signS3(env, method, key, query, headers['Content-Type'] || ''), {method, headers, body, redirect:'manual'});

  if (!response.ok) {

    throw await storageFailure(response, method);

  }

  return response;

}

async function readJSON(request) {

  const reader = request.body?.getReader();

  if (!reader) throw Object.assign(new Error('Request body required.'), {status:400});

  const chunks = []; let length = 0;

  for (;;) {

    const {value, done} = await reader.read(); if (done) break;

    length += value.length;

    if (length > 1024 * 1024) { await reader.cancel(); throw Object.assign(new Error('Request too large.'), {status:413}); }

    chunks.push(value);

  }

  const bytes = new Uint8Array(length); let offset = 0;

  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }

  try { return JSON.parse(new TextDecoder().decode(bytes)); }

  catch { throw Object.assign(new Error('Invalid request JSON.'), {status:400}); }

}

async function deletePage(env, body) {

  const prefix = String(body.prefix || '');

  if (!validKey(prefix) || (body.exact !== true && !prefix.endsWith('/'))) throw Object.assign(new Error('Invalid deletion prefix.'), {status:400});

  const keep = body.keepPrefixes || [];

  if (!Array.isArray(keep) || keep.length > 1000 || keep.some(value => !validKey(value) || !value.startsWith(prefix) || !value.endsWith('/'))) {

    throw Object.assign(new Error('Invalid retained-file prefixes.'), {status:400});

  }

  const query = {versions:'', prefix, 'max-keys':'16'};

  if (body.cursor && body.cursor.restart !== true) {

    if (!validKey(body.cursor.key) || !body.cursor.key.startsWith(prefix) || typeof body.cursor.version !== 'string' || body.cursor.version.length > 1024) {

      throw Object.assign(new Error('Invalid continuation.'), {status:400});

    }

    query['key-marker'] = body.cursor.key;

    query['version-id-marker'] = body.cursor.version;

  }

  const listing = await storage(env, 'GET', '', query);

  const xml = await listing.text();

  if (!xml.includes('<ListVersionsResult')) throw new Error('Invalid storage listing.');

  const versions = [...xml.matchAll(/<(Version|DeleteMarker)>([\s\S]*?)<\/\1>/g)].map(match => ({key:xmlValue(match[2], 'Key'),version:xmlValue(match[2], 'VersionId')}));

  let deleted = 0;

  // Explicit version IDs permanently free bytes. Plain S3 DELETE only adds a

  // delete marker, which would leave the old file consuming storage.

  const removable = versions.filter(file => {

    if (!validKey(file.key) || !file.key.startsWith(prefix) || !file.version) throw new Error('Invalid object version.');

    return !(body.exact === true && file.key !== prefix) && !keep.some(value => file.key.startsWith(value));

  });

  let next = 0, failure = null;

  await Promise.all(Array.from({length:Math.min(4, removable.length)}, async () => {

    while (!failure && next < removable.length) {

      const file = removable[next++];

      try {

        const response = await storage(env, 'DELETE', file.key, {versionId:file.version});

        await response.body?.cancel(); deleted++;

      } catch (error) { failure ||= error; }

    }

  }));

  if (failure) throw failure;

  let cursor = null;

  if (xmlValue(xml, 'IsTruncated') === 'true') {

    if (deleted > 0) cursor = {restart:true}; // Never continue from a deleted version marker.

    else {

      cursor = { key:xmlValue(xml,'NextKeyMarker'), version:xmlValue(xml,'NextVersionIdMarker') };

      if (!validKey(cursor.key) || !cursor.version || (cursor.key === body.cursor?.key && cursor.version === body.cursor?.version)) throw new Error('Storage continuation did not advance.');

    }

  }

  return {deleted,cursor};

}

const PART_BYTES = 8 * 1024 * 1024;

const MAX_RELAY_BYTES = 16 * 1024 * 1024;

const MAX_B2_FILE_BYTES = 10000000000000;

const escapeXML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'})[c]);

async function issueTicket(env, value) {

  const payload = encodeURIComponent(JSON.stringify({...value, expires:Date.now() + 48 * 60 * 60 * 1000}));

  return payload + '.' + hex(await hmac(env.B2_APP_KEY, payload));

}

async function readTicket(env, token) {

  if (typeof token !== 'string' || token.length > 6000) throw Object.assign(new Error('Invalid upload ticket.'), {status:400});

  const at = token.lastIndexOf('.'), payload = token.slice(0, at), signature = token.slice(at + 1);

  const expected = hex(await hmac(env.B2_APP_KEY, payload));

  let difference = expected.length ^ signature.length;

  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ (signature.charCodeAt(i) || 0);

  if (difference) throw Object.assign(new Error('Invalid upload ticket.'), {status:403});

  let ticket;

  try { ticket = JSON.parse(decodeURIComponent(payload)); } catch {}

  if (!ticket || !validKey(ticket.objectKey) || ticket.objectKey.endsWith('/') || !Number.isSafeInteger(ticket.size) || ticket.size < 0 || ticket.expires < Date.now()) {

    throw Object.assign(new Error('Upload session expired. Please select the file again.'), {status:400});

  }

  return ticket;

}

async function uploadPlan(env, ticket, token, partNumber = 0) {

  const query = ticket.uploadId ? {uploadId:ticket.uploadId, partNumber:String(partNumber)} : {};

  const size = ticket.uploadId ? Math.min(ticket.partSize, ticket.size - (partNumber - 1) * ticket.partSize) : ticket.size;

  const transferTicket = await issueTicket(env, {...ticket, partNumber, transferSize:size});

  if (ticket.storageBackend === 'kv') {

    validateBackupTicket(ticket);

    return {storageBackend:'kv',relayOnly:true,uploadURL:'',relayURL:'/transfer?ticket=' + encodeURIComponent(transferTicket)};

  }

  return {uploadURL:await signS3(env, 'PUT', ticket.objectKey, query, ticket.contentType),

    ...(size <= MAX_RELAY_BYTES ? {relayURL:'/transfer?ticket=' + encodeURIComponent(transferTicket)} : {})};

}

async function relayUpload(request, env, token) {

  const ticket = await readTicket(env, token);

  if (!Number.isSafeInteger(ticket.transferSize) || ticket.transferSize < 0 || ticket.transferSize > MAX_RELAY_BYTES) throw Object.assign(new Error('Invalid upload part size.'), {status:400});

  if (request.headers.has('Content-Length') && Number(request.headers.get('Content-Length')) !== ticket.transferSize) throw Object.assign(new Error('Upload part size does not match.'), {status:400});

  if (ticket.storageBackend === 'kv') return backupTransfer(request,env,ticket);

  const query = ticket.uploadId ? {uploadId:ticket.uploadId, partNumber:String(ticket.partNumber)} : {};

  let stored;

  if (typeof FixedLengthStream === 'function') {

    // Cloudflare streams directly to B2 with backpressure and an enforced

    // Content-Length. Concurrent phones never accumulate whole parts here.

    const stream = new FixedLengthStream(ticket.transferSize), controller = new AbortController();

    const pumping = request.body ? request.body.pipeTo(stream.writable, {signal:controller.signal}) : stream.writable.getWriter().close();

    pumping.catch(() => {});

    try {

      stored = await storage(env, 'PUT', ticket.objectKey, query, {'Content-Type':ticket.contentType}, stream.readable);

      await pumping;

    } catch (error) {

      controller.abort();

      await pumping.catch(() => {});

      throw error;

    }

  } else {

    // Portable test runtimes without FixedLengthStream use one bounded buffer.

    const bytes = new Uint8Array(ticket.transferSize), reader = request.body?.getReader();

    let length = 0;

    if (reader) for (;;) {

      const {value, done} = await reader.read(); if (done) break;

      if (length + value.length > bytes.length) { await reader.cancel(); throw Object.assign(new Error('Upload part is too large.'), {status:413}); }

      bytes.set(value, length); length += value.length;

    }

    if (length !== ticket.transferSize) throw Object.assign(new Error('Upload part is incomplete.'), {status:409});

    stored = await storage(env, 'PUT', ticket.objectKey, query, {'Content-Type':ticket.contentType}, bytes);

  }

  await stored.body?.cancel();

  return stored.headers.get('ETag') || '';

}

async function completeMultipart(env, ticket, parts) {

  const count = Math.ceil(ticket.size / ticket.partSize);

  if (!Array.isArray(parts) || parts.length !== count || count > 10000 || parts.some((part, i) => part.partNumber !== i + 1 || !/^"?[a-fA-F0-9]{32}"?$/.test(String(part.etag || '')))) {

    throw Object.assign(new Error('The upload part receipts are incomplete. Retry the upload.'), {status:400});

  }

  const xml = '<CompleteMultipartUpload>' + parts.map(part => `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${escapeXML(part.etag)}</ETag></Part>`).join('') + '</CompleteMultipartUpload>';

  const result = await storage(env, 'POST', ticket.objectKey, {uploadId:ticket.uploadId}, {'Content-Type':'application/xml'}, xml);

  const response = await result.text();

  // S3 can report a completion error inside a 200 response.

  if (!response.includes('<CompleteMultipartUploadResult') || response.includes('<Error>')) throw Object.assign(new Error('File storage could not finish assembling the upload. Please retry.'), {status:502});

}



// The free KV backup is independent of B2 caps, but has its own finite limits.

// Pending chunks expire; successfully committed chunks never expire.

const BACKUP_MAX_BYTES = 100 * 1024 * 1024;

const BACKUP_TICKET_MS = 48 * 60 * 60 * 1000;

const BACKUP_PENDING_TTL = 3 * 24 * 60 * 60;

const isBackupKey = key => validKey(key) && /-kv1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(key);

const backupPartKey = (key, number, staged = false) => `${key}/${staged ? 'stage' : 'parts'}/${String(number).padStart(6,'0')}`;

const backupCount = size => Math.max(1, Math.ceil(size / PART_BYTES));

const backupPartBytes = (size, number) => Math.max(0, Math.min(PART_BYTES, size - (number - 1) * PART_BYTES));

const backupError = (message, code = 'BACKUP_UNAVAILABLE', status = 503, retryable = false) => Object.assign(new Error(message), {code,status,retryable});

const backupNotReady = () => Object.assign(backupError('The backup file is still reaching this region. Please retry shortly.', 'BACKUP_NOT_READY',503,true), {retryAfter:60});

function backupNamespace(env) {

  if (!env.FILE_BACKUP?.get || !env.FILE_BACKUP?.put || !env.FILE_BACKUP?.delete || !env.FILE_BACKUP?.list) {

    throw backupError('The free file backup has not been configured.');

  }

  return env.FILE_BACKUP;

}

async function backupCall(operation) {

  try { return await operation(); }

  catch (error) {

    if (error?.code?.startsWith('BACKUP_')) throw error;

    const detail = String(error?.message || '');

    if (/daily|quota|storage limit|capacity|limit exceeded/i.test(detail)) {

      throw backupError('The free backup has reached its own allowance. Existing chat text is unaffected.', 'BACKUP_LIMIT');

    }

    if (/429|rate|too many requests/i.test(detail)) {

      throw Object.assign(backupError('The free backup is busy. Please retry shortly.', 'BACKUP_BUSY',503,true), {retryAfter:2});

    }

    throw backupError('The free backup is unavailable. Please retry later.', 'BACKUP_UNAVAILABLE',503,true);

  }

}

function validateBackupTicket(ticket) {

  if (ticket.storageBackend !== 'kv' || !isBackupKey(ticket.objectKey) || ticket.objectKey.split('/').length > 4 ||

      ticket.partSize !== PART_BYTES || !Number.isSafeInteger(ticket.size) || ticket.size < 0 || ticket.size > BACKUP_MAX_BYTES ||

      !Number.isSafeInteger(ticket.createdAt) || !Number.isSafeInteger(ticket.sessionExpires) || ticket.sessionExpires < Date.now()) {

    throw backupError('Invalid or expired backup upload session.', 'BACKUP_SESSION',400);

  }

}

async function backupDeleted(env, objectKey, createdAt = 0) {

  const kv = backupNamespace(env);

  if (await backupCall(() => kv.get(`__deleted/${objectKey}`))) return true;

  const segments = objectKey.split('/');

  for (let count = 2; count < segments.length; count++) {

    const prefix = segments.slice(0,count).join('/') + '/';

    const mark = await backupCall(() => kv.get(`__prefix_deleted/${prefix}`, 'json'));

    if (mark && Number(mark.cutoff) >= createdAt && !(mark.keep || []).some(value => objectKey.startsWith(value))) return true;

  }

  return false;

}

async function assertBackupActive(env, ticket) {

  validateBackupTicket(ticket);

  if (await backupDeleted(env,ticket.objectKey,ticket.createdAt)) throw backupError('This file upload was cancelled or its message was cleared.', 'BACKUP_DELETED',409);

}

async function backupTransfer(request, env, ticket) {

  await assertBackupActive(env,ticket);

  if (!Number.isInteger(ticket.partNumber) || ticket.partNumber < 1 || ticket.partNumber > backupCount(ticket.size) ||

      ticket.transferSize !== backupPartBytes(ticket.size,ticket.partNumber)) throw backupError('Invalid backup part.', 'BACKUP_PART',400);

  // Only one bounded part is buffered for integrity hashing, never a full file.

  const bytes = new Uint8Array(ticket.transferSize), reader = request.body?.getReader();

  let offset = 0;

  if (reader) for (;;) {

    const {value,done} = await reader.read(); if (done) break;

    if (offset + value.length > bytes.length) { await reader.cancel(); throw backupError('The backup part is too large.', 'BACKUP_PART',413); }

    bytes.set(value,offset); offset += value.length;

  }

  if (offset !== bytes.length) throw backupError('The backup part is incomplete.', 'BACKUP_PART',409);

  const digest = hex(await crypto.subtle.digest('SHA-256',bytes));

  const etag = hex(await hmac(env.B2_APP_KEY, `kv-part-v1\n${ticket.objectKey}\n${ticket.partNumber}\n${bytes.length}\n${digest}`)).slice(0,32);

  const metadata = {objectKey:ticket.objectKey,bytes:bytes.length,etag,digest,createdAt:ticket.createdAt};

  const kv = backupNamespace(env), key = backupPartKey(ticket.objectKey,ticket.partNumber,true);

  await backupCall(() => kv.put(key,bytes,{metadata,expirationTtl:BACKUP_PENDING_TTL}));

  // Recheck cancellation after the write. KV is eventually consistent; the

  // deferred reaper also cleans writes that raced a clear in another region.

  if (await backupDeleted(env,ticket.objectKey,ticket.createdAt)) {

    await backupCall(() => kv.delete(key));

    throw backupError('This file upload was cancelled or its message was cleared.', 'BACKUP_DELETED',409);

  }

  return `"${etag}"`;

}

async function backupReceipt(env,ticket,metadata,number,etag) {

  if (!metadata || metadata.objectKey !== ticket.objectKey || metadata.bytes !== backupPartBytes(ticket.size,number) ||

      !/^[0-9a-f]{64}$/.test(metadata.digest || '') || metadata.etag !== etag) return false;

  const expected = hex(await hmac(env.B2_APP_KEY, `kv-part-v1\n${ticket.objectKey}\n${number}\n${metadata.bytes}\n${metadata.digest}`)).slice(0,32);

  return expected === etag;

}

async function backupComplete(env,ticket,parts) {

  await assertBackupActive(env,ticket);

  const count = backupCount(ticket.size);

  if (!Array.isArray(parts) || parts.length !== count || parts.some((part,index) => part.partNumber !== index + 1 || !/^"?[0-9a-f]{32}"?$/.test(String(part.etag || '')))) {

    throw backupError('The backup upload receipts are incomplete.', 'BACKUP_PARTS',400);

  }

  const kv = backupNamespace(env), manifestKey = ticket.objectKey + '/manifest';

  const receipts = parts.map(part => String(part.etag).replace(/"/g,''));

  const previous = await backupCall(() => kv.get(manifestKey,'json'));

  if (previous?.size === ticket.size && JSON.stringify(previous.parts?.map(part => part.etag)) === JSON.stringify(receipts)) return;

  const committed = [];

  // Sequential promotion holds at most one open KV stream. At 100 MiB this is

  // at most 13 parts; each costs a get, a put and a staging delete.

  for (let index = 0; index < count; index++) {

    const number = index + 1, stagingKey = backupPartKey(ticket.objectKey,number,true), finalKey = backupPartKey(ticket.objectKey,number);

    let part = await backupCall(() => kv.getWithMetadata(stagingKey,'stream'));

    const staged = !!part.value;

    if (!staged) part = await backupCall(() => kv.getWithMetadata(finalKey,'stream'));

    if (!part.value) throw backupNotReady();

    if (!await backupReceipt(env,ticket,part.metadata,number,receipts[index])) {

      await part.value.cancel();

      throw backupError('A backup upload receipt does not match its stored bytes.', 'BACKUP_INTEGRITY',409);

    }

    if (staged) {

      validateBackupTicket(ticket);

      // Permanent chunks deliberately have no expiration.

      try { await backupCall(() => kv.put(finalKey,part.value,{metadata:part.metadata})); }

      catch (error) { try { await part.value.cancel(); } catch {} throw error; }

      await backupCall(() => kv.delete(stagingKey));

    } else await part.value.cancel();

    committed.push({bytes:part.metadata.bytes,etag:part.metadata.etag,digest:part.metadata.digest});

  }

  validateBackupTicket(ticket);

  const manifest = {version:1,objectKey:ticket.objectKey,size:ticket.size,contentType:ticket.contentType,createdAt:ticket.createdAt,partSize:PART_BYTES,parts:committed};

  await backupCall(() => kv.put(manifestKey,JSON.stringify(manifest),{metadata:{objectKey:ticket.objectKey,size:ticket.size,createdAt:ticket.createdAt}}));

  if (await backupDeleted(env,ticket.objectKey,ticket.createdAt)) {

    await backupDeleteObject(env,ticket.objectKey,ticket.size);

    throw backupError('This file upload was cancelled or its message was cleared.', 'BACKUP_DELETED',409);

  }

}

function validBackupManifest(value,key) {

  return value && value.version === 1 && value.objectKey === key && Number.isSafeInteger(value.size) && value.size >= 0 && value.size <= BACKUP_MAX_BYTES &&

    Number.isSafeInteger(value.createdAt) && value.partSize === PART_BYTES && Array.isArray(value.parts) && value.parts.length === backupCount(value.size) &&

    value.parts.every((part,index) => part.bytes === backupPartBytes(value.size,index + 1) && /^[0-9a-f]{32}$/.test(part.etag || '') && /^[0-9a-f]{64}$/.test(part.digest || ''));

}

async function backupRead(request,env,key) {

  const kv = backupNamespace(env), manifest = await backupCall(() => kv.get(key + '/manifest','json'));

  if (!manifest) {

    if (await backupDeleted(env,key)) throw backupError('This file is no longer in storage.', 'BACKUP_NOT_FOUND',404);

    throw backupNotReady();

  }

  if (!validBackupManifest(manifest,key)) throw backupError('The backup file manifest is invalid.', 'BACKUP_INTEGRITY',502);

  if (await backupDeleted(env,key,manifest.createdAt)) throw backupError('This file is no longer in storage.', 'BACKUP_NOT_FOUND',404);

  let start = 0, end = manifest.size - 1, status = 200;

  const headers = new Headers({'Content-Type':manifest.contentType || 'application/octet-stream','Accept-Ranges':'bytes',ETag:`"kv-${key.split('/').pop()}"`});

  const range = request.headers.get('Range');

  if (range && request.method !== 'HEAD') {

    const match = /^bytes=(\d*)-(\d*)$/.exec(range);

    let valid = !!match && !!(match[1] || match[2]) && manifest.size > 0;

    if (valid && !match[1]) { const suffix = Number(match[2]); valid = Number.isSafeInteger(suffix) && suffix > 0; start = Math.max(0,manifest.size - suffix); }

    else if (valid) { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]),end) : end; valid = Number.isSafeInteger(start) && Number.isSafeInteger(end) && start <= end && start < manifest.size; }

    if (!valid) return new Response(null,{status:416,headers:{'Content-Range':`bytes */${manifest.size}`,'Cache-Control':'no-store'}});

    status = 206; headers.set('Content-Range',`bytes ${start}-${end}/${manifest.size}`);

  }

  headers.set('Content-Length',String(Math.max(0,end - start + 1)));

  if (request.method === 'HEAD' || manifest.size === 0) return new Response(null,{status,headers});

  const first = Math.floor(start / PART_BYTES) + 1, last = Math.floor(end / PART_BYTES) + 1;

  // Check every selected part before returning a successful response. Close each

  // probe stream before opening another, then stream one part at a time below.

  for (let number = first; number <= last; number++) {

    const part = await backupCall(() => kv.getWithMetadata(backupPartKey(key,number),'stream'));

    if (!part.value) throw backupNotReady();

    await part.value.cancel();

    if (part.metadata?.etag !== manifest.parts[number - 1].etag || part.metadata?.bytes !== manifest.parts[number - 1].bytes) throw backupError('The backup file is incomplete.', 'BACKUP_INTEGRITY',502);

  }

  let number = first, reader = null, offset = 0, cancelled = false;

  const stream = new ReadableStream({

    async pull(controller) {

      try {

        for (;;) {

          if (cancelled) return;

          if (!reader) {

            if (number > last) { controller.close(); return; }

            const part = await backupCall(() => kv.getWithMetadata(backupPartKey(key,number),'stream'));

            if (!part.value) throw backupNotReady();

            if (cancelled) { await part.value.cancel(); return; }

            if (part.metadata?.etag !== manifest.parts[number - 1].etag || part.metadata?.bytes !== manifest.parts[number - 1].bytes) { await part.value.cancel(); throw backupError('The backup file is incomplete.', 'BACKUP_INTEGRITY',502); }

            reader = part.value.getReader(); offset = 0;

          }

          const {value,done} = await reader.read();

          if (done) {

            if (offset !== manifest.parts[number - 1].bytes) throw backupError('A backup file chunk is incomplete.', 'BACKUP_INTEGRITY',502);

            reader.releaseLock(); reader = null; number++; continue;

          }

          const absolute = (number - 1) * PART_BYTES + offset;

          offset += value.length;

          if (offset > manifest.parts[number - 1].bytes) throw backupError('A backup file chunk is invalid.', 'BACKUP_INTEGRITY',502);

          const from = Math.max(0,start - absolute), to = Math.min(value.length,end + 1 - absolute);

          if (to > from) { controller.enqueue(value.subarray(from,to)); return; }

        }

      } catch (error) {

        try { await reader?.cancel(); } catch {}

        controller.error(error);

      }

    },

    async cancel() { cancelled = true; try { await reader?.cancel(); } catch {} }

  });

  if (typeof FixedLengthStream === 'function') {

    // workerd derives Content-Length from the stream, not a manually supplied

    // header on a generic ReadableStream. It also rejects truncated output.

    const fixed = new FixedLengthStream(end - start + 1);

    stream.pipeTo(fixed.writable).catch(() => {});

    return new Response(fixed.readable,{status,headers});

  }

  return new Response(stream,{status,headers});

}

async function backupTombstone(env,key,size) {

  const kv = backupNamespace(env), name = `__deleted/${key}`;

  if (!await backupCall(() => kv.get(name))) {

    const mark = {objectKey:key,deletedAt:Date.now(),cleanupAfter:Date.now() + BACKUP_PENDING_TTL * 1000,...(Number.isSafeInteger(size) && size >= 0 && size <= BACKUP_MAX_BYTES ? {size} : {})};

    // Keep deletion markers until a later cleanup succeeds. Expiring these

    // markers alone could expose a late cross-region write after cancellation.

    await backupCall(() => kv.put(name,JSON.stringify(mark),{metadata:{cleanupAfter:mark.cleanupAfter}}));

  }

}

async function backupDeleteObject(env,key,size) {

  if (!isBackupKey(key)) throw backupError('Invalid backup deletion reference.', 'BACKUP_DELETE',400);

  await backupTombstone(env,key,size);

  const count = Number.isSafeInteger(size) && size >= 0 && size <= BACKUP_MAX_BYTES ? backupCount(size) : backupCount(BACKUP_MAX_BYTES);

  const kv = backupNamespace(env);

  // Explicit deterministic keys work even when KV listing has not caught up.

  for (let number = 1; number <= count; number++) {

    await backupCall(() => kv.delete(backupPartKey(key,number,true)));

    await backupCall(() => kv.delete(backupPartKey(key,number)));

  }

  await backupCall(() => kv.delete(key + '/manifest'));

  return count * 2 + 1;

}

function deletionInput(body) {

  const prefix = String(body.prefix || ''), keep = body.keepPrefixes || [];

  if (!validKey(prefix) || (body.exact !== true && !prefix.endsWith('/')) || !Array.isArray(keep) || keep.length > 1000 ||

      keep.some(value => !validKey(value) || !value.startsWith(prefix) || !value.endsWith('/'))) throw backupError('Invalid deletion prefix.', 'BACKUP_DELETE',400);

  if ((body.objects !== undefined && !Array.isArray(body.objects)) || (body.objectKeys !== undefined && !Array.isArray(body.objectKeys))) throw backupError('Invalid deletion objects.', 'BACKUP_DELETE',400);

  const objects = [...(body.objectKeys || []).map(objectKey => ({objectKey})),...(body.objects || [])];

  if ((body.objects || []).length > 1000 || (body.objectKeys || []).length > 1000 || objects.some(item => !item || !validKey(item.objectKey) || !item.objectKey.startsWith(prefix) ||

      (body.exact === true && item.objectKey !== prefix) || (item.size !== undefined && (!Number.isSafeInteger(item.size) || item.size < 0)))) throw backupError('Invalid deletion objects.', 'BACKUP_DELETE',400);

  const candidates = objects.filter(item => isBackupKey(item.objectKey) && !keep.some(value => item.objectKey.startsWith(value)));

  return {prefix,keep,objects:[...new Map(candidates.map(item => [item.objectKey,item])).values()]};

}

async function backupDeletePage(env,body) {

  const {prefix,keep,objects} = deletionInput(body), kv = backupNamespace(env);

  if (body.exact === true && isBackupKey(prefix)) {

    return {deleted:await backupDeleteObject(env,prefix,objects.find(item => item.objectKey === prefix)?.size),cursor:null};

  }

  const cursor = body.cursor || {}, phase = cursor.backend || 'kv-known';

  if (!['kv-known','kv-list'].includes(phase)) throw backupError('Invalid backup continuation.', 'BACKUP_DELETE',400);

  if (!body.cursor && body.exact !== true) {

    const markKey = `__prefix_deleted/${prefix}`;

    const previous = await backupCall(() => kv.get(markKey,'json'));

    if (!previous || JSON.stringify(previous.keep || []) !== JSON.stringify(keep)) {

      const mark = {prefix,cutoff:Date.now(),keep,cleanupAfter:Date.now() + BACKUP_PENDING_TTL * 1000};

      await backupCall(() => kv.put(markKey,JSON.stringify(mark),{metadata:{cleanupAfter:mark.cleanupAfter}}));

    }

  }

  if (phase === 'kv-known') {

    const index = Number(cursor.index || 0);

    if (!Number.isSafeInteger(index) || index < 0 || index > objects.length) throw backupError('Invalid backup continuation.', 'BACKUP_DELETE',400);

    if (index < objects.length) {

      const item = objects[index];

      return {deleted:await backupDeleteObject(env,item.objectKey,item.size),cursor:{backend:'kv-known',index:index + 1}};

    }

  }

  const token = phase === 'kv-list' ? cursor.token : undefined;

  if (token !== undefined && (typeof token !== 'string' || token.length > 2048)) throw backupError('Invalid backup continuation.', 'BACKUP_DELETE',400);

  const listed = await backupCall(() => kv.list({prefix,limit:16,...(token ? {cursor:token} : {})}));

  let deleted = 0;

  const marked = new Set(objects.map(item => item.objectKey));

  for (const item of listed.keys || []) {

    const key = String(item.name || ''), objectKey = key.replace(/\/(?:manifest|(?:stage|parts)\/\d{6})$/,'');

    if (!isBackupKey(objectKey) || !objectKey.startsWith(prefix) || (body.exact === true && objectKey !== prefix) || keep.some(value => objectKey.startsWith(value))) continue;

    if (!marked.has(objectKey)) { await backupTombstone(env,objectKey); marked.add(objectKey); }

    await backupCall(() => kv.delete(key)); deleted++;

  }

  if (!listed.list_complete) {

    if (!listed.cursor || listed.cursor === token) throw backupError('The backup cleanup continuation did not advance.', 'BACKUP_DELETE',502,true);

    return {deleted,cursor:{backend:'kv-list',token:listed.cursor}};

  }

  return {deleted,cursor:body.backupOnly === true ? null : {backend:'b2'}};

}

async function deleteStoredPage(env,body) {

  deletionInput(body);

  if (body.exact === true && isBackupKey(body.prefix)) return backupDeletePage(env,body);

  if (body.cursor?.backend === 'b2') {

    const result = await deletePage(env,{...body,cursor:body.cursor.next || null});

    return {...result,cursor:result.cursor ? {backend:'b2',next:result.cursor} : null};

  }

  // Old B2 continuation objects retain their original meaning.

  if (body.cursor && !body.cursor.backend) return deletePage(env,body);

  if (!env.FILE_BACKUP) return deletePage(env,body);

  try { return await backupDeletePage(env,body); }

  catch (error) {

    // A backup limit must not prevent an independent attempt to clean B2.

    if (body.backupOnly !== true) { try { await deletePage(env,{...body,cursor:null}); } catch {} }

    throw error;

  }

}



async function reapBackupDeletes(env) {

  if (!env.FILE_BACKUP) return;

  const kv = backupNamespace(env), stateKey = '__gc_state';

  const state = await backupCall(() => kv.get(stateKey,'json')) || {};

  const kind = state.kind === 'prefix' ? 'prefix' : 'exact';

  const cursorField = kind + 'Cursor', markerPrefix = kind === 'exact' ? '__deleted/' : '__prefix_deleted/';

  const page = await backupCall(() => kv.list({prefix:markerPrefix,limit:16,...(typeof state[cursorField] === 'string' && state[cursorField] ? {cursor:state[cursorField]} : {})}));

  const due = (page.keys || []).find(item => Number(item.metadata?.cleanupAfter) > 0 && Number(item.metadata.cleanupAfter) <= Date.now());

  if (due) {

    const mark = await backupCall(() => kv.get(due.name,'json'));

    if (mark && Number(mark.cleanupAfter) <= Date.now()) {

      if (kind === 'exact' && isBackupKey(mark.objectKey)) {

        const count = Number.isSafeInteger(mark.size) && mark.size >= 0 && mark.size <= BACKUP_MAX_BYTES ? backupCount(mark.size) : backupCount(BACKUP_MAX_BYTES);

        // Tickets are expired and the extra propagation day has passed. This

        // deterministic pass removes any late write before removing its marker.

        for (let number = 1; number <= count; number++) {

          await backupCall(() => kv.delete(backupPartKey(mark.objectKey,number,true)));

          await backupCall(() => kv.delete(backupPartKey(mark.objectKey,number)));

        }

        await backupCall(() => kv.delete(mark.objectKey + '/manifest'));

        await backupCall(() => kv.delete(due.name));

      } else if (kind === 'prefix' && validKey(mark.prefix) && mark.prefix.endsWith('/') && Array.isArray(mark.keep)) {

        const listed = await backupCall(() => kv.list({prefix:mark.prefix,limit:16,...(mark.cursor ? {cursor:mark.cursor} : {})}));

        for (const item of listed.keys || []) {

          const objectKey = String(item.name || '').replace(/\/(?:manifest|(?:stage|parts)\/\d{6})$/,'');

          if (isBackupKey(objectKey) && objectKey.startsWith(mark.prefix) && Number(item.metadata?.createdAt) <= Number(mark.cutoff) &&

              !mark.keep.some(prefix => objectKey.startsWith(prefix))) await backupCall(() => kv.delete(item.name));

        }

        if (listed.list_complete) await backupCall(() => kv.delete(due.name));

        else {

          if (!listed.cursor || listed.cursor === mark.cursor) throw backupError('Backup cleanup could not advance.', 'BACKUP_CLEANUP',503,true);

          await backupCall(() => kv.put(due.name,JSON.stringify({...mark,cursor:listed.cursor}),{metadata:{cleanupAfter:mark.cleanupAfter}}));

        }

      }

    }

  } else state[cursorField] = page.list_complete ? '' : page.cursor;

  // One bounded object or prefix page per invocation, alternating queues. An

  // hourly trigger therefore cannot consume the whole free delete allowance.

  state.kind = kind === 'exact' ? 'prefix' : 'exact';

  await backupCall(() => kv.put(stateKey,JSON.stringify(state)));

}



export default {

  async scheduled(event,env,context) {

    context.waitUntil(reapBackupDeletes(env));

  },

  async fetch(request, env) {

    const cors = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'GET, HEAD, POST, OPTIONS',

      'Access-Control-Allow-Headers':'Content-Type, Range', 'Access-Control-Expose-Headers':'Content-Length, Content-Range, Accept-Ranges, ETag',

      'Access-Control-Max-Age':'86400', 'Cache-Control':'no-store' };

    const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {status,headers:{...cors,'Content-Type':'application/json',...headers}});

    try {

      if (!env.B2_KEY_ID || !env.B2_APP_KEY || !/^[a-z0-9-]+$/.test(env.B2_REGION || '') || !/^[A-Za-z0-9-]{6,63}$/.test(env.B2_BUCKET || '')) {

        return json({error:'Worker storage configuration is incomplete.'}, 503);

      }

      const url = new URL(request.url);

      // CORS is a browser restriction, not authentication. This intentionally

      // follows the app's public read/write model; keep B2 spending caps at $0.

      if (request.method === 'POST' || request.method === 'OPTIONS') {

        const origins = String(env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);

        if (!origins.includes(request.headers.get('Origin') || '')) return json({error:`This app origin is not enabled for uploads: ${request.headers.get('Origin') || '(missing)'}. Add it to Worker ALLOWED_ORIGINS and redeploy.`}, 403);

      }

      if (request.method === 'OPTIONS') return new Response(null, {status:204,headers:cors});

      if (request.method === 'GET' && url.pathname === '/health') return json({ready:true,provider:'b2-worker-v1',uploadProtocol:2,multipart:true,storageRevision:'2026-10-28-free-backup',browserCacheSeconds:300,backup:{configured:!!env.FILE_BACKUP,provider:'cloudflare-kv',maxFileBytes:BACKUP_MAX_BYTES},maxFileBytes:(await readFileLimit()).bytes});

      if (request.method === 'POST' && url.pathname === '/transfer') {

        const etag = await relayUpload(request, env, url.searchParams.get('ticket'));

        return new Response(null, {status:200,headers:{...cors,ETag:etag}});

      }

      if (request.method === 'POST') {

        const body = await readJSON(request);

        if (url.pathname === '/sign') {

          const limit = await readFileLimit();

          if (!validKey(body.path) || body.path.length > 360 || body.path.endsWith('/') || !Number.isSafeInteger(body.size) || body.size < 0 || body.size > limit.bytes) return json({error:`Invalid file or size. Maximum ${limit.megabytes} MB.`}, 400);

          if (body.size > MAX_B2_FILE_BYTES) return json({error:'This file exceeds the B2 provider maximum of 10 TB.'}, 400);

          const objectKey = `${body.path}-${crypto.randomUUID()}`;

          const contentType = /^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(body.mimeType || '') ? body.mimeType : 'application/octet-stream';

          if (body.fallback === true) {

            backupNamespace(env);

            if (body.size > BACKUP_MAX_BYTES || body.path.split('/').length > 4 || body.path.length > 350) return json({error:'The free backup supports files up to 100 MiB.',code:'BACKUP_SIZE',retryable:false},400);

            const session = {objectKey:`${body.path}-kv1-${crypto.randomUUID()}`,storageBackend:'kv',contentType,size:body.size,uploadId:'kv1',partSize:PART_BYTES,createdAt:Date.now(),sessionExpires:Date.now() + BACKUP_TICKET_MS};

            await assertBackupActive(env,session);

            const ticket = await issueTicket(env,session);

            return json({objectKey:session.objectKey,storageBackend:'kv',relayOnly:true,contentType,ticket,uploadId:session.uploadId,partSize:session.partSize});

          }

          let uploadId = '', partSize = 0;

          if (body.multipart === true && body.size > PART_BYTES) {

            partSize = Math.max(PART_BYTES, Math.ceil(body.size / 10000 / 1048576) * 1048576);

            if (partSize > 5 * 1024 ** 3) return json({error:'This file exceeds the storage provider multipart capacity.'}, 400);

            const created = await storage(env, 'POST', objectKey, {uploads:''}, {'Content-Type':contentType});

            uploadId = xmlValue(await created.text(), 'UploadId');

            if (!uploadId) throw new Error('File storage could not start the upload.');

          }

          const session = {objectKey, contentType, size:body.size, uploadId, partSize};

          const ticket = await issueTicket(env, session);

          return json({objectKey,contentType,ticket,...(uploadId ? {uploadId,partSize} : await uploadPlan(env,session,ticket))});

        }

        if (url.pathname === '/part-sign') {

          const ticket = await readTicket(env, body.ticket);

          if (!ticket.uploadId || !Number.isInteger(body.partNumber) || body.partNumber < 1 || body.partNumber > (ticket.storageBackend === 'kv' ? backupCount(ticket.size) : Math.ceil(ticket.size / ticket.partSize))) return json({error:'Invalid upload part.'}, 400);

          return json(await uploadPlan(env, ticket, body.ticket, body.partNumber));

        }

        if (url.pathname === '/abort') {

          const ticket = await readTicket(env, body.ticket);

          if (ticket.storageBackend === 'kv') {

            validateBackupTicket(ticket);

            await backupDeleteObject(env,ticket.objectKey,ticket.size);

            return json({aborted:true});

          }

          if (!ticket.uploadId) return json({aborted:true});

          try {

            const response = await storage(env, 'DELETE', ticket.objectKey, {uploadId:ticket.uploadId});

            await response.body?.cancel();

          } catch (error) { if (error.status !== 404) throw error; }

          return json({aborted:true});

        }

        if (url.pathname === '/complete') {

          const limit = await readFileLimit();

          if (!validKey(body.objectKey) || !Number.isSafeInteger(body.size) || body.size < 0 || body.size > limit.bytes) return json({error:`Invalid file reference. Maximum ${limit.megabytes} MB.`}, 400);

          const ticket = body.ticket ? await readTicket(env, body.ticket) : null;

          if (ticket && (ticket.objectKey !== body.objectKey || ticket.size !== body.size)) return json({error:'Upload ticket does not match this file.'}, 400);

          if (ticket?.storageBackend === 'kv') {

            await backupComplete(env,ticket,body.parts);

            return json({complete:true,storageBackend:'kv'});

          }

          if (isBackupKey(body.objectKey)) return json({error:'A signed backup upload ticket is required.',code:'BACKUP_SESSION',retryable:false},403);

          let stored;

          try { stored = await storage(env, 'HEAD', body.objectKey); }

          catch (error) {

            if (error.status !== 404 || !ticket?.uploadId) throw error;

            await completeMultipart(env, ticket, body.parts);

            stored = await storage(env, 'HEAD', body.objectKey);

          }

          if (!stored.headers.has('Content-Length') || Number(stored.headers.get('Content-Length')) !== body.size) return json({error:'The uploaded file size does not match. Retry the upload.'}, 409);

          return json({complete:true});

        }

        if (url.pathname === '/delete') return json(await deleteStoredPage(env, body));

      }

      if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname.startsWith('/objects/')) {

        const key = decodeURIComponent(url.pathname.slice('/objects/'.length));

        if (!validKey(key) || key.endsWith('/')) return json({error:'Invalid file reference.'}, 400);

        const headers = {};

        if (request.headers.has('Range')) headers.Range = request.headers.get('Range');

        const stored = isBackupKey(key) ? await backupRead(request,env,key) : await storage(env, request.method, key, {}, headers);

        const output = new Headers(cors);

        // UUID file URLs never change content. Only the receiving browser may

        // reuse bytes for five minutes; shared caches must not store them.

        // Clear still deletes B2 versions immediately, subject to its result.

        output.set('Cache-Control',stored.ok ? 'private, max-age=300' : 'no-store');

        for (const name of ['Content-Type','Content-Length','Content-Range','Accept-Ranges','ETag','Last-Modified']) {

          if (stored.headers.has(name)) output.set(name,stored.headers.get(name));

        }

        output.set('X-Content-Type-Options','nosniff');

        output.set('Content-Security-Policy',"sandbox; default-src 'none'");

        // HTML runs only in the app's existing sandbox, never as Worker code.

        if (/html|svg|javascript|xml/i.test(output.get('Content-Type') || '')) output.set('Content-Disposition','attachment');

        return new Response(stored.body, {status:stored.status,headers:output});

      }

      return json({error:'Not found.'}, 404);

    } catch (error) {

      return json({error:error?.message || 'File storage is unavailable.',

        ...(error?.code ? {code:error.code} : {}),

        ...(Number.isInteger(error?.providerStatus) ? {providerStatus:error.providerStatus} : {}),

        ...(typeof error?.retryable === 'boolean' ? {retryable:error.retryable} : {}),

        ...(error?.retryAfter ? {retryAfter:error.retryAfter} : {})}, error?.status || 500,

        error?.retryAfter ? {'Retry-After':String(error.retryAfter)} : {});

    }

  }

};



```

<!-- END STORAGE WORKER -->
