/* Shared pure calendar recurrence rules. Loaded by the browser and Firebase worker.
 * Keep this file dependency-free: both runtimes must produce identical instances. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else { root.CalendarRecurrence = api; root.ChatApp.register("calendar/recurrence", function () {}); }
})(globalThis, function () {
  "use strict";
  const normalize = text => String(text || "").normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase("en-US");
  const key = date => date.toISOString().slice(0, 10);
  function today(timestamp, timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: timeZone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(timestamp));
      const get = type => parts.find(part => part.type === type).value;
      return `${get("year")}-${get("month")}-${get("day")}`;
    } catch { return key(new Date(timestamp)); }
  }
  function materialize(current, timestamp) {
    if (!current) return null; // Obtain the server retry for a cold Firebase transaction.
    const root = { ...current, years: { ...(current.years || {}) } };
    const datesByZone = new Map();
    let changed = false;
    for (const [id, series] of Object.entries(current.repeating || {})) {
      const seriesText = normalize(series?.text);
      if (!series?.enabled || !seriesText || !/^\d{4}-\d{2}-\d{2}$/.test(series.startDate || "") || !Number.isInteger(series.weekday) || series.weekday < 0 || series.weekday > 6) continue;
      const zone = series.timeZone || "UTC";
      if (!datesByZone.has(zone)) datesByZone.set(zone, today(timestamp, zone));
      const date = datesByZone.get(zone), year = Number(date.slice(0, 4));
      if (Number(current.activeYear) > year) continue;
      const start = [series.startDate, series.enabledFrom || series.startDate, `${Math.max(year, Number(current.activeYear) || year)}-01-01`].sort().at(-1);
      const end = new Date(Date.UTC(year, Number(date.slice(5, 7)), 0, 12));
      const cursor = new Date(`${start}T12:00:00Z`);
      if (!Number.isFinite(cursor.getTime())) continue;
      const noteId = `repeat_${id}`;
      cursor.setUTCDate(cursor.getUTCDate() + (series.weekday - cursor.getUTCDay() + 7) % 7);
      for (; cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 7)) {
        const day = key(cursor), branch = day.slice(0, 4), existing = root.years[branch]?.[day] || {};
        if (series.excluded?.[day] || existing[noteId] || Object.values(existing).some(note => normalize(note?.text) === seriesText)) continue;
        const record = { text: series.text, seriesId: id, createdAt: timestamp, updatedAt: timestamp, authorName: series.authorName || "User" };
        if (series.authorCode) record.authorCode = series.authorCode;
        if (series.authorUsername) record.authorUsername = series.authorUsername;
        if (root.years[branch] === current.years?.[branch]) root.years[branch] = { ...root.years[branch] };
        root.years[branch][day] = { ...existing, [noteId]: record };
        changed = true;
      }
    }
    return changed ? root : undefined;
  }
  return { normalize, today, materialize };
});
