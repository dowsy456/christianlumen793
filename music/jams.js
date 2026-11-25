/* One unique RTDB record per Jam. Only its creator publishes the playback clock.
 * Guest membership is committed against the existing record so ending a Jam
 * concurrently with a new join cannot recreate it. */
(function (App) {
  'use strict';
  let active = null, pending = null, generation = 0, floating, tipAnchor;
  const notice = body => App.showToast?.({ title: 'Music', body });
  const usable = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,180}$/.test(id);
  const connected = () => App.musicSessionConnected?.() === true;
  App.musicJamIsGuest = () => !!active && !active.host;
  App.musicJamId = () => active?.id || '';
  App.musicJamPlayback = () => App.musicJamIsGuest() ? active.playback : null;
  App.musicJamBusy = () => !!pending || !!active?.leaving;

  function hidePeople() {
    tipAnchor?.removeAttribute('aria-describedby');
    tipAnchor = null;
    if (floating) App.setTooltipVisible(floating, false);
  }
  function positionPeople() {
    if (!tipAnchor || !tipAnchor.getClientRects().length || !floating || floating.hidden) return hidePeople();
    const rect = tipAnchor.getBoundingClientRect(), box = floating.getBoundingClientRect();
    floating.style.left = Math.max(8, Math.min(rect.right - box.width, innerWidth - box.width - 8)) + 'px';
    const below = rect.bottom + 7;
    floating.style.top = Math.max(8, below + box.height <= innerHeight - 8 ? below : rect.top - box.height - 7) + 'px';
  }
  function jamPeople() {
    const users = new Map();
    for (const person of Object.values(active?.members || {})) {
      if (!person?.code || person.code === App.currentUser?.code) continue;
      const user = App.getUserProfileRecord?.(person.code) || App.schedulesPeopleByCode?.get(person.code) || person;
      users.set(person.code, user);
    }
    return [...users.values()].sort((a, b) => String(a.displayName || a.username).localeCompare(b.displayName || b.username));
  }
  App.musicJamPeople = jamPeople;
  App.updateMusicJamButton = function (button) {
    const people = jamPeople();
    const label = App.musicJamIsGuest() ? 'Leave Jam' : active ? 'End Jam' : 'Start Jam';
    button.setAttribute('aria-label', label);
    const simple = !people.length && (active || App.musicState.playing) && !button.disabled;
    const kind = simple ? label : people.length ? 'people' : 'off';
    if (button.dataset.jamTooltip === kind) return;
    button.dataset.jamTooltip = kind;
    if (simple) {
      button.dataset.tooltip = label;
      button.dataset.uiTooltip = 'on';
    } else {
      delete button.dataset.tooltip;
      button.dataset.uiTooltip = 'off';
    }
    if (button.matches(':hover,:focus-visible')) {
      if (people.length) { App.hideAppTooltip?.(); showPeople(button); }
      else { hidePeople(); App.showAppTooltip?.(button); }
    }
  };
  function showPeople(anchor) {
    const sorted = jamPeople();
    if (!sorted.length) return hidePeople();
    if (!floating) {
      floating = document.createElement('div');
      floating.hidden = true;
      floating.className = 'call-viewers-floating music-jam-floating';
      document.body.append(floating);
      floating.addEventListener('pointerleave', () => { if (!tipAnchor?.matches(':hover,:focus-visible')) hidePeople(); });
    }
    if (tipAnchor !== anchor) tipAnchor?.removeAttribute('aria-describedby');
    tipAnchor = anchor;
    const tip = App.buildNamedPeopleTooltip(sorted, 'In Jam With');
    floating.replaceChildren(tip);
    App.setTooltipVisible(floating, true);
    anchor.setAttribute('aria-describedby', tip.id);
    positionPeople();
  }
  App.musicSyncJamTooltip = function () { if (tipAnchor) positionPeople(); };
  App.bindMusicJamButton = function (button) {
    button.addEventListener('pointerenter', () => showPeople(button));
    button.addEventListener('focus', () => showPeople(button));
    button.addEventListener('pointerleave', event => { if (!floating?.contains(event.relatedTarget)) hidePeople(); });
    button.addEventListener('blur', hidePeople);
    button.addEventListener('wheel', event => {
      const list = tipAnchor === button && floating?.querySelector('.call-viewers-row');
      if (!list || list.scrollHeight <= list.clientHeight) return;
      const previous = list.scrollTop;
      list.scrollTop += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? list.clientHeight : 1);
      if (previous !== list.scrollTop) event.preventDefault();
    }, { passive: false });
  };

  function detach(room) {
    if (active !== room) return;
    room.ref.off('value', room.listener);
    active = null;
    hidePeople();
    if (!room.host) App.musicReleaseJamPlayback();
    App.musicJamChanged();
  }
  function armRoom(room, record) {
    active = room;
    room.members = record.members;
    room.playback = record.playback;
    room.listener = snap => {
      if (active !== room || room.leaving) return;
      const next = snap.val();
      if (!next?.members?.[room.memberId] || next.hostSession !== room.hostSession) {
        detach(room);
        if (!room.host) notice('The Jam has ended.');
        return;
      }
      const peopleChanged = JSON.stringify(room.members) !== JSON.stringify(next.members);
      const songChanged = JSON.stringify(room.playback) !== JSON.stringify(next.playback);
      room.members = next.members;
      room.playback = next.playback;
      if (!room.host && songChanged) { App.musicFollowJamPlayback(); App.renderMusicPlayer(); }
      if (peopleChanged) {
        App.renderMusicPlayer();
        if (tipAnchor) showPeople(tipAnchor);
        else {
          const hovered = document.querySelector('[data-music-control="jam"]:hover, [data-music-control="jam"]:focus-visible');
          if (hovered) showPeople(hovered);
        }
      }
    };
    room.ref.on('value', room.listener, () => {
      if (active === room) { detach(room); void discard(room.cleanup).catch(() => {}); notice('Lost access to this Jam.'); }
    });
    if (!room.host) App.musicBeginJamPlayback();
    App.musicJamChanged();
  }
  async function discard(ref) {
    // Leave disconnect cleanup armed if the explicit removal fails.
    await ref.remove();
    await ref.onDisconnect().cancel().catch(() => {});
  }
  async function enter(id) {
    if (pending || active) return;
    if (!connected()) { notice('Connect to Chat App to use Jams.'); return; }
    if (App.musicState.blocked) { notice('Pause Spotify before joining a Jam.'); return; }
    App.musicPrepareJamAudio();
    const user = App.currentUser, session = App.musicSessionId(), host = !id;
    const ref = host ? App.db.ref('music/jams').push() : App.db.ref('music/jams/' + id);
    const memberId = ref.child('members').push().key;
    const room = { id: ref.key, host, ref, session, memberId, generation };
    const person = { code: user.code, displayName: String(user.displayName || user.username || 'User').slice(0, 160) };
    const cleanup = room.cleanup = host ? ref : ref.child('members').child(memberId);
    const current = () => room.generation === generation && connected() && App.musicSessionId() === session;
    let writeStarted = false;
    pending = room;
    App.renderMusicPlayer();
    try {
      await cleanup.onDisconnect().remove();
      if (!current()) return;
      let record;
      if (host) {
        const playback = App.musicJamClock();
        if (!playback) throw new Error('Play a song to start a Jam.');
        record = { hostCode: user.code, hostSession: session, playback, members: { [memberId]: person } };
        writeStarted = true;
        await ref.set(record);
      } else {
        const before = (await ref.once('value')).val();
        if (!before?.hostSession || !before.playback || !current()) throw new Error('This Jam is no longer available.');
        writeStarted = true;
        const result = await ref.transaction(value => {
          if (!current()) return;
          // A cold SDK transaction can first receive null even after once().
          // A null proposal retries against a live record, and preserves deletion.
          if (value === null) return null;
          if (value.hostSession !== before.hostSession || !value.playback) return;
          return { ...value, members: { ...value.members, [memberId]: person } };
        }, undefined, false);
        if (!result.committed || !result.snapshot.val()?.members?.[memberId]) {
          writeStarted = false;
          throw new Error('This Jam is no longer available.');
        }
        record = result.snapshot.val();
      }
      if (!current() || host && !App.musicJamClock()) return;
      room.hostSession = record.hostSession;
      pending = null;
      armRoom(room, record);
    } catch (error) {
      if (current()) notice(error.message || 'Could not join the Jam.');
    } finally {
      if (pending === room) pending = null;
      if (active !== room) {
        const cleanupJob = writeStarted ? discard(cleanup) : cleanup.onDisconnect().cancel();
        void cleanupJob.catch(() => {});
      }
      App.renderMusicPlayer();
    }
  }
  App.musicPublishJamClock = function () {
    const room = active;
    if (!room?.host || room.leaving || !connected()) return;
    const playback = App.musicJamClock();
    if (!playback) return;
    // Suppress duplicate media events with the same clock, while still
    // recording seeks, pauses, track changes, and periodic drift anchors.
    const previous = room.sent;
    if (previous && ['playlistId', 'trackId', 'playing', 'shuffle', 'repeat'].every(key => playback[key] === previous[key])) {
      const elapsed = playback.measuredAt - previous.measuredAt;
      const expected = previous.position + (previous.playing ? elapsed / 1000 : 0);
      if (elapsed < 15000 && Math.abs(expected - playback.position) < 0.08) return;
    }
    room.sent = playback;
    void room.ref.child('playback').set(playback).catch(() => {
      if (active === room && room.sent === playback) { room.sent = null; notice('Could not sync Jam playback.'); }
    });
  };

  async function leave(room) {
    if (!room || active !== room || room.leaving) return false;
    room.leaving = true;
    App.renderMusicPlayer();
    try {
      await discard(room.cleanup);
      detach(room);
      return true;
    } catch {
      room.leaving = false;
      // A rejected optimistic removal can deliver both the local deletion
      // and rollback while leaving is set. Reconcile the authoritative state.
      if (active === room) {
        try { room.listener(await room.ref.once('value')); } catch {}
        App.musicJamChanged();
        notice('Could not leave the Jam. Please try again.');
      }
      return false;
    }
  }
  function confirmLeave(anchor, nextId = '', stopAfter = false) {
    const room = active;
    if (!room || room.leaving) return;
    hidePeople();
    const label = room.host ? 'End Jam' : 'Leave Jam';
    let copy = room.host ? 'The Jam will end for everyone.' : 'You will stop listening with this Jam.';
    if (nextId) copy += ' You will then join the other Jam.';
    const menu = App.openPollMenu({ title: label, anchor,
      bodyHTML: '<p class="poll-confirm-copy">' + copy + '</p>',
      actionsHTML: '<button class="btn primary" type="button" data-jam-confirm>' + label + '</button>' });
    menu.querySelector('.chat-popup-mark').innerHTML = App.musicJamIconMarkup();
    const close = menu.querySelector('.chat-popup-close'), confirm = menu.querySelector('[data-jam-confirm]');
    close.focus({ preventScroll: true });
    for (const button of [close, confirm]) button.onkeydown = event => {
      if (event.key !== 'Escape' && event.key !== 'Tab') return;
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'Escape') App.closePollPopover({ restoreFocus: true });
      else (button === close ? confirm : close).focus({ preventScroll: true });
    };
    confirm.onclick = async event => {
      event.currentTarget.disabled = true;
      App.musicPrepareJamAudio();
      App.closePollPopover({ immediate: true });
      if (!await leave(room) || App.musicSessionId() !== room.session) return;
      if (stopAfter) App.musicStop();
      if (nextId) await enter(nextId);
    };
  }
  App.musicJamClick = function (anchor, stopAfter = false) {
    if (active) return confirmLeave(anchor, '', stopAfter);
    return enter('');
  };
  App.musicJoinJam = function (id, anchor) {
    if (!usable(id) || active?.id === id || pending) return;
    if (active) return confirmLeave(anchor, id);
    return enter(id);
  };
  App.musicDropJam = function () {
    ++generation;
    pending = null;
    const room = active;
    if (room) {
      room.leaving = true;
      detach(room);
      // onDisconnect is already installed at this unique Jam or member path.
      void discard(room.cleanup).catch(() => {});
    }
    hidePeople();
    const confirm = App.$('poll-popover')?.querySelector('[data-jam-confirm]');
    if (confirm) App.closePollPopover({ immediate: true });
  };
  App.register('music/jams', () => {
    window.addEventListener('resize', () => { if (tipAnchor) positionPeople(); });
    window.addEventListener('scroll', () => { if (tipAnchor) positionPeople(); }, true);
  });
})(globalThis.ChatApp);
