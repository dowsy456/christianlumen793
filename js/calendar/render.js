/* calendar/render: shared notes, fitted day bubbles, and personal note reminders. */
(function (App) {
  "use strict";

  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const drafts = new Map();
  let ui = null;
  let draftYear = null;
  let generation = 0;
  let pageMode = "month";
  let dayDate = null;
  let mainNoteDate = null;
  let pendingMoveDate = null;
  let selectedSeries = null;
  const seriesDrafts = new Map();
  const icons = {
    calendar: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2m-8 3h2"/></svg>',
    note: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z"/><path d="M14 3v6h6M8 13h8m-8 4h5"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m10 6 6 6-6 6"/></svg>'
  };
  icons.repeat = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6M13 3v6h6l-6-6ZM15 14h6l-2-2m2 2-2 2m-3 5h-5l2 2m-2-2 2-2"/></svg>';

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function dateKey(year, month, day) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  function dateFromKey(key) {
    const bits = String(key).split("-").map(Number);
    return new Date(bits[0], bits[1] - 1, bits[2], 12);
  }
  function fullDate(key) {
    const d = dateFromKey(key);
    return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }
  function records(kind, date) {
    const source = kind === "note" ? App.calendarState.notes : App.calendarState.reminders;
    if (kind === "note") return App.getCalendarNoteEntries(source?.[date]);
    return Object.entries(source?.[date] || {}).filter(([id, record]) => {
      if (kind === "reminder" && date < App.calendarState.today) return false;
      const text = kind === "reminder" && record?.noteId === id ? App.calendarState.notes?.[date]?.[id]?.text : record?.text;
      return typeof text === "string" && !!text.trim();
    }).sort((a, b) => (Number(a[1].createdAt) || 0) - (Number(b[1].createdAt) || 0) || a[0].localeCompare(b[0]));
  }
  function draftKey(kind, date, id) { return `${kind}|${date}|${id}`; }
  function getDraft(kind, date, id, remoteText) {
    const key = draftKey(kind, date, id);
    if (!drafts.has(key)) drafts.set(key, { kind, date, id, base: remoteText, value: remoteText, remote: remoteText, dirty: false, busy: false, conflict: false, error: "", editing: id === "__new__", remind: false, remindBusy: false, remindError: "" });
    const d = drafts.get(key);
    d.remote = remoteText;
    if (!d.dirty && !d.busy) {
      d.base = remoteText;
      d.value = remoteText;
      d.conflict = false;
    } else if (!d.busy) {
      d.conflict = d.base !== remoteText;
    }
    return d;
  }

  function validDate(date) {
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = dateFromKey(date);
    return parsed.getFullYear() === App.calendarState.year && dateKey(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()) === date;
  }

  function releaseEditors() {
    App.closeCalendarDatePicker?.();
    const select = ui?.root.querySelector("#calendar-month-select");
    if (select) App.closeCustomSelect?.(App.customSelectState?.get(select));
    for (const editor of [...(ui?.editors.values() || []), ...(ui?.seriesEditors.values() || []), ...(ui?.seriesRows.values() || [])]) App.releaseCalendarAuthor?.(editor.meta);
    ui?.observer?.disconnect();
  }

  function sizeMonth() {
    if (!ui?.root.isConnected) return;
    if (pageMode === "day") {
      for (const editor of ui.editors.values()) sizeEditor(editor);
      return;
    }
    const viewport = App.messagesEl || App.messagesListEl.parentElement;
    if (!viewport) return;
    const style = getComputedStyle(viewport);
    const bounds = viewport.getBoundingClientRect();
    const visual = window.visualViewport;
    const visibleBottom = Math.min(bounds.top + viewport.clientTop + viewport.clientHeight,
      visual ? visual.offsetTop + visual.height : window.innerHeight);
    // Add scrollTop back so scrolling to the note editor cannot grow the month.
    // The measured card start also includes any parent padding or app header.
    const cardTop = ui.root.querySelector(".calendar-month-card").getBoundingClientRect().top + viewport.scrollTop;
    const height = Math.max(1, Math.floor(visibleBottom - cardTop - (parseFloat(style.paddingBottom) || 0) - 8));
    ui.root.style.setProperty("--calendar-height", `${height}px`);
    ui.root.classList.toggle("calendar-compact", height < 450);
    ui.root.classList.toggle("calendar-tight", height < 280);
    // Only overflowing previews become scroll containers. Others use native page scrolling.
    for (const { preview } of ui.cells.values()) preview.classList.toggle("is-scrollable", preview.scrollHeight > preview.clientHeight + 1);
  }

  function sizeEditor(editor) {
    if (editor.kind !== "note" || !editor.textarea.isConnected || editor.textarea.hidden) return;
    const input = editor.textarea;
    const style = getComputedStyle(input);
    const sizeKey = `${input.clientWidth}|${style.font}|${style.lineHeight}`;
    if (editor.measuredText === input.value && editor.measuredSize === sizeKey) return;
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight + 2}px`;
    editor.measuredText = input.value;
    editor.measuredSize = sizeKey;
  }

  function buildPage() {
    releaseEditors();
    const root = el("section", `calendar-page calendar-${pageMode}-page`);
    root.id = "calendar-page";
    root.setAttribute("aria-label", "Calendar");
    root.innerHTML = pageMode === "day" ? `
      <header class="calendar-day-page-heading"><button type="button" class="calendar-button calendar-back-button" data-calendar-action="back">${icons.left}<span>Back</span></button><h1 id="calendar-day-title" tabindex="-1"></h1></header>
      <div class="calendar-banner" role="status" hidden></div>
      <section class="calendar-day-notes" aria-labelledby="calendar-day-title"><div class="calendar-section-message calendar-note-message" role="status"></div><div class="calendar-order-status calendar-sr-only" role="status" aria-live="polite"></div><div class="calendar-note-list"></div></section>` : `
      <section class="calendar-month-card" aria-label="Month Calendar">
        <div class="calendar-toolbar">
          <div class="calendar-month-heading"><h2 id="calendar-month-title"></h2></div>
          <div class="calendar-controls">
            <button type="button" class="calendar-button calendar-today-button" data-calendar-action="today">Today</button>
            <label class="calendar-sr-only" for="calendar-month-select">Choose a month in the current year</label>
            <select id="calendar-month-select" class="calendar-month-select">${MONTHS.map((m, i) => `<option value="${i}">${m}</option>`).join("")}</select>
            <div class="calendar-arrows"><button type="button" class="calendar-button calendar-arrow" data-calendar-action="prev" aria-label="Previous Month">${icons.left}</button><button type="button" class="calendar-button calendar-arrow" data-calendar-action="next" aria-label="Next Month">${icons.right}</button></div>
          </div>
        </div>
        <div class="calendar-month-grid-card"><div class="calendar-weekdays" aria-hidden="true">${WEEKDAYS.map(d => `<div title="${d}">${d.slice(0, 3)}</div>`).join("")}</div>
        <div class="calendar-grid" aria-labelledby="calendar-month-title"></div></div>
      </section>
      <section id="calendar-detail" class="calendar-detail" aria-label="Add Notes">
        <div class="calendar-banner" role="status" hidden></div>
        <div class="calendar-detail-columns">
          <section class="calendar-notes-section calendar-detail-card"><div class="calendar-section-heading"><span class="calendar-section-icon">${icons.note}</span><h3>Add Notes</h3></div><div class="calendar-date-slot calendar-date-label"></div><div class="calendar-section-message calendar-note-message" role="status"></div><div class="calendar-note-list"></div></section>
          <section class="calendar-repeating-section calendar-detail-card"><div class="calendar-section-heading"><span class="calendar-section-icon">${icons.repeat}</span><div><h3>Repeating Notes</h3><p>Weekly notes, added as each month begins.</p></div></div><div class="calendar-repeat-message calendar-section-message" role="status"></div><div class="calendar-repeat-list"></div><section class="calendar-repeat-details" hidden></section></section>
        </div>
      </section>`;
    App.messagesListEl.replaceChildren(root);
    ui = { root, mode: pageMode, gridKey: "", editors: new Map(), cells: new Map(), seriesRows: new Map(), seriesEditors: new Map() };
    if (typeof ResizeObserver === "function") {
      ui.observer = new ResizeObserver(sizeMonth);
      ui.observer.observe(App.messagesEl || App.messagesListEl.parentElement);
    }
    if (pageMode === "day") {
      root.querySelector(".calendar-back-button").addEventListener("click", () => App.showCalendarPage());
      return;
    }
    ui.datePicker = App.createCalendarDatePicker({
      id: "calendar-note-date", value: mainNoteDate, label: "Date",
      onChange: date => {
        if (validDate(date)) mainNoteDate = date;
        App.renderCalendar();
      }
    });
    root.querySelector(".calendar-date-slot").append(el("span", "", "Date"), ui.datePicker);
    root.querySelector("#calendar-month-select").addEventListener("change", e => changeMonth(Number(e.target.value)));
    App.enhanceNativeSelect?.(root.querySelector("#calendar-month-select"));
    root.querySelector("[data-calendar-action='prev']").addEventListener("click", () => changeMonth(App.calendarState.month - 1));
    root.querySelector("[data-calendar-action='next']").addEventListener("click", () => changeMonth(App.calendarState.month + 1));
    root.querySelector("[data-calendar-action='today']").addEventListener("click", () => {
      App.refreshCalendarDate?.();
      const state = App.calendarState;
      state.month = Number(state.today.slice(5, 7)) - 1;
      state.selectedDate = state.today;
      App.renderCalendar();
      ui.cells.get(state.today)?.button.focus({ preventScroll: true });
    });
    sizeMonth();
  }

  function changeMonth(month) {
    if (month < 0 || month > 11) return;
    const state = App.calendarState;
    const oldDay = Number((state.selectedDate || state.today).slice(8, 10)) || 1;
    state.month = month;
    const todayMonth = Number(state.today.slice(5, 7)) - 1;
    state.selectedDate = month === todayMonth ? state.today : dateKey(state.year, month, Math.min(oldDay, new Date(state.year, month + 1, 0).getDate()));
    App.renderCalendar();
  }

  function selectDate(date) {
    App.calendarState.selectedDate = date;
    App.renderCalendar();
  }

  function handleDayKey(e, date) {
    const state = App.calendarState;
    const d = dateFromKey(date);
    const day = d.getDate();
    const last = new Date(state.year, state.month + 1, 0).getDate();
    let next = day;
    if (e.key === "ArrowLeft") next--;
    else if (e.key === "ArrowRight") next++;
    else if (e.key === "ArrowUp") next -= 7;
    else if (e.key === "ArrowDown") next += 7;
    else if (e.key === "Home") next -= d.getDay();
    else if (e.key === "End") next += 6 - d.getDay();
    else if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      changeMonth(state.month + (e.key === "PageUp" ? -1 : 1));
      ui.cells.get(state.selectedDate)?.button.focus({ preventScroll: true });
      return;
    } else return;
    e.preventDefault();
    next = Math.min(last, Math.max(1, next));
    const key = dateKey(state.year, state.month, next);
    selectDate(key);
    ui.cells.get(key)?.button.focus({ preventScroll: true });
  }

  function renderGrid() {
    const state = App.calendarState;
    const monthKey = `${state.year}-${state.month}`;
    const grid = ui.root.querySelector(".calendar-grid");
    if (ui.gridKey !== monthKey) {
      ui.gridKey = monthKey;
      for (const { preview } of ui.cells.values()) ui.observer?.unobserve(preview);
      ui.cells.clear();
      grid.replaceChildren();
      const offset = new Date(state.year, state.month, 1).getDay();
      const length = new Date(state.year, state.month + 1, 0).getDate();
      const cells = Math.ceil((offset + length) / 7) * 7;
      grid.style.setProperty("--calendar-weeks", String(cells / 7));
      for (let index = 0; index < cells; index++) {
        const day = index - offset + 1;
        if (day < 1 || day > length) {
          const blank = el("div", "calendar-day-empty");
          blank.setAttribute("aria-hidden", "true");
          grid.append(blank);
          continue;
        }
        const key = dateKey(state.year, state.month, day);
        const button = el("button", "calendar-day");
        button.type = "button";
        button.dataset.date = key;
        const top = el("span", "calendar-day-top");
        top.append(el("span", "calendar-day-number", String(day)));
        const reminder = el("span", "calendar-day-reminder");
        reminder.innerHTML = icons.bell;
        const reminderCount = el("span");
        reminder.append(reminderCount);
        top.append(reminder);
        const preview = el("span", "calendar-day-preview");
        const count = el("span", "calendar-day-count");
        button.append(top, preview, count);
        button.addEventListener("click", () => App.showCalendarDay(key));
        button.addEventListener("keydown", e => handleDayKey(e, key));
        grid.append(button);
        ui.observer?.observe(preview);
        ui.cells.set(key, { button, reminder, reminderCount, preview, count });
      }
    }
    for (const [key, cell] of ui.cells) {
      const notes = records("note", key);
      const reminders = records("reminder", key);
      const isToday = key === state.today;
      const selected = key === state.selectedDate;
      cell.button.classList.toggle("is-today", isToday);
      // selectedDate is the keyboard navigation anchor, not a persistent
      // selection: closing a day's notes must leave only today highlighted.
      cell.button.classList.remove("is-selected");
      cell.button.classList.toggle("has-notes", !!notes.length);
      cell.button.tabIndex = selected ? 0 : -1;
      if (isToday) cell.button.setAttribute("aria-current", "date");
      else cell.button.removeAttribute("aria-current");
      cell.button.setAttribute("aria-label", `${fullDate(key)}${isToday ? ", today" : ""}, ${notes.length} shared ${notes.length === 1 ? "note" : "notes"}, ${reminders.length} personal ${reminders.length === 1 ? "reminder" : "reminders"}. Open day details.`);
      cell.reminder.hidden = !reminders.length;
      cell.reminderCount.textContent = String(reminders.length);
      const previewTexts = notes.map(([, note]) => note.text.trim().replace(/\s+/g, " "));
      const previewKey = JSON.stringify(previewTexts);
      if (cell.preview.dataset.content !== previewKey) {
        cell.preview.dataset.content = previewKey;
        cell.preview.replaceChildren(...previewTexts.map(t => {
          const preview = el("span", "calendar-note-preview", t);
          preview.dataset.calendarTooltip = "1";
          preview.dataset.tooltip = t;
          return preview;
        }));
      }
      cell.count.textContent = notes.length ? `${notes.length} ${notes.length === 1 ? "note" : "notes"}` : "";
    }
  }

  function createEditor(kind, date, id) {
    const fresh = id === "__new__";
    const card = el("article", `calendar-editor${fresh ? " calendar-editor-new" : " calendar-note-item"}`);
    card.dataset.kind = kind;
    card.dataset.id = id;
    const header = el("div", "calendar-editor-header");
    const meta = el("span", "calendar-editor-meta");
    header.append(meta);
    const orderControls = el("div", "calendar-note-order");
    orderControls.setAttribute("role", "group");
    orderControls.setAttribute("aria-label", "Note Order");
    const moveUp = el("button", "calendar-button calendar-note-move calendar-note-move-up");
    const moveDown = el("button", "calendar-button calendar-note-move calendar-note-move-down");
    for (const [button, label, path] of [[moveUp, "Move Note Up", "m6 14 6-6 6 6"], [moveDown, "Move Note Down", "m6 10 6 6 6-6"]]) {
      button.type = "button";
      button.setAttribute("aria-label", label);
      button.title = label;
      button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="${path}"/></svg>`;
    }
    orderControls.append(moveUp, moveDown);
    header.append(orderControls);
    header.hidden = fresh;
    const bubble = el("p", "calendar-note-bubble");
    bubble.hidden = fresh;
    const textarea = el("textarea", "calendar-editor-input");
    textarea.id = `calendar-${kind}-${date}-${id}`;
    textarea.setAttribute("aria-label", fresh ? "New Note" : "Edit Note");
    textarea.rows = fresh ? 3 : 1;
    textarea.maxLength = 10000;
    textarea.placeholder = "Leave a note for everyone…";
    textarea.hidden = !fresh;
    const conflict = el("div", "calendar-editor-conflict");
    conflict.hidden = true;
    conflict.append(el("p", "", "This was changed elsewhere. Your draft is safe. Review the latest version before saving."));
    const latest = el("div", "calendar-editor-latest");
    const choices = el("div", "calendar-editor-conflict-actions");
    const useLatest = el("button", "calendar-button", "Use Latest Version");
    const keepDraft = el("button", "calendar-button", "Keep My Draft");
    useLatest.type = keepDraft.type = "button";
    choices.append(useLatest, keepDraft);
    conflict.append(latest, choices);
    const footer = el("div", "calendar-editor-footer");
    const remindLabel = el("label", "calendar-remind-label");
    const remind = el("input", "calendar-remind-checkbox");
    remind.type = "checkbox";
    remind.id = `calendar-remind-${date}-${id}`;
    remindLabel.htmlFor = remind.id;
    remindLabel.append(remind, el("span", "", "Remind Me"));
    const repeatLabel = el("label", "calendar-repeat-label");
    const repeat = el("input", "calendar-repeat-checkbox");
    repeat.type = "checkbox";
    repeat.setAttribute("aria-label", "Repeat");
    repeatLabel.append(repeat, el("span", "", "Repeat"));
    repeatLabel.hidden = !fresh;
    const status = el("span", "calendar-editor-status");
    status.setAttribute("role", "status");
    status.hidden = true;
    const save = el("button", "calendar-button calendar-editor-save", fresh ? "Add Note" : "Save");
    const edit = el("button", "calendar-button calendar-editor-edit", "Edit");
    const cancel = el("button", "calendar-button calendar-editor-cancel", "Cancel");
    const remove = el("button", "calendar-button calendar-editor-delete", "Delete");
    for (const button of [save, edit, cancel, remove]) button.type = "button";
    const actions = el("div", "calendar-editor-actions");
    actions.append(edit, save, cancel, remove);
    const toggles = el("div", "calendar-editor-toggles");
    toggles.append(remindLabel, repeatLabel);
    footer.append(toggles, actions);
    card.append(header, bubble, textarea, conflict, footer, status);
    const editor = { card, header, meta, orderControls, moveUp, moveDown, bubble, textarea, conflict, latest, status, save, edit, cancel, remove, remind, remindLabel, repeat, repeatLabel, kind, date, id, persisted: false, orderIndex: -1, orderCount: 0 };
    repeat.addEventListener("change", () => { const d = drafts.get(draftKey(kind, date, id)); if (d) d.repeat = repeat.checked; });
    moveUp.addEventListener("click", () => void moveEditor(editor, -1));
    moveDown.addEventListener("click", () => void moveEditor(editor, 1));
    textarea.addEventListener("input", () => {
      const d = drafts.get(draftKey(kind, date, id));
      if (!d) return;
      d.value = textarea.value;
      d.dirty = d.value !== d.base;
      d.error = "";
      syncEditor(editor);
    });
    textarea.addEventListener("keydown", e => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !save.disabled) {
        e.preventDefault();
        void saveEditor(editor);
      }
      if (e.key === "Escape" && !fresh && !cancel.disabled) {
        e.preventDefault();
        cancel.click();
      }
    });
    edit.addEventListener("click", () => {
      const d = drafts.get(draftKey(kind, date, id));
      d.editing = true;
      syncEditor(editor);
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    });
    cancel.addEventListener("click", () => {
      const d = drafts.get(draftKey(kind, date, id));
      d.base = d.value = d.remote;
      d.dirty = d.conflict = d.editing = false;
      d.error = "";
      App.renderCalendar();
      if (edit.isConnected && !edit.hidden) edit.focus({ preventScroll: true });
    });
    useLatest.addEventListener("click", () => {
      const d = drafts.get(draftKey(kind, date, id));
      d.base = d.value = d.remote;
      d.dirty = d.conflict = false;
      d.error = "";
      App.renderCalendar();
    });
    keepDraft.addEventListener("click", () => {
      const d = drafts.get(draftKey(kind, date, id));
      d.base = d.remote;
      d.dirty = d.value !== d.base;
      d.conflict = false;
      d.error = "";
      syncEditor(editor);
      textarea.focus({ preventScroll: true });
    });
    remind.addEventListener("change", () => {
      const d = drafts.get(draftKey(kind, date, id));
      if (!d || remind.disabled) return;
      if (fresh) {
        d.remind = remind.checked;
        d.remindError = "";
      } else {
        void toggleReminder(editor, remind.checked);
      }
    });
    save.addEventListener("click", () => void saveEditor(editor));
    remove.addEventListener("click", () => void saveEditor(editor, true));
    return editor;
  }

  function syncEditor(editor, record) {
    const { kind, date, id } = editor;
    const d = drafts.get(draftKey(kind, date, id));
    const state = App.calendarState;
    if (!d) return;
    const fresh = id === "__new__";
    if (record !== undefined) {
      editor.persisted = !fresh && typeof record?.text === "string" && !!record.text.trim();
      if (!fresh) App.syncCalendarAuthor?.(editor.meta, record);
    }
    if (editor.textarea.value !== d.value) editor.textarea.value = d.value;
    if (editor.bubble.textContent !== d.remote) editor.bubble.textContent = d.remote;
    const editing = fresh || d.editing || d.dirty || d.conflict;
    editor.card.classList.toggle("is-editing", editing);
    editor.textarea.hidden = !editing;
    editor.bubble.hidden = editing;
    editor.textarea.disabled = d.busy || !state.ready;
    editor.save.hidden = !editing;
    editor.save.disabled = d.busy || d.remindBusy || !state.ready || !!state.error || !d.dirty || d.conflict || (fresh && !d.value.trim()) || state.connected === false;
    editor.save.textContent = d.busy ? "Saving…" : fresh ? "Add Note" : "Save";
    editor.edit.hidden = fresh || editing;
    editor.edit.disabled = d.busy || !state.ready;
    editor.cancel.hidden = fresh || !editing;
    editor.cancel.disabled = d.busy;
    editor.remove.hidden = !editor.persisted;
    editor.remove.disabled = d.busy || d.remindBusy || !state.ready || !!state.error || d.conflict || state.connected === false;
    editor.remindLabel.hidden = date < state.today || (!fresh && !editor.persisted);
    editor.remind.disabled = d.busy || d.remindBusy || !state.remindersReady || !!state.remindersError || state.connected === false || date < state.today;
    editor.remind.checked = fresh ? d.remind : d.remindBusy ? d.remindPending : !!App.isCalendarNoteReminder?.(date, id);
    editor.repeat.checked = !!d.repeat;
    editor.repeat.disabled = d.busy || !state.ready || !state.repeatingReady || state.connected === false;
    editor.remindLabel.classList.toggle("is-busy", d.remindBusy);
    editor.orderControls.hidden = fresh || !editor.persisted;
    const orderDisabled = !!pendingMoveDate || d.busy || !state.ready || !!state.error || state.connected === false;
    editor.moveUp.disabled = orderDisabled || editor.orderIndex <= 0;
    editor.moveDown.disabled = orderDisabled || editor.orderIndex < 0 || editor.orderIndex >= editor.orderCount - 1;
    editor.remindLabel.title = state.remindersError || (!state.remindersReady ? "Reminders are connecting…" : "Show a reminder for this note on its date.");
    editor.conflict.hidden = !d.conflict;
    editor.latest.textContent = d.remote || "This note is now empty.";
    editor.status.textContent = d.error || d.orderError || d.remindError || (d.conflict ? "Resolve the change below." : d.dirty && !fresh ? "Unsaved changes" : "");
    editor.status.hidden = !editor.status.textContent;
    editor.status.classList.toggle("is-error", !!(d.error || d.orderError || d.remindError));
    sizeEditor(editor);
  }

  async function moveEditor(editor, direction) {
    const trigger = direction < 0 ? editor.moveUp : editor.moveDown;
    if (trigger.disabled || pendingMoveDate) return;
    const d = drafts.get(draftKey("note", editor.date, editor.id));
    if (!d) return;
    const savedGeneration = generation;
    const restoreFocus = document.activeElement === trigger;
    pendingMoveDate = editor.date;
    d.orderError = "";
    const announcement = ui?.root.querySelector(".calendar-order-status");
    if (announcement) announcement.textContent = "";
    App.renderCalendar();
    try {
      const moved = await App.moveCalendarNote(editor.date, editor.id, direction);
      if (savedGeneration === generation && announcement?.isConnected) {
        announcement.textContent = moved ? `Note moved ${direction < 0 ? "up" : "down"}.` : `Note is already at the ${direction < 0 ? "top" : "bottom"}.`;
      }
    } catch (error) {
      if (savedGeneration !== generation) return;
      d.orderError = error?.message || "Could not move this note. Please try again.";
    } finally {
      if (savedGeneration === generation) {
        pendingMoveDate = null;
        App.renderCalendar();
        if (restoreFocus && trigger.isConnected && pageMode === "day" && dayDate === editor.date) {
          const fallback = direction < 0 ? editor.moveDown : editor.moveUp;
          (trigger.disabled ? fallback : trigger)?.focus({ preventScroll: true });
        }
      }
    }
  }

  async function toggleReminder(editor, enabled) {
    const { date, id } = editor;
    const d = drafts.get(draftKey("note", date, id));
    if (!d || !editor.persisted || editor.remind.disabled) return;
    const savedGeneration = generation;
    d.remindBusy = true;
    d.remindPending = enabled;
    d.remindError = "";
    syncEditor(editor);
    try {
      await App.setCalendarNoteReminder(date, id, enabled);
      if (savedGeneration !== generation) return;
      d.remindBusy = false;
      App.renderCalendar();
    } catch (error) {
      if (savedGeneration !== generation) return;
      d.remindBusy = false;
      d.remindError = error?.message || "Could not update the reminder. Please try again.";
      App.renderCalendar();
    }
  }

  async function saveEditor(editor, remove = false) {
    if (remove ? editor.remove.hidden || editor.remove.disabled : editor.save.disabled) return;
    const { date, id } = editor;
    const key = draftKey("note", date, id);
    const d = drafts.get(key);
    const savedGeneration = generation;
    const fresh = id === "__new__";
    const value = remove ? "" : d.value;
    const addReminder = fresh && d.remind && date >= App.calendarState.today;
    d.busy = true;
    d.error = d.remindError = "";
    syncEditor(editor);
    try {
      const savedId = await App.saveCalendarNote(date, fresh ? null : id, value, fresh ? undefined : d.base, fresh && d.repeat);
      if (savedGeneration !== generation) return;
      d.dirty = d.conflict = false;
      d.editing = fresh;
      d.base = d.value = d.remote = fresh ? "" : value;
      d.remind = false;
      d.repeat = false;
      if (addReminder) {
        try {
          await App.setCalendarNoteReminder(date, savedId, true);
        } catch (error) {
          if (savedGeneration !== generation) return;
          d.remindError = "Note added, but its reminder could not be set. Open the note and turn on Remind me to retry.";
        }
        if (savedGeneration !== generation) return;
      }
      d.busy = false;
      if (!value.trim() && !fresh) drafts.delete(key);
      App.renderCalendar();
      if (fresh && editor.textarea.isConnected) editor.textarea.focus({ preventScroll: true });
      else if (!remove && editor.edit.isConnected && !editor.edit.hidden) editor.edit.focus({ preventScroll: true });
    } catch (error) {
      if (savedGeneration !== generation) return;
      d.busy = false;
      if (error?.code === "calendar/conflict") {
        d.conflict = true;
        d.error = "A newer version was saved. Review it before trying again.";
      } else {
        d.error = error?.message || "Could not save. Your draft is still here. Please try again.";
      }
      App.renderCalendar();
    }
  }
  function renderEditors(kind, date) {
    const list = ui.root.querySelector(".calendar-note-list");
    const onlyNew = pageMode === "month";
    const entries = onlyNew ? [] : records(kind, date);
    const orderedIds = entries.map(([id]) => id);
    const entryMap = new Map(entries);
    const state = App.calendarState;
    const ready = state.ready;
    const error = state.error;
    // A remote removal must not discard an editor that still contains a draft.
    for (const d of drafts.values()) {
      if (!onlyNew && d.kind === kind && d.date === date && d.id !== "__new__" && (d.dirty || d.busy) && !entryMap.has(d.id)) {
        entries.push([d.id, { text: "" }]);
        entryMap.set(d.id, { text: "" });
      }
    }
    const message = ui.root.querySelector(".calendar-note-message");
    message.textContent = error ? String(error) : !ready ? "Loading notes…" : pageMode === "day" && !entries.length ? "No notes for this day yet." : "";
    message.hidden = !message.textContent;
    message.classList.toggle("is-error", !!error);
    if (pageMode === "month") entries.push(["__new__", { text: "" }]);
    const visibleKeys = new Set();
    let position = 0;
    for (const [id, record] of entries) {
      const key = draftKey(kind, date, id);
      visibleKeys.add(key);
      getDraft(kind, date, id, record.text);
      if (!ui.editors.has(key)) ui.editors.set(key, createEditor(kind, date, id));
      const editor = ui.editors.get(key);
      editor.orderIndex = orderedIds.indexOf(id);
      editor.orderCount = orderedIds.length;
      syncEditor(editor, record, position);
      // Do not detach existing editors on live updates: selection and focus stay intact.
      const atPosition = list.children[position];
      if (atPosition !== editor.card) list.insertBefore(editor.card, atPosition || null);
      sizeEditor(editor);
      position++;
    }
    for (const [key, editor] of ui.editors) {
      if (editor.kind === kind && !visibleKeys.has(key)) {
        App.releaseCalendarAuthor?.(editor.meta);
        editor.card.remove();
        ui.editors.delete(key);
      }
    }
  }

  function createSeriesRow(id) {
    const card = el("article", "calendar-repeat-row");
    card.dataset.seriesId = id;
    const meta = el("div", "calendar-editor-meta");
    const open = el("button", "calendar-repeat-open");
    open.type = "button";
    const frequency = el("p", "calendar-repeat-frequency");
    const input = el("textarea", "calendar-editor-input");
    input.maxLength = 10000;
    input.setAttribute("aria-label", "Edit Repeating Note");
    input.hidden = true;
    const footer = el("div", "calendar-editor-footer");
    const label = el("label", "calendar-repeat-label");
    const enabled = el("input");
    enabled.type = "checkbox";
    enabled.setAttribute("aria-label", "Enable Repeating Note");
    const enabledText = el("span");
    label.append(enabled, enabledText);
    const actions = el("div", "calendar-editor-actions");
    const edit = el("button", "calendar-button", "Edit");
    const save = el("button", "calendar-button calendar-editor-save", "Save");
    const cancel = el("button", "calendar-button", "Cancel");
    const remove = el("button", "calendar-button calendar-editor-delete", "Delete");
    for (const button of [edit, save, cancel, remove]) button.type = "button";
    const status = el("p", "calendar-editor-status");
    status.setAttribute("role", "status");
    actions.append(edit, save, cancel, remove);
    footer.append(label, actions);
    card.append(meta, open, frequency, input, footer, status);
    const draft = () => seriesDrafts.get(id);
    open.addEventListener("click", () => { selectedSeries = selectedSeries === id ? null : id; App.renderCalendar(); ui.root.querySelector(".calendar-repeat-details")?.scrollIntoView({ block: "nearest", behavior: "smooth" }); });
    input.addEventListener("input", () => { draft().value = input.value; draft().error = ""; });
    edit.addEventListener("click", () => { const d = draft(); d.editing = true; d.base = d.value = App.calendarState.repeating[id].text; App.renderCalendar(); input.focus(); });
    cancel.addEventListener("click", () => { draft().editing = false; draft().error = ""; App.renderCalendar(); });
    async function update(change) {
      const d = draft(), savedGeneration = generation;
      if (d.busy) return;
      d.busy = true; d.error = "";
      App.renderCalendar();
      try {
        await App.updateCalendarRepeating(id, change, change.text !== undefined ? d.base : undefined);
        if (savedGeneration !== generation) return;
        d.editing = false;
      } catch (reason) { if (savedGeneration === generation) d.error = reason?.message || "Could not save this repeating note."; }
      finally { if (savedGeneration === generation) { d.busy = false; App.renderCalendar(); } }
    }
    enabled.addEventListener("change", () => void update({ enabled: enabled.checked }));
    save.addEventListener("click", () => void update({ text: draft().value }));
    remove.addEventListener("click", () => void update({ remove: true }));
    return { card, meta, open, frequency, input, enabled, enabledText, edit, save, cancel, remove, status };
  }

  function renderRepeating() {
    const state = App.calendarState, list = ui.root.querySelector(".calendar-repeat-list");
    const entries = Object.entries(state.repeating || {}).filter(([, value]) => value && typeof value.text === "string").sort((a, b) => (Number(a[1].createdAt) || 0) - (Number(b[1].createdAt) || 0) || a[0].localeCompare(b[0]));
    const message = ui.root.querySelector(".calendar-repeat-message");
    message.textContent = state.repeatingError || (!state.repeatingReady ? "Loading repeating notes…" : !entries.length ? "Turn on Repeat when adding a note to repeat it every week." : "");
    message.hidden = !message.textContent;
    message.classList.toggle("is-error", !!state.repeatingError);
    for (const [id, row] of ui.seriesRows) if (!state.repeating[id]) { App.releaseCalendarAuthor?.(row.meta); row.card.remove(); ui.seriesRows.delete(id); seriesDrafts.delete(id); }
    if (selectedSeries && !state.repeating[selectedSeries]) selectedSeries = null;
    let position = 0;
    for (const [id, series] of entries) {
      if (!seriesDrafts.has(id)) seriesDrafts.set(id, { editing: false, busy: false, error: "", value: series.text, base: series.text });
      if (!ui.seriesRows.has(id)) ui.seriesRows.set(id, createSeriesRow(id));
      const row = ui.seriesRows.get(id), d = seriesDrafts.get(id);
      App.syncCalendarAuthor?.(row.meta, series);
      row.open.textContent = series.text;
      row.open.setAttribute("aria-expanded", String(selectedSeries === id));
      row.frequency.textContent = `Every ${WEEKDAYS[series.weekday] || "week"} · ${series.enabled ? "Repeats each month" : "Paused — existing notes stay"}`;
      row.enabled.checked = !!series.enabled;
      row.enabledText.textContent = series.enabled ? "On" : "Off";
      row.input.hidden = !d.editing;
      row.open.hidden = d.editing;
      if (row.input.value !== d.value) row.input.value = d.value;
      row.edit.hidden = d.editing;
      row.save.hidden = row.cancel.hidden = !d.editing;
      for (const control of [row.input, row.enabled, row.edit, row.save, row.remove]) control.disabled = d.busy || !state.connected || !state.ready;
      row.cancel.disabled = d.busy;
      row.status.textContent = d.busy ? "Saving…" : d.error || (d.editing ? "Updates this month's notes and future repetitions." : "");
      row.status.hidden = !row.status.textContent;
      row.status.classList.toggle("is-error", !!d.error);
      if (list.children[position] !== row.card) list.insertBefore(row.card, list.children[position] || null);
      position++;
    }
    const detail = ui.root.querySelector(".calendar-repeat-details");
    detail.hidden = !selectedSeries;
    const currentKeys = new Set();
    if (selectedSeries) {
      const series = state.repeating[selectedSeries];
      const month = CalendarRecurrence.today(App.getAccurateNow?.()?.getTime() || Date.now(), series.timeZone).slice(0, 7);
      let heading = detail.querySelector(".calendar-repeat-detail-heading");
      if (!heading) { heading = el("div", "calendar-repeat-detail-heading"); heading.append(el("h3"), el("p", "calendar-repeat-detail-copy")); detail.prepend(heading); }
      heading.querySelector("h3").textContent = `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;
      heading.querySelector("p").textContent = "Edit or delete one date below. Deleting a date keeps it from being added again.";
      let count = 0;
      for (const date of Object.keys(state.notes).filter(date => date.startsWith(month)).sort()) {
        const allNotes = records("note", date);
        for (const [id, note] of allNotes.filter(([, note]) => note.seriesId === selectedSeries)) {
          const key = draftKey("note", date, id);
          currentKeys.add(key);
          getDraft("note", date, id, note.text);
          if (!ui.seriesEditors.has(key)) {
            const editor = createEditor("note", date, id);
            editor.dateHeading = el("h4", "calendar-repeat-date", fullDate(date));
            editor.card.prepend(editor.dateHeading);
            ui.seriesEditors.set(key, editor);
          }
          const editor = ui.seriesEditors.get(key);
          editor.orderIndex = allNotes.findIndex(([key]) => key === id); editor.orderCount = allNotes.length;
          syncEditor(editor, note);
          const at = detail.children[++count];
          if (at !== editor.card) detail.insertBefore(editor.card, at || null);
        }
      }
      let empty = detail.querySelector(".calendar-repeat-empty");
      if (!empty) { empty = el("p", "calendar-repeat-empty calendar-section-message", "No occurrences remain for this month."); detail.append(empty); }
      empty.hidden = count > 0;
    }
    for (const [key, editor] of ui.seriesEditors) if (!currentKeys.has(key)) { App.releaseCalendarAuthor?.(editor.meta); editor.card.remove(); ui.seriesEditors.delete(key); }
  }

  App.renderCalendar = function () {
    App.renderHomeDashboardData?.();
    const place = App.getStoredPlace();
    if (!App.messagesListEl || !/^calendar(?::\d{4}-\d{2}-\d{2})?$/.test(place) || !App.calendarState) return;
    const focused = document.activeElement;
    const preserveInputFocus = focused?.classList.contains("calendar-editor-input") && ui?.root.contains(focused);
    const preserveMoveFocus = focused?.classList.contains("calendar-note-move") && ui?.root.contains(focused);
    const selection = preserveInputFocus ? [focused.selectionStart, focused.selectionEnd, focused.selectionDirection, focused.scrollTop] : null;
    const state = App.calendarState;
    if (draftYear !== null && draftYear !== state.year) {
      drafts.clear();
      mainNoteDate = state.today;
    }
    draftYear = state.year;
    dayDate = place.startsWith("calendar:") ? place.slice(9) : null;
    if (dayDate && !validDate(dayDate)) {
      App.prepareCalendarPage("calendar");
      dayDate = null;
    }
    pageMode = dayDate ? "day" : "month";
    if (!validDate(mainNoteDate)) mainNoteDate = state.today;
    if (!ui || !ui.root.isConnected || ui.root.parentNode !== App.messagesListEl || ui.mode !== pageMode) buildPage();
    const connected = state.connected !== false && navigator.onLine !== false;
    const banner = ui.root.querySelector(".calendar-banner");
    banner.textContent = !connected ? "You are offline. You can keep writing; save your changes when the connection returns." : [state.error, state.cleanupError].filter(Boolean).join(" ");
    banner.hidden = !banner.textContent;
    if (pageMode === "day") {
      ui.root.querySelector("#calendar-day-title").textContent = fullDate(dayDate);
      renderEditors("note", dayDate);
    } else {
      const selectedPrefix = `${state.year}-${String(state.month + 1).padStart(2, "0")}-`;
      if (!state.selectedDate?.startsWith(selectedPrefix)) state.selectedDate = state.today?.startsWith(selectedPrefix) ? state.today : `${selectedPrefix}01`;
      ui.root.querySelector("#calendar-month-title").textContent = `${MONTHS[state.month]} ${state.year}`;
      ui.root.querySelector("#calendar-month-select").value = String(state.month);
      App.syncCustomSelectControl?.(ui.root.querySelector("#calendar-month-select"));
      ui.root.querySelector("[data-calendar-action='prev']").disabled = state.month === 0;
      ui.root.querySelector("[data-calendar-action='next']").disabled = state.month === 11;
      App.updateCalendarDatePicker(ui.datePicker, { value: mainNoteDate, min: `${state.year}-01-01`, max: `${state.year}-12-31`, disabled: false });
      renderEditors("note", mainNoteDate);
      renderGrid();
      renderRepeating();
      sizeMonth();
    }
    if ((preserveInputFocus || preserveMoveFocus) && focused.isConnected && !focused.hidden && !focused.disabled) {
      if (document.activeElement !== focused) focused.focus({ preventScroll: true });
      if (selection) {
        focused.setSelectionRange(selection[0], selection[1], selection[2]);
        focused.scrollTop = selection[3];
      }
    }
  };

  App.showCalendarPage = function (date = null) {
    App.prepareCalendarPage("calendar");
    App.refreshCalendarDate?.();
    const state = App.calendarState;
    if (state && validDate(date)) {
      const parsed = dateFromKey(date);
      state.month = parsed.getMonth();
      state.selectedDate = date;
      mainNoteDate = date;
    }
    App.renderCalendar();
  };
  App.showCalendarDay = function (date) {
    App.refreshCalendarDate?.();
    if (!validDate(date)) return App.showCalendarPage();
    App.calendarState.month = dateFromKey(date).getMonth();
    App.calendarState.selectedDate = date;
    App.prepareCalendarPage(`calendar:${date}`);
    App.renderCalendar();
    ui?.root.querySelector("#calendar-day-title")?.focus({ preventScroll: true });
  };
  App.openCalendarDay = App.showCalendarDay;
  App.openCalendar = App.showCalendarPage;
  App.resetCalendarUI = function () {
    generation++;
    pendingMoveDate = null;
    drafts.clear();
    seriesDrafts.clear();
    selectedSeries = null;
    releaseEditors();
    App.resetCalendarAuthors?.();
    ui?.root.remove();
    ui = null;
    draftYear = null;
    dayDate = mainNoteDate = null;
    pageMode = "month";
  };
  App.register("calendar/render", function initializeCalendarRender() {
    window.addEventListener("resize", sizeMonth, { passive: true });
    window.visualViewport?.addEventListener("resize", sizeMonth, { passive: true });
  });
})(globalThis.ChatApp);

