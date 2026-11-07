/* Yoroll runtime AI adventures. Provider credentials never belong in this file. */
(function (global) {
  'use strict';

  function failure(code, message, status) {
    var error = new Error(message);
    error.code = code;
    error.status = status || 0;
    return error;
  }
  var messages = {
    login_required: '请先登录 Yoroll，再回来开始冒险。',
    unauthorized: '游玩凭证已失效，请重新登录后开始新冒险。',
    expired: '这次冒险的游玩凭证已过期，请开始新冒险。',
    session_expired: '这次冒险的游玩凭证已过期，旧剧情仍可阅读，请开始新冒险。',
    unconfigured: '这个游戏还没有配置实时 AI 服务，可以先体验演示模式。',
    disabled: '这个游戏尚未开启实时 AI 互动，可以先体验演示模式。',
    insufficient_credits: '互动额度不足，请补充额度后再试。',
    quota_exceeded: '本次互动额度已用完，请稍后再试。',
    rate_limited: '操作有些频繁，请稍后再试。',
    storage_unavailable: '浏览器无法保存冒险进度，请允许网站存储后重试。',
    pending: '上一条行动仍在处理，请先查看它的结果。',
    receipt_unknown: '行动可能已经送达，正在保留原请求。请点击“查询原请求”，避免重复提交。',
    network_error: '暂时连接不上服务器，冒险进度已保留，请稍后查询。',
    poll_paused: '这次等待已暂停，进度仍保留。点击“查询原请求”继续查看，不会重新提交行动。',
    invalid_response: '暂时未收到有效的互动结果，请稍后查询原请求。',
    no_play: '请先开始冒险。',
    invalid_action: '请输入 1 到 600 个字的行动。',
    busy: '正在处理当前操作，请稍候。'
  };
  Object.assign(messages, {
    result_uncertain: '这次生成的结果无法确认，系统不会重复提交。已有剧情已保留，可以回到历史节点尝试其他行动。',
    generation_failed: '这次生成未完成，已有剧情已保留，请稍后选择其他行动。',
    video_timeout: '短片生成超时，已有画面和剧情已保留。请返回已播放的节点选择其他行动。',
    video_failed: '短片未生成成功，已有画面和剧情已保留。请返回已播放的节点选择其他行动。',
    frame_missing: '场景短片缺少起始画面，请游戏作者完成画面配置后再试。',
    story_ended: '这条分支已经结束，可以回到历史节点开启另一条路线。',
    request_conflict: '原行动编号对应的内容不同，请恢复旅途进度后再试。'
  });
  Object.assign(messages, {
    feature_disabled: '实时互动服务尚未开启，可以先体验不调用 AI 的演示模式。',
    provider_unconfigured: '实时剧情服务尚未就绪，可以先体验演示模式。',
    game_unconfigured: '这个游戏的互动规则尚未配置完成，可以先体验演示模式。',
    access_denied: '请先登录作者账号进行预览。公开互动体验尚未开放时，请联系游戏作者。',
    video_unavailable: '实时短片服务暂时不可用，已有剧情仍可回看。',
    invalid_frame: '场景画面无法读取，请游戏作者提供有效的 PNG、JPEG 或 WebP 图片。',
    frame_too_large: '场景起始图片过大，请游戏作者压缩后重新配置。',
    first_frame_missing: '找不到开场图片，请让制作助手补齐画面后重试开场，已有进度会保留。',
    first_frame_oversize: '开场图片超过 8 MB，请让制作助手压缩后重试开场，已有进度会保留。',
    first_frame_invalid: '开场图片格式无效，请让制作助手提供有效的 PNG、JPEG 或 WebP 图片后重试开场，已有进度会保留。',
    opening_frame_missing: '开场画面暂不可用，原旅程已保留。请让制作助手检查或补齐开场图片，再点击“重试开场”。不需要先播放，也不会自动重新开始。',
    opening_frame_invalid: '开场画面无法读取，原旅程已保留。请让制作助手修复开场图片，再点击“重试开场”。不需要先播放，也不会自动重新开始。',
    frame_required: '请先播放当前场景并准备好衔接画面，再提交下一次行动。',
    frame_not_ready: '当前场景尚未生成完毕，请等待视频就绪后再行动。',
    frame_prepare_failed: '视频已保留，但衔接画面还未准备好。请重试准备画面，不会重新生成或重复消耗视频额度。',
    video_load_failed: '视频暂时无法加载，请重试加载已有视频，不会重复生成。',
    video_download_timeout: '视频下载超时，请重试加载已有视频，不会重新生成。',
    video_decode_timeout: '视频解码等待超时，请重试加载已有视频。',
    video_decode_failed: '浏览器无法解码本段视频，请重试加载；若仍失败，请检查视频格式。',
    video_playback_timeout: '播放器启动超时，请重试播放已有视频。',
    video_playback_stalled: '视频播放长时间没有推进，请重试加载已有视频。',
    video_autoplay_blocked: '浏览器需要点击播放，请点击画面中的播放按钮。',
    video_cancelled: '本次视频加载已取消，已有进度保持不变。',
    video_cache_full: '视频缓存空间暂时不足，请关闭其他画面后重试加载。',
    video_too_large: '本段视频超过播放大小限制，请返回已有场景。',
    origin_denied: '请通过 Yoroll 的游戏页面开启互动。',
    service_unavailable: '互动服务暂时不可用，已有进度会保留，请稍后恢复。',
    invalid_request: '互动请求格式有误，请刷新页面恢复进度后再试。'
  });
  function friendlyError(error) {
    var code = error && error.code;
    return messages[code] || '这次互动暂时未完成，进度已保留，请稍后重试。';
  }
  function inferGameId() {
    var path = String(global.location && global.location.pathname || '');
    var match = path.match(/\/(?:sessions|play)\/([^/]+)(?:\/|$)/);
    return match ? decodeURIComponent(match[1]) : '';
  }
  function makeId() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    if (!global.crypto || !global.crypto.getRandomValues) throw failure('unconfigured', 'Secure browser required');
    var bytes = global.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    var hex = Array.prototype.map.call(bytes, function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }
  function terminal(job) { return job && (job.status === 'complete' || job.status === 'failed' || job.status === 'uncertain'); }
  function openingFrameError(code) { return ['opening_frame_missing', 'opening_frame_invalid', 'first_frame_missing', 'first_frame_invalid', 'first_frame_oversize'].indexOf(code) >= 0; }
  function bounded(value, fallback, maximum) { return Number.isFinite(value) && value > 0 ? Math.min(value, maximum) : fallback; }
  // Race every network/read operation as well as aborting the underlying fetch:
  // a non-responsive stream must not hold the single download slot forever.
  function abortable(promise, signal) {
    return new Promise(function (resolve, reject) {
      function cancelled() { reject(failure('video_cancelled', messages.video_cancelled)); }
      if (signal.aborted) { cancelled(); return; }
      signal.addEventListener('abort', cancelled, { once: true });
      Promise.resolve(promise).then(resolve, reject).finally(function () { signal.removeEventListener('abort', cancelled); });
    });
  }
  function create(options) {
    options = options || {};
    var gameId = options.gameId || global.YOROLL_GAME_ID || inferGameId();
    var endpoint = options.endpoint || global.YOROLL_INTERACTIVE_ENDPOINT || '';
    var origin = String(global.location && global.location.origin || '');
    if (endpoint && !/\/interactive\/?$/.test(endpoint)) {
      endpoint = endpoint.replace(/\/+$/, '') + '/api/v1/sessions/' + encodeURIComponent(gameId) + '/interactive';
    } else if (!endpoint && gameId && /^https?:/.test(origin)) {
      endpoint = origin + '/api/v1/sessions/' + encodeURIComponent(gameId) + '/interactive';
    }
    endpoint = endpoint.replace(/\/+$/, '');
    var storageKey = 'yoroll-interactive:v1:' + endpoint;
    var state = { access: null, nodes: [], jobs: [], pending: null, opening_request_id: null, opening_error: null };
    var actionPromise = null;
    var startPromise = null;
    var waitPromise = null;
    var waitCancelled = false;
    var mediaCache = new Map();
    var mediaEntries = new Set(), mediaQueue = [], activeMedia = null, mediaBytes = 0, mediaClock = 0;
    var mediaOptions = options.media || {};
    var mediaLimits = {
      entries: Math.max(1, Math.floor(bounded(mediaOptions.maxEntries, 12, 100))),
      bytes: bounded(mediaOptions.maxBytes, 64 * 1024 * 1024, 128 * 1024 * 1024),
      videoBytes: bounded(mediaOptions.maxVideoBytes, 32 * 1024 * 1024, 32 * 1024 * 1024),
      downloadMs: bounded(mediaOptions.downloadTimeoutMs, 120000, 180000),
      idleMs: bounded(mediaOptions.readIdleTimeoutMs, 30000, 60000)
    };
    var framePromises = new Map();
    var frameControllers = new Set(), mediaPlayers = new Set();
    var preparedNodes = new Set();
    var confirmedVideos = new Set();
    var mediaEpoch = 0;
    try {
      var saved = JSON.parse(global.localStorage.getItem(storageKey) || 'null');
      if (saved && saved.access && saved.access.play_id && saved.access.access_token) {
        state = { access: saved.access, nodes: Array.isArray(saved.nodes) ? saved.nodes : [], jobs: Array.isArray(saved.jobs) ? saved.jobs : [], pending: saved.pending || null, evidence: saved.evidence || null,
          opening_request_id: typeof saved.opening_request_id === 'string' ? saved.opening_request_id : (saved.pending && saved.pending.kind === 'opening' ? saved.pending.request_id : null),
          opening_error: openingFrameError(saved.opening_error) ? saved.opening_error : null };
      }
    } catch (_) { /* Report storage failure before any billable submission. */ }
    function notify(code, details) {
      if (typeof options.onStatus === 'function') options.onStatus({ code: code, message: messages[code] || '', details: details });
    }
    function save() {
      try { global.localStorage.setItem(storageKey, JSON.stringify(state)); }
      catch (_) { throw failure('storage_unavailable', messages.storage_unavailable); }
    }
    function snapshot() { return JSON.parse(JSON.stringify(state)); }
    function auth() {
      if (!state.access) throw failure('no_play', messages.no_play);
      if (state.access.expired) throw failure('session_expired', messages.session_expired, 401);
      return state.access.access_token;
    }
    async function api(path, method, body, token, signal) {
      if (!endpoint || !gameId) throw failure('unconfigured', messages.unconfigured);
      var controller = new AbortController();
      function cancel() { controller.abort(); }
      if (signal) { if (signal.aborted) throw failure('video_cancelled', messages.video_cancelled); signal.addEventListener('abort', cancel, { once: true }); }
      var timer = global.setTimeout(function () { controller.abort(); }, 30000);
      try {
        var headers = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = 'Bearer ' + token;
        var request = global.fetch(endpoint + path, {
          method: method || 'GET', credentials: 'include', headers: headers,
          body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal
        });
        var response = await (signal ? abortable(request, controller.signal) : request);
        var payload;
        try { payload = await (signal ? abortable(response.json(), controller.signal) : response.json()); } catch (error) { if (signal && signal.aborted) throw error; payload = null; }
        if (!response.ok) {
          var code = payload && (payload.error && payload.error.code || payload.code);
          if (typeof code !== 'string') code = response.status === 401 ? 'login_required' : response.status === 429 ? 'rate_limited' : response.status === 503 ? 'unconfigured' : 'request_failed';
          if (code === 'session_expired' && state.access) { state.access.expired = true; save(); }
          throw failure(code, messages[code] || 'Interactive request failed', response.status);
        }
        if (!payload || typeof payload !== 'object') throw failure('invalid_response', messages.invalid_response);
        return payload;
      } catch (error) {
        if (error && error.code) throw error;
        throw failure('network_error', messages.network_error);
      } finally { global.clearTimeout(timer); if (signal) signal.removeEventListener('abort', cancel); }
    }
    function remember(job, confirmedRead) {
      if (!job || typeof job.id !== 'string' || typeof job.status !== 'string') throw failure('invalid_response', messages.invalid_response);
      var index = state.jobs.findIndex(function (item) { return item.id === job.id; });
      if (index < 0) state.jobs.push(job); else state.jobs[index] = job;
      if (job.kind === 'opening') { state.opening_request_id = job.id; state.opening_error = null; }
      if (job.node && !state.nodes.some(function (node) { return node.id === job.node.id; })) state.nodes.push(job.node);
      if (state.pending && state.pending.request_id === job.id && terminal(job)) state.pending = null;
      if (confirmedRead && state.access && !state.access.capabilities.video && job.status === 'complete' && job.node) {
        var evidence = state.evidence || { version: 1, source: 'live_browser', play_id: state.access.play_id, turns: [] };
        if (!evidence.turns.some(function (turn) { return turn.job_id === job.id; })) {
          evidence.turns.push({ job_id: job.id, node_id: job.node.id, response_status: 200, status: 'complete', action: job.action, parent_id: job.parent_id });
          evidence.tested_at = new Date().toISOString(); state.evidence = evidence;
        }
      }
      save();
      notify(job.status, job);
      return job;
    }
    async function start() {
      if (startPromise) return startPromise;
      if (state.access) {
        await restore();
        return Object.assign({}, state.access, { opening: state.nodes[0], restored: true });
      }
      startPromise = (async function () {
        save();
        notify('starting');
        var access = await api('/start', 'POST', {});
        if (!access.play_id || !access.access_token || !access.opening) throw failure('invalid_response', messages.invalid_response);
        state.access = { play_id: access.play_id, access_token: access.access_token, capabilities: access.capabilities || {}, expires_at: access.expires_at, opening_frame: access.opening_frame };
        state.nodes = [access.opening]; state.jobs = []; state.pending = null; state.opening_request_id = null; state.opening_error = null;
        save(); notify('ready');
        return access;
      })();
      try { return await startPromise; } finally { startPromise = null; }
    }
    async function poll(requestId) {
      return remember(await api('/plays/' + encodeURIComponent(state.access && state.access.play_id || '') + '/jobs/' + encodeURIComponent(requestId), 'GET', undefined, auth()), true);
    }
    async function submitPending() {
      var pending = state.pending;
      if (!pending) throw failure('no_play', messages.no_play);
      try {
        var isOpening = pending.kind === 'opening';
        var body = isOpening ? { play_id: pending.play_id, request_id: pending.request_id } : pending;
        var job = await api(isOpening ? '/opening' : '/turn', 'POST', body, auth());
        // The server may reuse a previously completed identical branch.
        // Adopt its confirmed receipt instead of waiting on a nonexistent id.
        if (job.id && job.id !== pending.request_id && (isOpening ? job.kind === 'opening' : job.parent_id === pending.parent_id && job.action === pending.action)) {
          state.pending.request_id = job.id;
          save();
        }
        return remember(job);
      } catch (error) {
        // Older servers used the continuation-frame code for a legacy play's missing opening image.
        // Scope this compatibility mapping to /opening; /turn must retain its original meaning.
        if (isOpening && error.code === 'frame_required') error = failure('opening_frame_missing', messages.opening_frame_missing, error.status);
        if (isOpening && openingFrameError(error.code)) state.opening_error = error.code;
        // A dropped response is not proof that a billable operation failed.
        // Keep the exact receipt before sending, then only retry that receipt.
        if ([400, 401, 403, 404, 413, 415, 422, 429].indexOf(error.status) >= 0 || openingFrameError(error.code) || ['feature_disabled', 'provider_unconfigured', 'video_unavailable', 'story_ended', 'request_conflict', 'frame_not_ready', 'frame_required'].indexOf(error.code) >= 0) {
          state.pending = null; save(); notify(error.code);
          throw error;
        }
        notify('receipt_unknown');
        throw failure('receipt_unknown', messages.receipt_unknown, error.status);
      }
    }
    async function recover() {
      if (!state.pending) return null;
      var requestId = state.pending.request_id;
      try { return await poll(requestId); }
      catch (error) {
        // Explicit user retry can resubmit the original id only after a 404.
        if (error.status === 404) return submitPending();
        throw error;
      }
    }
    async function act(parentId, action, settings) {
      action = String(action || '').trim();
      if (!action || action.length > 600) throw failure('invalid_action', messages.invalid_action);
      if (actionPromise) return actionPromise;
      if (state.pending && (state.pending.parent_id !== parentId || state.pending.action !== action)) throw failure('pending', messages.pending);
      auth();
      actionPromise = (async function () {
        if (state.pending) return recover();
        state.pending = { play_id: state.access.play_id, parent_id: parentId, action: action, request_id: makeId() };
        if (settings && settings.frame) state.pending.frame = settings.frame;
        save(); notify('generating');
        return submitPending();
      })();
      try { return await actionPromise; } finally { actionPromise = null; }
    }
    async function opening() {
      auth();
      if (!state.access.capabilities.video) throw failure('video_unavailable', messages.video_unavailable);
      if (actionPromise) return actionPromise;
      var existing = state.jobs.find(function (job) { return job.kind === 'opening'; });
      if (existing) return existing;
      if (state.pending && state.pending.kind !== 'opening') throw failure('pending', messages.pending);
      actionPromise = (async function () {
        if (state.pending) return recover();
        // A definitively rejected preflight is retried only by an explicit call, with the same receipt.
        // Persist it outside pending so reloads neither invent a new request nor block configuration repair.
        state.opening_request_id = state.opening_request_id || makeId();
        state.opening_error = null;
        state.pending = { kind: 'opening', play_id: state.access.play_id, request_id: state.opening_request_id };
        save(); notify('generating');
        return submitPending();
      })();
      try { return await actionPromise; } finally { actionPromise = null; }
    }

    // Only our authenticated media endpoint is fetched. Never put a play token
    // into a provider URL or a video src; same-origin blobs also allow safe canvas reads.
    function revokeMedia(entry) {
      if (!entry.result || entry.revoked || entry.pins) return;
      entry.revoked = true; mediaBytes -= entry.result.bytes;
      global.URL.revokeObjectURL(entry.result.url); mediaEntries.delete(entry);
      if (mediaCache.get(entry.id) === entry) { mediaCache.delete(entry.id); confirmedVideos.delete(entry.id); }
    }
    function retireMedia(entry) {
      if (!entry || entry.retired) return;
      entry.retired = true;
      if (mediaCache.get(entry.id) === entry) { mediaCache.delete(entry.id); confirmedVideos.delete(entry.id); }
      if (entry.result) revokeMedia(entry);
      else {
        entry.controller.abort(); entry.reject(failure('video_cancelled', messages.video_cancelled));
        mediaQueue = mediaQueue.filter(function (item) { return item !== entry; }); mediaEntries.delete(entry);
      }
    }
    function reserveMedia(bytes) {
      function count() { return Array.from(mediaEntries).filter(function (entry) { return entry.result && !entry.revoked; }).length; }
      var candidates = Array.from(mediaEntries).filter(function (entry) { return entry.result && !entry.pins; })
        .sort(function (a, b) { return a.used - b.used; });
      while ((mediaBytes + bytes > mediaLimits.bytes || count() >= mediaLimits.entries) && candidates.length) retireMedia(candidates.shift());
      if (mediaBytes + bytes > mediaLimits.bytes || count() >= mediaLimits.entries) throw failure('video_cache_full', messages.video_cache_full);
    }
    async function downloadMedia(entry) {
      var controller = entry.controller, timer, idleTimer, reader, timedOut = false;
      function timeout() { timedOut = true; controller.abort(); }
      function armIdle() { global.clearTimeout(idleTimer); idleTimer = global.setTimeout(timeout, mediaLimits.idleMs); }
      timer = global.setTimeout(timeout, mediaLimits.downloadMs); armIdle();
      try {
        var response = await abortable(global.fetch(entry.path, {
          method: 'GET', credentials: 'include', headers: { Authorization: 'Bearer ' + entry.token }, signal: controller.signal
        }), controller.signal);
        if (!response.ok) {
          var payload = await abortable(response.json().catch(function () { return null; }), controller.signal);
          var code = payload && payload.error && payload.error.code || 'video_load_failed';
          throw failure(code, messages[code] || messages.video_load_failed, response.status);
        }
        if (Number(response.headers.get('content-length')) > mediaLimits.videoBytes) throw failure('video_too_large', messages.video_too_large);
        if (!response.body || !response.body.getReader) throw failure('video_load_failed', messages.video_load_failed);
        reader = response.body.getReader();
        var chunks = [], size = 0;
        while (true) {
          armIdle();
          var part = await abortable(reader.read(), controller.signal);
          if (part.done) break;
          size += part.value.byteLength;
          if (size > mediaLimits.videoBytes) throw failure('video_too_large', messages.video_too_large);
          chunks.push(part.value);
        }
        if (entry.retired || entry.epoch !== mediaEpoch) throw failure('video_cancelled', messages.video_cancelled);
        if (!size) throw failure('video_load_failed', messages.video_load_failed);
        reserveMedia(size);
        var type = /^video\/webm(?:;|$)/i.test(response.headers.get('content-type') || '') ? 'video/webm' : 'video/mp4';
        var url = global.URL.createObjectURL(new global.Blob(chunks, { type: type }));
        entry.result = { url: url, node_id: entry.nodeId, bytes: size }; mediaBytes += size; entry.used = ++mediaClock;
        confirmedVideos.add(entry.id); entry.resolve(entry.result);
      } catch (error) {
        if (mediaCache.get(entry.id) === entry) mediaCache.delete(entry.id);
        mediaEntries.delete(entry);
        entry.reject(timedOut ? failure('video_download_timeout', messages.video_download_timeout) : error && error.code ? error : failure('video_load_failed', messages.video_load_failed));
      } finally {
        if (reader) void reader.cancel().catch(function () {});
        controller.abort(); global.clearTimeout(timer); global.clearTimeout(idleTimer);
      }
    }
    function pumpMedia() {
      if (activeMedia || !mediaQueue.length) return;
      mediaQueue.sort(function (a, b) { return a.priority - b.priority || a.order - b.order; });
      var entry = mediaQueue.shift(); activeMedia = entry;
      downloadMedia(entry).finally(function () { activeMedia = null; pumpMedia(); });
    }
    function mediaEntry(requestId, settings) {
      settings = settings || {};
      var token = auth(), job = state.jobs.find(function (item) { return item.id === requestId; });
      if (!job || job.status !== 'complete' || !job.video_url || !job.node) throw failure('frame_not_ready', messages.frame_not_ready);
      if (settings.signal && settings.signal.aborted) throw failure('video_cancelled', messages.video_cancelled);
      var entry = mediaCache.get(requestId), priority = settings.priority === 'preload' ? 1 : 0;
      if (settings.retry && entry) { retireMedia(entry); entry = null; }
      if (entry) { entry.used = ++mediaClock; entry.priority = Math.min(entry.priority, priority); return entry; }
      if (mediaQueue.length >= 8) throw failure('busy', messages.busy);
      entry = { id: requestId, nodeId: job.node.id, token: token, epoch: mediaEpoch, priority: priority, order: ++mediaClock,
        used: mediaClock, pins: 0, consumers: 0, controller: new AbortController(), result: null, retired: false,
        path: endpoint + '/plays/' + encodeURIComponent(state.access.play_id) + '/jobs/' + encodeURIComponent(requestId) + '/video' };
      entry.promise = new Promise(function (resolve, reject) { entry.resolve = resolve; entry.reject = reject; });
      // Retirement may precede a consumer subscription during cancellation.
      entry.promise.catch(function () {});
      mediaCache.set(requestId, entry); mediaEntries.add(entry); mediaQueue.push(entry);
      // Foreground decoding wins over speculative background traffic. Retrying a
      // prefetch is a GET of the existing receipt, never another generation.
      if (!priority && activeMedia && activeMedia.priority && activeMedia.id !== requestId) retireMedia(activeMedia);
      pumpMedia(); return entry;
    }
    async function consumeMedia(entry, signal) {
      entry.consumers++;
      try { return await (signal ? abortable(entry.promise, signal) : entry.promise); }
      finally {
        entry.consumers--;
        if (!entry.result && !entry.consumers && !entry.pins) retireMedia(entry);
      }
    }
    async function loadVideo(requestId, settings) {
      settings = settings || {};
      return consumeMedia(mediaEntry(requestId, settings), settings.signal);
    }
    async function retainVideo(requestId, settings) {
      settings = settings || {};
      var entry = mediaEntry(requestId, settings), released = false; entry.pins++;
      function release() { if (released) return; released = true; entry.pins--; if (entry.retired) revokeMedia(entry); else if (!entry.result && !entry.pins && !entry.consumers) retireMedia(entry); }
      try { return { media: await consumeMedia(entry, settings.signal), release: release }; }
      catch (error) { release(); throw error; }
    }
    function invalidateVideo(requestId) { retireMedia(mediaCache.get(requestId)); }
    async function preloadVideos(requestIds, settings) {
      var loaded = [];
      // Callers supply known completed next clips, in story order; do not fan
      // out downloads of every branch or generate speculative paid content.
      for (var index = 0; index < requestIds.length; index++) {
        await loadVideo(requestIds[index], { priority: 'preload', signal: settings && settings.signal }); loaded.push(requestIds[index]);
      }
      return loaded;
    }
    function clearMedia() {
      mediaEpoch++; frameControllers.forEach(function (controller) { controller.abort(); });
      Array.from(mediaEntries).forEach(retireMedia); preparedNodes.clear(); confirmedVideos.clear();
    }
    async function prepareNextFrame(requestId) {
      auth();
      var job = state.jobs.find(function (item) { return item.id === requestId; });
      if (!job || job.status !== 'complete' || !job.node || !job.video_url) throw failure('frame_not_ready', messages.frame_not_ready);
      if (preparedNodes.has(job.node.id)) return;
      if (framePromises.has(requestId)) return framePromises.get(requestId);
      var playId = state.access.play_id, token = auth(), epoch = mediaEpoch;
      var controller = new AbortController(); frameControllers.add(controller);
      var promise = (async function () {
        var lease = await retainVideo(requestId, { signal: controller.signal }), frame;
        try {
          try { frame = await tailFrame(lease.media.url, controller.signal); }
          catch (error) { if (!controller.signal.aborted) invalidateVideo(requestId); throw error; }
          if (epoch !== mediaEpoch) throw failure('frame_prepare_failed', messages.frame_prepare_failed);
          var result = await api('/frames', 'POST', { play_id: playId, node_id: job.node.id, frame: frame }, token, controller.signal);
          if (epoch !== mediaEpoch) throw failure('video_cancelled', messages.video_cancelled);
          if (result.saved !== true || result.node_id !== job.node.id) throw failure('invalid_response', messages.invalid_response);
          preparedNodes.add(job.node.id);
        } finally { lease.release(); }
      })();
      framePromises.set(requestId, promise);
      try { return await promise; } finally { if (framePromises.get(requestId) === promise) framePromises.delete(requestId); frameControllers.delete(controller); }
    }
    function createVideoPlayer(settings) {
      settings = settings || {};
      var videos = settings.videos;
      if (!Array.isArray(videos) || videos.length !== 2 || !videos[0] || !videos[1] || videos[0] === videos[1]) throw failure('unconfigured', 'Two persistent video elements are required');
      var active = null, pending = null, pendingController = null, generation = 0, playSerial = 0, destroyed = false, stallTimer, playController = null;
      var decodeMs = bounded(settings.decodeTimeoutMs, 30000, 60000), playMs = bounded(settings.playTimeoutMs, 15000, 30000), stallMs = bounded(settings.stallTimeoutMs, 15000, 30000);
      function release(handle) {
        if (!handle) return;
        handle.video.pause(); handle.video.removeAttribute('src'); handle.video.load(); handle.video.hidden = true; handle.lease.release();
      }
      function report(error) { if (typeof settings.onError === 'function') settings.onError(error, active && active.id); }
      function stopStall() { global.clearTimeout(stallTimer); stallTimer = null; }
      function cancelPending() {
        if (pendingController) pendingController.abort(); pendingController = null;
        release(pending); pending = null;
      }
      function decode(video, url, signal) {
        return new Promise(function (resolve, reject) {
          var settled = false, timer;
          function done(error) {
            if (settled) return; settled = true; global.clearTimeout(timer);
            video.removeEventListener('loadeddata', ready); video.removeEventListener('canplay', ready); video.removeEventListener('error', failed); signal.removeEventListener('abort', cancelled);
            if (error) reject(error); else resolve();
          }
          function ready() { if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0 && (!video.currentSrc || video.currentSrc === url)) done(); }
          function failed() { done(failure('video_decode_failed', messages.video_decode_failed)); }
          function cancelled() { done(failure('video_cancelled', messages.video_cancelled)); }
          if (signal.aborted) { cancelled(); return; }
          timer = global.setTimeout(function () { done(failure('video_decode_timeout', messages.video_decode_timeout)); }, decodeMs);
          video.addEventListener('loadeddata', ready); video.addEventListener('canplay', ready); video.addEventListener('error', failed); signal.addEventListener('abort', cancelled, { once: true });
          try { video.muted = true; video.playsInline = true; video.preload = 'auto'; video.src = url; video.load(); ready(); }
          catch (_) { failed(); }
        });
      }
      async function prepare(requestId, options) {
        if (destroyed) throw failure('video_cancelled', messages.video_cancelled);
        options = options || {}; var ticket = ++generation; cancelPending();
        if (active && active.id === requestId && !options.retry && active.video.readyState >= 2 && !active.video.error) return active;
        var controller = new AbortController(); pendingController = controller;
        var lease, handle;
        try {
          lease = await retainVideo(requestId, { signal: controller.signal, retry: options.retry });
          if (ticket !== generation || controller.signal.aborted) throw failure('video_cancelled', messages.video_cancelled);
          handle = { id: requestId, video: active && active.video === videos[1] ? videos[0] : videos[1], media: lease.media, lease: lease, generation: ticket };
          pending = handle;
          await decode(handle.video, handle.media.url, controller.signal);
          if (ticket !== generation) throw failure('video_cancelled', messages.video_cancelled);
          return handle;
        } catch (error) {
          if (pending === handle && handle) { release(handle); pending = null; } else if (lease && !handle) lease.release();
          if (error.code !== 'video_cancelled') invalidateVideo(requestId);
          throw error;
        } finally { if (pendingController === controller) pendingController = null; }
      }
      function commit(handle) {
        if (destroyed || !handle || handle !== active && (handle !== pending || handle.generation !== generation)) throw failure('video_cancelled', messages.video_cancelled);
        if (handle === active) return active.video;
        stopStall(); playSerial++; if (playController) playController.abort();
        release(active); active = handle; pending = null; active.video.hidden = false;
        return active.video;
      }
      async function play() {
        if (!active || destroyed) throw failure('video_cancelled', messages.video_cancelled);
        if (playController) playController.abort();
        var controller = new AbortController(), timedOut = false, video = active.video, ticket = ++playSerial; playController = controller;
        function pauseTimedOutPlay() { if (timedOut && ticket === playSerial && active && active.video === video) video.pause(); }
        var timer = global.setTimeout(function () { timedOut = true; controller.abort(); pauseTimedOutPlay(); }, playMs);
        try {
          var started = video.play();
          if (!started || typeof started.then !== 'function') throw failure('video_load_failed', messages.video_load_failed);
          // pause() normally rejects native pending play promises; also guard
          // a late settlement without pausing a newer explicit play attempt.
          started.then(pauseTimedOutPlay, function () {});
          await abortable(started, controller.signal);
        } catch (error) {
          var code = timedOut ? 'video_playback_timeout' : error && error.name === 'NotAllowedError' ? 'video_autoplay_blocked' : error && error.name === 'NotSupportedError' ? 'video_decode_failed' : error && error.code === 'video_cancelled' ? 'video_cancelled' : 'video_load_failed';
          var mapped = failure(code, messages[code]); if (code !== 'video_cancelled') report(mapped); throw mapped;
        } finally { global.clearTimeout(timer); if (playController === controller) playController = null; }
      }
      var listeners = [];
      videos.forEach(function (video) {
        var lastTime = 0;
        function on(name, handler) { video.addEventListener(name, handler); listeners.push(function () { video.removeEventListener(name, handler); }); }
        function isActive() { return active && active.video === video; }
        function stalled() {
          if (!isActive() || video.paused || video.ended || stallTimer) return;
          stallTimer = global.setTimeout(function () { stallTimer = null; if (isActive() && !video.paused && !video.ended) { video.pause(); report(failure('video_playback_stalled', messages.video_playback_stalled)); } }, stallMs);
        }
        function resumed() { if (isActive()) { stopStall(); stallTimer = null; } }
        on('waiting', stalled); on('stalled', stalled); on('playing', resumed);
        on('timeupdate', function () { var now = Number(video.currentTime) || 0; if (!video.seeking && now > lastTime) resumed(); lastTime = now; });
        on('pause', resumed); on('ended', resumed);
        on('error', function () { if (isActive()) { resumed(); report(failure('video_decode_failed', messages.video_decode_failed)); } });
      });
      function resetPlayer() { generation++; playSerial++; cancelPending(); stopStall(); stallTimer = null; if (playController) playController.abort(); release(active); active = null; }
      var player = { prepare: prepare, commit: commit, play: play, reset: resetPlayer,
        getCurrent: function () { return active ? { job_id: active.id, video: active.video } : null; },
        destroy: function () { resetPlayer(); destroyed = true; listeners.forEach(function (remove) { remove(); }); listeners = []; mediaPlayers.delete(player); } };
      mediaPlayers.add(player); return player;
    }
    // Observable browser verification only: no provider URLs or access tokens.
    // A verifier adds the source fingerprint after confirming the project has not changed.
    function recordPlayback(requestId, video, previousJobId) {
      var job = state.jobs.find(function (item) { return item.id === requestId; });
      if (!state.access || !confirmedVideos.has(requestId) || !job || !job.node || job.status !== 'complete' || !video
        || video.paused || video.readyState < 2 || !video.videoWidth || !video.videoHeight
        || !Number.isFinite(video.currentTime) || video.currentTime <= 0) return;
      var evidence = state.evidence;
      if (!evidence || evidence.play_id !== state.access.play_id) evidence = { version: 1, source: 'live_browser', play_id: state.access.play_id, turns: [] };
      var entry = { job_id: job.id, node_id: job.node.id, response_status: 200, status: 'complete',
        playback: { ready_state: video.readyState, video_width: video.videoWidth, video_height: video.videoHeight, played_seconds: video.currentTime } };
      if (job.kind === 'opening') {
        if (evidence.opening) return;
        evidence.opening = entry;
      } else {
        if (evidence.turns.some(function (turn) { return turn.job_id === job.id; })) return;
        entry.action = job.action; entry.parent_id = job.parent_id;
        if (previousJobId) entry.switched_from_job_id = previousJobId;
        if (preparedNodes.has(job.parent_id)) { entry.continuation_parent_id = job.parent_id; entry.frame_upload_status = 200; }
        evidence.turns.push(entry);
      }
      evidence.tested_at = new Date().toISOString(); state.evidence = evidence; save();
    }
    function getEvidence() { return state.evidence ? JSON.parse(JSON.stringify(state.evidence)) : null; }
    async function restore() {
      if (!state.access) return null;
      notify('restoring');
      var saved = await api('/plays/' + encodeURIComponent(state.access.play_id), 'GET', undefined, auth());
      if (!Array.isArray(saved.nodes) || !Array.isArray(saved.jobs)) throw failure('invalid_response', messages.invalid_response);
      state.nodes = saved.nodes; state.jobs = saved.jobs;
      var openingJob = saved.jobs.find(function (job) { return job.kind === 'opening'; });
      if (openingJob) { state.opening_request_id = openingJob.id; state.opening_error = null; }
      // Restoring a page never POSTs: an unknown receipt remains recoverable.
      if (state.pending && saved.jobs.some(function (job) { return job.id === state.pending.request_id && terminal(job); })) state.pending = null;
      save(); notify(state.pending ? 'pending' : 'ready');
      return snapshot();
    }
    async function wait(requestId, settings) {
      settings = settings || {};
      if (waitPromise) return waitPromise;
      waitCancelled = false;
      var until = Date.now() + Math.min(900000, Math.max(0, settings.timeoutMs === undefined ? 900000 : settings.timeoutMs));
      waitPromise = (async function () {
        while (!waitCancelled && Date.now() < until) {
          var job = await poll(requestId);
          if (typeof settings.onUpdate === 'function') settings.onUpdate(job);
          if (terminal(job) || job.status === 'uncertain') return job;
          await new Promise(function (resolve) { global.setTimeout(resolve, Math.min(5000, settings.intervalMs || 2200)); });
        }
        throw failure('poll_paused', messages.poll_paused);
      })();
      try { return await waitPromise; } finally { waitPromise = null; }
    }
    function reset() {
      if (actionPromise || startPromise || framePromises.size || (!(state.access && state.access.expired) && (state.pending || state.jobs.some(function (job) { return !terminal(job); })))) throw failure('pending', messages.pending);
      waitCancelled = true;
      mediaPlayers.forEach(function (player) { player.reset(); }); clearMedia();
      state = { access: null, nodes: [], jobs: [], pending: null, opening_request_id: null, opening_error: null }; save();
    }
    return { start: start, opening: opening, act: act, poll: poll, restore: restore, wait: wait, retry: recover, loadVideo: loadVideo, prepareNextFrame: prepareNextFrame,
      invalidateVideo: invalidateVideo, preloadVideos: preloadVideos, createVideoPlayer: createVideoPlayer, recordPlayback: recordPlayback, getEvidence: getEvidence,
      getMediaCacheStats: function () { return { bytes: mediaBytes, entries: Array.from(mediaEntries).filter(function (entry) { return entry.result && !entry.revoked; }).length, queued: mediaQueue.length, downloading: activeMedia ? 1 : 0 }; },
      releaseMedia: function () { mediaPlayers.forEach(function (player) { player.reset(); }); clearMedia(); },
      dispose: function () { waitCancelled = true; Array.from(mediaPlayers).forEach(function (player) { player.destroy(); }); clearMedia(); },
      getState: snapshot, reset: reset, stopWaiting: function () { waitCancelled = true; },
      configured: Boolean(endpoint && gameId), errorMessage: friendlyError };
  }
  function tailFrame(url, signal) {
    return new Promise(function (resolve, reject) {
      var video, timer, finished = false;
      function done(error, frame) {
        if (finished) return;
        finished = true; global.clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', cancelled);
        if (video) {
          video.onloadeddata = video.onseeked = video.onerror = null;
          video.pause(); video.removeAttribute('src'); video.load();
        }
        if (error) reject(error); else resolve(frame);
      }
      function cancelled() { done(failure('video_cancelled', messages.video_cancelled)); }
      try {
        if (signal && signal.aborted) { cancelled(); return; }
        if (signal) signal.addEventListener('abort', cancelled, { once: true });
        video = global.document.createElement('video');
        video.muted = true; video.playsInline = true; video.preload = 'auto';
        timer = global.setTimeout(function () { done(failure('frame_prepare_failed', messages.frame_prepare_failed)); }, 20000);
        video.onerror = function () { done(failure('frame_prepare_failed', messages.frame_prepare_failed)); };
        video.onloadeddata = function () {
          video.onloadeddata = null;
          if (!Number.isFinite(video.duration) || video.duration <= 0) return done(failure('frame_prepare_failed', messages.frame_prepare_failed));
          video.onseeked = function () {
            var frame = captureFrame(video);
            done(frame ? null : failure('frame_prepare_failed', messages.frame_prepare_failed), frame);
          };
          // Seek the decoded tail, independently of the visible player's position.
          video.currentTime = Math.max(0, video.duration - Math.min(0.05, video.duration / 2));
        };
        video.src = url; video.load();
      } catch (_) { done(failure('frame_prepare_failed', messages.frame_prepare_failed)); }
    });
  }
  function captureFrame(video) {
    if (!video || video.readyState < 2 || !video.videoWidth) return null;
    try {
      var canvas = global.document.createElement('canvas');
      var scale = Math.min(1, 640 / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      var frame = canvas.toDataURL('image/jpeg', 0.75);
      return frame.length <= 1333300 ? frame : null;
    } catch (_) { return null; }
  }
  global.YorollInteractive = { create: create, captureFrame: captureFrame, errorMessage: friendlyError };
})(window);
