// page-bridge.js
// Injected into the PAGE's JS context (not the extension's isolated world).
// Has direct access to MusicKit.getInstance().
// Communicates with content-script.js via window.postMessage.

(function () {
  // Guard against re-injection on SPA navigation (Safari re-runs content scripts
  // on pushState/popstate without a full page reload, causing duplicate listeners).
  if (window.__AML_BRIDGE_INIT__) return;
  window.__AML_BRIDGE_INIT__ = true;

  const PREFIX = "AML_";

  function getMK() {
    return typeof MusicKit !== "undefined" ? MusicKit.getInstance() : null;
  }

  function extractTrack(item) {
    if (!item) return null;
    return {
      id:               item.id,
      title:            item.title,
      artistName:       item.artistName,
      albumName:        item.albumName,
      isrc:             item.isrc,
      genreNames:       item.genreNames ?? [],
      releaseDate:      item.releaseDate,
      durationInMillis: item.durationInMillis,
    };
  }

  function waitForMK(retries = 20) {
    const mk = getMK();
    if (mk) return Promise.resolve(mk);
    if (retries <= 0) return Promise.reject(new Error("MusicKit not found"));
    return new Promise(r => setTimeout(r, 500)).then(() => waitForMK(retries - 1));
  }

  // --- Audio BPM analysis ---
  // Runs here (MAIN world) so we can access the <audio> element.
  // AudioContext and source are created once and reused across tracks.
  let _audioCtx  = null;
  let _analyser  = null;
  let _bpmRafId  = null;

  function stopBPMAnalysis() {
    if (_bpmRafId) { cancelAnimationFrame(_bpmRafId); _bpmRafId = null; }
  }

  function startBPMAnalysis() {
    stopBPMAnalysis();
    const audioEl = document.querySelector("audio");
    if (!audioEl) return;
    try {
      if (!_audioCtx) {
        _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = _audioCtx.createMediaElementSource(audioEl);
        _analyser = _audioCtx.createAnalyser();
        _analyser.fftSize = 1024;
        _analyser.smoothingTimeConstant = 0.8;
        source.connect(_analyser);
        _analyser.connect(_audioCtx.destination);
      }
      if (_audioCtx.state === "suspended") _audioCtx.resume();

      const freqData  = new Float32Array(_analyser.frequencyBinCount);
      const binHz     = _audioCtx.sampleRate / _analyser.fftSize;
      const bassLo    = Math.max(1, Math.floor(60  / binHz));
      const bassHi    = Math.ceil(180 / binHz);
      const history   = [];
      const HIST_LEN  = 43; // ~1.5 s at 30 fps
      const beatTimes = [];
      let lastBeat    = 0;
      const deadline  = performance.now() + 15000;

      function tick() {
        const now = performance.now();
        if (now >= deadline) {
          const bpm = calcBPM(beatTimes);
          if (bpm) window.postMessage({ type: `${PREFIX}BPM_RESULT`, bpm }, "*");
          return;
        }
        _analyser.getFloatFrequencyData(freqData);
        let energy = 0;
        for (let i = bassLo; i <= bassHi; i++) energy += Math.pow(10, freqData[i] / 10);
        energy /= (bassHi - bassLo + 1);
        history.push(energy);
        if (history.length > HIST_LEN) history.shift();
        if (history.length >= 10) {
          const avg = history.reduce((s, v) => s + v, 0) / history.length;
          if (energy > avg * 1.35 && now - lastBeat > 250) {
            beatTimes.push(now);
            lastBeat = now;
          }
        }
        _bpmRafId = requestAnimationFrame(tick);
      }
      _bpmRafId = requestAnimationFrame(tick);
    } catch (e) {
      console.log("[AML bridge] BPM analysis error:", e.message);
    }
  }

  function calcBPM(times) {
    if (times.length < 8) return null;
    const intervals = [];
    for (let i = 1; i < times.length; i++) intervals.push(times[i] - times[i - 1]);
    const bpms = intervals.map(ms => 60000 / ms).filter(b => b >= 60 && b <= 220);
    if (bpms.length < 4) return null;
    bpms.sort((a, b) => a - b);
    const med   = bpms[Math.floor(bpms.length / 2)];
    const close = bpms.filter(b => Math.abs(b - med) <= 12);
    return Math.round(close.reduce((s, b) => s + b, 0) / close.length);
  }

  // Listen for commands from content script
  window.addEventListener("message", e => {
    if (e.source !== window || !e.data?.type?.startsWith(PREFIX)) return;
    const mk = getMK();

    switch (e.data.type) {
      case `${PREFIX}START_BPM_ANALYSIS`:
        startBPMAnalysis();
        return;
      case `${PREFIX}STOP_BPM_ANALYSIS`:
        stopBPMAnalysis();
        return;
    }

    if (!mk) return;
    switch (e.data.type) {
      case `${PREFIX}PLAY_NEXT`: {
        const songId   = e.data.id;
        const rawSong  = e.data.rawSong; // pre-fetched by content script (CORS-exempt)
        const afterIds = new Set(e.data.afterIds ?? []);
        const q        = mk.queue;

        function insertSong(song) {
          const mediaItem = new MusicKit.MediaItem(song);
          const pos  = q._position ?? 0;
          const ids  = q._itemIDs ?? [];

          // Insert AFTER the last of our already-queued tracks (FIFO order).
          // Default to pos+1 if none are found (first track we're queuing).
          let insertAt = pos + 1;
          for (let i = ids.length - 1; i > pos; i--) {
            if (afterIds.has(ids[i])) { insertAt = i + 1; break; }
          }

          q._itemIDs.splice(insertAt, 0, songId);
          q._queueItems.splice(insertAt, 0, { isAutoplay: false, item: mediaItem });
          window.postMessage({ type: `${PREFIX}PLAY_NEXT_OK`, id: songId }, "*");
        }

        if (rawSong) {
          // Content script already fetched this via api.music.apple.com (CORS-exempt in
          // isolated world). Use it directly — avoids the amp-api.music.apple.com CORS block
          // that hits mk.api.music() from the MAIN world.
          try { insertSong(rawSong); } catch (err) {
            console.error("[AML bridge] MediaItem construction failed:", err?.message ?? err);
          }
        } else {
          // Fallback: fetch via MusicKit (may hit CORS on some clients)
          const storefront = mk.storefrontId ?? "us";
          mk.api.music(`/v1/catalog/${storefront}/songs/${songId}`)
            .then(response => {
              const song = response.data.data?.[0];
              if (!song) throw new Error(`Song ${songId} not found`);
              insertSong(song);
            })
            .catch(err => console.error("[AML bridge] FAILED:", err?.message ?? err));
        }
        break;
      }

      case `${PREFIX}CLEAR_QUEUED`: {
        // Remove previously-inserted tracks from the queue when filters change.
        // Skips the currently-playing position and anything before it.
        const idsToRemove = new Set(e.data.ids ?? []);
        const q2 = mk?.queue;
        if (q2 && idsToRemove.size) {
          const pos = q2._position ?? 0;
          // Walk backwards so splice indices stay valid
          for (let i = (q2._itemIDs?.length ?? 0) - 1; i > pos; i--) {
            if (idsToRemove.has(q2._itemIDs[i])) {
              q2._itemIDs.splice(i, 1);
              q2._queueItems?.splice(i, 1);
            }
          }
        }
        break;
      }

      case `${PREFIX}GET_QUEUE`:
        window.postMessage({
          type:     `${PREFIX}QUEUE`,
          items:    mk.queue.items.map(extractTrack),
          position: mk.queue.position,
        }, "*");
        break;

      case `${PREFIX}GET_NOW_PLAYING`:
        window.postMessage({
          type:  `${PREFIX}NOW_PLAYING`,
          track: extractTrack(mk.nowPlayingItem),
        }, "*");
        break;

      case `${PREFIX}GET_TOKENS`:
        // Content script requests re-handshake after returning from background.
        window.postMessage({
          type:         `${PREFIX}TOKENS`,
          dev:          mk.developerToken,
          user:         mk.musicUserToken,
          storefront:   mk.storefrontId ?? "us",
          isAuthorized: mk.isAuthorized,
        }, "*");
        break;
    }
  });

  // Push events to content script
  waitForMK().then(mk => {
    console.log("[AML bridge] MusicKit connected");

    mk.addEventListener("nowPlayingItemDidChange", () => {
      window.postMessage({
        type:  `${PREFIX}NOW_PLAYING_CHANGED`,
        track: extractTrack(mk.nowPlayingItem),
      }, "*");
      // Also send current queue state — queueItemsDidChange doesn't fire on position advance
      window.postMessage({
        type:     `${PREFIX}QUEUE_CHANGED`,
        items:    mk.queue.items.map(extractTrack),
        position: mk.queue.position,
      }, "*");
    });

    mk.addEventListener("queueItemsDidChange", () => {
      window.postMessage({
        type:     `${PREFIX}QUEUE_CHANGED`,
        items:    mk.queue.items.map(extractTrack),
        position: mk.queue.position,
      }, "*");
    });

    // Send tokens to content script
    window.postMessage({
      type:         `${PREFIX}TOKENS`,
      dev:          mk.developerToken,
      user:         mk.musicUserToken,
      storefront:   mk.storefrontId ?? "us",
      isAuthorized: mk.isAuthorized,
    }, "*");

    // Send current state immediately
    window.postMessage({
      type:  `${PREFIX}NOW_PLAYING_CHANGED`,
      track: extractTrack(mk.nowPlayingItem),
    }, "*");

  }).catch(err => console.error("[AML bridge]", err));
})();
