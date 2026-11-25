/* Windows excludes the app from system loopback. Add only room attachments
 * and HTML Hub playback to the selected screen's audio sender. */
(function (App) {
  'use strict';
  function installRouting(App, isolatedPreview = false) {
    const providers = new Set(), mixes = new Set();
    const noop = () => {};
    const available = () => (isolatedPreview || !!globalThis.chatDesktopCapture) && typeof AudioContext === 'function';

    function register(provider) {
      if (!available()) return noop;
      providers.add(provider);
      for (const mix of mixes) mix.attach(provider);
      return () => {
        providers.delete(provider);
        for (const mix of mixes) mix.detach(provider);
      };
    }

    App.callSharePlaybackNode = node => register(mix => {
      const tap = node.context.createMediaStreamDestination();
      node.connect(tap);
      const disconnect = mix.input(tap.stream);
      return () => {
        disconnect();
        try { node.disconnect(tap); } catch {}
        tap.stream.getTracks().forEach(track => track.stop());
      };
    });

    // Capturing an element leaves its normal speaker route alone. Element
    // capture precedes volume and mute, so mirror both onto the share branch.
    App.callSharePlaybackElement = (element, activeStops) => {
      if (!available() || !element.captureStream) return noop;
      let unregister;
      function start() {
        if (unregister || element.paused || element.ended) return;
        unregister = register(mix => {
          const stream = element.captureStream();
          let disconnect = noop;
          function refresh() {
            disconnect();
            const track = stream.getAudioTracks().find(item => item.readyState === 'live');
            disconnect = track ? mix.input(new MediaStream([track]), element) : noop;
          }
          stream.addEventListener('addtrack', refresh);
          stream.addEventListener('removetrack', refresh);
          refresh();
          return () => {
            stream.removeEventListener('addtrack', refresh);
            stream.removeEventListener('removetrack', refresh);
            disconnect();
            stream.getTracks().forEach(track => track.stop());
          };
        });
        activeStops?.add(stop);
      }
      function stop() { unregister?.(); unregister = null; activeStops?.delete(stop); }
      element.addEventListener('playing', start);
      for (const event of ['pause', 'ended', 'emptied']) element.addEventListener(event, stop);
      start();
      return () => {
        stop();
        element.removeEventListener('playing', start);
        for (const event of ['pause', 'ended', 'emptied']) element.removeEventListener(event, stop);
      };
    };

    // Install in an app-opened HTML document before its scripts execute. The
    // parent call page, its Music player, and its remote voices never use these
    // hooks. Each document retains its normal output and origin permissions.
    const hubDocuments = new WeakSet(), hubRoutes = new WeakMap(), wrappedFrameTypes = new WeakSet();
    function routeHubAudio(realm, native) {
      const activeStops = new Set(), tracked = new WeakMap(), graphMedia = new WeakSet();
      const buses = new WeakMap();
      const connect = native.connect, disconnect = native.disconnect;
      native.connect = function (target, ...args) {
        const ctx = this.context;
        if (target !== ctx.destination || typeof ctx.createMediaStreamDestination !== 'function') return connect.call(this, target, ...args);
        let bus = buses.get(ctx);
        if (!bus) {
          bus = ctx.createGain();
          // Keep the output channel layout, including mono and multichannel
          // local devices, independent of the outgoing stereo WebRTC branch.
          bus.channelCount = ctx.destination.channelCount;
          bus.channelCountMode = ctx.destination.channelCountMode;
          connect.call(bus, target);
          buses.set(ctx, bus);
          const release = App.callSharePlaybackNode(bus);
          const stop = () => { release(); activeStops.delete(stop); ctx.removeEventListener('statechange', closed); };
          const closed = () => { if (ctx.state === 'closed') stop(); };
          activeStops.add(stop); ctx.addEventListener('statechange', closed);
        }
        connect.call(this, bus, ...args);
        return target;
      };
      native.disconnect = function (...args) {
        if (args[0] === this.context.destination && buses.has(this.context)) args[0] = buses.get(this.context);
        return disconnect.apply(this, args);
      };
      function followElement(element) {
        if (element && !tracked.has(element) && !graphMedia.has(element)) {
          tracked.set(element, App.callSharePlaybackElement(element, activeStops));
        }
      }
      // A game can amplify or filter its element audio through Web Audio. Tap
      // that final graph only, including for a detached new Audio() instance.
      const audioProto = realm.AudioContext?.prototype;
      if (audioProto?.createMediaElementSource) {
        const original = audioProto.createMediaElementSource;
        audioProto.createMediaElementSource = function (element) {
          const source = original.call(this, element);
          graphMedia.add(element); tracked.get(element)?.();
          return source;
        };
      }
      const media = realm.HTMLMediaElement.prototype;
      const play = media.play;
      media.play = function () { followElement(this); return play.call(this); };
      return { activeStops, followElement };
    }
    App.callInstallHubPlayback = function install(realm) {
      if (!available() || !realm || (!isolatedPreview && realm === window)) return;
      let doc;
      try { doc = realm.document; } catch { return; }
      if (!doc || hubDocuments.has(doc)) return;
      hubDocuments.add(doc);
      const native = realm.AudioNode?.prototype;
      if (!native) return;
      let routes = hubRoutes.get(native);
      if (!routes) {
        routes = routeHubAudio(realm, native);
        hubRoutes.set(native, routes);
      }
      const { activeStops, followElement } = routes;
      doc.addEventListener('play', event => followElement(event.target), true);
      doc.querySelectorAll('audio,video').forEach(followElement);

      const children = new WeakSet();
      function watchChild(frame) {
        if (children.has(frame)) return;
        children.add(frame);
        const inspect = () => install(frame.contentWindow);
        frame.addEventListener('load', inspect);
        // Chromium may reuse the initial about:blank realm for srcdoc. The
        // startup hook will install there once, after navigation commits.
        try {
          if (frame.contentDocument?.URL !== 'about:blank' || (!frame.hasAttribute('src') && !frame.hasAttribute('srcdoc'))) inspect();
        } catch {}
      }
      doc.querySelectorAll('iframe').forEach(watchChild);
      const observer = new MutationObserver(changes => {
        for (const change of changes) for (const node of change.addedNodes) {
          if (node.localName === 'iframe') watchChild(node);
          node.querySelectorAll?.('iframe').forEach(watchChild);
        }
      });
      observer.observe(doc, { childList: true, subtree: true });
      // A dynamically assigned srcdoc may construct and connect an oscillator
      // before its load event. Install in that new document at parser startup.
      const iframeProto = realm.HTMLIFrameElement.prototype;
      const srcdoc = Object.getOwnPropertyDescriptor(iframeProto, 'srcdoc');
      realm.__chatHubChildAudio = install;
      if (srcdoc?.set && srcdoc.configurable && !wrappedFrameTypes.has(iframeProto)) {
        wrappedFrameTypes.add(iframeProto);
        Object.defineProperty(iframeProto, 'srcdoc', { ...srcdoc, set(value) {
          if (typeof value !== 'string' || (this.hasAttribute('sandbox') && !this.sandbox.contains('allow-same-origin'))) {
            return srcdoc.set.call(this, value);
          }
          const script = '<script>try{parent.__chatHubChildAudio?.(window)}catch{}<\/script>';
          // Read only the opening document tags, respecting quoted attributes.
          // A game may legally contain a literal "<head>" in JS or text.
          const prefix = /^\s*(?:<!--[\s\S]*?-->\s*)*(?:<!doctype\s+html\b(?:[^>"']|"[^"]*"|'[^']*')*>\s*)?(?:<html(?=[\s>])(?:[^>"']|"[^"]*"|'[^']*')*>\s*)?(?:<head(?=[\s>])(?:[^>"']|"[^"]*"|'[^']*')*>)?/i.exec(value)[0];
          srcdoc.set.call(this, prefix + script + value.slice(prefix.length));
        } });
      }
      realm.addEventListener('pagehide', () => {
        observer.disconnect();
        for (const stop of activeStops) stop();
      }, { once: true });
    };

    App.callMixDesktopScreenAudio = async stream => {
      if (!available() || (!isolatedPreview && !stream?.getVideoTracks().length)) return;
      const context = new AudioContext({ latencyHint: 'interactive' });
      const branches = new Map(), original = stream.getAudioTracks();
      let stopped = false;
      const mix = {
        input(input, element) {
          const source = context.createMediaStreamSource(input);
          const gain = context.createGain();
          const volume = () => { gain.gain.value = element ? (element.muted ? 0 : element.volume) : 1; };
          volume(); element?.addEventListener('volumechange', volume);
          source.connect(gain); gain.connect(destination);
          return () => { element?.removeEventListener('volumechange', volume); source.disconnect(); gain.disconnect(); };
        },
        attach(provider) {
          if (branches.has(provider)) return;
          try { branches.set(provider, provider(mix)); }
          catch (error) { console.warn('Playback source could not join screen audio.', error.name); }
        },
        detach(provider) { branches.get(provider)?.(); branches.delete(provider); }
      };
      const destination = context.createMediaStreamDestination();
      const output = destination.stream.getAudioTracks()[0];
      const stopOutput = output.stop.bind(output);
      const systemInputs = [];
      const stop = () => {
        if (stopped) return;
        stopped = true;
        mixes.delete(mix);
        for (const provider of branches.keys()) mix.detach(provider);
        systemInputs.forEach(disconnect => disconnect());
        for (const track of original) track.stop();
        stopOutput();
        void context.close().catch(noop);
      };
      let resumeTimeout;
      try {
        await Promise.race([context.resume(), new Promise((_, reject) => {
          resumeTimeout = setTimeout(() => reject(new Error('Audio output could not start.')), 2500);
        })]);
        for (const track of original) systemInputs.push(mix.input(new MediaStream([track])));
        for (const provider of providers) mix.attach(provider);
        stream.addTrack(output);
        original.forEach(track => stream.removeTrack(track));
        output.stop = stop;
        output.addEventListener('ended', stop, { once: true });
        mixes.add(mix);
      } catch (error) {
        // Setup failed before ownership changed. Leave the checked system
        // tracks on the capture stream and release only our own resources.
        for (const provider of branches.keys()) mix.detach(provider);
        systemInputs.forEach(disconnect => disconnect());
        stopOutput();
        await context.close().catch(noop);
        console.warn('Selected playback could not join screen audio.', error.name);
      } finally { clearTimeout(resumeTimeout); }
    };
    return register;
  }
  const register = installRouting(App);
  App.callShareDocumentMedia = root => {
    if (!globalThis.chatDesktopCapture) return () => {};
    const elements = new Map();
    const playing = event => {
      const element = event.target;
      if (!(element instanceof HTMLMediaElement) || elements.has(element)) return;
      elements.set(element, App.callSharePlaybackElement(element));
    };
    root.addEventListener('play', playing, true);
    return () => { root.removeEventListener('play', playing, true); for (const remove of elements.values()) remove(); elements.clear(); };
  };

  // Chat HTML previews have opaque origins. An app-created port gives each
  // active share a one-way audio source. The child receives no app streams,
  // account objects, or native bridge, and keeps the viewer's existing CSP.
  function startPreview(install) {
    const local = {};
    install(local, true);
    local.callInstallHubPlayback(window);
    window.addEventListener('message', async event => {
      const port = event.ports[0];
      if (event.source !== parent || event.data !== 'chat-preview-audio' || !port) return;
      const stream = new MediaStream();
      let done = false;
      const stop = () => {
        done = true;
        stream.getTracks().forEach(track => track.stop());
        window.removeEventListener('pagehide', stop);
        port.close();
      };
      port.onmessage = stop;
      window.addEventListener('pagehide', stop, { once: true });
      try {
        await local.callMixDesktopScreenAudio(stream);
        if (done) { stop(); return; }
        const track = stream.getAudioTracks()[0];
        const processor = new MediaStreamTrackProcessor({ track, maxBufferSize: 2 });
        // WebCodecs frames are origin-bound. Transfer bounded PCM samples to
        // the parent, leaving this document's sandbox and origin intact.
        const pcm = processor.readable.pipeThrough(new TransformStream({ transform(frame, out) {
          try {
            const { numberOfChannels, numberOfFrames, sampleRate, timestamp } = frame;
            const data = new Float32Array(numberOfFrames * numberOfChannels);
            for (let channel = 0; channel < numberOfChannels; channel++) {
              frame.copyTo(data.subarray(channel * numberOfFrames, (channel + 1) * numberOfFrames), { planeIndex: channel, format: 'f32-planar' });
            }
            out.enqueue({ numberOfChannels, numberOfFrames, sampleRate, timestamp, data });
          } finally { frame.close(); }
        } }));
        port.postMessage(pcm, [pcm]);
      } catch (error) { console.warn('Preview audio source failed.', error.message); stop(); }
    });
  }
  App.callSandboxAudioScript = () => globalThis.chatDesktopCapture && typeof MediaStreamTrackGenerator === 'function'
    ? '<script>(' + startPreview.toString() + ')(' + installRouting.toString() + ');<\/script>' : '';
  App.callShareSandboxAudio = frame => {
    if (!globalThis.chatDesktopCapture || typeof MediaStreamTrackGenerator !== 'function') return () => {};
    let unregister;
    const ready = () => {
      unregister?.();
      unregister = register(mix => {
        const { port1, port2 } = new MessageChannel();
        const abort = new AbortController();
        let track, disconnect;
        port1.onmessage = event => {
          if (track || !(event.data instanceof ReadableStream)) return;
          track = new MediaStreamTrackGenerator({ kind: 'audio' });
          disconnect = mix.input(new MediaStream([track]));
          const frames = event.data.pipeThrough(new TransformStream({ transform(chunk, out) {
            const { numberOfChannels, numberOfFrames, sampleRate, timestamp, data } = chunk;
            if (![1, 2].includes(numberOfChannels) || !Number.isInteger(numberOfFrames) || numberOfFrames < 1 ||
              numberOfFrames > 8192 || !Number.isFinite(sampleRate) || sampleRate < 3000 || sampleRate > 192000 ||
              !Number.isSafeInteger(timestamp) || !(data instanceof Float32Array) || data.length !== numberOfFrames * numberOfChannels) {
              throw new TypeError('Invalid preview audio sample.');
            }
            out.enqueue(new AudioData({ format: 'f32-planar', numberOfChannels, numberOfFrames, sampleRate, timestamp, data }));
          } }));
          void frames.pipeTo(track.writable, { signal: abort.signal }).catch(error => {
            if (!abort.signal.aborted) console.warn('Preview audio stream stopped.', error.message);
          });
        };
        frame.contentWindow.postMessage('chat-preview-audio', '*', [port2]);
        return () => {
          port1.postMessage('stop'); port1.close(); abort.abort();
          disconnect?.(); track?.stop();
        };
      });
    };
    frame.addEventListener('load', ready);
    return () => { frame.removeEventListener('load', ready); unregister?.(); };
  };
  App.register('calling/shared-audio', function () {});
})(globalThis.ChatApp);
