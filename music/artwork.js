/* Music artwork uses the original uploaded file for both icon actions. */
(function (App) {
  'use strict';
  const imageData = src => typeof src === 'string' && src.length <= 8 * 1024 * 1024 &&
    /^data:image\/(?:png|jpeg|jpg|gif|webp);base64,/i.test(src);
  App.musicIconAction = function (action, source, title) {
    if (!imageData(source)) return;
    if (action === 'copy-icon-address') return App.copyImageAddress(source);
    return App.downloadFileViaObjectURL(source, App.safeFileBaseName(title || 'Audio') + '-icon.' + App.inferImageExt(source));
  };
  function metadata(playlistId, trackId) {
    return App.musicData.tracks.get(playlistId)?.get(trackId) ||
      App.musicData.audios?.get(App.musicLibraryOwner?.(playlistId))?.get(trackId);
  }
  App.musicProfileArtwork = function (record) {
    const track = metadata(record.playlistId, record.trackId);
    const source = track ? track.photoDataURL : record.photoDataURL;
    if (!imageData(source)) return '';
    const frame = document.createElement('span'), img = document.createElement('img');
    frame.className = 'user-profile-music-art'; img.alt = ''; frame.append(img);
    App.applyCroppedImage(img, source, track?.photoTransform || record.photoTransform, 40, 132);
    return frame.outerHTML;
  };
  // A profile may open before the music catalog arrives. Large covers are
  // resolved by track identity instead of duplicating them in presence writes.
  App.refreshMusicProfileArtwork = function (element) {
    const button = element.querySelector('[data-music-play-profile]');
    if (!button) return;
    const track = metadata(button.dataset.musicPlayProfile, button.dataset.musicTrackId);
    if (!track || element.musicArtworkTrack === track) return;
    element.musicArtworkTrack = track;
    let frame = element.querySelector('.user-profile-music-art');
    if (!imageData(track.photoDataURL)) { frame?.remove(); return; }
    if (!frame) {
      frame = document.createElement('span'); frame.className = 'user-profile-music-art';
      const image = document.createElement('img'); image.alt = ''; frame.append(image);
      element.querySelector('.user-profile-music-track').prepend(frame);
    }
    App.applyCroppedImage(frame.firstElementChild, track.photoDataURL, track.photoTransform, 40, 132);
  };
  App.register('music/artwork', function () {
    document.addEventListener('contextmenu', event => {
      const frame = event.target.closest?.('.music-cover, .music-art, .user-profile-music-art, #music-icon-clip');
      if (!frame) return;
      const source = frame.querySelector('img')?.getAttribute('src');
      if (!imageData(source)) return;
      event.preventDefault(); event.stopPropagation();
      const title = frame.closest('.music-track-row')?.querySelector('.music-track-title')?.textContent ||
        frame.closest('.user-profile-music-track')?.querySelector('strong')?.textContent ||
        frame.closest('.music-playlist-card')?.querySelector('.music-card-name')?.textContent ||
        frame.closest('.music-playlist-heading')?.querySelector('h1')?.textContent ||
        App.$('music-playlist-name')?.value || App.$('music-track-title')?.value || App.musicState.track?.title;
      App.closeMsgMenu(true); App.ensureMsgMenu();
      let menu = App.$('music-context-menu');
      if (!menu) { menu = document.createElement('div'); menu.id = 'music-context-menu'; menu.className = 'msg-menu'; menu.hidden = true; document.body.append(menu); }
      menu.replaceChildren();
      for (const [act, action, label] of [['downloadImage','download-icon','Download'], ['copyImageAddress','copy-icon-address','Copy Address']]) {
        const button = App.msgMenuBtns[act].cloneNode(true);
        button.style.display = ''; button.hidden = false; button.querySelector('.msg-menu-label').textContent = label;
        button.onclick = () => { App.closeContextMenu(menu, { immediate:true }); void App.musicIconAction(action, source, title); };
        menu.append(button);
      }
      App.openContextMenu(menu, { x:event.clientX, y:event.clientY, anchor:frame });
      menu.firstElementChild.focus({ preventScroll:true });
    }, true);
  });
})(globalThis.ChatApp);
