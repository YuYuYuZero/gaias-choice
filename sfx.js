/*
 * sfx.js — Reusable, zero-asset sound effects for H5 games (WebAudio).
 *
 * Plain script (NO module / NO imports). Defines a global `window.SFX`.
 * Self-contained: synthesises every sound procedurally with oscillators +
 * noise, so it needs NO audio files and adds nothing to load time.
 *
 * Autoplay-safe: browsers start an AudioContext "suspended" until the first
 * user gesture. This lib lazily creates the context and auto-resumes it on the
 * first pointer/key/touch, so you can call SFX.* anytime — early calls before
 * the first gesture are silently dropped, not errors.
 *
 * Every function no-ops safely (wrapped in try/catch); a bad/absent AudioContext
 * can never crash the game.
 *
 * ---------------------------------------------------------------------------
 * API — call the named preset that matches the moment (all args optional):
 * ---------------------------------------------------------------------------
 * SFX.click()        // UI tap / button press
 * SFX.coin()         // pickup / +score / collect  (alias: SFX.pickup())
 * SFX.jump()         // jump / launch
 * SFX.hit()          // take damage / bump / collision  (alias: SFX.hurt())
 * SFX.shoot()        // fire / dash / zap
 * SFX.explode()      // explosion / big impact / break
 * SFX.powerup()      // level up / unlock / buff  (rising arpeggio)
 * SFX.win()          // victory / clear            (major fanfare)
 * SFX.lose()         // game over / fail           (descending)
 * SFX.blip()         // generic tick / move / typewriter
 * SFX.select(dir)    // menu move; dir=+1 up / -1 down (shifts pitch)
 * SFX.play(name)     // dispatch by string, e.g. SFX.play('coin')
 * SFX.tone(freq,ms,type,gain)   // low-level one-shot, e.g. SFX.tone(660,120,'square',0.2)
 * SFX.mute(true|false) / SFX.setVolume(0..1)   // master controls
 * ---------------------------------------------------------------------------
 * Phaser tip: call SFX.* right where you trigger the matching Juice.* effect,
 * e.g. on pickup:  Juice.popText(this,x,y,'+1','#ffd166'); SFX.coin();
 */
