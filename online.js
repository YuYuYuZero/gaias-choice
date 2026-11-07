/* Yoroll player services and multiplayer runtime. Idle until the game calls it. */
(function (global) {
  'use strict';
  var listeners = Object.create(null);
  var settings = {
    gameId: global.YOROLL_GAME_ID || inferGameId(),
    gameVersion: global.YOROLL_GAME_VERSION || null,
    endpoint: global.YOROLL_ONLINE_API_ENDPOINT || inferEndpoint(),
    socketPath: '/online/socket.io',
    authToken: null,
    displayName: null
  };
  var socket = null;
  var access = null;
  var connectionEpoch = 0;
  var renewalTimer = null;
  var renewalInFlight = null;
  var cancelPendingConnect = null;
  var accessDeadline = 0;
  var renewalDeadline = 0;
  var inputSequence = 0;
  var playerStateSequence = 0;
  var sharedStateSequence = 0;
  var serverClockOffset = 0;
  var serverClockReady = false;
  // Built-in network diagnostics (?netlog=1): ack round-trip stats + failures.
  var NET_DIAG = typeof location !== 'undefined' && /[?&]netlog=1/.test(location.search);
  var netDiag = { last: 0, avg: 0, max: 0, samples: [], fails: 0 };
  if (NET_DIAG && typeof window !== 'undefined') window.YorollNetDiag = netDiag;
  var netDiagLastLogAt = 0;
  function noteAck(event, rtt) {
    if (!NET_DIAG) return;
    netDiag.samples.push(rtt);
    if (netDiag.samples.length > 60) netDiag.samples.shift();
    netDiag.last = rtt;
    if (rtt > netDiag.max) netDiag.max = rtt;
    var total = 0;
    for (var index = 0; index < netDiag.samples.length; index += 1) total += netDiag.samples[index];
    netDiag.avg = total / netDiag.samples.length;
    var now = Date.now();
    if (rtt > 200) {
      console.log('[yoroll-net] slow ack', event, rtt.toFixed(0) + 'ms', 'avg=' + netDiag.avg.toFixed(0) + 'ms');
    } else if (now - netDiagLastLogAt > 5000) {
      netDiagLastLogAt = now;
      console.log('[yoroll-net] ack avg=' + netDiag.avg.toFixed(0) + 'ms max=' + netDiag.max.toFixed(0) + 'ms fails=' + netDiag.fails);
    }
  }

  function inferGameId() {
    var match = String(location.pathname).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    return match ? match[0] : '';
  }
  function inferEndpoint() {
    var host = location.hostname;
    if (host === 'vibe-games.yoroll.ai') return 'https://code.yoroll.ai';
    if (host === 'test-vibe-games.yoroll.ai') return 'https://test-code.yoroll.ai';
    if (host === 'localhost' || host === '127.0.0.1') return location.origin;
    return location.origin;
  }
  function guestId() {
    var key = 'yoroll-online-guest-id';
    try {
      var existing = localStorage.getItem(key);
      if (existing) return existing;
      var created = global.crypto && global.crypto.randomUUID
        ? global.crypto.randomUUID()
        : 'guest-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
      localStorage.setItem(key, created);
      return created;
    } catch (_) { return 'guest-' + Math.random().toString(36).slice(2); }
  }
  function emit(name, value) {
    (listeners[name] || []).slice().forEach(function (callback) {
      try { callback(value); } catch (error) { console.error('[YorollOnline]', error); }
    });
  }
  function boundedNumber(value, fallback, minimum, maximum) {
    var number = Number(value);
    if (!Number.isFinite(number)) number = fallback;
    return Math.max(minimum, Math.min(maximum, number));
  }
  function normalizedAxis(x, y) {
    var axisX = Math.max(-1, Math.min(1, Number(x) || 0));
    var axisY = Math.max(-1, Math.min(1, Number(y) || 0));
    var magnitude = Math.hypot(axisX, axisY) || 1;
    if (magnitude > 1) {
      axisX /= magnitude;
      axisY /= magnitude;
    }
    return { x: axisX, y: axisY };
  }
  function syncServerClock(serverTime) {
    if (!Number.isFinite(serverTime)) return;
    var sample = serverTime - Date.now();
    if (!serverClockReady) {
      serverClockOffset = sample;
      serverClockReady = true;
      return;
    }
    // Network jitter must not move the interpolation timeline backwards and forwards.
    serverClockOffset += Math.max(-50, Math.min(50, sample - serverClockOffset)) * 0.1;
  }
  function ensureGameId() {
    if (!settings.gameId) throw new Error('YorollOnline requires a gameId');
  }
  function headers() {
    var result = { 'Content-Type': 'application/json' };
    if (settings.authToken) result.Authorization = 'Bearer ' + settings.authToken;
    return result;
  }
  function api(path, options) {
    options = options || {};
    return fetch(settings.endpoint.replace(/\/+$/, '') + '/api/v1/online' + path, {
      method: options.method || 'GET', headers: headers(), credentials: 'include',
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    }).then(function (response) {
      return response.json().catch(function () { return null; }).then(function (payload) {
        if (!response.ok || !payload || payload.code !== 0) {
          var error = new Error(payload && payload.msg || 'Online request failed (' + response.status + ')');
          error.status = response.status;
          error.code = payload && payload.code;
          throw error;
        }
        return payload.data;
      });
    });
  }
  function cancelledConnection() { return new Error('Online connection was cancelled'); }
  function roomAllowsRenewal(room) {
    return !!room && (room.phase !== 'finished' ||
      (room.config && room.config.ruleset === 'artillery-v1' && !room.termination_reason));
  }
  function clearRenewalTimer() {
    if (renewalTimer !== null) clearTimeout(renewalTimer);
    renewalTimer = null;
  }
  function disconnect() {
    connectionEpoch += 1;
    clearRenewalTimer();
    renewalInFlight = null;
    accessDeadline = 0; renewalDeadline = 0;
    var previous = socket;
    socket = null; access = null;
    if (cancelPendingConnect) cancelPendingConnect(cancelledConnection());
    cancelPendingConnect = null;
    if (previous) previous.disconnect();
  }
  function roomRequest(path, values) {
    ensureGameId();
    disconnect();
    var epoch = connectionEpoch;
    return api(path, { method: 'POST', body: Object.assign({
      game_id: settings.gameId, game_version: settings.gameVersion,
      guest_id: guestId(), display_name: settings.displayName
    }, values || {}) }).then(function (nextAccess) {
      if (epoch !== connectionEpoch) throw cancelledConnection();
      return connectAccess(nextAccess, epoch);
    });
  }
  function updateAccessDeadlines(value) {
    // Use the server's relative lifetime, even when the player's clock is wrong.
    var serverNow = Number(value.server_time) || Date.now();
    accessDeadline = value.access_expires_at ? Date.now() + Number(value.access_expires_at) - serverNow : 0;
    renewalDeadline = value.renewal_expires_at ? Date.now() + Number(value.renewal_expires_at) - serverNow : 0;
  }
  function scheduleRenewal(epoch, retry) {
    clearRenewalTimer();
    if (epoch !== connectionEpoch || !access || !access.renewal_token || !accessDeadline) return;
    if (renewalDeadline && renewalDeadline - Date.now() < 60000) return;
    var delay = retry ? 15000 : Math.max(1000, accessDeadline - Date.now() - 60000);
    renewalTimer = setTimeout(function () {
      renewalTimer = null;
      renewAccess(false, epoch).then(function () {
        if (epoch === connectionEpoch && socket && !socket.connected) socket.connect();
      }).catch(function (error) {
        if (epoch === connectionEpoch) emit('error', error);
      });
    }, delay);
    if (renewalTimer && renewalTimer.unref) renewalTimer.unref();
  }
  function renewAccess(force, epoch) {
    if (epoch !== connectionEpoch || !access) return Promise.reject(cancelledConnection());
    if (!access.renewal_token) return Promise.resolve(access); // older API rolling upgrade
    if (renewalInFlight) return renewalInFlight;
    if (!force && accessDeadline > Date.now() + 60000) return Promise.resolve(access);
    var original = access;
    var operation = api('/rooms/renew', { method: 'POST', body: { renewal_token: original.renewal_token } })
      .then(function (refreshed) {
        if (epoch !== connectionEpoch || access !== original || !roomAllowsRenewal(access.room)) throw cancelledConnection();
        if (!refreshed || !refreshed.access_token || !refreshed.room || !refreshed.player
          || refreshed.room.code !== original.room.code || refreshed.room.game_id !== original.room.game_id
          || refreshed.room.game_version !== original.room.game_version || refreshed.player.id !== original.player.id) {
          throw new Error('Renewed room credential does not match the active game');
        }
        access = refreshed;
        updateAccessDeadlines(refreshed);
        scheduleRenewal(epoch, false);
        return refreshed;
      }).catch(function (error) {
        if (epoch === connectionEpoch) {
          if (error.status === 401 || error.status === 403 || error.status === 404) {
            clearRenewalTimer();
            // Stop retrying a revoked seat or an absolutely expired session.
            if (access) access.renewal_token = null;
          } else scheduleRenewal(epoch, true);
        }
        throw error;
      }).then(function (result) {
        if (renewalInFlight === operation) renewalInFlight = null;
        return result;
      }, function (error) {
        if (renewalInFlight === operation) renewalInFlight = null;
        throw error;
      });
    renewalInFlight = operation;
    return operation;
  }
  function connectAccess(nextAccess, epoch) {
    if (!global.io) throw new Error('socket.io.min.js must load before online.js');
    access = nextAccess;
    updateAccessDeadlines(nextAccess);
    inputSequence = 0;
    playerStateSequence = 0;
    sharedStateSequence = 0;
    serverClockReady = false;
    // The API origin stays fixed. Production's realtime endpoint only serves
    // WebSockets and must never replace the origin used for /api/v1/online.
    var connection = global.io(nextAccess.endpoint || global.YOROLL_ONLINE_ENDPOINT || settings.endpoint, {
      path: nextAccess.socket_path || settings.socketPath, transports: ['websocket'], upgrade: false,
      auth: function (callback) {
        renewAccess(false, epoch).then(function (current) {
          if (epoch === connectionEpoch) callback({ token: current.access_token });
        }).catch(function (error) {
          if (epoch !== connectionEpoch || !access) return;
          emit('error', error);
          // Complete the failed handshake so Socket.IO is not stranded waiting
          // for auth. A transient HTTP failure is retried by the bounded timer.
          callback({ token: access.access_token });
        });
      },
      reconnection: true, reconnectionAttempts: 12,
      reconnectionDelay: 500, reconnectionDelayMax: 4000, timeout: 10000
    });
    socket = connection;
    function current() { return epoch === connectionEpoch && socket === connection && !!access; }
    function guarded(callback) { return function (value) { if (current()) callback(value); }; }
    connection.on('connect', guarded(function () { emit('connect', { socketId: connection.id }); }));
    connection.on('disconnect', guarded(function (reason) { emit('disconnect', { reason: reason }); }));
    connection.on('connect_error', guarded(function (error) {
      if (error && error.data && error.data.code === 'game_connection_limit') {
        clearRenewalTimer(); access.renewal_token = null;
      }
      emit('error', error);
      if (access.renewal_token && /token|expired|credential|timestamp/i.test(String(error && error.message))) {
        renewAccess(true, epoch).then(function () {
          if (current() && !connection.connected) connection.connect();
        }).catch(function () {});
      }
    }));
    connection.on('online:error', guarded(function (error) {
      if (error && (error.retryable === false || /^(expired|resource_limit|not_found|finished)$/.test(error.code))) {
        clearRenewalTimer(); access.renewal_token = null;
      }
      emit('error', error);
    }));
    connection.on('online:connected', guarded(function (value) {
      syncServerClock(value.server_time);
      access.room = value.room; emit('connected', value);
    }));
    connection.on('online:state', guarded(function (value) {
      syncServerClock(value.server_time);
      var previous = access.room;
      access.room = value;
      if (previous && previous.phase === 'finished' && value.phase !== 'finished' && roomAllowsRenewal(value)) scheduleRenewal(epoch, false);
      emit('state', value);
    }));
    connection.on('online:action', guarded(function (value) { emit('action', value); }));
    connection.on('online:lockstep-bootstrap', guarded(function (value) { emit('lockstep-bootstrap', value); }));
    connection.on('online:lockstep-frames', guarded(function (value) { emit('lockstep-frames', value); }));
    connection.on('online:lockstep-desync', guarded(function (value) { emit('lockstep-desync', value); }));
    connection.on('online:lockstep-snapshot', guarded(function (value) { emit('lockstep-snapshot', value); }));
    connection.on('online:finished', guarded(function (value) {
      access.room = value;
      if (roomAllowsRenewal(value)) scheduleRenewal(epoch, false);
      else { clearRenewalTimer(); access.renewal_token = null; }
      emit('finished', value);
    }));
    scheduleRenewal(epoch, false);
    return new Promise(function (resolve, reject) {
      function fail(error) { clearTimeout(timeout); if (cancelPendingConnect === fail) cancelPendingConnect = null; reject(error); }
      var timeout = setTimeout(function () { fail(new Error('Realtime connection timed out')); }, 12000);
      cancelPendingConnect = fail;
      connection.once('online:connected', function (value) {
        if (!current()) return;
        clearTimeout(timeout); if (cancelPendingConnect === fail) cancelPendingConnect = null;
        resolve({ room: value.room, player: nextAccess.player, roomCode: value.room.code });
      });
      connection.once('connect_error', function (error) {
        if (current() && !(access.renewal_token && /token|expired|credential|timestamp/i.test(String(error && error.message)))) fail(error);
      });
    });
  }
  function send(event, value) {
    var sentAt = NET_DIAG ? Date.now() : 0;
    if (!socket || !socket.connected) {
      if (NET_DIAG) { netDiag.fails += 1; console.log('[yoroll-net] send-fail', event, 'socket-not-connected'); }
      return Promise.reject(new Error('Not connected to an online room'));
    }
    return new Promise(function (resolve, reject) {
      socket.timeout(5000).emit(event, value, function (error, response) {
        if (NET_DIAG) noteAck(event, Date.now() - sentAt);
        if (error) {
          if (NET_DIAG) { netDiag.fails += 1; console.log('[yoroll-net] send-fail', event, String(error && error.message || error)); }
          return reject(new Error('Online server did not acknowledge the event'));
        }
        if (!response || response.ok !== true) {
          var failure = new Error(response && response.error || 'Online event failed');
          if (response && response.code) failure.code = response.code;
          if (response && response.retry_after_ms) failure.retryAfterMs = response.retry_after_ms;
          return reject(failure);
        }
        resolve(response.data);
      });
    });
  }
  function isWatchedKeysConflict(error) {
    return /one \(or more\) of the watched keys has been changed/i.test(String(error && error.message || error || ''));
  }
  function sendWithRetry(event, value, options) {
    options = options || {};
    var attempts = Math.max(1, Math.min(6, Math.trunc(Number(options.attempts) || 4)));
    var baseDelayMs = Math.max(1, Math.min(250, Number(options.baseDelayMs) || 20));
    function attempt(number) {
      return send(event, value).catch(function (error) {
        if (!isWatchedKeysConflict(error) || number >= attempts) throw error;
        var ceiling = Math.min(500, baseDelayMs * Math.pow(2, number - 1));
        var delay = Math.max(1, Math.floor(ceiling / 2 + Math.random() * ceiling / 2));
        return new Promise(function (resolve) { setTimeout(resolve, delay); })
          .then(function () { return attempt(number + 1); });
      });
    }
    return attempt(1);
  }
  function sendInputFrame(x, y) {
    var axis = normalizedAxis(x, y);
    inputSequence += 1;
    var sequence = inputSequence;
    return {
      sequence: sequence,
      promise: send('online:input', { sequence: sequence, x: axis.x, y: axis.y })
    };
  }

  function createMovementController(options) {
    options = options || {};
    var initialRoom = access && access.room;
    var initialConfig = initialRoom && initialRoom.config || {};
    var initialWorld = initialConfig.world || {};
    var localPlayer = access && access.player;
    if (!initialRoom || !localPlayer) {
      throw new Error('Create the movement controller after joining an online room');
    }
    // Prediction must use the exact server-approved simulation parameters.
    var speed = boundedNumber(initialWorld.speed, 240, 1, 2000);
    var tickRate = boundedNumber(initialConfig.tick_rate, 15, 5, 30);
    var tickMs = 1000 / tickRate;
    var interpolationMs = boundedNumber(options.interpolationMs, Math.max(90, tickMs * 2), 50, 300);
    var correctionMs = boundedNumber(options.correctionMs, 120, 16, 500);
    var maxExtrapolationMs = boundedNumber(options.maxExtrapolationMs, tickMs * 1.5, 0, 200);
    var hardSnapDistance = boundedNumber(options.hardSnapDistance, speed * 0.8, 16, 2000);
    var worldWidth = boundedNumber(initialWorld.width, 1280, 1, 20000);
    var worldHeight = boundedNumber(initialWorld.height, 720, 1, 20000);
    var localId = String(localPlayer.id);
    var desiredInput = { x: 0, y: 0 };
    var displayPosition = null;
    var predictedPosition = null;
    var pendingInputs = [];
    var remoteSamples = Object.create(null);
    var knownPlayers = Object.create(null);
    var correction = { x: 0, y: 0 };
    var sendAccumulator = 0;
    var lastAcknowledgedInput = -1;
    var destroyed = false;

    function clampPosition(position) {
      position.x = Math.max(0, Math.min(worldWidth, position.x));
      position.y = Math.max(0, Math.min(worldHeight, position.y));
      return position;
    }
    function integrate(position, axis, deltaMs) {
      position.x += axis.x * speed * deltaMs / 1000;
      position.y += axis.y * speed * deltaMs / 1000;
      return clampPosition(position);
    }
    function copyPosition(position) {
      return position ? { x: position.x, y: position.y } : null;
    }
    function reportError(error) {
      if (typeof options.onError === 'function') options.onError(error);
      else emit('error', error);
    }
    function pushRemoteSample(player, serverTime) {
      var samples = remoteSamples[player.id] || (remoteSamples[player.id] = []);
      var sample = { time: serverTime, x: Number(player.x) || 0, y: Number(player.y) || 0 };
      var latest = samples[samples.length - 1];
      if (latest && latest.time === sample.time) samples[samples.length - 1] = sample;
      else samples.push(sample);
      if (samples.length > 24) samples.splice(0, samples.length - 24);
    }
    function acknowledgeLocal(player) {
      var authoritative = { x: Number(player.x) || 0, y: Number(player.y) || 0 };
      if (!displayPosition || !predictedPosition) {
        displayPosition = copyPosition(authoritative);
        predictedPosition = copyPosition(authoritative);
      }
      var acknowledged = Number(player.last_processed_input_sequence);
      if (!Number.isFinite(acknowledged) || acknowledged <= lastAcknowledgedInput) return;
      var matched = null;
      for (var index = 0; index < pendingInputs.length; index += 1) {
        if (pendingInputs[index].sequence <= acknowledged) matched = pendingInputs[index];
      }
      if (matched) {
        var errorX = authoritative.x - matched.x;
        var errorY = authoritative.y - matched.y;
        var errorDistance = Math.hypot(errorX, errorY);
        predictedPosition.x += errorX;
        predictedPosition.y += errorY;
        clampPosition(predictedPosition);
        for (var pendingIndex = 0; pendingIndex < pendingInputs.length; pendingIndex += 1) {
          if (pendingInputs[pendingIndex].sequence > acknowledged) {
            pendingInputs[pendingIndex].x += errorX;
            pendingInputs[pendingIndex].y += errorY;
          }
        }
        if (errorDistance >= hardSnapDistance) {
          displayPosition = copyPosition(predictedPosition);
          correction.x = 0;
          correction.y = 0;
        } else {
          correction.x += errorX;
          correction.y += errorY;
        }
      }
      pendingInputs = pendingInputs.filter(function (input) { return input.sequence > acknowledged; });
      lastAcknowledgedInput = acknowledged;
    }
    function ingestRoom(room) {
      if (!room || !Array.isArray(room.players)) return;
      var serverTime = Number(room.server_time) || Date.now();
      var present = Object.create(null);
      room.players.forEach(function (player) {
        present[player.id] = true;
        knownPlayers[player.id] = player;
        if (player.id === localId) acknowledgeLocal(player);
        else pushRemoteSample(player, serverTime);
      });
      Object.keys(knownPlayers).forEach(function (playerId) {
        if (present[playerId]) return;
        delete knownPlayers[playerId];
        delete remoteSamples[playerId];
        if (typeof options.removeRemote === 'function') options.removeRemote(playerId);
      });
    }
    function sampleRemote(playerId) {
      var samples = remoteSamples[playerId] || [];
      if (samples.length === 0) return null;
      var targetTime = runtime.serverTime() - interpolationMs;
      if (targetTime <= samples[0].time) return copyPosition(samples[0]);
      for (var index = 1; index < samples.length; index += 1) {
        var previous = samples[index - 1];
        var next = samples[index];
        if (targetTime > next.time) continue;
        var range = Math.max(1, next.time - previous.time);
        var amount = Math.max(0, Math.min(1, (targetTime - previous.time) / range));
        return {
          x: previous.x + (next.x - previous.x) * amount,
          y: previous.y + (next.y - previous.y) * amount
        };
      }
      var latest = samples[samples.length - 1];
      if (samples.length < 2 || maxExtrapolationMs <= 0) return copyPosition(latest);
      var beforeLatest = samples[samples.length - 2];
      var sampleDelta = Math.max(1, latest.time - beforeLatest.time);
      var extrapolation = Math.max(0, Math.min(maxExtrapolationMs, targetTime - latest.time));
      return clampPosition({
        x: latest.x + (latest.x - beforeLatest.x) / sampleDelta * extrapolation,
        y: latest.y + (latest.y - beforeLatest.y) / sampleDelta * extrapolation
      });
    }

    var unsubscribeState = runtime.on('state', ingestRoom);
    ingestRoom(initialRoom);

    var controller = {
      setInput: function (x, y) {
        desiredInput = normalizedAxis(x, y);
        return controller;
      },
      update: function (deltaMs) {
        if (destroyed) return controller;
        var elapsed = boundedNumber(deltaMs, 0, 0, 100);
        if (displayPosition) integrate(displayPosition, desiredInput, elapsed);
        if (displayPosition && (correction.x !== 0 || correction.y !== 0)) {
          var correctionAmount = 1 - Math.exp(-elapsed / correctionMs);
          var stepX = correction.x * correctionAmount;
          var stepY = correction.y * correctionAmount;
          displayPosition.x += stepX;
          displayPosition.y += stepY;
          correction.x -= stepX;
          correction.y -= stepY;
          clampPosition(displayPosition);
        }
        sendAccumulator += elapsed;
        var sentFrames = 0;
        while (runtime.connected() && predictedPosition && sendAccumulator >= tickMs && sentFrames < 3) {
          sendAccumulator -= tickMs;
          integrate(predictedPosition, desiredInput, tickMs);
          var outbound = sendInputFrame(desiredInput.x, desiredInput.y);
          pendingInputs.push({
            sequence: outbound.sequence,
            x: predictedPosition.x,
            y: predictedPosition.y
          });
          if (pendingInputs.length > 120) pendingInputs.shift();
          outbound.promise.catch(reportError);
          sentFrames += 1;
        }
        if (!runtime.connected()) sendAccumulator = Math.min(sendAccumulator, tickMs);
        if (sentFrames === 3) sendAccumulator = Math.min(sendAccumulator, tickMs);
        if (displayPosition && typeof options.applyLocal === 'function') {
          options.applyLocal(copyPosition(displayPosition), knownPlayers[localId] || null);
        }
        if (typeof options.applyRemote === 'function') {
          Object.keys(knownPlayers).forEach(function (playerId) {
            if (playerId === localId) return;
            var position = sampleRemote(playerId);
            if (position) options.applyRemote(playerId, position, knownPlayers[playerId]);
          });
        }
        return controller;
      },
      position: function (playerId) {
        var id = String(playerId || localId);
        return id === localId ? copyPosition(displayPosition) : sampleRemote(id);
      },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        unsubscribeState();
      }
    };
    return controller;
  }

  var runtime = {
    configure: function (options) {
      options = options || {};
      disconnect();
      if (Object.prototype.hasOwnProperty.call(options, 'gameVersion')) settings.gameVersion = options.gameVersion ? String(options.gameVersion) : null;
      if (options.gameId) settings.gameId = String(options.gameId);
      if (options.endpoint) settings.endpoint = String(options.endpoint).replace(/\/+$/, '');
      if (options.apiEndpoint) settings.endpoint = String(options.apiEndpoint).replace(/\/+$/, '');
      if (options.socketPath) settings.socketPath = String(options.socketPath);
      // Only a player's own runtime credential; never bake creator tokens into source.
      if (Object.prototype.hasOwnProperty.call(options, 'authToken')) settings.authToken = options.authToken ? String(options.authToken) : null;
      if (options.displayName) settings.displayName = String(options.displayName).slice(0, 32);
      return runtime;
    },
    createRoom: function (options) {
      options = options || {}; return roomRequest('/rooms', { visibility: options.public ? 'public' : 'private' });
    },
    joinRoom: function (code) { return roomRequest('/rooms/join', { room_code: String(code || '').toUpperCase() }); },
    quickMatch: function () { return roomRequest('/matchmake'); },
    ready: function (ready) { return send('online:ready', ready !== false); },
    sendInput: function (x, y) { return sendInputFrame(x, y).promise; },
    sendLockstepInput: function (frame, payload) {
      return sendWithRetry('online:lockstep-input', {
        frame: Math.trunc(Number(frame)), payload: payload || {}
      });
    },
    sendLockstepChecksum: function (frame, checksum) {
      return sendWithRetry('online:lockstep-checksum', {
        frame: Math.trunc(Number(frame)), checksum: String(checksum || '')
      });
    },
    sendLockstepSnapshot: function (frame, state, checksum) {
      return sendWithRetry('online:lockstep-snapshot', {
        frame: Math.trunc(Number(frame)), state: state || {}, checksum: String(checksum || '')
      });
    },
    lockstepBootstrap: function () { return sendWithRetry('online:lockstep-bootstrap', {}); },
    createMovementController: createMovementController,
    sendAction: function (name, payload, options) {
      options = options || {};
      return send('online:action', {
        name: String(name || ''), payload: payload,
        dedupe_key: options.dedupeKey ? String(options.dedupeKey) : undefined
      });
    },
    sendPlayerState: function (state) {
      playerStateSequence += 1;
      return send('online:player-state', { sequence: playerStateSequence, state: state || {} });
    },
    setSharedState: function (state) {
      sharedStateSequence += 1;
      return send('online:shared-state', { sequence: sharedStateSequence, state: state || {} });
    },
    publishState: function (state) { return runtime.setSharedState(state); },
    finish: function () { return send('online:finish', {}); },
    save: function (data, options) {
      ensureGameId(); options = options || {};
      return api('/games/' + encodeURIComponent(settings.gameId) + '/save?slot=' + encodeURIComponent(options.slot || 'default'), {
        method: 'PUT', body: { data: data, version: options.version || 1 }
      });
    },
    loadSave: function (options) {
      ensureGameId(); options = options || {};
      return api('/games/' + encodeURIComponent(settings.gameId) + '/save?slot=' + encodeURIComponent(options.slot || 'default'));
    },
    leaderboard: function (options) {
      ensureGameId(); options = options || {};
      return api('/games/' + encodeURIComponent(settings.gameId) + '/leaderboard?board=' + encodeURIComponent(options.board || 'global') + '&limit=' + encodeURIComponent(options.limit || 50));
    },
    submitScore: function (score, options) {
      ensureGameId(); options = options || {};
      return api('/games/' + encodeURIComponent(settings.gameId) + '/leaderboard', {
        method: 'POST', body: {
          score: score, board: options.board || 'global',
          guest_id: guestId(), display_name: settings.displayName
        }
      });
    },
    identity: function () {
      ensureGameId();
      return api('/games/' + encodeURIComponent(settings.gameId) + '/player');
    },
    on: function (name, callback) {
      if (!listeners[name]) listeners[name] = []; listeners[name].push(callback);
      return function () { runtime.off(name, callback); };
    },
    off: function (name, callback) {
      if (listeners[name]) listeners[name] = listeners[name].filter(function (item) { return item !== callback; });
    },
    disconnect: disconnect,
    room: function () { return access && access.room || null; },
    player: function () { return access && access.player || null; },
    isHost: function () {
      return !!(access && access.room && access.player && access.room.host_id === access.player.id);
    },
    serverTime: function () { return Date.now() + serverClockOffset; },
    elapsedMs: function () {
      var room = access && access.room;
      return room && room.started_at ? Math.max(0, runtime.serverTime() - room.started_at) : 0;
    },
    connected: function () { return !!(socket && socket.connected); }
  };
  global.YorollOnline = runtime;
})(window);
