/* Native pointer drawings are composited into the ordinary screen video. */
(function (App) {
  'use strict';
  App.callReportIndicatorUnavailable = function () {
    App.showToast?.({ title: 'Screen Drawing Unavailable', body: 'Your screen is still being shared. The drawing overlay could not start or stopped unexpectedly. Turn Call Overlay off and on to retry.', duration: 6000 });
  };
  App.callSetIndicatorSource = function (sourceId = '') {
    App.callIndicatorDesiredSourceId = sourceId;
    App.callSyncIndicatorOverlay();
  };
  App.callSyncIndicatorOverlay = function () {
    if (!globalThis.chatDesktopDrawing?.setSource) return;
    const sourceId = App.callIndicatorDesiredSourceId || '';
    const active = !!(sourceId && App.callSharing && App.callDesktopOverlayEnabled !== false), shareId = App.callScreenShareId || '';
    const signature = JSON.stringify([active, sourceId, shareId, App.currentCallRoomId, App.callSessionId]);
    if (App.callIndicatorSourceSignature === signature) return;
    App.callIndicatorSourceSignature = signature;
    if (!active) App.callScreenStream?.__clearIndicatorStrokes?.();
    const sequence = App.callIndicatorActivation = (App.callIndicatorActivation || 0) + 1;
    const current = () => active && App.callIndicatorActivation === sequence && App.callSharing && App.callDesktopOverlayEnabled !== false && App.callScreenShareId === shareId;
    try {
      const result = globalThis.chatDesktopDrawing.setSource({ active, sourceId,
        roomId: App.currentCallRoomId || '', sessionId: App.callSessionId || '', shareId, activationId: sequence });
      Promise.resolve(result).then(ready => { if (ready === false && current()) App.callReportIndicatorUnavailable(); }, () => { if (current()) App.callReportIndicatorUnavailable(); });
    } catch { if (current()) App.callReportIndicatorUnavailable(); }
  };
  App.callPrepareIndicatorStream = async function (raw, sourceId, { isCurrent = () => true } = {}) {
    if (!sourceId || globalThis.chatDesktopDrawing?.version !== 1) return raw;
    if (!isCurrent()) throw new DOMException('Capture canceled', 'AbortError');
    const input = raw.getVideoTracks()[0];
    const video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.srcObject = raw;
    let timeout, cancellation;
    try {
      await Promise.race([video.play(), new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new DOMException('Capture video did not start.', 'NotReadableError')), 8000);
        cancellation = setInterval(() => { if (!isCurrent() || input.readyState !== 'live') reject(new DOMException('Capture canceled', 'AbortError')); }, 100);
      })]);
      if (!isCurrent() || input.readyState !== 'live') throw new DOMException('Capture canceled', 'AbortError');
    } catch (error) { video.pause(); video.srcObject = null; throw error; }
    finally { clearTimeout(timeout); clearInterval(cancellation); }
    const settings = input.getSettings?.() || {};
    const width = video.videoWidth || settings.width || 1280, height = video.videoHeight || settings.height || 720;
    const scale = Math.min(1, 1280 / width, 720 / height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.round(width * scale)); canvas.height = Math.max(2, Math.round(height * scale));
    const pen = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!pen || !canvas.captureStream) throw new Error('Screen drawing capture is unavailable.');
    const output = canvas.captureStream(0), track = output.getVideoTracks()[0];
    for (const audio of raw.getAudioTracks()) output.addTrack(audio);
    const strokes = new Map();
    let disposed = false, timer = 0, frame = 0, animation = 0, animationDue = Infinity, lastDrawAt = -Infinity;
    const frameInterval = 1000 / 30;
    const scheduleDraw = delay => {
      const due = performance.now() + delay;
      if (due >= animationDue) return;
      clearTimeout(animation);
      animationDue = due;
      animation = setTimeout(draw, delay);
    };
    // New video frames and drawing animations have independent clocks. An
    // unmoving captured window needs pixels only when a stroke changes.
    const draw = () => {
      if (disposed) return;
      clearTimeout(animation);
      animation = 0;
      animationDue = Infinity;
      const now = performance.now();
      let nextStrokeFrame = Infinity;
      if (video.readyState >= 2) {
        lastDrawAt = now;
        const sourceWidth = video.videoWidth || width, sourceHeight = video.videoHeight || height;
        const frameScale = Math.min(1, 1280 / sourceWidth, 720 / sourceHeight);
        const nextWidth = Math.max(2, Math.round(sourceWidth * frameScale)), nextHeight = Math.max(2, Math.round(sourceHeight * frameScale));
        // Resized windows keep their true aspect ratio; reset the canvas only
        // when decoded dimensions actually change, never on every frame.
        if (canvas.width !== nextWidth) canvas.width = nextWidth;
        if (canvas.height !== nextHeight) canvas.height = nextHeight;
        pen.drawImage(video, 0, 0, canvas.width, canvas.height);
        for (const [id, stroke] of strokes) {
          const age = stroke.endedAt == null ? 0 : now - stroke.endedAt;
          if (age >= 3000) { strokes.delete(id); continue; }
          if (now - stroke.startedAt < 90 || age >= 2820) nextStrokeFrame = frameInterval;
          else if (stroke.endedAt != null) nextStrokeFrame = Math.min(nextStrokeFrame, 2820 - age);
          pen.globalAlpha = Math.min(1, (now - stroke.startedAt) / 90, (3000 - age) / 180);
          pen.lineJoin = pen.lineCap = 'round';
          pen.beginPath();
          stroke.points.forEach(([x, y], index) => pen[index ? 'lineTo' : 'moveTo'](x * canvas.width, y * canvas.height));
          if (stroke.points.length === 1) { const [x, y] = stroke.points[0]; pen.lineTo(x * canvas.width + .1, y * canvas.height); }
          pen.strokeStyle = '#090909'; pen.lineWidth = 4; pen.stroke();
          pen.strokeStyle = '#ff2929'; pen.lineWidth = 2.5; pen.stroke();
        }
        pen.globalAlpha = 1;
        track.requestFrame?.();
      }
      if (Number.isFinite(nextStrokeFrame)) scheduleDraw(nextStrokeFrame);
    };
    const nextVideoFrame = () => {
      if (disposed) return;
      if (!document.hidden && typeof video.requestVideoFrameCallback === 'function') {
        frame = video.requestVideoFrameCallback(() => {
          frame = 0;
          const delay = lastDrawAt + frameInterval - performance.now();
          if (delay > 1) scheduleDraw(delay);
          else draw();
          nextVideoFrame();
        });
      } else {
        // Hidden windows may suspend presentation callbacks while WebRTC
        // continues sending. Keep the existing desktop background cadence.
        timer = setTimeout(() => { timer = 0; draw(); nextVideoFrame(); }, frameInterval);
      }
    };
    const resetVideoClock = () => {
      clearTimeout(timer);
      if (frame) video.cancelVideoFrameCallback?.(frame);
      timer = frame = 0;
      nextVideoFrame();
    };
    const clearStrokes = () => { if (strokes.size) { strokes.clear(); draw(); } };
    const unsubscribe = globalThis.chatDesktopDrawing.onStroke(event => {
      if (disposed || App.callScreenStream !== output || event?.shareId !== App.callScreenShareId || event.sourceId && event.sourceId !== sourceId) return;
      if (event.activationId != null && event.activationId !== App.callIndicatorActivation) return;
      // A disabled overlay must also clear encoded viewer pixels and reject
      // late helper output. Keep the same outgoing track and screen session.
      if (App.callDesktopOverlayEnabled === false || event.phase === 'reset') { clearStrokes(); return; }
      if (event.phase === 'error') { clearStrokes(); App.callReportIndicatorUnavailable(); return; }
      if (typeof event.id !== 'string' || event.id.length > 160 || !['start', 'points', 'end'].includes(event.phase)) return;
      const points = Array.isArray(event.points) ? event.points.slice(0, 256).filter(point => Array.isArray(point) && point.length === 2 && point.every(value => Number.isFinite(value) && value >= 0 && value <= 1)) : [];
      const now = performance.now();
      let stroke = strokes.get(event.id);
      if (!stroke && points.length) {
        if (strokes.size >= 64) strokes.delete(strokes.keys().next().value);
        stroke = { points: [], startedAt: now, endedAt: null }; strokes.set(event.id, stroke);
      }
      if (!stroke) return;
      stroke.points.push(...points);
      if (stroke.points.length > 4096) stroke.points.splice(0, stroke.points.length - 4096);
      if (event.phase === 'end') stroke.endedAt = now;
      // Batch IPC point bursts into one paint, including on a static screen.
      scheduleDraw(Math.max(0, lastDrawAt + frameInterval - now));
    });
    const stop = track.stop.bind(track);
    track.stop = () => {
      if (disposed) return;
      disposed = true; clearTimeout(timer); clearTimeout(animation);
      if (frame) video.cancelVideoFrameCallback?.(frame);
      document.removeEventListener('visibilitychange', resetVideoClock);
      if (typeof unsubscribe === 'function') unsubscribe();
      strokes.clear(); video.pause(); video.srcObject = null;
      raw.getTracks().forEach(item => { item.onended = null; item.stop(); });
      stop();
    };
    input.onended = () => { if (!disposed) { track.stop(); track.dispatchEvent(new Event('ended')); } };
    output.__indicatorRawStream = raw;
    output.__indicatorSourceId = sourceId;
    output.__clearIndicatorStrokes = clearStrokes;
    // Preserve capture surface information used for screen audio checks/budgets.
    track.__captureSourceSettings = settings;
    document.addEventListener('visibilitychange', resetVideoClock);
    draw();
    nextVideoFrame();
    return output;
  };
  App.register('calling/indicators', function () {});
})(globalThis.ChatApp);
