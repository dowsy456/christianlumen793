# Weekly calendar notes maintenance

The browser and scheduled Firebase worker share `backend/functions/calendar-recurrence.js`. It has no server dependencies and is deliberately allowlisted as a single runtime file in the Pages packager. Keep the module-manifest entry and packager allowlist together when moving it.

## Stored data

- `calendar/repeating/<seriesId>` stores the text, author, weekday, start date, creator's IANA time zone, enabled state, reenable date and per-date deletion exclusions.
- `calendar/years/YYYY/YYYY-MM-DD/repeat_<seriesId>` stores an ordinary shared note with a `seriesId`. Stable IDs preserve author/reminder links and prevent duplicates across retries or simultaneous clients.
- Existing ordinary notes are retained unchanged. Per-day duplicate comparison uses Unicode NFKC, collapsed whitespace and lowercase. Saves and series operations run in one calendar-root transaction so simultaneous edits cannot bypass this rule.
- Individual deletion atomically records a date exclusion before removing its instance. Manual per-date edits retain the series ID. Disabling a series retains all its existing notes. Reenabling generates from today forward, skipping dates while it was disabled; exclusions continue to apply.
- Editing a series changes its linked notes in the real current month in the series' saved time zone, plus the text used for future months. Earlier months stay unchanged. A duplicate collision aborts the entire series edit with the affected date. Deleting a series removes all its linked instances across the stored calendar, including individually edited instances.
- The existing yearly calendar cleanup policy remains intact; series themselves survive year rollover. Do not change legacy author or personal reminder paths when updating recurrence.

## Generation and deployment

Clients reconcile enabled series on connection, focus, local month rollover and the existing 30-second maintenance interval. Generation catches up through the real current month, never prepopulates future months, and is idempotent. A series uses its creator's time zone so devices in different zones do not move its month boundary.

For generation while every browser and EXE is closed, the release owner must deploy the new scheduled function `materializeRepeatingCalendar` from the existing backend Firebase project. From `backend`, install the existing functions dependencies with `npm --prefix functions ci`, then deploy the function with the configured Firebase CLI/project (for this codebase: `firebase deploy --only functions:calendar:materializeRepeatingCalendar --project chatappv6-e9da9`). It runs once a minute, including when no client is active. This task prepares its source; it does not deploy the function or verify production database permissions. Existing deployments should allow the new `calendar/repeating` descendant wherever their calendar-root transaction permission is granted.

## Interface

Add Notes and Repeating Notes occupy the calendar's full width. Repeat Event uses the same `.toggle` control as Settings and resets off after a successful addition. The series list shows original authors, enable/disable, edit and delete controls. Clicking its text reveals the current month's instances with the existing author/bubble/edit/delete/reminder UI. All signed-in users with existing shared-calendar database access can manage them.

The month renders every note in each day's scrollable preview instead of hiding all but two. Short viewports scroll the overall page to preserve legible rows. Truncated previews use the existing composer/sidebar tooltip; scrolling dismisses it. No separate native title popup is added.

## Verification

- `node --test tests/calendar.test.cjs tests/calendar-cleanup.test.cjs tests-release/calendar-recurrence.test.cjs`
- `node tests-release/calendar-recurrence.browser.cjs`
- `node tests/calendar-order.browser.cjs`
- `node tests/calendar.browser.cjs`

Browser checks use an isolated in-memory Firebase fixture with external HTTP blocked. They cover desktop/mobile layout, complete preview lists, custom tooltips and scroll dismissal, repeat defaults/reset, individual and series edits/deletes, authors/reminders, shared ordering, normalization, retries, month rollover, pause/resume, and the background worker. They are not physical-phone or production Firebase deployment tests.
