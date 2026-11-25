# Chat App Music

Open Music from the account dock beside Settings. People with playlists or uploaded audio also have a **Music** shortcut on their avatar and profile actions menus. Current release versions are in `build-info.json`.

## Volume controls

Click the speaker to mute at 0%, then click again to restore the previous positive volume. Dragging the slider above zero also restores sound. The shared player supports up to 200%. The video viewer uses the same control and keeps its own playback level. A Jam guest changes their local listening volume without changing the host's playback.

For maintenance, exercise the Music player, native tray and video viewer after changing volume bounds or mute behavior. Check normal playback, 200% boost, mute/restore and dragging up from zero. Run `node tests-release/media-control-ui.browser.cjs` and `node tests-music/player.browser.cjs`. Use the packaged Music diagnostic for a Windows tray change.

## Features

- Home shows up to six owned playlists, Create beside Playlists, View All when needed, and one horizontal user row sorted by live display name. User pictures and names open their Music profile.
- **Audio** on Home lists everyone's uploads together, sorted by title. Each user's Music profile lists that person's uploads. Search either list by title, artist or album. Choose **Upload** beside Audio for a standalone track. With Repeat Off it stops at the end. Repeat One and Repeat All each replay that track.
- Right-click an upload or a track on another person's playlist and select one of your playlists under **Add to Playlist**. Each playlist can contain an upload once. Saved tracks retain their uploader credit and play even if the original playlist is later removed.
- Vinny can open a person's name or picture under **Music Ã¢â€ â€™ Users**, then choose **Upload** beside Audio on their profile. This also works for a person's first song. The selected person gets the upload in their library. New delegated uploads record the signed-in account in `uploadedBy`. Vinny can edit another person's Audio from the track menu. Existing tracks keep their original credits, including the playlist-owner fallback for older records.
- Drag a track row with the mouse, or drag its cover on a touchscreen. Hold near the edge to scroll. Move Up, Move Down and Alt+Arrow on a focused row are also available. The list updates locally as soon as you move a song. Writes run in order and ordinarily change only the moved track's rank. Failed writes restore the saved order.
- A single audio element survives screen changes, rooms, profiles, backgrounding and calls. The sidebar and full-width footer control that same player. Shuffle avoids repeats within its cycle; Repeat starts Off for new listeners. The saved Off, All or One setting belongs to the account on this device and persists between sessions. Older valid saved settings are honored. Previous restarts above four seconds; at four seconds or earlier it goes back. Stop clears playback. Volume moves in 5% steps from 0Ã¢â‚¬â€œ200% through a Web Audio gain node. While a track loads, a spinner stays beside its title in both controllers.
- Playing chat audio or an unmuted video pauses Music. A connected Spotify playing-state update pauses Music and blocks a new play until Spotify stops. Neither event automatically resumes Music. Spotify detection still depends on the existing Spotify polling/integration; this release does not introduce a new OS media monitor.
- Profiles publish listening state and interpolate elapsed time locally between measured updates, including an elapsed / total label. Seek, play, pause and track changes publish immediately; lease renewal is bounded. Uploaded artwork appears beside the title on the listening profile. Right-click an uploaded playlist or audio cover to download the original image or copy its address. Windows host 2.0.4 enables Repeat for a single upload. The Windows tray uses the same player state, with uploaded artwork, elapsed and total time, seek, transport, volume and Jam controls.

## Starting and joining Jams

1. Play a song, then click the Jam icon to the right of Stop on either Music controller.
2. Other people can open the host's or a listener's Chat App profile and click **Join Jam** beside Play. A join replaces the listener's current track and follows the host's current position, including when paused. Audio starts once the device can load and decode it.
3. The host controls the song, playhead, shuffle and repeat. Everyone, including the host, controls their own listening volume. The Jam button shows **Start Jam** during personal playback, **End Jam** for a solo host, and **In Jam With** plus the other participants when sharing. The Windows 2.0.5 tray shows participant names and pictures and lets guests adjust their own volume.
4. Click the Jam control again to confirm **Leave Jam** as a listener or **End Jam** as the host. Switching to another Jam uses the same confirmation. Ending a Jam stops all guest playback. The host can keep listening privately. Losing the host connection ends the Jam.

