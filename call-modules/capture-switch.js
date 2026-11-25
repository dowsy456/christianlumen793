/* Replace capture tracks without changing share identity or viewer subscriptions. */
(function (App) {
  'use strict';
  const stopStream = stream => stream?.getTracks?.().forEach(track => { track.onended = null; track.stop(); });
  App.CALL_SOURCE_ARROW = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 9.5 5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  App.callSyncSourceButton = function () {
    const share = App.$('btn-call-share');
    if (!share) return;
    let group = share.closest('.call-share-split'), arrow = App.$('btn-call-change-source');
    if (!group) {
      group = document.createElement('div'); group.className = 'call-share-split';
      share.before(group); group.appendChild(share);
      arrow = document.createElement('button'); arrow.id = 'btn-call-change-source'; arrow.type = 'button';
      arrow.className = 'call-control call-settings-toggle call-change-source'; arrow.innerHTML = App.CALL_SOURCE_ARROW;
      arrow.setAttribute('aria-label', 'Change Shared Source'); arrow.dataset.tooltip = 'Change Shared Source';
      arrow.setAttribute('aria-haspopup', 'dialog'); arrow.setAttribute('aria-controls', 'call-capture-picker');
      arrow.addEventListener('click', () => { if (App.callSharing) App.callOpenCapturePicker('screen'); });
      group.appendChild(arrow);
    }
    const active = !!(App.currentCallRoomId && App.callSharing);
    group.classList.toggle('call-control-split', active); arrow.hidden = !active;
    arrow.disabled = !!(App.callScreenCapturePending || App.callJoinPending || App.callLeavePending);
  };
  App.callChangeSharedSource = async function ({ sourceId = '', shareAudio = false } = {}) {
    if (!App.callSharing || !App.currentCallRoomId || !App.currentUser || App.callScreenCapturePending) return false;
    const roomId = App.currentCallRoomId, sessionId = App.callSessionId, shareId = App.callScreenShareId;
    const old = { stream: App.callScreenStream, track: App.callScreenTrack, audio: App.callScreenAudioTrack, sourceId: App.callScreenSourceId || '' };
    const request = { id: App.callMakeSignalId('capture-change') };
    const current = () => App.callScreenCaptureRequest === request && App.currentCallRoomId === roomId && App.callSessionId === sessionId && App.callScreenShareId === shareId && App.callSharing;
    let candidate = null, replaced = false;
    App.callScreenCaptureRequest = request; App.callScreenCapturePending = true; App.syncCallControlsUI();
    try {
      const beforeCapture = sourceId ? async () => {
        if (!current()) throw new DOMException('Capture canceled', 'AbortError');
        const selected = await globalThis.chatDesktopCapture?.selectSource(sourceId, { audio: shareAudio, requestId: request.id });
        if (!current()) throw new DOMException('Capture canceled', 'AbortError');
        if (!selected) throw new DOMException('That source is no longer available.', 'NotFoundError');
      } : null;
      candidate = await App.callRequestDisplayStream({ beforeCapture, shareAudio });
      if (!candidate) throw new Error('Capture unavailable');
      const raw = candidate;
      candidate = await App.callPrepareIndicatorStream?.(raw, sourceId, { isCurrent: current }) || raw;
      const track = candidate.getVideoTracks().find(item => item.readyState === 'live');
      if (!current() || !track) throw new DOMException('Capture canceled', 'AbortError');
      try { track.contentHint = 'detail'; } catch {}
      App.callScreenTrack = track;
      App.callScreenAudioTrack = candidate.getAudioTracks().find(item => item.readyState === 'live') || null;
      replaced = true;
      const results = await Promise.allSettled([...App.callPeerMap.values()].map(pc => App.callSetPeerScreenTrack(pc, track)));
      if (results.some(result => result.status === 'rejected')) throw new Error('A viewer could not switch to the new source.');
      if (!current() || track.readyState !== 'live') throw new DOMException('Capture canceled', 'AbortError');
      App.callScreenStream = candidate;
      App.callScreenSourceId = sourceId;
      track.enabled = !App.callScreenPaused;
      if (App.callScreenAudioTrack) App.callScreenAudioTrack.enabled = !App.callScreenPaused;
      track.onended = () => { if (App.callScreenStream === candidate) App.callStopShareScreen(true); };
      const audio = App.callScreenAudioTrack;
      if (audio) audio.onended = () => { if (App.callScreenAudioTrack === audio) { App.callScreenAudioTrack = null; App.callScheduleMediaBudget(); } };
      App.callPreparePauseCapture(candidate);
      App.callRemoteVideoStreams.set(String(App.currentUser.code), candidate);
      App.callSetIndicatorSource?.(sourceId);
      App.syncShareViewStream();
      App.callScreenPreviewDataURL = null;
      void App.callPublishScreenPreview(candidate, roomId, sessionId, shareId);
      stopStream(old.stream);
      App.callPublishDesktopOverlay?.();
      return true;
    } catch (error) {
      if (replaced && current()) {
        App.callScreenTrack = old.track; App.callScreenAudioTrack = old.audio; App.callScreenStream = old.stream;
        const rollback = await Promise.allSettled([...App.callPeerMap.values()].map(pc => App.callSetPeerScreenTrack(pc, old.track)));
        if (rollback.some(result => result.status === 'rejected')) App.callScheduleMediaBudget();
      }
      stopStream(candidate);
      if (current() && !['NotAllowedError', 'AbortError'].includes(error?.name)) App.showToast({ title: 'Source Unchanged', body: 'The new source could not start. Your current screen is still being shared.', duration: 4500 });
      return false;
    } finally {
      try { globalThis.chatDesktopCapture?.cancelSelection?.(request.id); } catch {}
      if (App.callScreenCaptureRequest === request) { App.callScreenCaptureRequest = null; App.callScreenCapturePending = false; }
      App.syncCallControlsUI();
    }
  };
  const cameraSettings = track => { try { return track?.getSettings?.() || {}; } catch { return {}; } };
  const cameraSide = track => {
    const facing = cameraSettings(track).facingMode;
    return facing === 'user' || facing === 'environment' ? facing : /back|rear|environment/i.test(track?.label || '') ? 'environment' : /front|user|facetime/i.test(track?.label || '') ? 'user' : '';
  };
  const cameraConstraints = selector => ({ audio: false, video: {
    width: { ideal: 1280, max: 1280 }, height: { ideal: 720, max: 720 }, frameRate: { ideal: 30, max: 30 }, ...selector
  } });
  const mobileCameraCapture = () => !!App.mobileUserAgent || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '') || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  // Multi-lens phones enumerate the ultra-wide/telephoto cameras too. Their
  // order is not a promise that the first rear-facing device is the main lens.
  App.callRankCameraDevices = function (devices, facing) {
    const side = facing === 'user' ? /front|user|facetime/i : /back|rear|environment/i;
    const score = item => /ultra[ -]?wide|telephoto|tele camera|macro|depth|infrared/i.test(item.label) ? -100
      : /main|primary/i.test(item.label) ? 60 : /dual|triple|virtual/i.test(item.label) ? 5
      : /wide/i.test(item.label) ? 50 : 40;
    return devices.filter(item => item.kind === 'videoinput' && item.deviceId && side.test(item.label || '') && score(item) >= 0)
      .sort((a,b) => score(b)-score(a) || String(a.label).localeCompare(String(b.label)));
  };
  App.callRefreshCameraFlipSupport = async function () {
    const track = App.callCameraTrack;
    App.callCameraFlipTarget = null;
    if (!App.callCameraSharing || !track) return;
    let settings = {}, modes = [];
    try { settings = track.getSettings?.() || {}; modes = track.getCapabilities?.().facingMode || []; } catch {}
    const facing = cameraSide(track);
    const opposite = facing === 'environment' ? 'user' : 'environment';
    let cameras = [];
    try { cameras = await navigator.mediaDevices.enumerateDevices(); } catch {}
    if (App.callCameraTrack !== track || !App.callCameraSharing) return;
    const alternates = facing ? App.callRankCameraDevices(cameras,opposite).filter(item => item.deviceId !== settings.deviceId) : [];
    if (alternates.length || facing && (modes.includes(opposite) || mobileCameraCapture() && cameras.filter(item => item.kind === 'videoinput').length > 1)) App.callCameraFlipTarget = {
      facingMode: opposite, deviceId: alternates[0]?.deviceId || '', deviceIds: alternates.map(item => item.deviceId)
    };
    document.querySelectorAll('.call-view-tile[data-share-kind="camera"] .call-view-readouts').forEach(readouts => {
      const tile = readouts.closest('.call-view-tile');
      if (App.callShareOwner(tile.dataset.shareCode) !== String(App.currentUser?.code || '')) return;
      readouts.querySelector('.call-camera-flip')?.remove();
      const button = App.callBuildCameraFlipButton(); if (button) readouts.appendChild(button);
    });
  };
  App.callSwapCameraSide = async function () {
    if (!App.callCameraSharing || !App.callCameraTrack || !App.callCameraStream || !App.callCameraFlipTarget || App.callCameraCapturePending) return false;
    const room = App.currentCallRoomId, session = App.callSessionId, shareId = App.callCameraShareId;
    const old = App.callCameraStream, oldTrack = App.callCameraTrack, target = App.callCameraFlipTarget;
    const request = { kind: 'camera-flip' };
    const current = () => App.callCameraCaptureRequest === request && App.currentCallRoomId === room && App.callSessionId === session && App.callCameraShareId === shareId && App.callCameraSharing;
    App.callCameraCaptureRequest = request; App.callCameraCapturePending = true; App.syncCallControlsUI();
    const previousSettings = cameraSettings(oldTrack), previousSide = cameraSide(oldTrack), previousEnded = oldTrack.onended;
    // iOS may end the previous capture as soon as a new hardware camera opens.
    // That is a source switch, not a request to tear down the published share.
    oldTrack.onended = null;
    let stream = null, released = false;
    const mobileCapture = mobileCameraCapture();
    const liveOld = () => oldTrack.readyState === 'live' && !oldTrack.muted && (!previousSide || cameraSide(oldTrack) === previousSide);
    const selectors = (side, ids = []) => [...new Set(ids.filter(Boolean))].map(id => ({ deviceId: { exact:id } })).concat(side ? [{ facingMode: { exact:side } }] : []);
    const capture = async choices => {
      let failure;
      for (const selector of choices) {
        if (!current()) throw new DOMException('Camera canceled','AbortError');
        let candidate = null;
        try {
          candidate = await navigator.mediaDevices.getUserMedia(cameraConstraints(selector));
          const track = candidate.getVideoTracks().find(item => item.readyState === 'live');
          if (!current()) throw new DOMException('Camera canceled','AbortError');
          if (!track) throw new DOMException('No camera video','NotReadableError');
          const settings=cameraSettings(track), actualSide=cameraSide(track);
          if (selector.deviceId && settings.deviceId && settings.deviceId !== selector.deviceId.exact || selector.facingMode && actualSide && actualSide !== selector.facingMode.exact) throw new DOMException('Camera selection was not applied','OverconstrainedError');
          return candidate;
        } catch (error) {
          stopStream(candidate); failure = error;
          if (!current() || error?.name === 'NotAllowedError' || error?.name === 'SecurityError') throw error;
          if (mobileCapture && !released && ['NotReadableError','AbortError'].includes(error?.name)) throw error;
        }
      }
      throw failure || new DOMException('No camera found','NotFoundError');
    };
    const replace = async candidate => {
      const track = candidate.getVideoTracks().find(item => item.readyState === 'live');
      if (!current() || !track) throw new DOMException('Camera canceled','AbortError');
      // Subscription work must see this track while replaceTrack is queued.
      App.callCameraTrack = track;
      const results = await Promise.allSettled([...App.callPeerMap.values()].map(pc => App.callSetPeerCameraTrack(pc,track)));
      if (!current() || track.readyState !== 'live') throw new DOMException('Camera canceled','AbortError');
      if (results.some(result => result.status === 'rejected')) throw new Error('Camera replacement failed');
      // Preserve the local MediaStream identity as well as the remote sender,
      // share ID and subscriptions. Viewers do not need to reopen the camera.
      if (old !== candidate) {
        for (const prior of old.getVideoTracks()) { old.removeTrack(prior); if (prior !== track) { prior.onended=null; prior.stop(); } }
        if (!old.getVideoTracks().includes(track)) old.addTrack(track);
      }
      App.callCameraStream = old; App.callCameraTrack = track;
      try { track.contentHint='motion'; } catch {}
      track.onended = () => { if (App.callCameraTrack === track && App.callCameraCaptureRequest?.kind !== 'camera-flip') App.callStopCamera(); };
      App.syncShareViewStream(); void App.callRefreshCameraFlipSupport();
    };
    try {
      // Some devices support changing facingMode in place. Verify the settings:
      // a resolved applyConstraints alone can also mean the request was ignored.
      if (oldTrack.applyConstraints && target.facingMode) {
        try {
          await oldTrack.applyConstraints(cameraConstraints({ facingMode:{exact:target.facingMode}, ...(target.deviceId ? {deviceId:{exact:target.deviceId}} : {}) }).video);
          const settings=cameraSettings(oldTrack);
          if (current() && oldTrack.readyState === 'live' && !oldTrack.muted && cameraSide(oldTrack) === target.facingMode && (!target.deviceId || settings.deviceId === target.deviceId)) {
            oldTrack.onended=previousEnded; void App.callRefreshCameraFlipSupport(); return true;
          }
        } catch {}
      }
      const choices=selectors(target.facingMode,[target.deviceId,...(target.deviceIds || [])]);
      try { stream=await capture(choices); }
      catch(error) {
        // A single-camera capture session may require releasing the hardware
        // first. Keep the call/share/senders alive while changing only its source.
        if (!current() || !mobileCapture || !['NotReadableError','AbortError'].includes(error?.name)) throw error;
        released=true; oldTrack.stop(); stream=await capture(choices);
      }
      await replace(stream);
      return true;
    } catch (error) {
      stopStream(stream); stream=null;
      if (current()) {
        if (liveOld()) {
          App.callCameraTrack = oldTrack; oldTrack.onended=previousEnded;
          await Promise.allSettled([...App.callPeerMap.values()].map(pc => App.callSetPeerCameraTrack(pc,oldTrack)));
        } else {
          // Opening a second camera can end or mute the first on iOS, even if
          // that second request fails. Reacquire the previous source in-place.
          try {
            if (!released) oldTrack.stop();
            stream=await capture(selectors(previousSide,[previousSettings.deviceId]));
            await replace(stream);
          } catch {
            stopStream(stream);
            if (current()) { App.showToast({title:'Camera Unavailable',body:'Neither camera could open. Check camera access and try again.',duration:4500}); App.callStopCamera(); }
            return false;
          }
        }
      }
      if (current()) App.showToast({ title: 'Camera Unchanged', body: 'The other camera could not open. Your current camera is still shared.', duration: 4000 });
      return false;
    } finally {
      if (App.callCameraCaptureRequest === request) { App.callCameraCapturePending = false; App.callCameraCaptureRequest = null; }
      App.syncCallControlsUI();
    }
  };
  App.callBuildCameraFlipButton = function () {
    if (!App.callCameraFlipTarget) return null;
    const button = document.createElement('button'); button.type = 'button';
    button.className = 'call-view-action call-viewers-eye call-camera-flip';
    button.setAttribute('aria-label', 'Swap Camera Side'); button.dataset.tooltip = 'Swap Camera Side';
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8a8 8 0 0 1 14-2l2 2M20 16a8 8 0 0 1-14 2l-2-2M20 3v5h-5M4 21v-5h5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    button.addEventListener('click', event => { event.stopPropagation(); void App.callSwapCameraSide(); });
    return button;
  };
  App.register('calling/capture-switch', function () {});
})(globalThis.ChatApp);
