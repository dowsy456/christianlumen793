/* RTDB audio is stored in immutable, ordered parts. Untagged MPEG/ADTS byte
 * streams can begin decoding while later parts are still in flight. Other
 * containers and incompatible decoders use the same verified complete blob. */
(function (App) {
  'use strict';
  const streams = new Map();
  App.releaseMusicStream = (url, retainParts) => { streams.get(url)?.dispose(); App.releaseMusicRange?.(url, retainParts); };
  App.retryMusicStream = url => streams.get(url)?.retry() || App.retryMusicRange?.(url);
  App.seekMusicStream = (url, seconds) => streams.get(url)?.seek(seconds);

  // An MP3 Info frame records a constant bit rate, exact number of audio
  // frames and byte extent. Ignore untagged, variable-rate or mismatched
  // descriptors rather than guessing a timeline from file length alone.
  function mp3Positions(bytes, track) {
    if (!bytes || bytes.length < 64) return null;
    let first = 0;
    if (bytes[0] === 73 && bytes[1] === 68 && bytes[2] === 51) {
      first = 10 + bytes.subarray(6, 10).reduce((size, byte) => size * 128 + (byte & 127), 0);
      if (bytes[5] & 16) first += 10;
    }
    const rates = [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320];
    const bitRate = rates[bytes[first + 2] >> 4], sampleRate = [44100,48000,32000][bytes[first + 2] >> 2 & 3];
    if (bytes[first] !== 255 || (bytes[first + 1] & 254) !== 250 || !bitRate || !sampleRate) return null;
    const side = bytes[first + 3] >> 6 === 3 ? 17 : 32;
    const info = first + 4 + (bytes[first + 1] & 1 ? 0 : 2) + side;
    if (info + 16 > bytes.length || String.fromCharCode(...bytes.subarray(info, info + 4)) !== 'Info') return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if ((view.getUint32(info + 4) & 3) !== 3) return null;
    const frames = view.getUint32(info + 8), extent = view.getUint32(info + 12), frameTime = 1152 / sampleRate;
    const trailer = track.size - first - extent, frameBytes = 144000 * bitRate / sampleRate;
    const stride = extent / (frames + 1), duration = Number(track.duration);
    if (!Number.isFinite(duration) || duration <= 0 || !frames || ![0,128].includes(trailer) || !Number.isInteger(stride) ||
        (stride !== Math.floor(frameBytes) && stride !== Math.floor(frameBytes) + 1) ||
        Math.abs(frames * frameTime - duration) > 1) return null;
    const signature = bytes[first + 2] & 252;
    const header = (part, at) => part[at] === 255 && (part[at + 1] & 254) === 250 &&
      (part[at + 2] & 252) === signature && Math.floor(frameBytes) + (part[at + 2] >> 1 & 1) === stride;
    if (!header(bytes, first) || !header(bytes, first + stride)) return null;
    return {
      partAt(time) {
        const frame = Math.max(0, Math.floor(time / frameTime) - 4);
        return Math.min(track.chunkCount - 1, Math.floor((first + frame * stride) / track.chunkBytes));
      },
      anchor(part, index) {
        if (!index) return { offset: 0, time: 0 };
        const start = index * track.chunkBytes, frame = Math.ceil((start - first) / stride);
        const offset = first + frame * stride - start;
        if (!header(part, offset) || !header(part, offset + stride)) return null;
        return { offset, time: Math.max(0, frame - 1) * frameTime };
      }
    };
  }

  App.createMusicStream = function (track, job, onError) {
    const mime = String(track.mime || '').toLowerCase().split(';')[0];
    if (track.chunkCount < 2 || !['audio/mpeg', 'audio/aac'].includes(mime) || !window.MediaSource?.isTypeSupported(mime)) return '';
    const source = new MediaSource(), url = URL.createObjectURL(source);
    let buffer, next = 0, failure = false, disposed = false, complete = false;
    let positions, requested = null, jumped = false;
    function fetchAhead(index) {
      if (!job || index >= job.count) return;
      void job.read(index).catch(retry);
    }
    function seek(seconds) {
      if (!buffer || !job || !Number.isFinite(seconds) || mime !== 'audio/mpeg') return;
      for (let i = 0; i < buffer.buffered.length; i++) {
        if (seconds >= buffer.buffered.start(i) && seconds + 0.1 < buffer.buffered.end(i)) { requested = null; return; }
      }
      if (positions === undefined && job.parts[0]) positions = mp3Positions(job.parts[0], track);
      if (!positions) return;
      requested = positions.partAt(seconds);
      // Include the preceding full chunk at EOF so a short final fragment
      // always has an independently verifiable frame boundary.
      if (requested === job.count - 1 && requested > 0) requested--;
      fetchAhead(requested);
      fetchAhead(requested + 1);
      pump();
    }
    function detach() {
      job?.listeners.delete(pump); job = null;
      buffer?.removeEventListener('updateend', pump);
      buffer?.removeEventListener('error', retry);
      source.removeEventListener('sourceopen', open);
    }
    function dispose() {
      disposed = true; detach(); streams.delete(url); URL.revokeObjectURL(url);
    }
    function retry() {
      if (disposed) return false;
      failure = true;
      // Deliver an error only after the selected media element owns this URL.
      if (source.readyState !== 'closed' || buffer) { detach(); onError(url); }
      return true;
    }
    function pump() {
      if (!buffer || buffer.updating || disposed || failure || !job || source.readyState === 'closed') return;
      try {
        let offset = 0;
        if (requested !== null) {
          const part = job.parts[requested];
          if (!part) return;
          const anchor = positions.anchor(part, requested);
          if (!anchor) { retry(); return; }
          // Setting timestampOffset reopens an ended MediaSource. Reset the
          // parser's partial frame before starting at the new byte position.
          if (source.readyState === 'ended') buffer.timestampOffset = anchor.time;
          buffer.abort();
          buffer.timestampOffset = anchor.time;
          next = requested; requested = null; jumped = true; offset = anchor.offset;
        }
        if (source.readyState !== 'open') return;
        const part = job.parts[next];
        if (part) {
          buffer.appendBuffer(offset ? part.subarray(offset) : part); next++;
          if (jumped) fetchAhead(next);
        } else if (next === track.chunkCount && (complete || jumped)) {
          source.endOfStream();
          if (!jumped) detach();
        }
      } catch { retry(); }
    }
    function open() {
      if (failure) { retry(); return; }
      try {
        buffer = source.addSourceBuffer(mime);
        if (Number(track.duration) > 0) source.duration = Number(track.duration);
        buffer.addEventListener('updateend', pump); buffer.addEventListener('error', retry);
        pump();
      } catch { retry(); }
    }
    streams.set(url, { dispose, retry, seek });
    job.listeners.add(pump);
    source.addEventListener('sourceopen', open, { once: true });
    job.complete().then(() => { complete = true; pump(); }, retry);
    return url;
  };
  App.register('music/audio-stream', () => {});
})(globalThis.ChatApp);