## RTDB storage and lifecycle

No Music upload calls the B2/Worker, Cloudflare KV, Firebase Storage, or the external attachment provider. Music data is in Realtime Database:

| Path | Content |
| --- | --- |
| `music/playlists/{playlistId}` | Owner, name, cropped icon, creation/update timestamps and compact track metadata |
| `music/playlists/{playlistId}/tracks/{trackId}` | Title, artist, album, cropped icon, duration, order, added time, MIME, file size and blob descriptor |
| `music/playlists/audio:{ownerCode}/uploads/{blobId}` | Standalone upload metadata |
| `music/playlists/{playlistId}/uploads/{blobId}` | Original uploads retained in Audio after removal from that playlist |
| `music/playlistOrder/{ownerCode}` | The library owner's custom playlist order |
| `music/jams/{jamId}` | Host session, current playback clock and participant memberships. The host registers disconnect removal for the Jam. Each guest registers it only for their membership. |
| `music/audio/{blobId}/meta` | Audio descriptor and ownership/cleanup information |
| `music/audio/{blobId}/parts/{sixDigitIndex}` | Independently encoded base64 audio chunks, at most 192 KiB decoded each |
| `users/{code}/musicSessions/{sessionId}` | Ephemeral listening lease; disconnect removal and expiry |

Audio publishes after all chunks are acknowledged. Upload scopes participate in the existing logout, disconnect and update protections. The upload cancels disconnect cleanup before publishing the track metadata. A failed upload cleans up unpublished bytes.

Playlist membership and upload ownership are separate. Removing a track or playlist moves its original upload metadata into the same record's `uploads` map in one transaction. A record containing only `uploads` is private to the catalog implementation and is skipped by playlist listings. Catalog rows use the stable blob ID across playlist removal. Membership copies store `playlistReference`, the uploader code and their unique `referenceKey`.

Each saved copy reserves its key in the blob descriptor before writing the destination playlist. A failed save releases that reservation. Deleting the original from Audio marks the descriptor. Deleting the final saved copy then releases its bytes. A crash between writes can leave an unused reservation or blob. Future storage maintenance must reconcile playlist tracks, retained uploads and active transfers before reclaiming space.

Only metadata is subscribed live. Hovering, focusing or pressing a track warms its first part. The next playlist selection also preloads where useful. Data Saver suppresses speculative reads. Selecting the prepared song reuses its reads, and stopping or changing selections discards superseded work. Each part must match its declared length.

On supported app origins the browser's media decoder can request the bytes it needs to start or seek in any playable container. A jump to the end of a large file can fetch its destination while preceding parts are still missing. The app reads one part ahead of each request. A single persistent audio element handles playback and exact seek completion. Touch or mouse dragging previews each position immediately and makes one decoder seek when released. The player silences the outgoing position through the scrub and any wait for the destination. Progress ticks preserve the selected time until the decoder settles, then sound returns at the listener's current volume. Keyboard, tray and media-session seeks commit directly. Android uses normal media output at up to 100% volume and enables the Web Audio gain path when boosting above 100%. When a Jam host seeks, listeners receive the selected position as paused until the host decoder is ready.

Direct files, opaque launchers and hosts without an active Music worker use the portable player. Where MediaSource supports MPEG audio or ADTS AAC it starts with the first decodable parts. Fixed-frame-size MPEG-1 Layer III uploads with a matching CBR Info header can also jump directly to a verified frame boundary. The byte extent, frame count, duration and destination headers must agree. Files marked as variable bitrate continue sequentially on this path. Other containers and incompatible streaming decoders use the complete verified file.

Completed songs use local blob URLs for seeking and replay. The memory cache holds up to six songs and 200 MiB. Where the origin supports IndexedDB and Web Crypto, an additional on-device cache holds up to eight completed songs and 200 MiB across reloads. The disk cache is partitioned by Firebase project and signed-in account and the app clears that account's entries on explicit sign-out. First playback and an uncached seek still depend on network transfer, decoder and device speed.

## Platform and deployment limits

