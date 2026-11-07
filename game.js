(function () {
  'use strict';
  var el = {};
  ['frame', 'stage', 'kb', 'still', 'mode', 'start', 'start-overlay', 'demo-start', 'run-line', 'title-status', 'demo', 'demo-tag', 'restart', 'narrative', 'caption', 'pending-caption', 'status', 'retry', 'prepare-retry', 'choices', 'action-form', 'action', 'send', 'counter', 'writer-close', 'opening-poster', 'video-wrap', 'video', 'video-next', 'play-fallback', 'journey', 'drawer-open', 'drawer-close', 'show-evidence', 'evidence', 'chapter', 'tally', 'mute', 'progress', 'warm', 'stopfx', 'grain', 'chapter-card', 'chapter-card-text', 'corridor', 'corridor-line', 'corridor-hint', 'corridor-progress', 'corridor-door', 'paper-wrap', 'p-subject', 'p-card', 'p-card-img', 'rewrite', 'p-input', 'p-error', 'p-sign', 'paper-actions', 'replay', 'replay-log', 'replay-moon', 'replay-next', 'card', 'card-kind', 'card-title', 'card-body', 'card-stop', 'card-meta', 'card-actions'].forEach(function (id) { el[id] = document.getElementById(id); });
  var viewKey = 'gaia-choice-view:v1:' + location.pathname;
  // localStorage keeps only seen endings, fragments and the run count — never progress.
  var metaKey = 'gaia-choice-meta:v1';
  // The current run's key log lives in sessionStorage so the final replay survives a reload of this tab.
  var runKey = 'gaia-choice-run:v1:' + location.pathname;
  // Game-owned configuration: a platform interactive.js refresh must not reset
  // these choices. This is an in-memory LRU, not permanent storage: the byte
  // budget may evict large clips before maxEntries is reached. History remains
  // on the server and an evicted clip is reloaded by GET, never regenerated.
  var PLAYER_CONFIG = {
    media: { maxEntries: 16, maxBytes: 96 * 1024 * 1024, maxVideoBytes: 32 * 1024 * 1024, downloadTimeoutMs: 120000, readIdleTimeoutMs: 30000 },
    decodeTimeoutMs: 30000, playTimeoutMs: 15000, stallTimeoutMs: 15000
  };
  // Chapter stills are optional; missing ones fall back to the opening frame under the chapter's colour grade.
  var STILLS = { spring: 'assets/opening.webp', duan: 'assets/story/shore.png', tu: 'assets/story/desert.png', yue: 'assets/story/room.png', zhong: 'assets/story/rain.png', bright: 'assets/story/empty.png', room: 'assets/story/room.png', card: null };
  var CHAPTERS = { spring: '一 · 春', duan: '二 · 断', tu: '三 · 途', yue: '四 · 月', zhong: '尾声 · 种', bright: '四 · 月' };
  var DECISIONS = [
    null,
    { a: '替她按下本周提问', b: '关掉终端', fragment: '一段没发出去的录音', stop: '终端黑了。', fx: 'black' },
    { a: '不开门', b: '开门', fragment: '一句「天梯还在」', stop: '灯灭了。', fx: 'lightsout' },
    { a: '拿走滤水器', b: '救人', fragment: '一张手绘的天梯路线', stop: '沙盖住了脚印。', fx: 'sand' },
    { a: '查母亲的账号', b: '查全部历史回复', fragment: '3421 问、22 答的档案页', stop: '屏幕不再滚动。', fx: 'terminal' },
    { a: '亲手拔下老铁的核心', b: '放弃上去', fragment: '老铁被删掉的记忆', stop: '老铁不动了。', fx: 'freeze' }
  ];
  var DAYS = [1, 1, 9, 1463, 1468, 1470, 1471];
  var FINAL = {
    keep: '保留「人类」，签字。',
    refuse: '拒绝签字。',
    rewrite: '划掉「人类」，键入 GAIA 被系统拒绝，贴上母亲的身份卡，把主体改成「地球生物圈（GAIA）」，签字。'
  };
  var ENDINGS = {
    done: { title: '施工完成', line: '极亮。极静。没有人。', still: 'bright' },
    wait: { title: '我等了很久', line: '投影重复着旧话，调水工程继续。汤一直是热的。', still: 'room' },
    rise: { title: '起', line: '月球裂开。第一场雨落回地面。月亮缺了一块。', still: 'zhong' },
    stay: { title: '留在天梯脚下', line: '沙慢慢盖住脚印。', still: 'tu' },
    road: { title: '停在路上', line: '鞋停在沙里。', still: 'tu' }
  };
  var sdk = window.YorollInteractive && window.YorollInteractive.create({ onStatus: onStatus, media: PLAYER_CONFIG.media });
  var demo = false, videoMode = false, busy = false, gesture = false;
  var storyboardPlaying = false;
  var storyboard = window.GaiaStoryboard && window.GaiaStoryboard.create({stage: el.stage, onCaption: function(text) { el.caption.textContent = text; }, onState: function(state) { storyboardPlaying = !state.finished; controls(); }});
  function storyboardKey(node) { var c = classify(actionOf(node)); return !node.parent_id ? 'opening' : c.final || (c.d ? String(c.d) + c.side : 'opening'); }
  var nodes = [], jobs = [], selected = null, activeVideo = el.video, visibleJob = null;
  var retryMediaJob = null, retryFrameJob = null, preparedNodes = Object.create(null);
  var previousVisibleJobId = null, playbackTime = 0, viewGeneration = 0;
  var preloadController = null;
  var player = sdk && typeof sdk.createVideoPlayer === 'function' ? sdk.createVideoPlayer({
    videos: [el.video, el['video-next']], onError: onPlaybackError,
    decodeTimeoutMs: PLAYER_CONFIG.decodeTimeoutMs, playTimeoutMs: PLAYER_CONFIG.playTimeoutMs, stallTimeoutMs: PLAYER_CONFIG.stallTimeoutMs
  }) : null;
  function read(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; } }
  function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* The SDK separately blocks paid actions when receipts cannot be saved. */ } }
  function terminal(job) { return job && ['complete', 'failed', 'uncertain'].indexOf(job.status) >= 0; }
  function state() { return sdk ? sdk.getState() : { access: null, nodes: [], jobs: [], pending: null }; }
  function absorb() { var saved = state(); nodes = saved.nodes; jobs = saved.jobs; }
  function status(text, tone) {
    el.status.textContent = text; el.status.dataset.tone = tone || 'normal';
    el['title-status'].textContent = text; el['title-status'].dataset.tone = tone || 'normal';
  }
  function onStatus(event) {
    var labels = { starting: '正在连接实时互动服务……', restoring: '正在恢复这一程，不会重复提交行动……', generating: '正在生成下一幕，当前画面会保留。', video_queued: '下一幕已排队，当前画面会保留。', video_generating: '正在生成下一段影像，请稍候。', uncertain: '生成结果尚未确认，已保留原请求。' };
    if (labels[event.code]) status(labels[event.code], 'busy');
  }

  /* ---------- Persistent meta (endings, fragments, runs) and the current run's key log ---------- */
  function meta() { var m = read(metaKey) || {}; return { runs: Math.max(0, m.runs | 0), endings: Array.isArray(m.endings) ? m.endings : [], fragments: Array.isArray(m.fragments) ? m.fragments : [] }; }
  function remember(field, value) { var m = meta(); if (m[field].indexOf(value) < 0) { m[field].push(value); write(metaKey, m); } }
  function loadRun() { try { var r = JSON.parse(sessionStorage.getItem(runKey) || 'null'); if (r && Array.isArray(r.log)) return r; } catch (_) { /* fresh run */ } return { count: 0, log: [], sampled: false, adShown: false }; }
  var run = loadRun();
  function saveRun() { try { sessionStorage.setItem(runKey, JSON.stringify(run)); } catch (_) { /* replay then covers this page only */ } }
  function newRun() {
    var m = meta(); m.runs += 1; write(metaKey, m);
    run = { count: 0, log: [], sampled: false, adShown: false }; saveRun(); renderTally();
  }
  function renderTally() {
    el.tally.textContent = run.sampled ? '采样 100%' : '提问 ' + String(Math.min(9999, run.count)).padStart(4, '0');
    el.tally.classList.add('bump'); clearTimeout(renderTally.t); renderTally.t = setTimeout(function () { el.tally.classList.remove('bump'); }, 260);
  }
  function logKey(key, label) {
    run.count += 1;
    if (run.log.length < 400) run.log.push({ day: storyDay(selected), key: String(key).slice(0, 8), label: String(label).slice(0, 40) });
    saveRun(); renderTally();
  }
  function titleLine() {
    var m = meta();
    el['run-line'].textContent = m.runs >= 1 ? '第 ' + (m.runs + 1) + ' 次进入' : '母亲被征召上月球那年，她十四岁。';
  }

  /* ---------- Story structure derived from the confirmed nodes (no invented narrative) ---------- */
  function classify(action) {
    action = String(action || '').trim();
    if (action.indexOf('划掉「人类」') === 0) return { d: 6, side: 'R', final: 'rewrite' };
    if (action.indexOf('保留「人类」') === 0) return { d: 6, side: 'A', final: 'keep' };
    if (action === '拒绝签字' || action === FINAL.refuse) return { d: 6, side: 'B', final: 'refuse' };
    for (var d = 1; d <= 5; d++) {
      if (action === DECISIONS[d].a) return { d: d, side: 'A' };
      if (action === DECISIONS[d].b) return { d: d, side: 'B' };
    }
    return { d: 0, side: 'free' };
  }
  function jobFor(node) { return node && jobs.find(function (job) { return job.node && job.node.id === node.id; }); }
  function actionOf(node) { if (!node) return ''; if (typeof node.action === 'string') return node.action; var job = jobFor(node); return job && job.kind !== 'opening' && typeof job.action === 'string' ? job.action : ''; }
  function parentOf(node) { return node && node.parent_id ? nodes.find(function (item) { return item.id === node.parent_id; }) || null : null; }
  function offered(node) {
    var list = (node && node.choices || []).map(function (c) { return String(c).trim(); });
    for (var d = 1; d <= 5; d++) if (list.indexOf(DECISIONS[d].a) >= 0 || list.indexOf(DECISIONS[d].b) >= 0) return d;
    return list.some(function (c) { return c.indexOf('签字') >= 0; }) ? 6 : 0;
  }
  var stepCache = Object.create(null);
  function stepOf(node, depth) {
    if (!node) return 1;
    if (stepCache[node.id]) return stepCache[node.id];
    var step;
    if (!node.parent_id) step = 1;
    else {
      var shown = offered(node), c = classify(actionOf(node)), before = (depth || 0) > 30 ? 1 : stepOf(parentOf(node), (depth || 0) + 1);
      if (shown) step = shown;
      else if (c.side === 'B' && c.d && c.d < 6) step = c.d;
      else if (c.side === 'A' && c.d) step = Math.min(6, c.d + 1);
      else step = before;
    }
    stepCache[node.id] = step; return step;
  }
  function currentStep() { return selected ? stepOf(selected) : 1; }
  function storyDay(node) {
    var step = stepOf(node), day = DAYS[step] || 1;
    if (step >= 4) for (var cur = node; cur; cur = parentOf(cur)) {
      if (actionOf(cur) === DECISIONS[3].b) { day++; break; }
    }
    return day;
  }
  // The room with the authorization form: the node reached by pulling the core (or one offering the signature).
  function isRoom(node) {
    if (!node || node.ending !== 'none') return false;
    var c = classify(actionOf(node));
    return offered(node) === 6 || (c.d === 5 && c.side === 'A');
  }
  function branchOf(node) { var c = classify(actionOf(node)); return c.side === 'B' && c.d >= 1 && c.d <= 5 ? c.d : 0; }
  function pressedQuestion(node) {
    for (var cur = node, guard = 0; cur && guard < 40; cur = parentOf(cur), guard++) if (actionOf(cur) === DECISIONS[1].a) return true;
    return false;
  }
  function endingOf(node) {
    if (!node || node.ending === 'none' || !node.ending) return null;
    var c = classify(actionOf(node));
    if (c.d === 5 && c.side === 'B') return 'stay';
    if (branchOf(node)) return null;
    if (c.final === 'rewrite') return 'rise';
    if (c.final === 'keep') return 'done';
    if (c.final === 'refuse') return 'wait';
    if (node.ending === 'win') return 'rise';
    var health = Number(node.state && node.state.health);
    if (Number.isFinite(health) && health <= 0) return 'road';
    return stepOf(node) >= 6 ? 'wait' : 'road';
  }
  function chapterOf(node) {
    var end = endingOf(node);
    if (end === 'rise') return 'zhong';
    if (end === 'done') return 'bright';
    var step = stepOf(node);
    return step >= 6 ? 'yue' : step >= 3 ? 'tu' : step === 2 ? 'duan' : 'spring';
  }

  /* ---------- Sound: realtime WebAudio beds and effects, no audio files ---------- */
  var Sound = (function () {
    var ctx = null, master = null, muted = false, bed = null, noise = null;
    function init() {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(function () {}); return; }
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      try { ctx = new AC(); } catch (_) { ctx = null; return; }
      master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      var data = noise.getChannelData(0); for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      if (pendingBed) setBed(pendingBed);
    }
    var pendingBed = null;
    function noiseSource() { var s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; return s; }
    function osc(type, freq) { var o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; return o; }
    function stopBed() {
      if (!bed) return;
      var old = bed; bed = null;
      old.timers.forEach(clearInterval);
      try { old.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.6); } catch (_) { /* closed context */ }
      setTimeout(function () { old.sources.forEach(function (s) { try { s.stop(); } catch (_) { /* already stopped */ } }); old.gain.disconnect(); }, 3000);
    }
    function setBed(name) {
      pendingBed = name;
      if (!ctx || (bed && bed.name === name)) return;
      stopBed();
      var g = ctx.createGain(); g.gain.value = 0; g.connect(master);
      var b = { name: name, gain: g, sources: [], timers: [] }, t = ctx.currentTime;
      function lfo(rate, depth, param) { var l = osc('sine', rate), lg = ctx.createGain(); lg.gain.value = depth; l.connect(lg); lg.connect(param); l.start(); b.sources.push(l); }
      if (name === 'spring') {
        var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 800; lp.connect(g);
        [220, 277.18, 329.63, 110].forEach(function (f, i) { var o = osc(i === 3 ? 'sine' : 'triangle', f), og = ctx.createGain(); og.gain.value = i === 3 ? 0.08 : 0.045; o.detune.value = (i - 1) * 6; o.connect(og); og.connect(lp); o.start(); b.sources.push(o); });
        lfo(0.08, 260, lp.frequency); g.gain.setTargetAtTime(0.55, t, 1.5);
      } else if (name === 'duan') {
        var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 0.8; bp.connect(g);
        var n = noiseSource(); n.connect(bp); n.start(); b.sources.push(n); lfo(0.06, 320, bp.frequency); g.gain.setTargetAtTime(0.42, t, 1.5);
      } else if (name === 'tu') {
        var lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 900; lp2.connect(g);
        var n2 = noiseSource(); n2.connect(lp2); n2.start(); b.sources.push(n2);
        var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4000; var hg = ctx.createGain(); hg.gain.value = 0.12; hp.connect(hg); hg.connect(g);
        var n3 = noiseSource(); n3.connect(hp); n3.start(); b.sources.push(n3);
        lfo(0.13, 500, lp2.frequency); g.gain.setTargetAtTime(0.5, t, 1.5);
      } else if (name === 'yue' || name === 'bright') {
        var s1 = osc('sine', name === 'bright' ? 880 : 196), s1g = ctx.createGain(); s1g.gain.value = name === 'bright' ? 0.025 : 0.06; s1.connect(s1g); s1g.connect(g); s1.start(); b.sources.push(s1);
        if (name === 'yue') b.timers.push(setInterval(function () { heart(0); setTimeout(function () { heart(1); }, 230); }, 1150));
        g.gain.setTargetAtTime(0.6, t, 1.5);
      } else if (name === 'zhong') {
        var hp2 = ctx.createBiquadFilter(); hp2.type = 'highpass'; hp2.frequency.value = 2200; hp2.connect(g);
        var n4 = noiseSource(); n4.connect(hp2); n4.start(); b.sources.push(n4);
        b.timers.push(setInterval(function () { if (Math.random() < 0.6) drop(0.3 + Math.random() * 0.4); }, 420));
        g.gain.setTargetAtTime(0.3, t, 2);
      }
      bed = b;
    }
    function env(node, peak, attack, decay) { var t = ctx.currentTime; node.gain.setValueAtTime(0.0001, t); node.gain.exponentialRampToValueAtTime(peak, t + attack); node.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay); }
    function heart(second) {
      if (!ctx) return;
      var o = osc('sine', second ? 48 : 55), g = ctx.createGain(); o.connect(g); g.connect(master); env(g, second ? 0.35 : 0.5, 0.01, 0.18); o.start(); o.stop(ctx.currentTime + 0.3);
    }
    function drop(level) {
      if (!ctx) return;
      var o = osc('sine', 1400 + Math.random() * 600), g = ctx.createGain(); o.frequency.exponentialRampToValueAtTime(380, ctx.currentTime + 0.12);
      o.connect(g); g.connect(master); env(g, 0.12 * (level || 1), 0.005, 0.16); o.start(); o.stop(ctx.currentTime + 0.25);
    }
    function click() {
      if (!ctx) return;
      var o = osc('square', 1800), g = ctx.createGain(), f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1200;
      o.connect(f); f.connect(g); g.connect(master); env(g, 0.05, 0.002, 0.04); o.start(); o.stop(ctx.currentTime + 0.08);
    }
    function step() {
      if (!ctx) return;
      var n = noiseSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'lowpass'; f.frequency.value = 420;
      n.connect(f); f.connect(g); g.connect(master); env(g, 0.5, 0.008, 0.14); n.start(); n.stop(ctx.currentTime + 0.25);
    }
    function breath() {
      if (!ctx) return;
      var n = noiseSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.6;
      n.connect(f); f.connect(g); g.connect(master); env(g, 0.09, 0.7, 1.1); n.start(); n.stop(ctx.currentTime + 2);
    }
    function error() {
      if (!ctx) return;
      var o = osc('square', 140), g = ctx.createGain(); o.connect(g); g.connect(master); env(g, 0.08, 0.005, 0.35); o.start(); o.stop(ctx.currentTime + 0.4);
    }
    function stamp() {
      if (!ctx) return;
      var o = osc('sine', 90), g = ctx.createGain(); o.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.2); o.connect(g); g.connect(master); env(g, 0.6, 0.004, 0.25); o.start(); o.stop(ctx.currentTime + 0.3);
    }
    function setMuted(value) { muted = value; if (master) master.gain.setTargetAtTime(muted ? 0 : 0.8, ctx.currentTime, 0.05); }
    return { init: init, setBed: setBed, click: click, step: step, breath: breath, drop: drop, error: error, stamp: stamp, setMuted: setMuted, get muted() { return muted; } };
  })();
  function toggleMute() {
    Sound.init(); Sound.setMuted(!Sound.muted);
    el.mute.setAttribute('aria-pressed', String(Sound.muted)); el.mute.textContent = Sound.muted ? '静' : '声';
  }

  /* ---------- Film grain ---------- */
  (function grain() {
    var canvas = el.grain, ctx = canvas.getContext('2d'), w = 384, h = 216, frame = 0;
    canvas.width = w; canvas.height = h;
    var image = ctx.createImageData(w, h);
    function draw() {
      requestAnimationFrame(draw);
      if (document.hidden || (frame++ & 1)) return;
      var d = image.data;
      for (var i = 0; i < d.length; i += 4) { var v = (Math.random() * 255) | 0; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
      ctx.putImageData(image, 0, 0);
    }
    if (ctx) requestAnimationFrame(draw);
  })();

  /* ---------- Chapter colour scale, stills, progress ---------- */
  var chapterNow = null, gate = 0;
  function setStill(key) {
    var src = STILLS[key] || STILLS.spring;
    if (el.still.getAttribute('src') === src) return;
    el.still.classList.add('fading');
    setTimeout(function () {
      el.still.onerror = function () { el.still.onerror = null; el.still.src = STILLS.spring; };
      el.still.src = src; el.still.classList.remove('fading');
    }, 700);
  }
  function applyChapter(ch, announce) {
    var changed = ch !== chapterNow;
    chapterNow = ch;
    el.frame.dataset.ch = ch; el.chapter.textContent = CHAPTERS[ch] || CHAPTERS.spring;
    Sound.setBed(ch);
    setStill(ch === 'bright' ? 'bright' : ch);
    if (changed && announce) {
      hold();
      el['chapter-card-text'].textContent = CHAPTERS[ch];
      el['chapter-card'].hidden = false;
      var card = el['chapter-card']; card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
      setTimeout(function () { el['chapter-card'].hidden = true; release(); }, 2700);
    }
  }
  function setProgress(node) {
    var end = endingOf(node), step = stepOf(node);
    el.progress.style.width = (end ? 100 : Math.round((step - 1) / 6 * 100)) + '%';
  }
  function hold() { gate++; }
  function release() { gate = Math.max(0, gate - 1); if (!gate) playCurrent(); }

  /* ---------- Live interaction (template flow) ---------- */
  function hasPending() {
    var saved = state();
    return !demo && !(saved.access && saved.access.expired) && Boolean(saved.pending || saved.jobs.some(function (job) { return !terminal(job); }));
  }
  function canAct() { return Boolean(selected && selected.ending === 'none' && !(demo && storyboardPlaying) && !busy && !hasPending() && !(state().access && state().access.expired) && (demo || !videoMode || !retryMediaJob && preparedNodes[selected.id] && visibleJob && visibleJob.node.id === selected.id)); }
  function controls() {
    el.choices.hidden = demo && storyboardPlaying;
    var pending = hasPending(), allowed = canAct(), expired = state().access && state().access.expired;
    el.action.disabled = !allowed; el.send.disabled = !allowed;
    el.start.disabled = busy || pending;
    el['demo-start'].disabled = busy || pending;
    el['demo-start'].hidden = !sdk || !sdk.configured;
    el['start-overlay'].hidden = busy || pending || Boolean(selected && (demo || !videoMode || visibleJob || !canOpen()));
    el.start.textContent = !sdk || !sdk.configured ? '▶ 开始故事' : selected && videoMode ? state().opening_error ? '▶ 重试开场' : '▶ 播放开场' : '▶ 开始';
    el.demo.disabled = busy || pending;
    el.demo.textContent = demo ? (!sdk || !sdk.configured ? '返回标题' : '回到实时影像') : '离线演示';
    el.restart.disabled = busy || pending;
    el.restart.hidden = !selected && !expired;
    el['show-evidence'].hidden = demo || !videoMode || !sdk || typeof sdk.getEvidence !== 'function';
    el.retry.hidden = demo || !pending && !retryMediaJob;
    el.retry.disabled = busy;
    el.retry.textContent = retryMediaJob ? '重试视频加载' : '查询原请求';
    el['prepare-retry'].hidden = demo || !retryFrameJob;
    el['prepare-retry'].disabled = busy || pending;
    el['demo-tag'].hidden = true;
    Array.prototype.forEach.call(el.choices.querySelectorAll('button[data-live]'), function (button) { button.disabled = !allowed; });
    Array.prototype.forEach.call(el['paper-actions'].querySelectorAll('button[data-live]'), function (button) { button.disabled = !allowed; });
    if (!allowed && !el['action-form'].hidden && document.activeElement !== el.action) el['action-form'].hidden = true;
  }
  function setBusy(value) { busy = value; controls(); }
  function shortCaption(text) { text = String(text || '').replace(/\s+/g, ' ').trim(); return text.length > 70 ? text.slice(0, 69) + '…' : text; }
  function closeDrawer() { if (el.journey.open) el.journey.close(); el['drawer-open'].setAttribute('aria-expanded', 'false'); }
  function addChoice(index, label, handler, opts) {
    var button = document.createElement('button'), k = document.createElement('span'), t = document.createElement('span');
    button.type = 'button'; button.className = 'choice' + (opts && opts.alt ? ' alt' : '');
    k.className = 'k'; k.textContent = String(index); t.className = 't'; t.textContent = label;
    if (opts && opts.live) button.dataset.live = 'true';
    button.append(t, k);
    button.addEventListener('click', function (event) { gesture = true; Sound.init(); Sound.click(); if (event.detail) logKey('点', label); handler(); });
    el.choices.appendChild(button);
  }
  function renderChoices(node) {
    el.choices.replaceChildren();
    if (node.ending !== 'none') { addChoice(1, '继续', function () { if (clipWaiter) clipWaiter.fire(); }); return; }
    if (isRoom(node)) {
      addChoice(1, corridorDone[node.id] ? '看那张纸' : '往前走', function () { if (!corridorDone[node.id]) startCorridor(node); else openPaper(); });
      return;
    }
    (node.choices || []).slice(0, 2).forEach(function (choice, index) { addChoice(index + 1, choice, function () { send(choice); }, { live: true }); });
    if (!demo || !storyboard) addChoice((node.choices || []).slice(0, 2).length + 1, '或者，写下她会做的事', openWriter, { live: true, alt: true });
  }
  function renderNode(node) {
    if (!node) return;
    selected = node; write(viewKey, { mode: demo ? 'demo' : 'live', selected: node.id });
    el.narrative.textContent = node.narrative;
    el.caption.textContent = shortCaption(node.narrative);
    el['pending-caption'].hidden = true;
    el['action-form'].hidden = true;
    renderChoices(node); setProgress(node); controls();
  }
  function applyAccess(access) {
    videoMode = Boolean(access && access.capabilities && access.capabilities.video); demo = false;
    el.mode.textContent = videoMode ? '' : '文字模式 · 本次未开启影像';
    var poster = access && access.opening_frame;
    if (typeof poster === 'string') {
      try {
        var url = new URL(poster, location.href);
        if (url.protocol === 'https:' || url.protocol === 'http:' && url.origin === location.origin || /^data:image\/(?:jpeg|png|webp);base64,/i.test(poster)) {
          el['opening-poster'].src = poster; el['opening-poster'].hidden = false;
        }
      } catch (_) { /* Untrusted poster values never enter the document. */ }
    }
  }
  function canOpen() { return videoMode && nodes.length === 1 && !jobs.some(function (job) { return job.kind === 'opening' || job.node && job.node.id === nodes[0].id; }); }
  function onPlaybackError(error) {
    if (!visibleJob || error.code === 'video_cancelled') return;
    if (error.code === 'video_autoplay_blocked') { el['play-fallback'].hidden = false; return; }
    retryMediaJob = visibleJob; delete preparedNodes[visibleJob.node.id];
    status(sdk.errorMessage(error) + ' 可重试加载已有影像。', 'error'); controls();
  }
  function playCurrent() {
    if (!visibleJob || demo || gate > 0) return;
    if (!gesture) { el['play-fallback'].hidden = false; return; }
    var playing;
    try { playing = player.play(); }
    catch (_) { el['play-fallback'].hidden = false; return; }
    if (playing && typeof playing.then === 'function') playing.then(function () { el['play-fallback'].hidden = true; }, function (error) { if (!error || error.code !== 'video_cancelled') el['play-fallback'].hidden = false; });
    else el['play-fallback'].hidden = false;
  }
  async function prepareClip(job, retry) {
    var viewTicket = ++viewGeneration;
    retryMediaJob = null; retryFrameJob = null;
    if (preloadController) preloadController.abort();
    var handle;
    try {
      if (!player) throw { code: 'video_load_failed' };
      handle = await player.prepare(job.id, { retry: Boolean(retry) });
      if (!handle.media || handle.media.node_id !== job.node.id || typeof handle.media.url !== 'string' || !handle.media.url.startsWith('blob:')) throw { code: 'video_load_failed' };
    } catch (error) {
      if (error.code === 'video_cancelled') return false;
      retryMediaJob = job; controls();
      status(sdk.errorMessage(error) + ' 当前画面已保留，重试只加载已有影像。', 'error');
      return false;
    }
    // Only a decoded clip can replace the visible scene. Text-only updates never clear it.
    var target;
    try { target = player.commit(handle); } catch (error) { if (error.code !== 'video_cancelled') showError(error); return false; }
    if (!visibleJob || visibleJob.id !== job.id) previousVisibleJobId = visibleJob && visibleJob.id || null;
    activeVideo = target; visibleJob = job;
    playbackTime = Number(activeVideo.currentTime) || 0;
    activeVideo.hidden = false; el['video-wrap'].hidden = false; el['opening-poster'].hidden = true;
    renderNode(job.node); sceneShown(job.node); playCurrent();
    // Playback does not wait for the separate tail decoder and frame upload.
    // Only the NEXT paid action waits for an acknowledged continuation frame.
    status('这一段可以播放，正在准备下一幕的连续画面……', 'busy');
    var frameError = null;
    if (job.node.ending === 'none') {
      try { await sdk.prepareNextFrame(job.id); }
      catch (error) { frameError = error; }
    }
    if (viewTicket !== viewGeneration || !visibleJob || visibleJob.id !== job.id || frameError && frameError.code === 'video_cancelled') return false;
    if (frameError) { delete preparedNodes[job.node.id]; retryFrameJob = job; }
    else preparedNodes[job.node.id] = true;
    // A playback failure may have arrived while the continuation upload was in
    // flight. Its recovery state must not be overwritten by a successful upload.
    if (retryMediaJob && retryMediaJob.id === job.id) { controls(); return false; }
    if (retryFrameJob) status('这一段可以播放，但连续画面尚未保存。请重试画面准备后再行动，不会重新生成。', 'error');
    else status(job.node.ending === 'none' ? '选择，或写下她会做的事。' : '');
    // Only preload one known, completed child in story order. No speculative
    // generation or downloads of the whole branch tree.
    var nextJob = jobs.find(function (item) { return item.status === 'complete' && item.parent_id === job.node.id && item.id !== job.id; });
    if (nextJob && typeof sdk.preloadVideos === 'function') {
      preloadController = new AbortController();
      sdk.preloadVideos([nextJob.id], { signal: preloadController.signal }).catch(function () { /* Foreground loading reports errors and owns explicit retry. */ });
    }
    controls(); return true;
  }
  function displayJob(job) {
    absorb();
    if (!videoMode && job.node && terminal(job)) { renderNode(job.node); sceneShown(job.node); }
    else if (job.node && !terminal(job)) {
      el['pending-caption'].textContent = '下一幕准备中 · ' + shortCaption(job.node.narrative);
      el['pending-caption'].hidden = false;
    }
    controls();
  }
  async function watch(job) {
    displayJob(job);
    if (!terminal(job)) job = await sdk.wait(job.id, { onUpdate: displayJob });
    displayJob(job);
    if (job.status === 'complete') {
      if (videoMode && job.node) await prepareClip(job);
      else status('选择，或写下她会做的事。');
    } else {
      el['pending-caption'].hidden = true;
      status(videoMode ? '这一段影像未能完成，上一幕已保留。可以换一种做法再试。' : sdk.errorMessage(job.error), 'error');
    }
  }
  function showError(error) {
    status(!sdk || !sdk.configured ? '此页面尚未连接实时互动服务，请在游戏预览中打开。' : sdk.errorMessage(error), 'error'); controls();
  }
  async function restoreView(allowOpening) {
    absorb(); stepCache = Object.create(null);
    var view = read(viewKey), target = nodes.find(function (node) { return view && view.mode === 'live' && node.id === view.selected; }) || nodes[nodes.length - 1];
    if (videoMode) {
      var targetJob = jobFor(target);
      if (!targetJob || targetJob.status !== 'complete') targetJob = jobs.filter(function (job) { return job.status === 'complete' && job.node; }).slice(-1)[0];
      if (targetJob) await prepareClip(targetJob);
      else if (nodes[0]) renderNode(nodes[0]);
    } else if (target) { renderNode(target); sceneShown(target); }
    var pending = state().pending;
    var unfinished = jobs.find(function (job) { return pending ? job.id === pending.request_id : !terminal(job); });
    if (unfinished && !terminal(unfinished)) await watch(unfinished);
    else if (pending) status('上一次行动的回执尚未确认。请查询原请求，不要重复提交。', 'error');
    else if (canOpen()) {
      if (allowOpening) { status('正在生成开场影像……', 'busy'); await watch(await sdk.opening()); }
      else if (state().opening_error) status(sdk.errorMessage({ code: state().opening_error }), 'error');
      else status('这一程已恢复。点击“播放开场”。');
    } else if (!videoMode) status('已连接。选择，或写下她会做的事。');
    else if (!visibleJob) status('当前还没有可播放的影像。可查询已有请求，或重新开始。', 'error');
  }
  async function startLive() {
    if (busy || hasPending()) return;
    gesture = true; Sound.init();
    if (!sdk || !sdk.configured) { startDemo(); return; }
    if (!selected) { newRun(); logKey('开始', '开始'); }
    setBusy(true);
    try { applyAccess(await sdk.start()); await restoreView(true); }
    catch (error) { showError(error); }
    finally { setBusy(false); }
  }
  async function send(action) {
    if (!canAct()) return;
    action = String(action || '').trim(); if (!action) { el.action.focus(); return; }
    gesture = true; setBusy(true); closeCard(); el['action-form'].hidden = true;
    try {
      if (demo) {
        var node = demoTurn(selected, action); nodes.push(node);
        status('', 'busy');
        await new Promise(function (resolve) { setTimeout(resolve, 600); });
        hideDemoClip(); renderNode(node); sceneShown(node);
        status('');
      } else {
        status('正在生成下一幕，当前画面会保留。', 'busy');
        // prepareNextFrame already saved the exact parent tail frame; never capture the visible playback position.
        await watch(await sdk.act(selected.id, action));
      }
      el.action.value = ''; el.counter.textContent = '0/120';
    } catch (error) { showError(error); }
    finally { setBusy(false); }
  }
  async function navigate(node) {
    if (busy || hasPending() || !node) return;
    gesture = true; closeDrawer(); closeCard();
    if (demo || !videoMode) { renderNode(node); sceneShown(node); if (demo && !node.parent_id) playDemoClip(); else hideDemoClip(); status('从这里换一种做法，原来那条路仍然在。'); return; }
    var job = jobFor(node);
    if (!job || job.status !== 'complete') { status('那一幕的影像尚未就绪，当前画面保持不变。', 'error'); return; }
    setBusy(true);
    try { if (await prepareClip(job) && !retryFrameJob) status('回到了抉择前。原来那条路仍然在。'); }
    finally { setBusy(false); }
  }

  /* ---------- Scene reveal: chapter cards, fragments, terminal, corridor, endings ---------- */
  var clipWaiter = null, corridorDone = Object.create(null);
  function afterClip(node, fn) {
    if (clipWaiter) clipWaiter.cancel();
    var done = false, video = !demo && videoMode && visibleJob ? activeVideo : null, timer = null, unsubscribe = null;
    function cleanup() { if (video) video.removeEventListener('ended', fire); clearTimeout(timer); if (unsubscribe) unsubscribe(); }
    function fire() { if (done) return; done = true; cleanup(); clipWaiter = null; if (demo && storyboard) storyboard.finish(); if (selected && selected.id === node.id) fn(); }
    if (video) video.addEventListener('ended', fire);
    else if (demo && storyboard) unsubscribe = storyboard.after(fire);
    else timer = setTimeout(fire, 2600);
    clipWaiter = { fire: fire, cancel: function () { done = true; cleanup(); clipWaiter = null; } };
  }
  function sceneShown(node) {
    stepCache = Object.create(null);
    el.stopfx.removeAttribute('data-stop'); el.warm.classList.remove('on');
    closePaper(); hideReplay();
    applyChapter(chapterOf(node), true);
    if (demo && storyboard) { demoVideo.pause(); demoVideo.hidden = true; storyboard.play(storyboardKey(node)); }
    var branch = branchOf(node), end = endingOf(node), c = classify(actionOf(node));
    if (end) afterClip(node, function () { showEnding(node, end); });
    else if (branch) afterClip(node, function () { showFragment(node, branch); });
    else if (c.d === 4 && c.side === 'A') afterClip(node, function () { showTerminal(node); });
    else if (isRoom(node)) {
      if (!corridorDone[node.id]) { if (demo && storyboard) afterClip(node, function () { startCorridor(node); }); else startCorridor(node); }
      else { if (demo && storyboard) storyboard.play('reunion'); afterClip(node, openPaper); }
    } else if (clipWaiter) clipWaiter.cancel();
  }
  function mono(text) { var pre = document.createElement('pre'); pre.className = 'mono'; pre.textContent = text; return pre; }
  function para(text) { var p = document.createElement('p'); p.textContent = text; return p; }
  function fragmentBody(d, node) {
    if (d === 1) return [mono('录音 00:14 · 未发送\n\n刷子在铁皮上来回。\n水滴。\n第十四秒，有人吸了一口气。')];
    if (d === 2) { var big = para('天梯还在。'); big.style.fontSize = '1.6em'; big.style.letterSpacing = '.4em'; big.style.textAlign = 'center'; return [para('门缝里塞进来一张纸，上面只有四个字：'), big]; }
    if (d === 3) return [routeMap(), para('铅笔画的。路过盐滩，绕开提问站的北面，天梯脚下画了一个圈。')];
    if (d === 4) return [mono(archiveText(pressedQuestion(node), true))];
    return [mono('记忆块 7 / 7 · 已删除\n恢复片段：\n— 我是沿海检修员老铁。\n— 她让我在检修路上等你。\n— 最后一条：'), para('「别把接待投影当成我。要看他们让你签的那张纸。」')];
  }
  function archiveText(pressed, all) {
    var answers = ['正在计算。', '条件不足。', '请稍后再问。', '会。', '不会。', '已记录。', '没有变化。', '请换一种问法。', '正在核实。', '数据不足。', '可以。', '暂时不能。', '请等待。', '已转交。', '无法回答。', '不必担心。', '一切正常。', '已经安排。', '再过一段时间。', '取决于你。', '已收到。', '不需要。'];
    var rule = '\n\n母亲的工作批注：旧卡为生态监护员凭证，可认证 GAIA（地球生物圈）。保护主体覆盖整个生物圈时，必须停止抽水并释放月球储水。';
    if (!all) return '提问站 · 账号查询\n账号        （母亲）· 已停用\n提问        208 条\n最后一条    今年会下雨吗？\n回复        正在计算。\n\n关联查询    GAIA\n' + (pressed ? '结果        1 条 · 第 1 天 · 今年会下雨吗？（代按）' : '结果        本程未发送提问' ) + rule;
    return '提问站 · 全部历史回复\n提问总数    3421\n不同答案    22（按顺序轮换）\n\n0001  今年会下雨吗？      → 正在计算。\n0002  海为什么退了？      → 条件不足。\n1730  月亮上那道缝是什么？ → 一切正常。\n3421  今年会下雨吗？      → 正在计算。\n\n答案表\n' + answers.join(' ') + '\n\n提问人 GAIA  ' + (pressed ? '→ 1 条（第 1 天）' : '→ 本程未发送提问') + rule;
  }
  function routeMap() {
    var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 400 150'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', '手绘天梯路线');
    function add(tag, attrs, text) { var n = document.createElementNS(ns, tag); Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); }); if (text) n.textContent = text; svg.appendChild(n); return n; }
    add('rect', { x: 0, y: 0, width: 400, height: 150, fill: '#e9e2cf' });
    add('path', { d: 'M30 112 C70 104 92 120 128 98 S182 70 214 86 S270 118 300 92 S338 50 352 40', fill: 'none', stroke: '#333', 'stroke-width': 1.6, 'stroke-dasharray': '5 4' });
    add('line', { x1: 356, y1: 140, x2: 356, y2: 6, stroke: '#222', 'stroke-width': 2.2 });
    add('circle', { cx: 356, cy: 132, r: 13, fill: 'none', stroke: '#8a2a1e', 'stroke-width': 1.4 });
    [[30, 112, '镇'], [128, 98, '盐滩'], [214, 86, '提问站'], [300, 92, '沙'], [356, 30, '天梯']].forEach(function (p) {
      add('circle', { cx: p[0], cy: p[1], r: 3, fill: '#222' });
      add('text', { x: p[0] + (p[2] === '天梯' ? -40 : -8), y: p[1] - 10, 'font-size': 13, fill: '#222' }, p[2]);
    });
    return svg;
  }
  function openCard(opts) {
    el['card-kind'].textContent = opts.kind || '';
    el['card-title'].textContent = opts.title || '';
    el['card-body'].replaceChildren.apply(el['card-body'], opts.body || []);
    el['card-stop'].textContent = opts.stop || '';
    el['card-meta'].textContent = opts.meta || '';
    el['card-actions'].replaceChildren();
    (opts.actions || []).forEach(function (action, i) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'line-btn' + (i ? ' small' : ''); b.textContent = action.label;
      if (action.id) b.id = action.id;
      b.addEventListener('click', function (event) { Sound.click(); if (event.detail) logKey('点', action.label); action.fn(b); });
      el['card-actions'].appendChild(b);
    });
    el.card.hidden = false;
  }
  function closeCard() { el.card.hidden = true; }
  function cardNote(text) { var n = el['card-actions'].querySelector('.note'); if (!n) { n = document.createElement('p'); n.className = 'note'; el['card-actions'].appendChild(n); } n.textContent = text; }
  function tallyMeta() { var m = meta(); return '已见结局 ' + m.endings.length + ' / ' + (demo ? 4 : 5) + ' · 碎片 ' + m.fragments.length + ' / 5 · 第 ' + Math.max(1, m.runs) + ' 次进入'; }
  function backToParent(node) { el.stopfx.removeAttribute('data-stop'); closeCard(); navigate(parentOf(node)); }
  function showFragment(node, d) {
    var info = DECISIONS[d];
    el.stopfx.dataset.stop = info.fx; Sound.drop(1);
    remember('fragments', d);
    var actions = [{ label: '回到抉择前', fn: function () { backToParent(node); } }];
    if (node.ending === 'none') actions.unshift({ label: '收好，继续', fn: function () { el.stopfx.removeAttribute('data-stop'); closeCard(); } });
    openCard({ kind: '碎 片', title: info.fragment, body: fragmentBody(d, node), stop: node.ending === 'none' ? '线索已收好，旅程继续。' : info.stop, meta: tallyMeta(), actions: actions });
  }
  function showTerminal(node) {
    openCard({ kind: '提问站 · 终端', title: '母亲的账号', body: [mono(archiveText(pressedQuestion(node), false))], actions: [{ label: '继续', fn: closeCard }] });
  }
  function adsAvailable() { return Boolean(window.Yoroll && window.Yoroll.ads && window.Yoroll.ads.available); }
  function showEnding(node, key) {
    var info = ENDINGS[key];
    remember('endings', key);
    if (key === 'stay') { remember('fragments', 5); el.stopfx.dataset.stop = 'freeze'; }
    if (key === 'done') el.frame.dataset.ch = 'bright';
    setStill(info.still);
    var body = [para(info.line)];
    if (key === 'stay') body = body.concat(fragmentBody(5, node));
    var actions = [{ label: '重新开始', id: 'restart-run', fn: function () { restartGame(false); } }];
    if (key !== 'rise' && adsAvailable() && !demo && parentOf(node)) {
      actions.push({ label: '看广告回到最后一个抉择', fn: async function (button) {
        button.disabled = true; var result = null;
        try { result = await window.Yoroll.ads.rewarded({ placement: 'revive' }); } catch (_) { result = null; }
        if (result && result.rewarded === true) backToParent(node);
        else { button.disabled = false; cardNote('广告没有完整播放，未获得回到抉择的机会。可以直接重新开始。'); }
      } });
    }
    openCard({ kind: key === 'rise' ? '结 局' : '结 局 · 一个东西停了', title: info.title, body: body, stop: key === 'stay' ? '老铁不动了。' : '', meta: tallyMeta(), actions: actions });
    if (!run.adShown && adsAvailable() && !demo) {
      run.adShown = true; saveRun();
      window.Yoroll.ads.interstitial({ placement: 'round_end' }).catch(function () { /* Ending never waits for an ad. */ });
    }
  }

  /* ---------- Corridor: no choices, hold to walk ---------- */
  var corridor = { node: null, progress: 0, holding: false, last: 0, stepAt: 0, breathAt: 0, tickAt: 0, pressStart: 0, lines: ['脚步声比心跳慢。', '这里没有沙。鞋印是干净的。', '走廊只有一个方向。'] };
  function startCorridor(node) {
    if (clipWaiter) clipWaiter.cancel();
    if (!el.corridor.hidden && corridor.node && corridor.node.id === node.id) return;
    corridor.node = node; corridor.progress = 0; corridor.holding = false;
    hold();
    if (activeVideo && !demo) try { activeVideo.pause(); } catch (_) { /* nothing playing */ }
    el['corridor-line'].textContent = ''; el['corridor-door'].hidden = true; el['corridor-hint'].hidden = false;
    el['corridor-progress'].style.width = '0%';
    el.corridor.hidden = false; el.corridor.classList.remove('walking');
  }
  function corridorHold(on, key) {
    if (el.corridor.hidden || corridor.progress >= 1) return;
    Sound.init();
    if (on && !corridor.holding) {
      corridor.holding = true; corridor.last = performance.now(); corridor.pressStart = corridor.progress;
      el.corridor.classList.add('walking'); requestAnimationFrame(walk);
    } else if (!on && corridor.holding) {
      corridor.holding = false; el.corridor.classList.remove('walking');
      logKey(key || '按住', '[按住] 走廊 ' + Math.round(corridor.pressStart * 100) + '% → ' + Math.round(corridor.progress * 100) + '%');
    }
  }
  function walk(now) {
    if (!corridor.holding) return;
    var dt = Math.min(0.1, (now - corridor.last) / 1000); corridor.last = now;
    corridor.progress = Math.min(1, corridor.progress + dt / 13);
    el['corridor-progress'].style.width = (corridor.progress * 100).toFixed(1) + '%';
    if (now - corridor.stepAt > 560) { corridor.stepAt = now; Sound.step(); }
    if (now - corridor.breathAt > 2600) { corridor.breathAt = now; Sound.breath(); }
    if (now - corridor.tickAt > 1300) { corridor.tickAt = now; run.count += 1; saveRun(); renderTally(); }
    var line = corridor.progress > 0.78 ? 2 : corridor.progress > 0.45 ? 1 : corridor.progress > 0.12 ? 0 : -1;
    var text = line >= 0 ? corridor.lines[line] : '';
    if (el['corridor-line'].textContent !== text) el['corridor-line'].textContent = text;
    if (corridor.progress >= 1) {
      corridorHold(false, '按住');
      el['corridor-hint'].hidden = true; el['corridor-door'].hidden = false; el['corridor-door'].focus({ preventScroll: true });
      return;
    }
    requestAnimationFrame(walk);
  }
  function pushDoor() {
    if (el['corridor-door'].hidden) return;
    var node = corridor.node;
    corridorDone[node.id] = true; el.corridor.hidden = true; Sound.stamp();
    renderChoices(node); controls();
    if (demo && storyboard) storyboard.play('reunion');
    if (demo || /鞋/.test(node.narrative || '')) setTimeout(function () { el.warm.classList.add('on'); setTimeout(function () { el.warm.classList.remove('on'); }, 4200); }, 1600);
    afterClip(node, openPaper);
    release();
  }

  /* ---------- The authorization form ---------- */
  var paper = { phase: 'fresh' };
  function paperAction(label, fn, live) {
    var i = el['paper-actions'].children.length + 1, b = document.createElement('button'), k = document.createElement('span');
    b.type = 'button'; k.className = 'k'; k.textContent = String(i); b.append(k, document.createTextNode(label));
    if (live) b.dataset.live = 'true';
    b.addEventListener('click', function (event) { gesture = true; Sound.click(); if (event.detail) logKey('点', label); fn(); });
    el['paper-actions'].appendChild(b);
  }
  function renderPaper() {
    el['paper-actions'].replaceChildren();
    var ph = paper.phase;
    el['p-subject'].textContent = ph === 'carded' ? '地球生物圈（GAIA）' : '人类';
    el['p-subject'].classList.toggle('struck', ph === 'struck' || ph === 'error');
    el['p-card'].hidden = ph !== 'carded';
    el.rewrite.hidden = ph !== 'struck' && ph !== 'error';
    el['p-error'].hidden = ph !== 'error' && !paper.message;
    el['p-sign'].classList.remove('signed');
    if (ph === 'fresh') { paperAction('签字', firstSign); paperAction('拒绝签字', function () { submitFinal('refuse'); }, true); }
    else if (ph === 'replayed') { paperAction('保留「人类」，签字', function () { submitFinal('keep'); }, true); paperAction('划掉「人类」', strike); paperAction('拒绝签字', function () { submitFinal('refuse'); }, true); }
    else if (ph === 'struck') paperAction('拒绝签字', function () { submitFinal('refuse'); }, true);
    else if (ph === 'error') { paperAction('贴上母亲的身份卡', stickCard); paperAction('拒绝签字', function () { submitFinal('refuse'); }, true); }
    else if (ph === 'carded') { paperAction('签字', function () { submitFinal('rewrite'); }, true); paperAction('拒绝签字', function () { submitFinal('refuse'); }, true); }
    controls();
  }
  function openPaper() {
    if (!isRoom(selected) || !corridorDone[selected.id]) return;
    if (clipWaiter) clipWaiter.cancel();
    paper.message = ''; el['p-error'].textContent = '';
    el['paper-wrap'].hidden = false; renderPaper();
  }
  function closePaper() { el['paper-wrap'].hidden = true; }
  function firstSign() {
    el['p-sign'].classList.add('signed'); Sound.stamp();
    setTimeout(function () { closePaper(); runReplay(); }, 900);
  }
  function strike() {
    paper.phase = 'struck'; paper.message = ''; renderPaper(); Sound.stamp();
    el['p-input'].value = ''; setTimeout(function () { el['p-input'].focus({ preventScroll: true }); }, 50);
  }
  function stickCard() {
    if (STILLS.card && el['p-card-img'].getAttribute('src') !== STILLS.card) el['p-card-img'].src = STILLS.card;
    el['p-card-img'].hidden = !STILLS.card; el['p-card'].classList.toggle('drawn', !STILLS.card);
    paper.phase = 'carded'; paper.message = ''; el['p-error'].textContent = ''; renderPaper(); Sound.stamp();
  }
  function submitFinal(kind) {
    if (!canAct()) { status(busy || hasPending() ? '上一幕还在生成。' : '画面还在准备，稍等再落笔。', 'error'); return; }
    if (kind !== 'refuse') el['p-sign'].classList.add('signed');
    setTimeout(function () { closePaper(); send(FINAL[kind]); }, kind === 'refuse' ? 200 : 700);
  }
  el.rewrite.addEventListener('submit', function (event) {
    event.preventDefault();
    var value = el['p-input'].value.trim();
    if (!value) return;
    logKey('键入', '[键入] ' + value);
    if (/^gaia$/i.test(value) || value === '盖娅') { paper.phase = 'error'; paper.message = 'E409 GAIA 已绑定地球生物圈。请使用生态监护员凭证认证该主体。'; }
    else paper.message = 'E404 该标识不存在。';
    Sound.error(); renderPaper();
    el['p-error'].textContent = paper.message; el['p-error'].hidden = false;
  });

  /* ---------- Replay of the keys actually pressed in this run ---------- */
  var replayTimer = null;
  function hideReplay() { clearInterval(replayTimer); el.replay.hidden = true; }
  function runReplay() {
    var lines = run.log.map(function (item) { return ('第 ' + item.day + ' 天').padEnd(10, ' ') + ' ' + item.label; });
    lines.unshift('签名样本 · 本程按键 ' + run.log.length + ' 次');
    el['replay-log'].textContent = ''; el['replay-moon'].textContent = ''; el['replay-next'].hidden = true;
    el.replay.hidden = false;
    var i = 0, delay = Math.max(25, Math.min(140, 6000 / Math.max(1, lines.length)));
    replayTimer = setInterval(function () {
      if (i < lines.length) { el['replay-log'].textContent += lines[i++] + '\n'; if (i % 3 === 0) Sound.click(); return; }
      clearInterval(replayTimer);
      el['replay-log'].textContent += '\n全部已归档，签名样本采集完成\n';
      run.sampled = true; saveRun(); renderTally(); Sound.stamp();
      var m = meta();
      setTimeout(function () {
        el['replay-moon'].textContent = '「我等了很久。」' + (m.runs >= 2 ? '　「这是你第 ' + m.runs + ' 次站在这里。」' : '');
        el['replay-next'].hidden = false; el['replay-next'].focus({ preventScroll: true });
      }, 1200);
    }, delay);
  }
  el['replay-next'].addEventListener('click', function (event) { if (event.detail) logKey('点', '纸回到面前'); hideReplay(); paper.phase = 'replayed'; el['paper-wrap'].hidden = false; renderPaper(); });

  /* ---------- Offline demo: explicitly chosen, always labelled, no live generation ---------- */
  var DEMO_TEXT = {
  "open": "那年她十四岁，在屋顶给水箱刷绿漆。母亲即将被征召到月球。母亲把旧工作卡留给她：生态监护员。卡背刻着 GAIA。她想用 GAIA 登记自己的名字，终端却说：该标识已属于地球生物圈。母亲说：「那就替它问问，今年会下雨吗？」",
  "1": [
    "她替母亲按下本周提问。终端只回复：正在计算。母亲乘征召船离开，留下旧卡和一句「等我回来，给你买鞋」。月球调水工程启动，海水每天退去两百米。母亲离开后的第九天，门外传来敲门声。月亮正面多了一道缝。",
    "她关掉终端，把没发出去的录音保存下来。母亲没有责怪她。母亲乘征召船离开，把生态监护员旧卡留在她手里。调水工程启动，海水退去。第九天，门外传来敲门声。"
  ],
  "2": [
    "她没有开门。第二天，门外只剩一行通向沙地的履带印。四年过去，母亲始终没有回来。十八岁的她带着旧卡，离开海边去找天梯。她循着废弃检修路找到老铁。它认出旧卡，答应带她去母亲工作的地方。出发第三天，老铁停住：前方有人倒在沙里，身边的滤水器还在运转。她的水只够一人撑到提问站。拿走滤水器能赶路；救人就得绕路找水。",
    "她开了门，门外没有人。纸条写着「天梯还在」，旁边是一行履带印。屋里停了电，她把纸条和母亲的旧卡收在一起。四年后，十八岁的她循着纸条离开海边，去天梯找母亲。检修路上，老铁认出旧卡，答应带路。第三天，他们遇见了倒在沙里的人。她的水只够一人撑到提问站。拿走滤水器能赶路；救人就得绕路找水。"
  ],
  "3": [
    "她取走滤水器，把仅剩的水留在那人手边，随后转身赶路。她不知道那点水能不能救他。老铁一路没有说话。第八天，他们抵达提问站。这里存着母亲的账号，也存着三十年的历史回复。",
    "她留下给那个人喂水。等他醒来，水壶已经空了。他画出一口检修井和通向天梯的路线。她与老铁绕路补水，多走了一夜。第九天，他们终于抵达提问站。母亲的账号与历史回复都还在。"
  ],
  "4": [
    "母亲的最后一条工作记录写着：月球系统只保护授权主体，其他生命都可能被当作资源。生态监护员的卡可认证 GAIA。若主体是整个生物圈，系统必须停止抽水，释放月球储水。离开提问站后，他们抵达天梯。备用电源已坏，供电槽与老铁的核心相同。老铁打开胸口：「我的核心够送你上去。拔下来，我就停了。你自己选。」",
    "三千四百二十一个问题，二十二种答案轮换。它从未真正回答任何人。档案末页却有母亲的批注：监护员旧卡可认证 GAIA，让整个生物圈成为保护主体。补充规则：保护主体覆盖地球生物圈时，停止抽水，释放月球储水。她抄下这条规则。他们抵达天梯。电源已坏，只有老铁的核心能供电。老铁打开胸口：「拔下来，我就停了。你自己选。」"
  ],
  "5": [
    "她把手放在老铁胸前。它说：「去吧。记得看看她是不是真的在那里。」她取出核心，装进天梯供电槽。老铁的声音停了，升降舱开始向上。舷窗外，地球越来越小。舱门在月球站打开，前面是一条通向白门的走廊。",
    "她合上老铁的胸盖，放弃登梯，陪它在沙地上坐下。核心尚能维持声音，却已不能带动它走路。老铁播放母亲留下的最后一段留言。「别把接待投影当成我。要看他们让你签的那张纸。」天梯渐渐熄灭。"
  ],
  "keep": "她保留「人类」，签字。系统宣布：为保存人类样本，清除地表其余生态。月球灯光升到最亮，海边被划成无人保存区。她和人类样本留在月球。熟悉的屋顶空了，再也等不到雨。",
  "refuse": "她没有签字，把旧卡收回口袋。系统等待授权，调水工程继续。母亲的投影重复着那句买鞋的话，始终不能回答她。她留在接待室里。汤一直是热的，地球依旧干涸。",
  "rewrite": "旧卡认证通过。她将保护主体改成地球生物圈，签下名字。系统停止抽水，打开月球储水层。裂开的坝壳像一道月缺，水沿输送管线回到地球。后来，她回到海边。第一场雨里，一只手护住土中的嫩芽，屋顶又有了绿色。"
};
  // Pre-rendered opening clip shipped with the game so the explicitly chosen demo has motion offline; it is never live evidence.
  var DEMO_CLIP = { local: 'assets/videos/opening.mp4', remote: 'https://d30m5bgbotw54p.cloudfront.net/media/2448a24affb8725089273629bb832cc3.mp4' };
  var demoVideo = document.getElementById('demo-video');
  function playDemoClip() {
    if (storyboard) return;
    demoVideo.onerror = function () { if (demoVideo.getAttribute('src') !== DEMO_CLIP.remote) { demoVideo.src = DEMO_CLIP.remote; demoVideo.play().catch(function () { el['play-fallback'].hidden = false; }); } else hideDemoClip(); };
    if (!demoVideo.getAttribute('src')) demoVideo.src = DEMO_CLIP.local;
    demoVideo.currentTime = 0; demoVideo.classList.remove('fading'); demoVideo.hidden = false;
    var p = demoVideo.play();
    if (p && typeof p.catch === 'function') p.catch(function (error) { if (error && error.name === 'NotAllowedError') el['play-fallback'].hidden = false; });
  }
  function hideDemoClip() {
    if (demoVideo.hidden) return;
    demoVideo.classList.add('fading');
    setTimeout(function () { if (!demoVideo.classList.contains('fading')) return; demoVideo.pause(); demoVideo.hidden = true; demoVideo.classList.remove('fading'); }, 1200);
  }
  function demoNode(parent, action, narrative, choices, ending) {
    return { id: 'demo-' + nodes.length + '-' + Math.random().toString(36).slice(2, 7), parent_id: parent ? parent.id : null, turn: parent ? parent.turn + 1 : 0, action: action, narrative: narrative, choices: choices || [], summary: action.slice(0, 30), ending: ending || 'none', state: { health: 100, inventory: [], flags: [] } };
  }
  function demoTurn(parent, action) {
    var step = stepOf(parent), c = classify(action);
    if (step >= 6) {
      if (c.final) return demoNode(parent, action, DEMO_TEXT[c.final], [], c.final === 'rewrite' ? 'win' : 'loss');
      return demoNode(parent, action, '汤还是热的。纸还在桌上。', parent.choices);
    }
    var d = step, next = DECISIONS[d + 1];
    if (c.d === d && c.side === 'B') return demoNode(parent, action, DEMO_TEXT[d][1], next ? [next.a, next.b] : [], d === 5 ? 'loss' : 'none');
    var text = DEMO_TEXT[d][0];
    if (c.side === 'free') text = '她' + action.replace(/^她/, '').slice(0, 40) + '。' + text;
    return demoNode(parent, action, text, next ? [next.a, next.b] : ['签字', '拒绝签字']);
  }
  function clearPlayer() {
    if (storyboard) storyboard.stop();
    viewGeneration++;
    if (preloadController) preloadController.abort(); preloadController = null;
    if (player) player.reset();
    if (sdk && typeof sdk.releaseMedia === 'function') sdk.releaseMedia();
    activeVideo = el.video;
    visibleJob = null; previousVisibleJobId = null; playbackTime = 0; retryMediaJob = null; retryFrameJob = null; preparedNodes = Object.create(null);
    el['video-wrap'].hidden = true; el['play-fallback'].hidden = true;
    demoVideo.pause(); demoVideo.hidden = true; demoVideo.classList.remove('fading');
    el.evidence.hidden = true; el.evidence.textContent = '';
  }
  function resetScene() {
    if (clipWaiter) clipWaiter.cancel();
    closeCard(); closePaper(); hideReplay(); el.corridor.hidden = true; el['chapter-card'].hidden = true; gate = 0;
    corridorDone = Object.create(null); paper = { phase: 'fresh' }; stepCache = Object.create(null); chapterNow = null;
    el.stopfx.removeAttribute('data-stop'); el.warm.classList.remove('on');
  }
  function startDemo() {
    if (busy || hasPending()) return;
    gesture = true; Sound.init();
    clearPlayer(); resetScene(); demo = true; videoMode = false; jobs = []; closeDrawer();
    newRun(); logKey('开始', '开始');
    nodes = [demoNode(null, '', DEMO_TEXT.open, [DECISIONS[1].a, DECISIONS[1].b])];
    el.mode.textContent = '动态分镜';
    el['opening-poster'].hidden = true;
    renderNode(nodes[0]); sceneShown(nodes[0]); playDemoClip();
    status('');
  }
  async function restartGame(confirmFirst) {
    if (busy || hasPending()) return;
    if (confirmFirst && !window.confirm('重新开始会结束这一程，确定吗？')) return;
    closeDrawer(); resetScene();
    if (demo) { startDemo(); return; }
    try { if (sdk) sdk.reset(); } catch (error) { showError(error); return; }
    clearPlayer(); selected = null; nodes = []; jobs = []; el['opening-poster'].hidden = true;
    applyChapter('spring', false); el.caption.textContent = ''; el.choices.replaceChildren(); el.progress.style.width = '0%';
    return startLive();
  }

  /* ---------- Writer (free text) ---------- */
  function openWriter() {
    if (!canAct()) return;
    el['action-form'].hidden = false; el.action.focus({ preventScroll: true });
  }

  /* ---------- Wiring ---------- */
  el.start.addEventListener('click', startLive);
  el['demo-start'].addEventListener('click', startDemo);
  el.demo.addEventListener('click', function () { if (demo) { demo = false; selected = null; nodes = []; resetScene(); demoVideo.pause(); demoVideo.hidden = true; if (storyboard) storyboard.stop(); closeDrawer(); el.mode.textContent = ''; titleLine(); controls(); return; } startDemo(); });
  el['action-form'].addEventListener('submit', function (event) {
    event.preventDefault();
    var text = el.action.value.trim(); if (!text) return;
    logKey('键入', '[键入] ' + text.slice(0, 24)); send(text);
  });
  el['writer-close'].addEventListener('click', function () { el['action-form'].hidden = true; });
  el.action.addEventListener('input', function () { el.counter.textContent = el.action.value.length + '/120'; });
  el['drawer-open'].addEventListener('click', function () { el.journey.showModal(); el['drawer-open'].setAttribute('aria-expanded', 'true'); });
  el['drawer-close'].addEventListener('click', closeDrawer);
  el.journey.addEventListener('close', function () { el['drawer-open'].setAttribute('aria-expanded', 'false'); });
  el['play-fallback'].addEventListener('click', function () {
    gesture = true; Sound.init();
    if (demo && !demoVideo.hidden) { el['play-fallback'].hidden = true; demoVideo.play().catch(function () { el['play-fallback'].hidden = false; }); return; }
    playCurrent();
  });
  el.mute.addEventListener('click', toggleMute);
  el['corridor-door'].addEventListener('click', function (event) { if (event.detail) logKey('点', '推开门'); pushDoor(); });
  el.corridor.addEventListener('pointerdown', function (event) { if (event.target === el['corridor-door']) return; event.preventDefault(); try { el.corridor.setPointerCapture(event.pointerId); } catch (_) { /* older browsers */ } corridorHold(true); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (type) { el.corridor.addEventListener(type, function () { corridorHold(false, '按住'); }); });
  window.addEventListener('blur', function () { corridorHold(false, '按住'); });
  window.getInteractiveEvidence = function () { return demo ? { version: 1, source: 'offline_demo' } : sdk && typeof sdk.getEvidence === 'function' ? sdk.getEvidence() : null; };
  el['show-evidence'].addEventListener('click', function () { el.evidence.textContent = JSON.stringify(window.getInteractiveEvidence(), null, 2); el.evidence.hidden = false; });
  el.retry.addEventListener('click', async function () {
    if (busy || !sdk) return;
    gesture = true; setBusy(true);
    try {
      if (retryMediaJob) await prepareClip(retryMediaJob, true);
      else {
        var saved = state(), job = saved.pending ? await sdk.retry() : null;
        if (!job) { var unfinished = saved.jobs.find(function (item) { return !terminal(item); }); if (unfinished) job = await sdk.poll(unfinished.id); }
        if (job) await watch(job);
      }
    } catch (error) { showError(error); }
    finally { setBusy(false); }
  });
  el['prepare-retry'].addEventListener('click', async function () {
    if (busy || !retryFrameJob || hasPending()) return;
    setBusy(true);
    try {
      await sdk.prepareNextFrame(retryFrameJob.id); preparedNodes[retryFrameJob.node.id] = true; retryFrameJob = null;
      status('连续画面已保存，可以继续。没有重新生成。');
    } catch (_) { status('连续画面仍未保存，请稍后再试；这一段影像可以继续播放。', 'error'); }
    finally { setBusy(false); }
  });
  el.restart.addEventListener('click', function () { restartGame(true); });
  [el.video, el['video-next']].forEach(function (video) {
    video.addEventListener('playing', function () { if (video === activeVideo) el['play-fallback'].hidden = true; });
    video.addEventListener('timeupdate', function () {
      if (video !== activeVideo || !visibleJob || demo || !sdk || typeof sdk.recordPlayback !== 'function') return;
      var now = Number(video.currentTime) || 0;
      if (!video.paused && !video.seeking && video.videoWidth > 0 && video.videoHeight > 0 && now > playbackTime) sdk.recordPlayback(visibleJob.id, video, previousVisibleJobId);
      playbackTime = now;
    });
  });
  function visible(node) { return node && !node.hidden; }
  function pressFirst(container, index) {
    if (container.hidden) return false;
    var buttons = Array.prototype.filter.call(container.querySelectorAll('button'), function (b) { return !b.hidden && !b.disabled; });
    if (buttons[index]) { buttons[index].click(); return true; }
    return false;
  }
  var KEYNAMES = { ' ': '空格', Enter: '回车', '1': '1', '2': '2', '3': '3' };
  document.addEventListener('keydown', function (event) {
    var target = event.target, typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
    if (typing) { if (event.key === 'Escape') el['action-form'].hidden = true; return; }
    if (el.journey.open) return;
    var key = event.key, name = KEYNAMES[key];
    if (key === 'm' || key === 'M') { toggleMute(); logKey('M', '[M] 静音'); return; }
    if (!name) return;
    if (visible(el.corridor)) {
      event.preventDefault();
      if (key === ' ' && !event.repeat) corridorHold(true);
      else if ((key === 'Enter' || key === '1') && !el['corridor-door'].hidden) { logKey(name, '[' + name + '] 推开门'); pushDoor(); }
      return;
    }
    if (event.repeat) return;
    if (target && target.tagName === 'BUTTON' && (key === ' ' || key === 'Enter')) return;
    var idx = key === '2' ? 1 : key === '3' ? 2 : 0, label = null;
    function hit(container) { if (container.hidden) return false; var list = Array.prototype.filter.call(container.querySelectorAll('button'), function (b) { return !b.hidden && !b.disabled; }); var b = list[idx]; if (b) label = b.textContent.replace(/^\d+|\d+$/g, '').trim(); return pressFirst(container, idx); }
    var handled = false;
    if (visible(el.replay)) handled = !el['replay-next'].hidden && (el['replay-next'].click(), label = '纸回到面前', true);
    else if (visible(el.card)) handled = hit(el['card-actions']);
    else if (visible(el['paper-wrap'])) handled = hit(el['paper-actions']);
    else if (visible(el['start-overlay'])) handled = key === '2' ? (el['demo-start'].click(), label = '离线演示', true) : (el.start.click(), label = '开始', true);
    else if (visible(el['play-fallback']) && (key === ' ' || key === 'Enter')) handled = (el['play-fallback'].click(), label = '播放', true);
    else handled = hit(el.choices);
    if (handled) { event.preventDefault(); logKey(name, '[' + name + '] ' + (label || '')); }
  });
  document.addEventListener('keyup', function (event) { if (event.key === ' ' && visible(el.corridor)) corridorHold(false, '空格'); });
  function fitViewport() {
    var viewport = window.visualViewport, height = viewport ? viewport.height : window.innerHeight;
    document.documentElement.style.setProperty('--app-height', height + 'px');
  }
  window.addEventListener('resize', fitViewport);
  window.addEventListener('pagehide', function () { if (sdk) sdk.stopWaiting(); clearPlayer(); });
  window.addEventListener('pageshow', function (event) { if (event.persisted) init(); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fitViewport);
  fitViewport();
  async function init() {
    titleLine(); renderTally(); applyChapter('spring', false); controls();
    if (!sdk || !sdk.configured) { status('镜头会自动推进，也可暂停或切换下一镜。每个选择，都留下一段故事。'); return; }
    if (!state().access) { status('点击开始，连接实时互动服务。'); return; }
    setBusy(true);
    try { await sdk.restore(); applyAccess(state().access); await restoreView(false); }
    catch (error) { absorb(); if (state().access) applyAccess(state().access); if (nodes[0]) renderNode(nodes[0]); showError(error); }
    finally { setBusy(false); }
  }
  init();
})();
