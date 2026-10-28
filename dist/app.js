/* Looproom — a local-first audio practice player. No audio is uploaded. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const audio = $('audio');
  const canvas = $('waveform');
  const ctx = canvas.getContext('2d');
  const demo = { id: 'demo', name: 'Sunday groove', detail: 'Original demo · Guitar & keys', duration: 48, src: 'assets/sunday-groove.wav', demo: true };
  const state = { tracks: [demo], active: demo, duration: 48, a: 8, b: 24, loop: false, speed: .75, volume: .8, peaks: [], playing: false, loadId: 0, db: null, waveformStatus: 'loading', lastVolume: .8, initializing: true };
  let frame = 0, toastTimer, audioContext, dragCount = 0;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const isFiniteNumber = n => Number.isFinite(Number(n));
  const fmt = (seconds, decimal = true) => {
    const tenths = Math.round(Math.max(0, Number(seconds) || 0) * 10);
    const mins = Math.floor(tenths / 600);
    const secs = Math.floor(tenths % 600 / 10);
    return `${mins}:${String(secs).padStart(2, '0')}${decimal ? '.' + tenths % 10 : ''}`;
  };
  const parseTime = raw => {
    const value = raw.trim();
    if (!/^\d+(?::[0-5]?\d(?:\.\d+)?)?(?:\.\d+)?$/.test(value)) return NaN;
    const parts = value.split(':').map(Number);
    return parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0];
  };
  function toast(message) {
    $('toast').textContent = message;
    $('toast').classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 4200);
  }
  function saveSettings() {
    try {
      const data = { speed: state.speed, volume: state.volume, lastTrack: state.active.id, tracks: {} };
      const previous = JSON.parse(localStorage.getItem('looproom-v1') || '{}');
      data.tracks = previous.tracks || {};
      data.tracks[state.active.id] = { a: state.a, b: state.b, loop: state.loop };
      localStorage.setItem('looproom-v1', JSON.stringify(data));
    } catch (_) { /* Playback remains available without browser storage. */ }
  }
  function storedSettings() {
    try { return JSON.parse(localStorage.getItem('looproom-v1') || '{}'); } catch (_) { return {}; }
  }
  function restoreLoop() {
    const saved = storedSettings().tracks?.[state.active.id];
    const minGap = Math.min(.1, state.duration);
    if (saved && isFiniteNumber(saved.a) && isFiniteNumber(saved.b)) {
      state.a = clamp(Number(saved.a), 0, Math.max(0, state.duration - minGap));
      state.b = clamp(Number(saved.b), state.a + minGap, state.duration);
      state.loop = saved.loop === true;
    } else {
      state.a = state.active.demo ? 8 : 0;
      state.b = state.active.demo ? 24 : state.duration;
      state.loop = false;
    }
    updateLoop(false);
  }
  function renderTracks() {
    $('track-list').replaceChildren();
    $('track-count').textContent = String(state.tracks.length).padStart(2, '0');
    for (const track of state.tracks) {
      const row = document.createElement('div');
      row.className = 'track-item' + (track.id === state.active.id ? ' active' : '');
      const select = document.createElement('button');
      select.className = 'track-select';
      select.setAttribute('aria-label', `Load ${track.name}`);
      select.setAttribute('aria-current', track.id === state.active.id ? 'true' : 'false');
      const thumb = document.createElement('span');
      thumb.className = 'track-thumb';
      thumb.innerHTML = '<svg aria-hidden="true"><use href="#i-music"/></svg>';
      const text = document.createElement('span');
      text.className = 'track-text';
      const name = document.createElement('span');
      name.className = 'track-name'; name.textContent = track.name; name.title = track.name;
      const meta = document.createElement('span');
      meta.className = 'track-meta'; meta.textContent = `${track.demo ? 'DEMO' : track.extension || 'AUDIO'}  ·  ${fmt(track.duration, false)}`;
      text.append(name, meta); select.append(thumb, text);
      if (track.id === state.active.id) {
        const eq = document.createElement('span'); eq.className = 'track-equalizer'; eq.setAttribute('aria-hidden', 'true'); eq.innerHTML = '<i></i><i></i><i></i>'; select.append(eq);
      }
      select.addEventListener('click', () => { if (track.id !== state.active.id) loadTrack(track); });
      row.append(select);
      if (!track.demo) {
        const remove = document.createElement('button'); remove.className = 'icon-button remove-track';
        remove.innerHTML = '<svg aria-hidden="true"><use href="#i-trash"/></svg>';
        remove.title = `Remove ${track.name}`; remove.setAttribute('aria-label', `Remove ${track.name}`);
        remove.addEventListener('click', () => removeTrack(track)); row.append(remove);
      }
      $('track-list').append(row);
    }
  }
  function setPlaying(playing) {
    state.playing = playing;
    document.body.classList.toggle('is-playing', playing);
    $('play-btn').innerHTML = `<svg aria-hidden="true"><use href="#i-${playing ? 'pause' : 'play'}"/></svg>`;
    $('play-btn').setAttribute('aria-label', playing ? 'Pause' : 'Play');
    $('playback-status').querySelector('span').textContent = playing ? 'IN YOUR ELEMENT' : 'READY WHEN YOU ARE';
    cancelAnimationFrame(frame);
    if (playing) tick();
  }
  async function play() {
    try {
      if (audio.readyState === 0) { toast('Your track is still loading. Try play in a moment.'); return; }
      if (state.loop && (audio.currentTime < state.a || audio.currentTime >= state.b - .015)) audio.currentTime = state.a;
      else if (audio.ended) audio.currentTime = 0;
      await audio.play();
    } catch (err) {
      if (err.name !== 'AbortError') toast('This audio could not play. Try an MP3 or WAV file supported by your browser.');
    }
  }
  function togglePlay() { if (audio.paused) play(); else audio.pause(); }
  function seek(time) {
    if (!Number.isFinite(time) || !Number.isFinite(audio.duration)) return;
    let target = clamp(time, 0, state.duration);
    // Seeking remains useful outside the selected section when looping is off.
    if (state.loop) target = clamp(target, state.a, Math.max(state.a, state.b - .025));
    audio.currentTime = target; updatePosition();
  }
  function enforceLoop() {
    if (state.loop && !audio.paused && state.b > state.a && (audio.currentTime >= state.b - .012 || audio.currentTime < state.a - .06)) audio.currentTime = state.a;
  }
  function tick() {
    enforceLoop(); updatePosition();
    if (state.playing) frame = requestAnimationFrame(tick);
  }
  function updatePosition() {
    const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    $('current-time').textContent = fmt(current);
    $('playhead').style.left = `${clamp(current / state.duration * 100, 0, 100)}%`;
    canvas.setAttribute('aria-valuenow', current.toFixed(1));
    canvas.setAttribute('aria-valuetext', fmt(current));
  }
  function updateRuler() {
    $('wave-ruler').replaceChildren();
    for (let i = 0; i <= 6; i++) {
      const label = document.createElement('span'); label.className = 'ruler-label';
      label.style.left = `${i / 6 * 100}%`; label.textContent = fmt(state.duration * i / 6, false); $('wave-ruler').append(label);
    }
    $('total-time').textContent = fmt(state.duration);
    canvas.setAttribute('aria-valuemax', state.duration);
  }
  function updateLoop(persist = true) {
    const aPct = state.a / state.duration * 100, bPct = state.b / state.duration * 100;
    $('marker-a').style.left = `${aPct}%`; $('marker-b').style.left = `${bPct}%`;
    $('loop-selection').style.left = `${aPct}%`; $('loop-selection').style.width = `${bPct - aPct}%`;
    $('loop-start').value = fmt(state.a); $('loop-end').value = fmt(state.b);
    $('marker-a').setAttribute('aria-valuenow', state.a.toFixed(1)); $('marker-b').setAttribute('aria-valuenow', state.b.toFixed(1));
    $('marker-a').setAttribute('aria-valuemax', Math.max(0, state.b - .1).toFixed(1));
    $('marker-b').setAttribute('aria-valuemin', Math.min(state.duration, state.a + .1).toFixed(1));
    $('marker-b').setAttribute('aria-valuemax', state.duration);
    $('marker-a').setAttribute('aria-valuetext', fmt(state.a)); $('marker-b').setAttribute('aria-valuetext', fmt(state.b));
    $('loop-toggle').setAttribute('aria-checked', state.loop);
    $('transport-loop').setAttribute('aria-pressed', state.loop);
    $('transport-loop').setAttribute('aria-label', state.loop ? 'Disable loop' : 'Enable loop');
    $('transport-loop-label').textContent = state.loop ? 'Loop on' : 'Loop off';
    $('loop-length').textContent = `${(state.b - state.a).toFixed(1)} second section`;
    $('loop-caption').textContent = state.loop ? `ON REPEAT  ·  ${fmt(state.a)} — ${fmt(state.b)}` : 'A little repetition goes a long way.';
    document.body.classList.toggle('loop-off', !state.loop);
    drawWaveform();
    if (persist && !state.initializing) saveSettings();
  }
  function setPoint(point, value, showToast = false) {
    const gap = Math.min(.1, state.duration);
    const time = Math.round(value * 10) / 10;
    if (point === 'a') state.a = clamp(time, 0, Math.max(0, state.b - gap));
    else state.b = clamp(time, Math.min(state.duration, state.a + gap), state.duration);
    updateLoop();
    if (state.loop && state.playing) enforceLoop();
    if (showToast) toast(`${point.toUpperCase()} set to ${fmt(point === 'a' ? state.a : state.b)}`);
  }
  function toggleLoop() {
    state.loop = !state.loop; updateLoop();
    if (state.loop && !audio.paused && (audio.currentTime < state.a || audio.currentTime >= state.b)) seek(state.a);
  }
  function setSpeed(value, persist = true) {
    state.speed = Math.round(clamp(Number(value), .25, 1.5) * 100) / 100;
    audio.playbackRate = state.speed;
    audio.preservesPitch = true;
    if ('webkitPreservesPitch' in audio) audio.webkitPreservesPitch = true;
    if ('mozPreservesPitch' in audio) audio.mozPreservesPitch = true;
    $('speed').value = state.speed;
    $('speed').style.setProperty('--fill', `${(state.speed - .25) / 1.25 * 100}%`);
    $('speed').setAttribute('aria-valuetext', `${state.speed.toFixed(2)} times normal speed`);
    $('speed-value').textContent = state.speed.toFixed(2);
    document.querySelectorAll('[data-speed]').forEach(btn => {
      const selected = Number(btn.dataset.speed) === state.speed;
      btn.classList.toggle('selected', selected); btn.setAttribute('aria-pressed', selected);
    });
    if (persist && !state.initializing) saveSettings();
  }
  function setVolume(value, persist = true) {
    state.volume = clamp(Number(value), 0, 1); audio.volume = state.volume;
    audio.muted = false; $('volume').value = state.volume;
    $('volume').style.setProperty('--fill', `${state.volume * 100}%`);
    $('mute-btn').innerHTML = `<svg aria-hidden="true"><use href="#i-${state.volume > 0 ? 'volume' : 'muted'}"/></svg>`;
    $('mute-btn').setAttribute('aria-label', state.volume > 0 ? 'Mute' : 'Unmute');
    if (persist && !state.initializing) saveSettings();
  }
  async function loadTrack(track, autoplay = false) {
    saveSettings(); audio.pause();
    state.loadId++; const loadId = state.loadId;
    state.active = track; state.peaks = []; state.duration = track.duration || 1;
    state.a = 0; state.b = state.duration; state.loop = false;
    state.waveformStatus = 'loading'; $('wave-loading').textContent = 'Preparing your waveform…'; $('wave-loading').hidden = false;
    $('now-title').textContent = track.name; $('track-info').textContent = track.detail;
    renderTracks(); updateRuler(); updateLoop(false); updatePosition();
    audio.src = track.src; audio.load(); audio.playbackRate = state.speed;
    const onMetadata = () => {
      if (loadId !== state.loadId) return;
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        state.duration = audio.duration; track.duration = audio.duration;
        restoreLoop(); updateRuler(); updatePosition(); renderTracks(); saveSettings();
      }
      if (autoplay) play();
    };
    audio.addEventListener('loadedmetadata', onMetadata, { once: true });
    decodeWaveform(track, loadId);
  }
  async function decodeWaveform(track, loadId) {
    try {
      const bytes = track.file ? await track.file.arrayBuffer() : await (await fetch(track.src)).arrayBuffer();
      if (loadId !== state.loadId) return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) throw new Error('Waveform decoding is not supported');
      audioContext ||= new AudioCtx();
      const buffer = await audioContext.decodeAudioData(bytes);
      if (loadId !== state.loadId) return;
      const count = 1400, peaks = new Float32Array(count);
      for (let channel = 0; channel < Math.min(2, buffer.numberOfChannels); channel++) {
        const data = buffer.getChannelData(channel), step = Math.max(1, Math.floor(data.length / count));
        for (let i = 0; i < count; i++) {
          let max = 0; const end = Math.min(data.length, (i + 1) * step);
          for (let j = i * step; j < end; j += 3) max = Math.max(max, Math.abs(data[j]));
          peaks[i] = Math.max(peaks[i], max);
        }
      }
      state.peaks = peaks; state.waveformStatus = 'ready'; $('wave-loading').hidden = true; drawWaveform();
    } catch (_) {
      if (loadId !== state.loadId) return;
      state.waveformStatus = 'unavailable'; $('wave-loading').textContent = 'Waveform unavailable · playback controls still work'; $('wave-loading').hidden = false;
    }
  }
  function drawWaveform() {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = '#39452d'; ctx.lineWidth = .5; ctx.beginPath(); ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2); ctx.stroke();
    if (!state.peaks.length) return;
    const bars = Math.floor(width / 4), barWidth = 2;
    const max = Math.max(.01, ...state.peaks);
    for (let i = 0; i < bars; i++) {
      const from = Math.floor(i / bars * state.peaks.length), to = Math.max(from + 1, Math.floor((i + 1) / bars * state.peaks.length));
      let peak = 0; for (let j = from; j < to; j++) peak = Math.max(peak, state.peaks[j]);
      const amount = Math.pow(peak / max, .85);
      const barHeight = Math.max(2, amount * (height - 28));
      const t = i / bars * state.duration, selected = t >= state.a && t <= state.b;
      ctx.fillStyle = selected ? (state.loop ? '#c9ed85' : '#a9c770') : '#657952';
      ctx.fillRect(i * (width / bars), (height - barHeight) / 2, barWidth, barHeight);
    }
  }
  async function openDatabase() {
    if (!('indexedDB' in window)) return null;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('looproom-audio', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('tracks', { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
  }
  function dbOperation(mode, action) {
    return new Promise((resolve, reject) => {
      if (!state.db) { reject(new Error('Browser storage unavailable')); return; }
      const tx = state.db.transaction('tracks', mode), request = action(tx.objectStore('tracks'));
      tx.oncomplete = () => resolve(request.result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Storage operation aborted'));
    });
  }
  function trackFromRecord(record) {
    return { ...record, src: URL.createObjectURL(record.file), detail: `${record.extension} audio · ${(record.file.size / (1024 * 1024)).toFixed(1)} MB · On your device` };
  }
  async function importFiles(files) {
    const supportedExtension = /\.(mp3|wav|m4a|ogg|flac|aac|aiff?|opus|webm|mp4)$/i;
    const candidates = Array.from(files).filter(file => file.type.startsWith('audio/') || supportedExtension.test(file.name));
    if (!candidates.length) { toast('Choose an audio file such as MP3, WAV or M4A.'); return; }
    let added = 0, failed = 0, notSaved = 0, first;
    for (const file of candidates) {
      if (state.tracks.some(t => t.file?.name === file.name && t.file?.size === file.size && t.file?.lastModified === file.lastModified)) { toast(`${file.name} is already in your tracks.`); continue; }
      const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `track-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
      const record = { id, name: file.name.replace(/\.[^.]+$/, ''), extension: (file.name.split('.').pop() || 'AUDIO').toUpperCase(), file, duration: 0 };
      const track = trackFromRecord(record);
      try {
        track.duration = record.duration = await probeDuration(track.src);
        if (!(track.duration > 0 && Number.isFinite(track.duration))) throw new Error('Invalid duration');
      } catch (_) { failed++; URL.revokeObjectURL(track.src); continue; }
      state.tracks.push(track); first ||= track; added++; renderTracks();
      try { await dbOperation('readwrite', store => store.put(record)); } catch (_) { notSaved++; }
    }
    if (first) await loadTrack(first);
    if (added) toast(`Added ${added === 1 ? first.name : added + ' songs'}${notSaved ? '. Browser storage is full or unavailable; this song is available for this session.' : '. Ready to practise.'}${failed ? ' Some files could not be played.' : ''}`);
    else if (failed) toast('Your browser could not read this audio. Try an MP3 or WAV file.');
    $('file-input').value = '';
  }
  function probeDuration(src) {
    return new Promise((resolve, reject) => {
      const probe = new Audio(); probe.preload = 'metadata';
      const cleanup = () => { clearTimeout(timer); probe.removeAttribute('src'); probe.load(); };
      const timer = setTimeout(() => { cleanup(); reject(new Error('Audio metadata timed out')); }, 20000);
      probe.onloadedmetadata = () => { const duration = probe.duration; cleanup(); resolve(duration); };
      probe.onerror = () => { cleanup(); reject(new Error('Unsupported audio')); }; probe.src = src;
    });
  }
  async function removeTrack(track) {
    if (track.id === state.active.id) await loadTrack(demo);
    state.tracks = state.tracks.filter(t => t.id !== track.id);
    URL.revokeObjectURL(track.src); renderTracks();
    try { await dbOperation('readwrite', store => store.delete(track.id)); }
    catch (_) { toast('Removed for this session. Browser storage could not be updated.'); return; }
    toast('Removed from your tracks. Your original file is unchanged.');
  }
  function bindMarker(marker, point) {
    let dragging = false;
    marker.addEventListener('pointerdown', event => {
      event.preventDefault(); event.stopPropagation(); dragging = true; marker.setPointerCapture(event.pointerId);
    });
    marker.addEventListener('pointermove', event => {
      if (!dragging) return;
      const rect = $('wave-body').getBoundingClientRect(); setPoint(point, (event.clientX - rect.left) / rect.width * state.duration);
    });
    marker.addEventListener('pointerup', event => { dragging = false; if (marker.hasPointerCapture(event.pointerId)) marker.releasePointerCapture(event.pointerId); });
    marker.addEventListener('pointercancel', () => { dragging = false; });
    marker.addEventListener('click', event => event.stopPropagation());
    marker.addEventListener('keydown', event => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation(); const current = point === 'a' ? state.a : state.b;
        const step = event.shiftKey ? 1 : .1;
        setPoint(point, event.key === 'Home' ? 0 : event.key === 'End' ? state.duration : current + (event.key === 'ArrowLeft' ? -step : step));
      }
    });
  }
  // Player controls.
  $('play-btn').addEventListener('click', togglePlay);
  $('back-btn').addEventListener('click', () => seek(audio.currentTime - 5));
  $('forward-btn').addEventListener('click', () => seek(audio.currentTime + 5));
  $('speed').addEventListener('input', event => setSpeed(event.target.value));
  document.querySelectorAll('[data-speed]').forEach(button => button.addEventListener('click', () => setSpeed(button.dataset.speed)));
  $('reset-speed').addEventListener('click', () => setSpeed(1));
  $('volume').addEventListener('input', event => setVolume(event.target.value));
  $('mute-btn').addEventListener('click', () => {
    if (state.volume > 0) { state.lastVolume = state.volume; setVolume(0); } else setVolume(state.lastVolume || .8);
  });
  $('transport-loop').addEventListener('click', toggleLoop); $('loop-toggle').addEventListener('click', toggleLoop);
  $('set-a').addEventListener('click', () => setPoint('a', audio.currentTime, true));
  $('set-b').addEventListener('click', () => setPoint('b', audio.currentTime, true));
  $('reset-loop').addEventListener('click', () => { state.a = 0; state.b = state.duration; state.loop = false; updateLoop(); });
  $('jump-loop').addEventListener('click', () => { state.loop = true; updateLoop(); seek(state.a); play(); });
  for (const [id, point] of [['loop-start', 'a'], ['loop-end', 'b']]) {
    const commitTime = event => {
      const value = parseTime(event.target.value);
      if (!Number.isFinite(value)) { toast('Use a time like 0:12.5 or a number of seconds.'); updateLoop(false); return; }
      if (value < 0 || value > state.duration || (point === 'a' && value >= state.b) || (point === 'b' && value <= state.a)) {
        toast(`Choose ${point === 'a' ? 'a start before B' : 'an end after A'}, within the song.`); updateLoop(false); return;
      }
      setPoint(point, value);
    };
    $(id).addEventListener('change', commitTime);
    $(id).addEventListener('blur', commitTime);
    $(id).addEventListener('keydown', event => { if (event.key === 'Enter') event.target.blur(); });
  }
  $('wave-area').addEventListener('click', event => {
    if (event.target.closest('.loop-marker')) return;
    const rect = $('wave-body').getBoundingClientRect(); seek((event.clientX - rect.left) / rect.width * state.duration);
  });
  bindMarker($('marker-a'), 'a'); bindMarker($('marker-b'), 'b');
  audio.addEventListener('play', () => setPlaying(true)); audio.addEventListener('pause', () => { setPlaying(false); updatePosition(); });
  audio.addEventListener('timeupdate', () => { enforceLoop(); updatePosition(); });
  audio.addEventListener('ended', () => { if (state.loop) { audio.currentTime = state.a; play(); } else setPlaying(false); });
  audio.addEventListener('error', () => { if (audio.error) { setPlaying(false); toast('This audio format could not be played. Try an MP3 or WAV file.'); } });
  // Local file import and drag-and-drop.
  $('upload-btn').addEventListener('click', () => $('file-input').click());
  $('file-input').addEventListener('change', event => importFiles(event.target.files));
  const hasFiles = event => Array.from(event.dataTransfer?.types || []).includes('Files');
  window.addEventListener('dragenter', event => { if (hasFiles(event)) { event.preventDefault(); dragCount++; $('drop-overlay').hidden = false; } });
  window.addEventListener('dragover', event => { if (hasFiles(event)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } });
  window.addEventListener('dragleave', event => { if (hasFiles(event)) { dragCount = Math.max(0, dragCount - 1); if (!dragCount) $('drop-overlay').hidden = true; } });
  window.addEventListener('drop', event => { if (hasFiles(event)) { event.preventDefault(); dragCount = 0; $('drop-overlay').hidden = true; importFiles(event.dataTransfer.files); } });
  // Help and keyboard access.
  const openHelp = () => { if (!$('help-dialog').open) $('help-dialog').showModal(); };
  ['shortcuts-btn', 'footer-shortcuts', 'guide-btn'].forEach(id => $(id).addEventListener('click', openHelp));
  document.querySelector('.dialog-close').addEventListener('click', () => $('help-dialog').close());
  $('help-dialog').addEventListener('click', event => { if (event.target === $('help-dialog')) { const box = $('help-dialog').getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) $('help-dialog').close(); } });
  window.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.target.matches('input,textarea,select,[contenteditable]') || $('help-dialog').open) return;
    if (event.key === ' ' && event.target.closest('button,a')) return;
    if (event.key === ' ') { event.preventDefault(); togglePlay(); }
    else if (event.key.toLowerCase() === 'a') { event.preventDefault(); setPoint('a', audio.currentTime, true); }
    else if (event.key.toLowerCase() === 'b') { event.preventDefault(); setPoint('b', audio.currentTime, true); }
    else if (event.key.toLowerCase() === 'l') { event.preventDefault(); toggleLoop(); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); seek(audio.currentTime - 5); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); seek(audio.currentTime + 5); }
    else if (event.key === '-' || event.key === '_') { event.preventDefault(); setSpeed(state.speed - .05); }
    else if (event.key === '+' || event.key === '=') { event.preventDefault(); setSpeed(state.speed + .05); }
    else if (event.key === '?') { event.preventDefault(); openHelp(); }
  });
  new ResizeObserver(drawWaveform).observe($('wave-body'));
  if (document.visibilityState !== undefined) document.addEventListener('visibilitychange', () => { if (!document.hidden) updatePosition(); });
  // Restore local tracks and preferences without blocking the demo.
  async function init() {
    const saved = storedSettings();
    setSpeed(Number.isFinite(saved.speed) ? saved.speed : .75, false);
    setVolume(Number.isFinite(saved.volume) ? saved.volume : .8, false);
    restoreLoop(); renderTracks(); updateRuler(); updatePosition();
    audio.addEventListener('loadedmetadata', () => { if (state.active.demo) { state.duration = audio.duration; restoreLoop(); updateRuler(); } }, { once: true });
    decodeWaveform(demo, state.loadId);
    if (!('preservesPitch' in audio || 'webkitPreservesPitch' in audio || 'mozPreservesPitch' in audio)) {
      document.querySelector('.pitch-badge').textContent = 'Pitch varies in this browser';
    }
    try {
      state.db = await openDatabase();
      if (state.db) {
        const records = await dbOperation('readonly', store => store.getAll());
        for (const record of records) { if (record.file instanceof Blob) state.tracks.push(trackFromRecord(record)); }
        renderTracks();
        const last = state.tracks.find(track => track.id === saved.lastTrack);
        if (last && !last.demo && state.active.demo && audio.paused && !audio.currentTime) await loadTrack(last);
      }
    } catch (_) { /* A temporary player still works when storage is denied. */ }
    state.initializing = false;
  }
  init();
})();