Audio must be decodable on the listening device. The picker accepts common audio types and detects support/duration before upload; unsupported codecs produce an error. Files are capped at 100 MiB, following the existing app's file ceiling. No arbitrary-format transcoder or paid backend is added. Icons are capped at 6 MiB.

Background playback continues while the app process/browser permits it. Closing or terminating the app, device sleep, mobile OS suspension, browser autoplay policy, audio-device changes, and Windows communication-volume policies cannot be overridden by shared JavaScript. Call start/mute/deafen and ordinary app navigation do not pause Music. No code tries to bypass these OS policies.

Music uses the existing Chat App password/session model. The shared client checks the stable owner account code and the app's existing Vinny admin predicate before library mutations. The Jam player accepts transport changes from its host. The supplied project has no Firebase Authentication integration or deployable RTDB rules that enforce these identities against direct database clients. Production access to Jam records and playlist order depends on the site's existing database permissions.

## Android shared updates

The existing Android package identifies itself as bridge version 1 and loads `https://appassets.androidplatform.net/app/index.html`. Keep `nativeBridge` at `1` for releases compatible with that host, increment `mobileRevision` in `build-info.json`, and publish all runtime files from the shared source together. Windows host capabilities are tracked separately in `desktop-capabilities.json`. The October Android bundle predates Music. Its updater checks the latest numbered GitHub repositories when the Android Activity is created. After a compatible shared release loads, open the navigation drawer and tap Music beside Settings.

## Maintenance

`music/data.js` owns library writes, upload scopes, validation, subscriptions and caching. `music/ui.js` owns library views and editors. `music/jams.js` owns membership, host clock publication, disconnect cleanup and leave/end confirmation. `music/player.js` owns the persistent audio element, local media arbitration, clock alignment, profile leases and native bridge. `music/audio-stream.js` owns progressive decoding and portable fixed-frame MP3 seeking. `music/file-cache.js` owns bounded IndexedDB storage. `music/range-client.js` connects the active signed-in page to `music-range-worker.js` beside `index.html`. Include that root script in static deployments and preserve the versioned message type when extending the protocol. Its fetch handler serves only generated Music playback URLs. Each URL belongs to one live document and the worker leaves unrelated requests to the existing host. A page with another site's worker uses the portable path. `music/artwork.js` owns cover actions and profile artwork. Load those helpers and Jams before the player, followed by the UI, after Spotify and before `core/start`. Keep playback control checks at the player entry points so the Music screen, profile, sidebar, media keys and native tray follow the same host/listener rules.

`window.chatDesktopMusic` is an optional versioned preload bridge. `setMusicState(null)` clears native controls. `onMusicAction` receives only allowlisted commands; native code validates the sender and ignores stale track commands. Older hosts can run shared Music without tray controls. Do not require a native rebuild for ordinary future Music UI changes.

Run `npm run test:music`, `npm test`, `npm run test:browser`, `npm run test:ui-consistency`, `npm --prefix desktop test`, and `npm run audit:upload`. Browser fixtures use an isolated in-memory database, generated WAV audio and the bundled MP3 clip. The MP3 player test holds back the final part until Chromium is playing. `tests-music/range.browser.cjs` seeks through a real WAV on a subdirectory origin and a fixed-frame-size MP3 via a direct file. Both tests withhold earlier data during a far seek. The Android-origin regression in `tests-music/android.browser.cjs` checks drawer entry, a backward touch drag over delayed MP3 data, output muting and recovery, and Back through the Music menus. To exercise a staged Android release, set `CHAT_ANDROID_WEB_ROOT` to the staged release directory. They also cover variable-bitrate fallback, byte-range boundaries, playback URL isolation, opaque srcdoc playback and zero database reads after a cached reload. Keep captures outside source. Native tray diagnostics require all three explicit isolation flags documented in `NATIVE-UPDATES.md`. Preserve the public verification key, combined updater, native-first update ordering and existing user-data paths.

Keep cover actions scoped to uploaded raster images and preserve row and card context menus outside the artwork. Music display text uses a compact text-shadow for clickable owner names and player titles and suppresses text selection. Editable fields retain normal text selection, and owned tracks and playlists retain reordering.
