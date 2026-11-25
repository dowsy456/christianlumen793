# Authentication exception — shared web 2026.11.16-1

The start, sign-in, create-account and auth-only notice use `css/auth-refresh.css` and `js/accounts/sign-in-ui.js`. They intentionally have white square surfaces, Segoe UI, underlined inputs and no app tooltips. Never reuse the auth notice or styling inside the signed-in app. `auth-controls` must be declared before `ui-controls` so its narrowly scoped important declarations win. All signed-in control/typing rules below remain in force.

---

# Shared UI controls

This contract applies to the shared app shell, authentication screens, dialogs,
menus, calendar, settings, editor and activity window controls. Embedded game
canvases, imported HTML and user-written content retain their own presentation.

## Buttons and typography

`css/ui-controls.css` is the final shared control layer. Keep its link after the
feature styles and before `css/scrollbars.css` in `index.html`. The named layer
owns important button appearance rules so older feature-specific overrides do
not create another button design. Adjust its tokens to change the design.

Use the existing `.btn` for text actions and `.icon-btn` for icon actions.
Use `.primary` for primary actions and `.danger` for destructive actions. Reuse
the shared border, 10px corner radius, font family, weight, focus outline and
hover treatment. Keep compact and touch dimensions in the owning feature.
Selected tabs, muted microphones, active sharing, saved stars and destructive
actions must stay visually distinct. Add any new state to the shared layer and
verify the actual computed style both before and after toggling it.

Avoid component-specific glow, gradients, font families, text transforms or
hover motion. UI controls use `--font-ui`; code editors, font previews and
user-selected content fonts can retain their intentional typeface. Do not style
content cards, avatars, swatches or switches as ordinary action buttons.

## Labels and tooltips

Write application-owned short labels in natural English Title Case: `Room
List`, `Create or Join Room`, `Find in Note`, `The Santino of City`. Preserve
acronyms and product names. Sentence descriptions stay sentence case. Never
capitalize stored user names, filenames, messages, room names or calendar notes.

`js/ui/tooltips.js` registers immediately after `ui/sidebar`. It reuses the
existing `#sidebar-tooltip` portal and automatically reconciles inserted and
updated controls. Always give icon-only actions a meaningful, state-aware
`aria-label` (for example, `Show Password` becomes `Hide Password`).
Self-explanatory text buttons have no redundant tooltip. Hidden text and
single-letter tool glyphs do not count as explanatory visible labels.

- Prefer `aria-label` for icon actions. Existing `data-tooltip` is supported.
- Avoid native `title` popups; the shared controller converts legacy titles.
- Use `data-tooltip-descriptive` only when the visible value needs a separate
  action or explanation, such as resetting a zoom percentage.
- Use `data-tooltip-preserve-case` for labels containing user-written content.
- Use `data-ui-tooltip="off"` for a surface with its own rich tooltip controller.
  Member status, classmates and timestamps retain their interactive/content
  behavior while sharing the tooltip appearance.
- Call `ChatApp.refreshTooltips(container)` if a feature hides text by changing
  only CSS classes and needs reconciliation before its next hover/focus.

Keyboard focus, Escape, scrolling, disabled hover, viewport bounds and touch
dismissal are supported. Do not add another tooltip event system for a new
ordinary button. Keep unrelated `aria-describedby` associations intact.

## Verification and release

Run `npm run test:ui-consistency`, `npm run test:browser`, and `npm test` after
shared-control changes. Also run the affected feature's browser tests; menus,
calendar, media/editor and composer have their own layout/state checks. Use
isolated fixtures; do not mutate production account data for a visual review.

Update the shared web version, asset revision and web/mobile revision together.
This design release requires no native build, native version bump or manifest
change. Keep the existing combined update control and shared update systems.
Read `NATIVE-UPDATES.md` before any future updater work.

Run `npm run audit:upload` before packaging. Keep every supplied source path,
with at most 100 files recursively in each top-level upload folder and in the
loose-root selection. Exclude dependencies, build output, captures and private
signing material. New tests belong in `tests-release` while `tests` is near its
upload limit.

## Shared web -5 refinements

Close/dismiss/X controls retain accessible names but have no tooltip. Message file and sticker surfaces have no tooltip; nested download and playback controls remain eligible. Keep these exclusions in tooltips.js so dynamically inserted messages follow the same policy. Editor zoom uses the descriptive tooltip `Scroll to Zoom · Click to Reset`.

Room toolbar, composer tools and the admin/settings dock use transparent resting surfaces with shared hover feedback. Send remains a filled primary action. Room plus and list toggle use the same neutral treatment. Preserve green active/join call states. The sidebar rail uses centered 44px targets with 22px block SVGs; avoid padding that pushes icons outside the available box. Run `npm run test:ui-refinements` after changing these rules.

## Shared web 2026.11.10-1

The reader receipt is deliberately sentence case: `Seen by`. Keep that exact label. Spotify seek and control states use the shared blue/control tokens. GradeSort auth layouts live in `css/auth-refresh.css`, before the shared controls; preserve their original element IDs and GradeSort branding on narrow screens. Upload layouts live in `css/upload-progress.css`; pending cards are noninteractive, with filename centered in the header and the progress meter at its right. See `UPLOAD-AUTH-TABS.md` for lifecycle and preview rules.

## Tooltip motion and sliders

All tooltips should have the same hover and unhover animation. Use the shared motion tokens, keep each tooltip mounted for its exit transition, and respect reduced motion. Ordinary range inputs inherit the sidebar Music seek style. Refresh the fill after setting a value in code with `App.syncPreciseRangeVisual(input)`. Keep the image editor hue spectrum so users can pick a color.

## Call and Music hover targets

Keep participant and share surfaces free of tooltips. Attach viewer details to the eye and preserve accessible names on tile controls. In the class tooltip, set the name-to-divider padding and divider-to-viewers gap together. Keep the Music screen’s editable fields and deliberate reorder gestures usable when changing selection styles.

## Wallpaper colors

Use the shared surface, text, border, and control properties for new signed-in
features. The active wallpaper palette in `css/wallpaper-palette.css` supplies
their colors. A component with its own gradient or legacy color can consume
a wallpaper role with its existing color as the fallback, for example
`background: var(--wall-raised, #222c38)`. Use `--wall-accent-ink` for text or
icons on a solid wallpaper accent. The navigation rails and Home cards use
`--wall-glass` for the user's panel opacity setting. Menus and overlapping
dialogs use solid panels to keep labels readable.

Keep media pixels, editor paint and swatches, presence states, warnings and
destructive actions recognizable. Run `node tests-release/wallpaper-theme.browser.cjs`
when changing a feature's colors. The test checks painted properties after
sampling warm and cool images in desktop and phone layouts.