(function (root) {
  'use strict';

  var ctx = null;
  var master = null;
  var muted = false;
  var volume = 0.5;
  var resumed = false;

  // --- background music (looping <audio>) -----------------------------------
  var musicEl = null;
  var musicVol = 0.4;
  var pendingMusic = null; // src waiting for the first user gesture to autoplay

  function startMusic(src) {
    try {
      if (!musicEl) {
        musicEl = new Audio();
        musicEl.loop = true;
      }
      if (src && musicEl.src.indexOf(src) === -1) musicEl.src = src;
      musicEl.volume = muted ? 0 : musicVol;
      var p = musicEl.play();
      if (p && p.catch) p.catch(function () { pendingMusic = src || (musicEl && musicEl.src); });
    } catch (e) { pendingMusic = src; }
  }

  function ensureCtx() {
    try {
      if (ctx) return ctx;
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    } catch (e) { ctx = null; }
    return ctx;
  }

  // Resume the context on the first real user gesture (autoplay policy).
  function armResume() {
    if (resumed) return;
    resumed = true;
    var kick = function () {
      try {
        var c = ensureCtx();
        if (c && c.state === 'suspended') c.resume();
      } catch (e) {}
      // Autoplay policy: a BGM track requested before any gesture starts now.
      if (pendingMusic) { var s = pendingMusic; pendingMusic = null; startMusic(s); }
    };
    var opts = { passive: true };
    ['pointerdown', 'touchstart', 'keydown', 'mousedown', 'click'].forEach(function (ev) {
      try { root.addEventListener(ev, kick, opts); } catch (e) {}
    });
  }
  try { if (root.addEventListener) armResume(); } catch (e) {}

  function now() { return ctx ? ctx.currentTime : 0; }

  // Core one-shot voice: a single oscillator with an attack/decay envelope and
  // an optional pitch glide from `freq` to `to`.
  function voice(opts) {
    try {
      var c = ensureCtx();
      if (!c || muted) return;
      if (c.state === 'suspended') { try { c.resume(); } catch (e) {} }
      opts = opts || {};
      var t = now();
      var freq = opts.freq || 440;
      var to = opts.to || freq;
      var dur = (opts.ms || 120) / 1000;
      var type = opts.type || 'square';
      var peak = (opts.gain == null ? 0.3 : opts.gain);
      var osc = c.createOscillator();
      var g = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (to !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
      var atk = Math.min(0.012, dur * 0.3);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + atk);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(master);
      osc.start(t); osc.stop(t + dur + 0.02);
    } catch (e) {}
  }

  // Filtered noise burst — for hits, explosions, breaks.
  function noise(opts) {
    try {
      var c = ensureCtx();
      if (!c || muted) return;
      if (c.state === 'suspended') { try { c.resume(); } catch (e) {} }
      opts = opts || {};
      var dur = (opts.ms || 220) / 1000;
      var peak = (opts.gain == null ? 0.35 : opts.gain);
      var t = now();
      var len = Math.floor(c.sampleRate * dur);
      var buf = c.createBuffer(1, len, c.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1);
      var src = c.createBufferSource(); src.buffer = buf;
      var flt = c.createBiquadFilter();
      flt.type = opts.filter || 'lowpass';
      flt.frequency.setValueAtTime(opts.cutoff || 1200, t);
      if (opts.cutoffTo) flt.frequency.exponentialRampToValueAtTime(Math.max(60, opts.cutoffTo), t + dur);
      var g = c.createGain();
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(flt); flt.connect(g); g.connect(master);
      src.start(t); src.stop(t + dur + 0.02);
    } catch (e) {}
  }

  function seq(notes, step, type, gain) {
    try {
      step = step || 90;
      notes.forEach(function (f, i) {
        setTimeout(function () { voice({ freq: f, ms: step * 1.6, type: type || 'square', gain: gain == null ? 0.28 : gain }); }, i * step);
      });
    } catch (e) {}
  }

  var API = {
    tone: function (freq, ms, type, gain) { voice({ freq: freq, ms: ms, type: type, gain: gain }); },
    noise: function (ms, cutoff, gain) { noise({ ms: ms, cutoff: cutoff, gain: gain }); },

    click: function () { voice({ freq: 520, to: 380, ms: 55, type: 'square', gain: 0.22 }); },
    blip: function () { voice({ freq: 660, ms: 45, type: 'square', gain: 0.18 }); },
    coin: function () { voice({ freq: 880, to: 1320, ms: 90, type: 'square', gain: 0.25 }); setTimeout(function () { voice({ freq: 1320, ms: 90, type: 'square', gain: 0.22 }); }, 60); },
    pickup: function () { this.coin(); },
    jump: function () { voice({ freq: 320, to: 720, ms: 160, type: 'square', gain: 0.28 }); },
    hit: function () { voice({ freq: 220, to: 90, ms: 160, type: 'sawtooth', gain: 0.3 }); noise({ ms: 120, cutoff: 900, gain: 0.18 }); },
    hurt: function () { this.hit(); },
    shoot: function () { voice({ freq: 900, to: 200, ms: 120, type: 'square', gain: 0.22 }); },
    explode: function () { noise({ ms: 420, cutoff: 1800, cutoffTo: 120, filter: 'lowpass', gain: 0.4 }); voice({ freq: 120, to: 40, ms: 400, type: 'sawtooth', gain: 0.28 }); },
    powerup: function () { seq([523, 659, 784, 1047], 70, 'square', 0.26); },
    win: function () { seq([523, 659, 784, 1047, 1319], 110, 'triangle', 0.3); },
    lose: function () { seq([392, 330, 262, 196], 150, 'sawtooth', 0.26); },
    select: function (dir) { voice({ freq: dir < 0 ? 300 : 520, to: dir < 0 ? 240 : 660, ms: 60, type: 'square', gain: 0.2 }); },

    play: function (name) { try { if (typeof this[name] === 'function') this[name](); } catch (e) {} },
    mute: function (v) { muted = !!v; if (musicEl) musicEl.volume = muted ? 0 : musicVol; },
    setVolume: function (v) { volume = Math.max(0, Math.min(1, v)); if (master) master.gain.value = volume; },

    // --- background music ---
    // Loop a BGM file. Call it any time — if there's been no user gesture yet
    // (browser autoplay block), it auto-starts on the first click/keypress.
    // Example: SFX.playMusic('assets/bgm.mp3');
    playMusic: function (src, vol) { if (vol != null) musicVol = Math.max(0, Math.min(1, vol)); startMusic(src); },
    stopMusic: function () { pendingMusic = null; try { if (musicEl) { musicEl.pause(); musicEl.currentTime = 0; } } catch (e) {} },
    setMusicVolume: function (v) { musicVol = Math.max(0, Math.min(1, v)); if (musicEl && !muted) musicEl.volume = musicVol; },
    toggleMute: function () { this.mute(!muted); return muted; },

    // Optional explicit unlock (e.g. call from your Start button handler).
    unlock: function () { try { var c = ensureCtx(); if (c && c.state === 'suspended') c.resume(); } catch (e) {} if (pendingMusic) { var s = pendingMusic; pendingMusic = null; startMusic(s); } },
  };

  root.SFX = API;
})(typeof window !== 'undefined' ? window : this);
