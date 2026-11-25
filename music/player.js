/* A single persistent media element owns Music across rooms, calls and screens. */
(function (App) {
  'use strict';
  const TTL = 90000, now = () => App.appPresenceNow?.() || Date.now();
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const text = value => String(value || '').slice(0, 300);
  const icons = {
    shuffle: '<path d="m3 5 3 0c4 0 6 14 10 14h5m-4-4 4 4-4 4M3 19h3c1.5 0 3-2 4-4m4-6c1-2 1.5-4 3-4h4m-4-4 4 4-4 4"/>',
    previous: '<path d="M5 5v14M19 5 8 12l11 7Z"/>', pause: '<path d="M8 5v14M16 5v14" stroke-width="4"/>',
    play: '<path d="m7 4 13 8-13 8Z"/>', next: '<path d="M19 5v14M5 5l11 7-11 7Z"/>',
    repeat: '<path d="m16 2 4 4-4 4M4 11V8a2 2 0 0 1 2-2h14M8 22l-4-4 4-4m12-1v3a2 2 0 0 1-2 2H4"/>',
    stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
    jam: '<path d="M9 14V5l9-2v10M9 8l9-2"/><ellipse cx="6" cy="15" rx="3" ry="2.5"/><ellipse cx="15" cy="14" rx="3" ry="2.5"/><path d="M3 20a5 5 0 0 0 6 0m3 1a8 8 0 0 0 9-5"/>',
    volume: '<path d="M11 4 5 9H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    muted: '<path d="M11 4 5 9H2v6h3l6 5ZM16 9l6 6m0-6-6 6"/>',
    music: '<path d="M9 18V5l12-2v13M9 8l12-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="18" cy="16" rx="3" ry="3"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.music}</svg>`;
  // Both shared players use one control and percent scale, including the boosted range.
  App.mediaVolumeMarkup = function (kind) {
    const music = kind === 'Music';
    return `<div class="music-volume media-volume">
      <button type="button" class="media-volume-button" aria-label="Mute ${kind}" aria-pressed="false">${icon('volume')}</button>
      <input type="range" ${music ? 'data-music-volume' : ''} min="0" max="200" step="5" value="100" aria-label="${kind} volume">
      <span ${music ? 'data-music-volume-label' : ''}>100%</span></div>`;
  };
  App.syncMediaVolume = function (control, percent, kind) {
    const button = control.querySelector('button'), range = control.querySelector('input'), label = control.querySelector('span');
    const muted = percent === 0;
    if (button.getAttribute('aria-pressed') !== String(muted)) {
      button.innerHTML = icon(muted ? 'muted' : 'volume');
      button.setAttribute('aria-pressed', String(muted));
    }
    const action = (muted ? 'Unmute ' : 'Mute ') + kind;
    button.setAttribute('aria-label', action); button.title = action;
    range.value = String(percent);
    range.setAttribute('aria-valuetext', percent + '%');
    label.textContent = percent + '%';
    App.syncPreciseRangeVisual?.(range);
  };
  App.musicIconMarkup = () => icon('music');
  App.musicJamIconMarkup = () => icon('jam');
  App.musicTime = value => { const seconds = Math.max(0, Math.floor(Number(value) || 0)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; };
  App.musicState = { playlistId: '', trackId: '', track: null, playing: false, position: 0, duration: 0, volume: 100, shuffle: false, repeat: 'off', blocked: false, loading: false };
  let audio, context, gain, loadGeneration = 0, activeURL = '', pendingLoad = null, history = [], shuffleBag = [], presence, tick, lastNative = '', lastPresenceAt = 0;
  let restoreVolume = 100;
  let scrubOwner, seekTarget = null, guestSeekClock = null;
  let guestChatMedia, guestRetryAt = 0, guestPlayPending = false;
  const isGuest = () => App.musicJamIsGuest();
  const state = () => App.musicState;
  const tracks = () => App.musicGetTracks?.(state().playlistId) || [];
  const libraryOwner = () => App.musicLibraryOwner?.(state().playlistId) || '';
  const volumeStep = value => Math.round(clamp(value, 0, 200) / 5) * 5;
  const hasSpotify = () => !!App.desktopSpotifyState?.connected && (!!App.desktopSpotifyState?.playback?.playing || (!App.desktopSpotifyState?.playback && !!App.desktopSpotifyState?.track));
  function toast(message) { App.showToast?.({ title: 'Music', body: message, duration: 4500 }); }
  function applyOutput() {
    if (!audio) return;
    // Silence the outgoing decoder position throughout a scrub or cold seek.
    const quiet = !!scrubOwner || seekTarget !== null;
    audio.muted = quiet;
    if (gain) { gain.gain.value = quiet ? 0 : state().volume / 100; audio.volume = 1; }
    else audio.volume = Math.min(1, state().volume / 100);
  }
  function resetSeek() {
    if (scrubOwner) delete scrubOwner.dataset.seeking;
    scrubOwner = null; seekTarget = null; guestSeekClock = null;
    applyOutput();
  }
  function finishSeek() {
    if (seekTarget === null || scrubOwner || !audio || !activeURL || audio.seeking || audio.readyState < 2) return;
    const end = Number.isFinite(audio.duration) ? audio.duration : seekTarget;
    if (Math.abs(audio.currentTime - Math.min(seekTarget, end)) > .75 && !audio.ended) return;
    seekTarget = null; applyOutput();
  }
  function readPosition() {
    if (!audio || !activeURL) return;
    if (Number.isFinite(audio.duration) && audio.duration > 0) state().duration = audio.duration;
    if (!scrubOwner && seekTarget === null) state().position = Math.max(0, Number(audio.currentTime) || 0);
  }
  function seekTo(seconds) {
    const target = clamp(seconds, 0, state().duration);
    state().position = target;
    if (audio && activeURL) {
      if (!audio.seeking && audio.readyState >= 2 && Math.abs(audio.currentTime - target) < .015) {
        seekTarget = null; applyOutput();
      } else {
        seekTarget = target; applyOutput(); audio.currentTime = target;
      }
    } else {
      seekTarget = null; applyOutput();
    }
    App.renderMusicProgress();
    if (activeURL && !isGuest() && App.musicJamId()) App.musicPublishJamClock();
  }
  function savedSettings() {
    let value;
    try {
      value = JSON.parse(localStorage.getItem(`chat.music.settings:${App.firebaseConfig?.projectId || ''}:${App.currentUser?.code || ''}`));
    } catch { /* Default settings also cover unavailable or malformed storage. */ }
    state().volume = value?.volume === undefined ? 100 : volumeStep(value.volume);
    restoreVolume = state().volume || volumeStep(value?.restoreVolume) || 100;
    state().shuffle = !!value?.shuffle;
    state().repeat = ['one', 'all'].includes(value?.repeat) ? value.repeat : 'off';
  }
  function saveSettings() {
    try {
      const key = `chat.music.settings:${App.firebaseConfig?.projectId || ''}:${App.currentUser?.code || ''}`;
      const s = state();
      const settings = isGuest() ? JSON.parse(localStorage.getItem(key) || '{}') || {} : { shuffle: s.shuffle, repeat: s.repeat };
      localStorage.setItem(key, JSON.stringify({ ...settings, volume: s.volume, restoreVolume }));
    } catch {}
  }
  function ensureAudio() {
    if (audio) return audio;
    audio = document.createElement('audio'); audio.id = 'chat-music-audio'; audio.preload = 'auto'; audio.dataset.chatMusic = 'true'; audio.setAttribute('playsinline', ''); document.body.appendChild(audio); App.musicAudio = audio;
    audio.addEventListener('playing', () => { if (!activeURL || audio.paused) return; finishSeek(); if (hasSpotify()) { App.musicSpotifyChanged(); return; } state().playing = true; state().loading = false; changed(true); });
    audio.addEventListener('pause', () => { if (!audio.paused) return; state().playing = false; readPosition(); changed(true); });
    audio.addEventListener('waiting', () => {
      if (App.musicJamId() && !isGuest() && activeURL && !audio.paused && state().playing) { state().playing = false; readPosition(); changed(true); }
    });
    audio.addEventListener('seeking', () => App.seekMusicStream?.(activeURL, audio.currentTime));
    audio.addEventListener('loadedmetadata', () => { App.seekMusicStream?.(activeURL, audio.currentTime); if (isGuest()) alignGuest(); readPosition(); changed(); });
    audio.addEventListener('timeupdate', () => { finishSeek(); readPosition(); App.renderMusicProgress(); });
    audio.addEventListener('loadeddata', finishSeek);
    audio.addEventListener('seeked', () => { finishSeek(); readPosition(); if (scrubOwner) App.renderMusicProgress(); else changed(true); });
    audio.addEventListener('ended', () => { if (!activeURL || !audio.ended) return; state().playing = false; if (isGuest()) changed(true); else void advance(true); });
    audio.addEventListener('error', () => { if (!activeURL || App.retryMusicStream?.(activeURL) || state().loading) return; state().playing = false; changed(true); toast('This audio could not be played. Try a different audio format.'); });
    return audio;
  }
  function activateAudio() {
    ensureAudio();
    // Android WebView supports ordinary volume directly. Other players keep
    // their existing Web Audio activation inside the initiating user gesture.
    const android = window.ChatAppNativeInfo?.platform === 'android' || /Android/i.test(navigator.userAgent);
    if (!context && (!android || state().volume > 100)) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) { try { context = new AudioContext({ latencyHint: 'interactive' }); gain = context.createGain(); context.createMediaElementSource(audio).connect(gain); gain.connect(context.destination); } catch { context = null; gain = null; } }
    }
    applyOutput();
    if (context?.state === 'suspended') void context.resume().catch(() => {});
  }
  let nativeTrack, nativePhoto, nativeCrop, sentPeopleRevision = -1, peopleRevision = 0;
  const trayPeople = new Map();
  async function makeTrayAvatar(entry) {
    try {
      const image = new Image();
      image.src = entry.source;
      await image.decode();
      if (trayPeople.get(entry.code) !== entry) return;
      const size = 56, canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      const scale = size / Math.max(image.naturalWidth, image.naturalHeight) * entry.crop.scale;
      const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
      ctx.drawImage(image, size * (.5 + entry.crop.x) - width / 2, size * (.5 + entry.crop.y) - height / 2, width, height);
      entry.avatar = canvas.toDataURL('image/png');
      ++peopleRevision;
      syncNative();
    } catch { /* A missing or unreadable picture uses initials in the tray. */ }
  }
  function nativePeople() {
    const current = new Set();
    const people = App.musicJamPeople().slice(0, 64).map(person => {
      const code = person.code, displayName = text(person.displayName || person.username || code);
      const source = window.chatDesktopMusic.jamAvatars ? String(person.photoDataURL || App.defaultStickmanDataURL()) : '';
      const crop = App.normalizeTransformToRel(person.photoTransform, 84);
      current.add(code);
      let entry = trayPeople.get(code);
      if (!entry || source !== entry.source || crop.x !== entry.crop.x || crop.y !== entry.crop.y || crop.scale !== entry.crop.scale) {
        entry = { code, displayName, source, crop, avatar: '' };
        trayPeople.set(code, entry);
        ++peopleRevision;
        if (source.startsWith('data:image/')) void makeTrayAvatar(entry);
      } else if (entry.displayName !== displayName) {
        entry.displayName = displayName;
        ++peopleRevision;
      }
      return { code, displayName, ...(entry.avatar ? { avatar: entry.avatar } : {}) };
    });
    for (const code of trayPeople.keys()) if (!current.has(code)) { trayPeople.delete(code); ++peopleRevision; }
    return people;
  }
  function nativeState(people) {
    const s = state();
    if (!s.track) return null;
    return { trackId: s.trackId, title: text(s.track.title), artist: text(s.track.artist), album: text(s.track.album),
      playing: s.playing, position: s.position, duration: s.duration, volume: s.volume, restoreVolume, shuffle: s.shuffle, repeat: s.repeat, blocked: s.blocked,
      loading: s.loading, guest: isGuest(), standalone: !!libraryOwner(), jamState: people.length ? 'shared' : App.musicJamId() ? 'solo' : 'none',
      jamDisabled: App.musicJamBusy() || !App.musicJamId() && (!s.playing || !App.musicSessionConnected()) };
  }
  function syncNative() {
    if (!window.chatDesktopMusic) return;
    const people = nativePeople(), value = nativeState(people), key = JSON.stringify(value);
    const track = state().track, photo = track?.photoDataURL || '', crop = JSON.stringify(track?.photoTransform || null);
    const artChanged = nativeTrack !== value?.trackId || nativePhoto !== photo || nativeCrop !== crop;
    const peopleChanged = sentPeopleRevision !== peopleRevision || nativeTrack !== value?.trackId;
    if (lastNative === key && !artChanged && !peopleChanged) return;
    if (value && (peopleChanged || !window.chatDesktopMusic.jamAvatars)) value.jamPeople = people;
    sentPeopleRevision = peopleRevision;
    lastNative = key; nativeTrack = value?.trackId; nativePhoto = photo; nativeCrop = crop;
    if (value && artChanged) { value.photoDataURL = photo; value.photoTransform = track.photoTransform || null; }
    try { Promise.resolve(window.chatDesktopMusic?.setMusicState(value)).catch(() => {}); } catch {}
  }
  function syncMediaSession() {
    if (!navigator.mediaSession) return;
    const s = state();
    try {
      navigator.mediaSession.playbackState = s.track ? s.playing ? 'playing' : 'paused' : 'none';
      const key = s.track ? JSON.stringify([s.trackId, s.track.title, s.track.artist, s.track.album]) : '';
      if (navigator.mediaSession.__chatMusicKey !== key || navigator.mediaSession.__chatMusicPhoto !== s.track?.photoDataURL) {
        navigator.mediaSession.__chatMusicKey = key;
        navigator.mediaSession.__chatMusicPhoto = s.track?.photoDataURL;
        navigator.mediaSession.metadata = s.track && window.MediaMetadata ? new MediaMetadata({ title: text(s.track.title), artist: text(s.track.artist), album: text(s.track.album), ...(s.track.photoDataURL ? { artwork: [{ src: s.track.photoDataURL }] } : {}) }) : null;
      }
      if (s.duration > 0) navigator.mediaSession.setPositionState?.({ duration: s.duration, position: clamp(s.position, 0, s.duration), playbackRate: 1 });
    } catch {}
  }
  function changed(publish = false) {
    App.renderMusicPlayer(); syncNative(); syncMediaSession();
    App.refreshMusicTrackStates?.();
    if (publish) { void writePresence(); App.musicPublishJamClock(); }
  }
  function prefetchNext() {
    if (libraryOwner()) return;
    const list = tracks(), index = list.findIndex(track => track.id === state().trackId);
    if (state().shuffle) refillShuffle(list);
    const next = state().shuffle ? list.find(track => track.id === shuffleBag[0]) : list[(index + 1) % list.length];
    if (next && next.id !== state().trackId) App.musicWarmTrack?.(next, true);
  }
  App.musicPlay = function (playlistId, trackId, options = {}) {
    if (isGuest()) return Promise.resolve(false);
    return loadTrack(playlistId, trackId, options);
  };
  async function loadTrack(playlistId, trackId, options = {}, follow = false) {
    const s = state();
    if (!App.currentUser) return false;
    App.musicSpotifyChanged();
    if (s.blocked && !follow) { toast('Pause Spotify before playing Music.'); return false; }
    activateAudio(); // Resume Web Audio inside the original user gesture, before any download.
    if (!options.fileOnly && s.playlistId === playlistId && s.trackId === trackId && activeURL) {
      if (follow) { alignGuest(); return true; }
      if (options.restart) seekTo(0);
      try { await audio.play(); return true; } catch (error) { if (error.name !== 'AbortError') toast('Press Play to start this audio.'); return false; }
    }
    if (!follow && !options.fileOnly && pendingLoad && s.loading && !activeURL &&
        s.playlistId === playlistId && s.trackId === trackId) return pendingLoad;
    const generation = ++loadGeneration, oldTrack = s.trackId, oldPlaylist = s.playlistId;
    audio.pause();
    resetSeek();
    if (activeURL) { App.releaseMusicStream?.(activeURL, options.fileOnly); audio.removeAttribute('src'); audio.load(); }
    activeURL = '';
    s.playlistId = String(playlistId || ''); s.trackId = String(trackId || '');
    s.track = tracks().find(item => item.id === s.trackId) || null;
    if (!options.fileOnly) App.cancelMusicAudioRead?.(s.track?.blobId);
    s.position = Number(options.position) || 0; s.duration = Number(s.track?.duration) || 0; s.loading = true; s.playing = false;
    if (oldPlaylist !== s.playlistId) { history = []; shuffleBag = []; }
    else if (oldTrack && oldTrack !== s.trackId && options.recordHistory !== false) history.push(oldTrack);
    history = history.slice(-500);
    changed(true);
    const job = (async () => {
      try {
        if (!s.track) {
          await App.musicWatchPlaylist?.(s.playlistId);
          if (generation !== loadGeneration) return false;
          s.track = tracks().find(item => item.id === s.trackId);
          if (!s.track) throw new Error('This audio is no longer available.');
          s.duration = Number(s.track.duration) || 0; changed();
        }
        const track = s.track;
        const onStreamError = failedURL => {
          if (generation !== loadGeneration || activeURL !== failedURL) return;
          void loadTrack(playlistId, trackId, { fileOnly: true, position: seekTarget ?? (scrubOwner ? s.position : audio.currentTime), paused: !s.playing && !s.loading && audio.paused }, follow);
        };
        const url = await App.musicGetAudioURL(track, options.fileOnly ? {} : { onStreamError });
        if (generation !== loadGeneration || !follow && hasSpotify()) { App.releaseMusicStream?.(url); return false; }
        activeURL = url; audio.src = url;
        if (s.position > 0) seekTo(s.position);
        if (follow) alignGuest(); else if (!options.paused) await audio.play();
        if (generation !== loadGeneration) return false;
        s.loading = false; changed(true); if (!follow) prefetchNext(); return true;
      } catch (error) {
        if (generation !== loadGeneration) return false;
        if (error.name === 'AbortError' && activeURL && !audio.paused) return false;
        if (error.name === 'NotSupportedError' && App.retryMusicStream?.(activeURL)) return false;
        s.loading = false; s.playing = false; changed(true);
        if (follow) guestRetryAt = Date.now() + 15000;
        if (error.name !== 'AbortError') toast(error.name === 'NotAllowedError' ? 'Press Play to start this audio.' : error.message || 'Could not load this audio.');
        return false;
      }
    })().finally(() => { if (pendingLoad === job) pendingLoad = null; });
    pendingLoad = job; return job;
  }
  App.musicSessionId = () => presence?.id;
  App.musicSessionConnected = () => presence?.connected === true;
  App.musicPrepareJamAudio = activateAudio;
  App.musicJamClock = function () {
    const s = state();
    if (!s.playlistId || !s.trackId) return null;
    readPosition();
    return { playlistId: s.playlistId, trackId: s.trackId, playing: s.playing && !scrubOwner && seekTarget === null,
      // Older listeners interpret a missing volume as mute. Keep a neutral
      // compatibility value for them. Current clients own their output gain.
      position: s.position, duration: s.duration, measuredAt: now(), volume: 100, shuffle: s.shuffle, repeat: s.repeat };
  };
  function alignGuest() {
    const target = App.musicJamPlayback(), s = state();
    if (!target || s.trackId !== target.trackId || s.playlistId !== target.playlistId || !activeURL || !audio) return;
    const elapsed = target.playing ? Math.max(0, now() - target.measuredAt) / 1000 : 0;
    const end = Number.isFinite(audio.duration) ? audio.duration : target.duration || s.duration;
    const position = clamp(target.position + elapsed, 0, end || 86400);
    const shouldPlay = target.playing && !hasSpotify() && !(guestChatMedia && !guestChatMedia.paused && !guestChatMedia.ended && !guestChatMedia.muted && guestChatMedia.volume !== 0);
    if (!shouldPlay && !audio.paused) audio.pause();
    if (target.playing && !shouldPlay) return; // Keep this device quiet until local chat media or Spotify finishes.
    if (Math.abs(audio.currentTime - position) > (target.playing ? 0.55 : 0.035)) {
      if (seekTarget === null || guestSeekClock !== target.measuredAt) {
        guestSeekClock = target.measuredAt;
        try { seekTo(position); } catch {}
      }
    }
    if (shouldPlay && audio.paused && !guestPlayPending && !(end > 0 && position >= end) && Date.now() >= guestRetryAt) {
      const generation = loadGeneration;
      guestPlayPending = true;
      void audio.play().catch(error => {
        if (generation === loadGeneration && isGuest() && error.name !== 'AbortError') {
          guestRetryAt = Date.now() + 15000;
          toast('Audio could not start on this device. Rejoin the Jam to retry.');
        }
      }).finally(() => { if (generation === loadGeneration) guestPlayPending = false; });
    }
  }
  App.musicBeginJamPlayback = function () {
    // Cancel a pending personal selection even when it is loading the very
    // same track; its old play() must never unpause a newly joined paused Jam.
    if (pendingLoad || state().loading) clearPlayback();
    App.musicFollowJamPlayback();
  };
  App.musicFollowJamPlayback = function () {
    const target = App.musicJamPlayback(), s = state();
    if (!target?.playlistId || !target.trackId) return;
    const switched = s.trackId !== target.trackId || s.playlistId !== target.playlistId;
    if (switched) { guestRetryAt = 0; guestPlayPending = false; }
    s.shuffle = !!target.shuffle;
    s.repeat = ['off', 'one', 'all'].includes(target.repeat) ? target.repeat : 'off';
    if (switched || !activeURL && !s.loading && Date.now() >= guestRetryAt) {
      void loadTrack(target.playlistId, target.trackId, {}, true);
    } else {
      alignGuest();
      readPosition();
    }
  };
  App.musicReleaseJamPlayback = function () {
    guestChatMedia = null; guestRetryAt = 0; guestPlayPending = false;
    clearPlayback();
    savedSettings();
    applyOutput();
  };
  App.musicJamChanged = function () {
    changed(true);
    document.querySelectorAll('[data-music-play-profile]').forEach(button => { button.disabled = isGuest(); });
    document.querySelectorAll('[data-music-join-jam]').forEach(button => { button.disabled = button.dataset.musicJoinJam === App.musicJamId(); });
  };
  function refillShuffle(list) {
    const valid = new Set(list.map(track => track.id));
    shuffleBag = shuffleBag.filter(id => valid.has(id) && id !== state().trackId);
    if (!shuffleBag.length) {
      shuffleBag = list.map(track => track.id).filter(id => id !== state().trackId);
      for (let index = shuffleBag.length - 1; index > 0; index--) { const other = Math.floor(Math.random() * (index + 1)); [shuffleBag[index], shuffleBag[other]] = [shuffleBag[other], shuffleBag[index]]; }
    }
  }
  function shuffledNext(list) { refillShuffle(list); return shuffleBag.shift() || state().trackId; }
  async function advance(ended = false) {
    const s = state(), list = tracks(); if (!list.length) { App.musicStop(); return; }
    const standalone = !!libraryOwner();
    if (ended && (s.repeat === 'one' || standalone && s.repeat === 'all')) {
      return App.musicPlay(s.playlistId, s.trackId, { restart: true });
    }
    if (standalone) { changed(true); return; }
    const index = list.findIndex(track => track.id === s.trackId);
    if (ended && s.repeat === 'off' && (s.shuffle ? history.length >= list.length - 1 : index === list.length - 1)) { changed(true); return; }
    const id = s.shuffle ? shuffledNext(list) : list[(index + 1) % list.length].id;
    return App.musicPlay(s.playlistId, id, { restart: true });
  }
  App.musicStop = function () {
    if (isGuest()) return;
    if (App.musicJamId()) return App.musicJamClick(document.querySelector('.music-player:not([hidden]) [data-music-control="stop"]'), true);
    clearPlayback();
  };
  function clearPlayback() {
    audio?.pause(); resetSeek();
    ++loadGeneration; pendingLoad = null; App.releaseMusicStream?.(activeURL); App.cancelMusicAudioRead?.(); activeURL = '';
    if (audio) { audio.removeAttribute('src'); audio.load(); }
    Object.assign(state(), { playlistId: '', trackId: '', track: null, playing: false, loading: false, position: 0, duration: 0 }); history = []; shuffleBag = []; changed(true);
  }
  App.musicControl = function (action, value) {
    const s = state();
    if (action === 'open') { const owner = libraryOwner(); App.openMusic?.(owner ? { kind: 'user', id: owner } : s.playlistId ? { kind: 'playlist', id: s.playlistId } : undefined); return; }
    if (action === 'jam') {
      const anchor = value?.getClientRects ? value : document.querySelector('.music-player:not([hidden]) [data-music-control="jam"]');
      if (anchor && !anchor.disabled) return App.musicJamClick(anchor);
      return;
    }
    if (action === 'download-icon' || action === 'copy-icon-address') {
      if (!value || value === s.trackId) return App.musicIconAction(action, s.track?.photoDataURL, s.track?.title);
      return;
    }
    if (action === 'volume' || action === 'toggle-mute') {
      if (s.volume > 0) restoreVolume = s.volume;
      s.volume = action === 'volume' ? volumeStep(value) : s.volume > 0 ? 0 : restoreVolume;
      if (s.volume > 0) restoreVolume = s.volume;
      activateAudio(); saveSettings(); changed(); return;
    }
    if (isGuest()) return;
    if (action === 'stop') { App.musicStop(); return; }
    if (libraryOwner() && ['previous', 'next', 'shuffle'].includes(action)) return;
    if (action === 'shuffle') { s.shuffle = value === undefined ? !s.shuffle : !!value; shuffleBag = []; history = []; saveSettings(); changed(); App.musicPublishJamClock(); prefetchNext(); return; }
    if (action === 'repeat') { s.repeat = ['off', 'all', 'one'].includes(value) ? value : { off: 'all', all: 'one', one: 'off' }[s.repeat]; saveSettings(); changed(); App.musicPublishJamClock(); return; }
    if (action === 'pause' || action === 'toggle' && (s.playing || s.loading)) {
      if (s.loading && !activeURL) { ++loadGeneration; pendingLoad = null; App.cancelMusicAudioRead?.(); }
      App.cancelMusicWarm?.(); s.loading = false; s.playing = false; audio?.pause(); readPosition(); changed(true); return;
    }
    if (action === 'play' || action === 'toggle') return App.musicPlay(s.playlistId, s.trackId);
    if (action === 'seek' && audio && s.track && s.duration > 0) {
      seekTo(value);
      return;
    }
    if (action === 'next') return advance();
    if (action === 'previous') {
      readPosition();
      if (s.position > 4 && audio && activeURL) { seekTo(0); return; }
      const list = tracks(); if (!list.length) return;
      const valid = new Set(list.map(track => track.id)); let previous;
      while (history.length && !previous) { const id = history.pop(); if (valid.has(id)) previous = id; }
      const index = list.findIndex(track => track.id === s.trackId);
      return App.musicPlay(s.playlistId, previous || list[(index - 1 + list.length) % list.length].id, { restart: true, recordHistory: false });
    }
  };
  App.musicSpotifyChanged = function () {
    const s = state(), blocked = hasSpotify(), changedBlock = s.blocked !== blocked; s.blocked = blocked;
    if (isGuest()) { if (changedBlock) { alignGuest(); changed(); } return; }
    if (blocked && (s.playing || s.loading)) { App.musicControl('pause'); }
    else if (changedBlock) changed();
  };
  App.musicInterruptForChatMedia = function (media) {
    if (!media || media === audio || media.muted || media.volume === 0 || media.srcObject) return;
    if (isGuest()) { guestChatMedia = media; audio?.pause(); return; }
    if (state().playing || state().loading) App.musicControl('pause');
  };
  App.musicPlayerDataChanged = function () {
    const s = state(); if (!s.trackId || !App.musicData?.loaded) return;
    const track = tracks().find(item => item.id === s.trackId);
    if (!track) {
      if (isGuest()) return; // Host owns deletion and publishes the resulting end or track change.
      App.musicDropJam(); clearPlayback(); return;
    }
    const previous = s.track;
    if (previous === track) return;
    s.track = track;
    if (previous && ['title', 'artist', 'album', 'photoDataURL', 'duration'].every(key => track[key] === previous[key]) &&
        JSON.stringify(track.photoTransform) === JSON.stringify(previous.photoTransform)) return;
    changed(true);
    if (!previous && isGuest() && !activeURL && !s.loading) {
      guestRetryAt = 0; App.musicFollowJamPlayback();
    }
  };
  function playerMarkup() {
    return `<div class="spotify-player-track"><button class="spotify-player-art music-art" type="button" data-music-control="open" aria-label="Open playlist"></button><div class="spotify-player-copy"><div class="music-title-line"><button class="spotify-player-title" type="button" data-music-control="open"></button><span class="music-loading-spinner" role="status" aria-label="Loading audio" hidden></span></div><div class="spotify-player-artist"></div><div class="spotify-player-album"></div></div><button type="button" class="spotify-player-button music-stop" data-music-control="stop" data-tooltip="Stop" aria-label="Stop">${icon('stop')}</button><button type="button" class="spotify-player-button music-jam" data-music-control="jam" data-ui-tooltip="off" aria-label="Start Jam">${icon('jam')}</button></div>
      <div class="music-transport"><div class="music-timeline"><input class="spotify-player-seek" data-music-seek type="range" min="0" max="1" value="0" step="0.1" aria-label="Song Position"><div class="spotify-player-times"><span data-music-position>0:00</span><span data-music-duration>0:00</span></div></div><div class="spotify-player-controls" role="group" aria-label="Music Controls">${['shuffle', 'previous', 'play', 'next', 'repeat'].map(action => `<button type="button" class="spotify-player-button" data-music-control="${action}" aria-label="${action}" data-tooltip="${action}">${icon(action)}</button>`).join('')}</div></div>
      ${App.mediaVolumeMarkup('Music')}<p class="music-player-status" role="status" hidden></p>`;
  }
  function mountPlayer(id, parent, sidebar) {
    let player = document.getElementById(id); if (player || !parent) return player;
    player = document.createElement('section'); player.id = id; player.className = 'music-player sidebar-spotify-player' + (sidebar ? ' music-sidebar-player' : ' music-bottom-player'); player.setAttribute('aria-label', 'Music Playback'); player.innerHTML = playerMarkup(); parent.appendChild(player);
    App.bindMusicJamButton(player.querySelector('.music-jam'));
    player.addEventListener('click', event => { const button = event.target.closest('[data-music-control]'); if (button) void App.musicControl(button.dataset.musicControl, button.dataset.musicControl === 'jam' ? button : undefined); });
    const seek = player.querySelector('[data-music-seek]');
    let seekGeneration;
    seek.addEventListener('input', () => {
      if (isGuest() || seek.disabled) return;
      if (App.preciseRangeDragState?.range !== seek) { seekTo(Number(seek.value)); return; }
      // Update the visible time immediately. A finger drag commits one decoder
      // request at release, so intermediate positions cannot queue old audio.
      scrubOwner = seek; seekGeneration = loadGeneration; seek.dataset.seeking = 'true';
      state().position = Number(seek.value); applyOutput(); App.renderMusicProgress();
    });
    const endSeek = () => {
      if (scrubOwner !== seek) return;
      const position = Number(seek.value);
      scrubOwner = null; delete seek.dataset.seeking;
      if (seekGeneration === loadGeneration && !isGuest()) seekTo(position);
      else { applyOutput(); App.renderMusicProgress(); }
    };
    for (const event of ['change', 'blur', 'pointercancel']) seek.addEventListener(event, endSeek);
    player.querySelector('.media-volume-button').addEventListener('click', () => App.musicControl('toggle-mute'));
    player.querySelector('[data-music-volume]').addEventListener('input', event => App.musicControl('volume', Number(event.target.value)));
    return player;
  }
  App.renderMusicProgress = function () {
    const s = state();
    document.querySelectorAll('.music-player').forEach(player => {
      if (player.hidden) return;
      const seek = player.querySelector('[data-music-seek]');
      if (!seek.dataset.seeking) seek.value = String(s.position);
      seek.style.setProperty('--spotify-progress', `${s.duration ? s.position / s.duration * 100 : 0}%`);
      App.syncPreciseRangeVisual?.(seek);
      seek.setAttribute('aria-valuetext', `${App.musicTime(s.position)} of ${App.musicTime(s.duration)}`);
      player.querySelector('[data-music-position]').textContent = App.musicTime(s.position);
    });
  };
  App.renderMusicPlayer = function () {
    const s = state();
    const track = s.track || { title: s.loading ? '' : 'Track unavailable' };
    const sidebar = mountPlayer('sidebar-music-player', App.$('sidebar-call')?.parentElement, true);
    const bottom = mountPlayer('music-bottom-player', App.$('music-player-host'), false);
    if (sidebar && sidebar.previousElementSibling?.id !== 'sidebar-spotify-player') App.$('sidebar-spotify-player')?.after(sidebar);
    for (const player of [sidebar, bottom].filter(Boolean)) {
      player.hidden = (!s.track && !s.loading && !App.musicJamId()) || (player === sidebar ? !!App.musicScreenOpen : !App.musicScreenOpen);
      if (player.hidden) continue;
      const title = player.querySelector('.spotify-player-title'); title.textContent = track.title; title.title = track.title;
      player.querySelector('.spotify-player-artist').textContent = track.artist || '';
      player.querySelector('.spotify-player-album').textContent = track.album || '';
      player.querySelector('.music-loading-spinner').hidden = !s.loading;
      const art = player.querySelector('.music-art'), crop = JSON.stringify(track.photoTransform || null);
      if (art.musicPhoto !== track.photoDataURL || art.musicCrop !== crop) {
        art.musicPhoto = track.photoDataURL; art.musicCrop = crop; art.replaceChildren();
        if (track.photoDataURL) { const image = document.createElement('img'); image.alt = ''; image.className = 'spotify-album-art'; art.appendChild(image); if (App.applyCroppedImage) App.applyCroppedImage(image, track.photoDataURL, track.photoTransform, 38, 132); else image.src = track.photoDataURL; }
        else art.innerHTML = `<span class="music-art-placeholder">${icon('music')}</span>`;
      }
      const seek = player.querySelector('[data-music-seek]'); seek.max = String(s.duration || 1); seek.disabled = isGuest() || !s.track || !(s.duration > 0);
      player.querySelector('[data-music-duration]').textContent = App.musicTime(s.duration);
      App.syncMediaVolume(player.querySelector('.media-volume'), s.volume, 'Music');
      player.querySelectorAll('[data-music-control]').forEach(button => {
        let action = button.dataset.musicControl;
        if (action === 'jam') {
          button.setAttribute('aria-pressed', String(!!App.musicJamId()));
          button.disabled = App.musicJamBusy() || !App.musicJamId() && (!s.playing || !App.musicSessionConnected());
          App.updateMusicJamButton(button);
          return;
        }
        if (action === 'play' || action === 'pause') { action = s.playing || s.loading ? 'pause' : 'play'; if (button.dataset.musicControl !== action) button.innerHTML = icon(action); button.dataset.musicControl = action; }
        const selected = action === 'shuffle' ? s.shuffle : action === 'repeat' ? s.repeat !== 'off' : false;
        if (action === 'shuffle' || action === 'repeat') button.setAttribute('aria-pressed', String(selected));
        if (action === 'repeat') button.dataset.repeat = s.repeat === 'one' ? 'track' : s.repeat;
        const label = action === 'repeat' ? `Repeat ${s.repeat === 'one' ? 'One' : s.repeat === 'all' ? 'All' : 'Off'}` : action === 'shuffle' ? `Shuffle ${s.shuffle ? 'On' : 'Off'}` : action === 'open' ? libraryOwner() ? 'Open audio library' : 'Open playlist' : action[0].toUpperCase() + action.slice(1);
        button.setAttribute('aria-label', label); button.dataset.tooltip = label; button.disabled = isGuest() && action !== 'open' || s.blocked && ['play', 'next', 'previous'].includes(action) || !!libraryOwner() && ['previous','next','shuffle'].includes(action);
      });
      const note = player.querySelector('.music-player-status'); note.textContent = s.blocked ? 'Spotify is playing' : ''; note.hidden = !note.textContent;
    }
    App.renderMusicProgress(); App.musicSyncJamTooltip();
  };
  function currentPresence() {
    const s = state(); if (!s.track || !s.playing && !App.musicJamId()) return null;
    return { playlistId: s.playlistId, trackId: s.trackId, title: text(s.track.title), artist: text(s.track.artist), album: text(s.track.album), photoDataURL: String(s.track.photoDataURL || '').length <= 131072 ? s.track.photoDataURL || '' : '', photoTransform: s.track.photoTransform || null, duration: s.duration, position: s.position, measuredAt: now(), playing: s.playing, ...(App.musicJamId() ? { jamId: App.musicJamId() } : {}) };
  }
  function syncPresenceLocal(session, playback) {
    if (presence !== session || App.currentUser?.code !== session.code) return;
    const records = { ...(App.currentUser.musicSessions || {}) };
    session.localRecord = playback && { ...playback, updatedAt: now() };
    if (playback) records[session.id] = session.localRecord; else delete records[session.id];
    App.currentUser.musicSessions = records; const cached = App.liveUserCache?.get(session.code); if (cached) cached.musicSessions = records;
    App.musicUserPresenceChanged(App.currentUser);
    App.refreshActivityPresenceForUser?.(App.currentUser);
  }
  async function writePresence() {
    const session = presence; if (!session) return;
    const playback = currentPresence(); syncPresenceLocal(session, playback);
    if (!session.ready) return;
    if (session.writing) { session.again = true; return; }
    session.writing = true;
    try {
      const latest = currentPresence();
      await session.ref.set(latest ? { ...latest, updatedAt: App.firebase.database.ServerValue.TIMESTAMP } : null);
      lastPresenceAt = Date.now();
      if (presence !== session) await session.ref.remove();
    } catch {} finally { session.writing = false; if (session.again && presence === session) { session.again = false; void writePresence(); } }
  }
  async function armPresence(session) {
    if (session.arming || !session.connected || presence !== session) return;
    session.arming = true; const generation = session.generation;
    try { await session.ref.onDisconnect().remove(); if (presence === session && session.connected && generation === session.generation) { session.ready = true; void writePresence(); } } catch {} finally { session.arming = false; }
  }
  App.startMusicPlaybackSession = function () {
    const code = App.currentUser?.code; if (!code || presence?.code === code) return;
    App.stopMusicPlaybackSession(); savedSettings();
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const session = { code, id, ref: App.db.ref(`users/${code}/musicSessions/${id}`), generation: 0, connected: false, ready: false }; presence = session;
    session.connectionRef = App.db.ref('.info/connected'); session.connectionCb = snapshot => { if (presence !== session) return; session.connected = snapshot.val() === true; session.ready = false; ++session.generation; if (session.connected) void armPresence(session); else App.musicDropJam(); }; session.connectionRef.on('value', session.connectionCb);
    tick = setInterval(() => { readPosition(); App.musicSpotifyChanged(); if (isGuest()) App.musicFollowJamPlayback(); App.renderMusicProgress(); syncNative(); syncMediaSession(); App.refreshMusicProfileProgress(); if ((state().playing || App.musicJamId()) && Date.now() - lastPresenceAt > 15000) { void writePresence(); App.musicPublishJamClock(); } if (presence?.connected && !presence.ready) void armPresence(presence); }, 500);
  };
  App.stopMusicPlaybackSession = function () {
    App.musicDropJam(); clearPlayback(); const session = presence; presence = null; clearInterval(tick); tick = null;
    if (session) { session.ready = false; session.connectionRef.off('value', session.connectionCb); session.ref.remove().then(() => session.ref.onDisconnect().cancel()).catch(() => {}); }
  };
  App.getUserMusicPlayback = function (user) {
    const time = now();
    // Directory and public-profile callbacks can arrive after a local play or
    // pause. This device owns its session only. Other devices still use RTDB.
    const sessions = { ...user?.musicSessions };
    if (presence && user?.code === presence.code) {
      if (presence.localRecord) sessions[presence.id] = { ...presence.localRecord, updatedAt: time };
      else delete sessions[presence.id];
    }
    const records = Object.values(sessions).filter(record => (record?.playing || record?.jamId) &&
      Number(record.updatedAt) > 0 && record.updatedAt <= time + TTL && time - record.updatedAt < TTL);
    // Keep Join stable when another device on this account publishes solo
    // playback. Multiple simultaneous device Jams have a stable tie break.
    records.sort((a, b) => Number(!!b.jamId) - Number(!!a.jamId) ||
      String(a.jamId || '').localeCompare(String(b.jamId || '')) || Number(b.updatedAt) - Number(a.updatedAt));
    const record = records[0]; if (!record || !record.title) return null;
    return { ...record, userCode: user.code, title: text(record.title), artist: text(record.artist), album: text(record.album), duration: clamp(record.duration, 0, 86400), position: clamp(record.position, 0, 86400), measuredAt: Number(record.measuredAt) || Number(record.updatedAt) };
  };
  App.musicProfileMarkup = function (record) {
    if (!record) return '';
    const position = Math.min(record.duration, record.position + (record.playing ? Math.max(0, now() - record.measuredAt) / 1000 : 0));
    const join = record.jamId && record.userCode !== App.currentUser?.code
      ? `<button class="btn tiny" type="button" data-music-join-jam="${App.escapeAttr(record.jamId)}" aria-label="Join Jam"${record.jamId === App.musicJamId() ? ' disabled' : ''}>${icon('jam')}</button>` : '';
    return `<div class="user-profile-music" data-music-profile-playing="${!!record.playing}" data-music-profile-playback="${App.escapeAttr(record.trackId || '')}" data-music-profile-position="${record.position}" data-music-profile-measured="${record.measuredAt}" data-music-profile-duration="${record.duration}" data-music-profile-expires="${Number(record.updatedAt) + TTL}"><div class="user-profile-music-label">${icon('music')}<span>Listening to Music</span></div><div class="user-profile-music-track">${App.musicProfileArtwork(record)}<div class="user-profile-music-copy"><strong>${App.escapeHtml(record.title)}</strong>${record.artist ? `<span>${App.escapeHtml(record.artist)}</span>` : ''}</div>${join}<button class="btn tiny" type="button" ${isGuest() ? 'disabled' : ''} data-music-play-profile="${App.escapeAttr(record.playlistId || '')}" data-music-track-id="${App.escapeAttr(record.trackId || '')}" aria-label="Play ${App.escapeAttr(record.title)}">${icon('play')}</button></div><div class="user-profile-music-progress"><span data-music-profile-time>${App.musicTime(position)} / ${App.musicTime(record.duration)}</span><progress max="${record.duration || 1}" value="${position}" aria-label="Song progress"></progress></div></div>`;
  };
  App.refreshMusicProfileProgress = function () {
    document.querySelectorAll('[data-music-profile-playback]').forEach(element => {
      if (Number(element.dataset.musicProfileExpires) <= now()) { element.hidden = true; return; }
      App.refreshMusicProfileArtwork(element);
      const duration = Number(element.dataset.musicProfileDuration), position = Math.min(duration, Number(element.dataset.musicProfilePosition) + (element.dataset.musicProfilePlaying === 'true' ? Math.max(0, now() - Number(element.dataset.musicProfileMeasured)) / 1000 : 0));
      element.querySelector('[data-music-profile-time]').textContent = `${App.musicTime(position)} / ${App.musicTime(duration)}`; element.querySelector('progress').value = position;
    });
  };
  // A progress heartbeat patches only its clock anchor; it does not recreate
  // the profile card, its controls, or any other activity rows.
  App.musicUserPresenceChanged = function (user) {
    const record = App.getUserMusicPlayback(user);
    document.querySelectorAll('.user-profile-shell').forEach(shell => {
      if (shell.dataset.usercode !== user?.code) return;
      const element = shell.querySelector('[data-music-profile-playback]');
      if (!element) return;
      if (!record) { element.hidden = true; return; }
      if (element.dataset.musicProfilePlayback !== record.trackId) return;
      element.hidden = false; element.dataset.musicProfilePlaying = String(!!record.playing); element.dataset.musicProfilePosition = record.position; element.dataset.musicProfileDuration = record.duration;
      element.dataset.musicProfileMeasured = record.measuredAt; element.dataset.musicProfileExpires = Number(record.updatedAt) + TTL;
    });
    App.refreshMusicProfileProgress();
  };
  App.register('music/player', function () {
    const start = App.startAppPresence, stop = App.stopAppPresence;
    App.startAppPresence = function (...args) { const result = start.apply(this, args); App.startMusicPlaybackSession(); return result; };
    App.stopAppPresence = function (...args) { App.stopMusicPlaybackSession(); return stop.apply(this, args); };
    const activities = App.getUserActivityItems;
    App.getUserActivityItems = function (user) { const playback = App.getUserMusicPlayback(user); return [...activities(user), ...(playback ? [{ kind: 'music', label: `Listening to ${playback.title}${playback.artist ? ' by ' + playback.artist : ''}`, activity: playback }] : [])]; };
    const activityKey = App.getActivityPresenceRenderKey;
    App.getActivityPresenceRenderKey = user => { const record = App.getUserMusicPlayback(user); return JSON.stringify([activityKey?.(user), record ? [record.playlistId, record.trackId, record.title, record.artist, record.album, record.duration, record.playing, record.jamId || ''] : null]); };
    window.chatDesktopMusic?.onMusicAction(command => { if (command && typeof command.action === 'string' && (!command.trackId || command.trackId === state().trackId)) void App.musicControl(command.action, command.value); });
    document.addEventListener('play', event => { const media = event.target; if (media?.matches?.('audio,video') && (media.closest('.message, .msg, .media-viewer, .vpu, #media-viewer, #messages') || media.matches('.vpu-video'))) App.musicInterruptForChatMedia(media); }, true);
    document.addEventListener('volumechange', event => { const media = event.target; if (!media?.paused && media?.matches?.('.vpu-video')) App.musicInterruptForChatMedia(media); }, true);
    document.addEventListener('click', event => {
      const join = event.target.closest?.('[data-music-join-jam]');
      if (join) { event.preventDefault(); event.stopPropagation(); void App.musicJoinJam(join.dataset.musicJoinJam, join); return; }
      const profile = event.target.closest?.('[data-music-profile]'), play = event.target.closest?.('[data-music-play-profile]');
      if (profile) { event.preventDefault(); event.stopPropagation(); App.closeUserProfile?.(true); App.openMusic?.({ kind: 'user', id: profile.dataset.musicProfile }); }
      if (play) { event.preventDefault(); event.stopPropagation(); void App.musicPlay(play.dataset.musicPlayProfile, play.dataset.musicTrackId); }
    });
    window.addEventListener('pagehide', () => App.stopMusicPlaybackSession());
    window.addEventListener('pageshow', () => { if (App.currentUser) App.startMusicPlaybackSession(); });
    if (navigator.mediaSession) for (const [name, action] of Object.entries({ play: 'play', pause: 'pause', stop: 'stop', previoustrack: 'previous', nexttrack: 'next' })) { try { navigator.mediaSession.setActionHandler(name, () => void App.musicControl(action)); } catch {} }
    try { navigator.mediaSession?.setActionHandler('seekto', event => App.musicControl('seek', event.seekTime)); } catch {}
    App.renderMusicPlayer();
  });
})(globalThis.ChatApp);
