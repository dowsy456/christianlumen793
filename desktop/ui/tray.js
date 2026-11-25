'use strict';
let current = {};
let musicReceivedAt = 0, controlsSignature = '';
const controls = document.getElementById('controls');
const send = action => window.chatTray.command({ action, roomId: current.roomId, sessionId: current.sessionId });
const musicCommand = (command, value) => window.chatTray.command({ action: 'music', command, value, trackId: current.music?.trackId });
const time = seconds => { const value = Math.max(0, Math.floor(seconds || 0)); return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`; };
const byId = id => document.getElementById(id);
const byAction = action => document.querySelector('[data-music="' + action + '"]');
const seek = byId('music-seek'), volume = byId('music-volume');
const artwork = byId('music-art-image'), iconMenu = byId('icon-menu'), tooltip = byId('music-tooltip');
let seekDrag = '', volumeDrag = '', menuTrack = '', tipAnchor = null, tipPeople = null;

function setRange(range, value) {
  range.value = value;
  range.style.setProperty('--progress', (100 * Number(range.value) / (Number(range.max) || 1)) + '%');
}
function tickMusic() {
  const music = current.music;
  if (!music || seekDrag) return;
  const elapsed = music.playing ? (performance.now() - musicReceivedAt) / 1000 : 0;
  const position = Math.min(music.duration || Infinity, music.position + elapsed);
  byId('music-position').textContent = time(position);
  setRange(seek, position);
  seek.setAttribute('aria-valuetext', time(position) + ' of ' + time(music.duration));
}
function hideTip() {
  tipAnchor?.removeAttribute('aria-describedby');
  tipAnchor = null; tipPeople = null; tooltip.classList.remove('visible');
}
function renderPeople(people) {
  const heading = document.createElement('strong');
  heading.textContent = 'In Jam With';
  const list = document.createElement('div');
  list.className = 'jam-people'; list.setAttribute('role', 'list');
  for (const person of people) {
    const row = document.createElement('div');
    row.setAttribute('role', 'listitem');
    const avatar = document.createElement('span');
    avatar.className = 'jam-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = Array.from(person.displayName.trim())[0] || '•';
    if (person.avatar) {
      const image = document.createElement('img');
      image.alt = ''; image.src = person.avatar;
      image.addEventListener('error', () => image.remove(), { once: true });
      avatar.append(image);
    }
    const name = document.createElement('span');
    name.textContent = person.displayName;
    row.append(avatar, name); list.append(row);
  }
  tooltip.replaceChildren(heading, list);
}
function showTip(button) {
  if (!button || button.disabled || !iconMenu.hidden) return hideTip();
  const music = current.music;
  const sharedJam = button.dataset.music === 'jam' && music?.jamState === 'shared';
  if (sharedJam) {
    if (tipPeople !== music.jamPeople) renderPeople(music.jamPeople);
    tipPeople = music.jamPeople;
  } else {
    const label = button.getAttribute('aria-label');
    if (tooltip.textContent !== label || tipPeople) tooltip.textContent = label;
    tipPeople = null;
  }
  const bounds = button.getBoundingClientRect();
  tooltip.style.left = Math.max(8, Math.min(innerWidth - tooltip.offsetWidth - 8, bounds.x + bounds.width / 2 - tooltip.offsetWidth / 2)) + 'px';
  tooltip.style.top = (bounds.bottom + tooltip.offsetHeight + 8 <= innerHeight ? bounds.bottom + 4 : Math.max(8, bounds.top - tooltip.offsetHeight - 4)) + 'px';
  if (tipAnchor !== button) tipAnchor?.removeAttribute('aria-describedby');
  tipAnchor = button;
  button.setAttribute('aria-describedby', tooltip.id);
  tooltip.classList.add('visible');
}
function closeIconMenu(restoreFocus = false) {
  if (iconMenu.hidden) return;
  iconMenu.hidden = true; menuTrack = '';
  if (restoreFocus) byId('music-art').focus();
}
function renderMusic(music) {
  byId('music').hidden = !music;
  musicReceivedAt = performance.now();
  if (!music) {
    artwork.removeAttribute('src'); artwork.hidden = true; closeIconMenu(); hideTip();
    return;
  }
  if (Object.hasOwn(music, 'photoDataURL')) {
    if (music.photoDataURL) artwork.src = music.photoDataURL;
    else artwork.removeAttribute('src');
    artwork.hidden = !music.photoDataURL;
  }
  artwork.nextElementSibling.toggleAttribute('hidden', !artwork.hidden);
  artwork.style.left = (50 + music.photoTransform.x * 100) + '%';
  artwork.style.marginTop = (music.photoTransform.y * 100) + '%';
  artwork.style.transform = 'translate(-50%, -50%) scale(' + music.photoTransform.scale + ')';
  if (!iconMenu.hidden && (menuTrack !== music.trackId || artwork.hidden)) closeIconMenu();
  byId('music-title').textContent = music.title;
  byId('music-artist').textContent = music.artist;
  byId('music-album').textContent = music.album;
  byId('music-duration').textContent = time(music.duration);
  byId('music-loading').hidden = !music.loading;
  const pausable = music.playing || music.loading;
  byAction('toggle').setAttribute('aria-label', pausable ? 'Pause' : 'Play');
  byId('music-play-icon').setAttribute('d', pausable ? 'M8 5v14M16 5v14' : 'm7 4 13 8-13 8Z');
  byId('music-play-icon').setAttribute('stroke-width', pausable ? '4' : '1.8');
  for (const action of ['toggle', 'previous', 'next']) byAction(action).disabled = music.guest || music.blocked || music.standalone && action !== 'toggle';
  byAction('shuffle').disabled = music.guest || music.standalone;
  byAction('repeat').disabled = music.guest;
  byAction('stop').disabled = music.guest;
  byAction('jam').disabled = music.jamDisabled;
  byAction('jam').setAttribute('aria-pressed', String(music.jamState !== 'none'));
  byAction('jam').setAttribute('aria-label', music.guest ? 'Leave Jam' : music.jamState === 'none' ? 'Start Jam' : 'End Jam');
  byAction('shuffle').setAttribute('aria-pressed', String(music.shuffle));
  byAction('shuffle').setAttribute('aria-label', music.shuffle ? 'Shuffle On' : 'Shuffle Off');
  byAction('repeat').setAttribute('aria-pressed', String(music.repeat !== 'off'));
  byAction('repeat').setAttribute('aria-label', music.repeat === 'one' ? 'Repeat One' : music.repeat === 'all' ? 'Repeat All' : 'Repeat Off');
  byId('music-repeat-one').hidden = music.repeat !== 'one';
  seek.max = String(music.duration || 1);
  seek.disabled = music.guest || music.loading || !music.duration;
  const volumeButton = byId('music-volume-button');
  volumeButton.setAttribute('aria-pressed', String(music.volume === 0));
  volumeButton.title = music.volume === 0 ? 'Unmute Music' : 'Mute Music';
  volumeButton.setAttribute('aria-label', volumeButton.title);
  if (!volumeDrag) {
    setRange(volume, music.volume);
    byId('music-volume-value').textContent = music.volume + '%';
  }
  if (tipAnchor) showTip(tipAnchor);
  tickMusic();
}
window.chatTray.onState(state => {
  const music = state.music && !Object.hasOwn(state.music, 'jamPeople') ? { ...state.music, jamPeople: current.music?.jamPeople || [] } : state.music;
  current = { ...state, music };
  renderMusic(music);
  document.getElementById('room').textContent = state.roomName;
  document.getElementById('room').title = state.roomName;
  const status = document.getElementById('status'); status.textContent = state.status; status.hidden = !state.status;
  const signature = JSON.stringify(state.controls); if (signature === controlsSignature) return; controlsSignature = signature;
  const focused = document.activeElement?.dataset.action;
  controls.replaceChildren(...state.controls.map(control => {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.action = control.action;
    button.disabled = control.disabled; if (control.action === 'leave') button.className = 'danger';
    if (control.icon === 'return') { const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('aria-hidden', 'true'); const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', 'M6 18 18 6M6 6h12v12'); icon.append(path); button.append(icon); }
    else { const icon = document.createElement('img'); icon.alt = ''; icon.src = state.extraIcons[control.icon] || `../assets/call-controls/${control.icon}.png`; button.append(icon); }
    button.append(document.createTextNode(control.label)); return button;
  }));
  if (focused) controls.querySelector(`[data-action="${focused}"]`)?.focus();
});
byId('music-art').addEventListener('contextmenu', event => {
  if (!current.music || artwork.hidden) return;
  event.preventDefault(); hideTip(); menuTrack = current.music.trackId; iconMenu.hidden = false;
  const anchor = byId('music-art').getBoundingClientRect();
  const x = event.clientX || anchor.left, y = event.clientY || anchor.bottom;
  iconMenu.style.left = Math.max(8, Math.min(innerWidth - iconMenu.offsetWidth - 8, x)) + 'px';
  iconMenu.style.top = Math.max(8, Math.min(innerHeight - iconMenu.offsetHeight - 8, y)) + 'px';
  iconMenu.firstElementChild.focus();
});
document.addEventListener('pointerdown', event => { if (!iconMenu.contains(event.target)) closeIconMenu(); });
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (button?.dataset.icon) {
    if (menuTrack === current.music?.trackId) void musicCommand(button.dataset.icon);
    closeIconMenu(true);
  } else if (button?.dataset.music) void musicCommand(button.dataset.music);
  else if (button?.dataset.action) void send(button.dataset.action);
});
byId('music-volume-button').addEventListener('click', () => {
  if (current.music) void musicCommand('volume', current.music.volume ? 0 : current.music.restoreVolume || 100);
});
for (const range of [seek, volume]) {
  const isSeek = range === seek;
  range.addEventListener('pointerdown', () => {
    if (isSeek) seekDrag = current.music?.trackId;
    else volumeDrag = current.music?.trackId;
  });
  range.addEventListener('input', () => {
    const trackId = isSeek ? seekDrag : volumeDrag;
    if (trackId && current.music?.trackId !== trackId) return;
    const value = Number(range.value);
    setRange(range, value);
    if (isSeek) byId('music-position').textContent = time(value);
    else byId('music-volume-value').textContent = value + '%';
    void musicCommand(isSeek ? 'seek' : 'volume', value);
  });
  const end = () => {
    if (isSeek) seekDrag = '';
    else volumeDrag = '';
  };
  for (const event of ['change', 'pointerup', 'pointercancel', 'blur']) range.addEventListener(event, end);
}
const musicPanel = byId('music');
byAction('jam').addEventListener('wheel', event => {
  const list = tipPeople && tooltip.querySelector('.jam-people');
  if (!list || list.scrollHeight <= list.clientHeight) return;
  list.scrollTop += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? list.clientHeight : 1);
  event.preventDefault();
}, { passive: false });
for (const [start, end] of [['pointerover', 'pointerout'], ['focusin', 'focusout']]) {
  musicPanel.addEventListener(start, e => { if (e.target.closest('.music-button')) showTip(e.target.closest('.music-button')); });
  musicPanel.addEventListener(end, e => { if (tipAnchor && !tipAnchor.contains(e.relatedTarget)) hideTip(); });
}
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    if (!iconMenu.hidden) closeIconMenu(true);
    else void send('close');
  } else if (!iconMenu.hidden && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
    event.preventDefault();
    const [first, second] = iconMenu.children;
    (document.activeElement === first ? second : first).focus();
  }
});
window.addEventListener('blur', () => { closeIconMenu(); hideTip(); });
setInterval(tickMusic, 250);
