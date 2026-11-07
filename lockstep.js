/* Deterministic lockstep runtime for Yoroll multiplayer games. */
(function (global) {
  'use strict';

  // Built-in network diagnostics: append ?netlog=1 to the game URL to enable.
  // Zero overhead when off; logs use the [yoroll-net] prefix.
  var NET_DIAG = typeof location !== 'undefined' && /[?&]netlog=1/.test(location.search);

  var SCALE = 1000;

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function canonical(value) {
    if (value === null || typeof value !== 'object') {
      if (typeof value === 'number' && !Number.isFinite(value)) return 'null';
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    return '{' + Object.keys(value).sort().map(function (key) {
      return JSON.stringify(key) + ':' + canonical(value[key]);
    }).join(',') + '}';
  }

  function checksum(value) {
    var text = canonical(value);
    var hash = 2166136261;
    for (var index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return ('00000000' + (hash >>> 0).toString(16)).slice(-8);
  }

  function Random(seed) {
    this.value = (Number(seed) || 0x6d2b79f5) >>> 0;
  }
  Random.prototype.nextUint = function () {
    var value = this.value;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.value = value >>> 0;
    return this.value;
  };
  Random.prototype.nextFloat = function () { return this.nextUint() / 4294967296; };
  Random.prototype.range = function (minimum, maximum) {
    return minimum + Math.floor(this.nextFloat() * Math.max(0, maximum - minimum));
  };

  var Fixed = {
    SCALE: SCALE,
    from: function (value) { return Math.round((Number(value) || 0) * SCALE); },
    toNumber: function (value) { return (Number(value) || 0) / SCALE; },
    add: function (left, right) { return Math.trunc(left) + Math.trunc(right); },
    sub: function (left, right) { return Math.trunc(left) - Math.trunc(right); },
    mul: function (left, right) { return Math.trunc(Math.trunc(left) * Math.trunc(right) / SCALE); },
    div: function (left, right) {
      if (!right) throw new Error('Fixed.div cannot divide by zero');
      return Math.trunc(Math.trunc(left) * SCALE / Math.trunc(right));
    },
    clamp: function (value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
  };

  var Physics2D = {
    integrate: function (body) {
      body.x = Math.trunc(body.x) + Math.trunc(body.vx || 0);
      body.y = Math.trunc(body.y) + Math.trunc(body.vy || 0);
      return body;
    },
    clamp: function (body, minimumX, minimumY, maximumX, maximumY) {
      body.x = Fixed.clamp(Math.trunc(body.x), minimumX, maximumX);
      body.y = Fixed.clamp(Math.trunc(body.y), minimumY, maximumY);
      return body;
    },
    distanceSquared: function (left, right) {
      var x = Math.trunc(left.x) - Math.trunc(right.x);
      var y = Math.trunc(left.y) - Math.trunc(right.y);
      return x * x + y * y;
    },
    circlesOverlap: function (left, right) {
      var radius = Math.trunc(left.radius || 0) + Math.trunc(right.radius || 0);
      return Physics2D.distanceSquared(left, right) <= radius * radius;
    },
    aabbsOverlap: function (left, right) {
      return Math.abs(Math.trunc(left.x) - Math.trunc(right.x)) * 2
          <= Math.trunc(left.width || 0) + Math.trunc(right.width || 0)
        && Math.abs(Math.trunc(left.y) - Math.trunc(right.y)) * 2
          <= Math.trunc(left.height || 0) + Math.trunc(right.height || 0);
    }
  };

  function transportFromOnline(online) {
    return {
      room: function () { return online.room(); },
      player: function () { return online.player(); },
      isHost: function () { return online.isHost(); },
      connected: function () { return online.connected(); },
      on: function (name, callback) { return online.on(name, callback); },
      sendInput: function (frame, payload) { return online.sendLockstepInput(frame, payload); },
      sendChecksum: function (frame, value) { return online.sendLockstepChecksum(frame, value); },
      sendSnapshot: function (frame, state, value) {
        return online.sendLockstepSnapshot(frame, state, value);
      },
      bootstrap: function () { return online.lockstepBootstrap(); }
    };
  }

  function createController(options) {
    options = options || {};
    if (typeof options.step !== 'function') throw new Error('YorollLockstep requires step(context)');
    var transport = options.transport || transportFromOnline(global.YorollOnline);
    var room = transport.room && transport.room();
    if (!room || !room.config || !room.config.sync || room.config.sync.mode !== 'lockstep') {
      throw new Error('online-game.json must use sync.mode "lockstep"');
    }

    var config = room.config.sync;
    var tickRate = Math.max(1, Number(room.config.tick_rate) || 15);
    var tickMs = 1000 / tickRate;
    var inputDelay = Math.max(0, Math.trunc(Number(config.input_delay_frames) || 0));
    var maxPrediction = Math.max(0, Math.trunc(Number(config.max_prediction_frames) || 0));
    var checksumInterval = Math.max(1, Math.trunc(Number(config.checksum_interval) || 30));
    var snapshotInterval = Math.max(1, Math.trunc(Number(config.snapshot_interval) || 120));
    var historyFrames = Math.max(60, Math.trunc(Number(config.history_frames) || 300));
    var localPlayer = transport.player && transport.player();
    var localId = String(localPlayer && localPlayer.id || 'local');
    var initialState = clone(options.initialState || {});
    var state = clone(initialState);
    var nextFrame = 0;
    var confirmedFrame = -1;
    var accumulator = 0;
    var running = false;
    var raf = 0;
    var lastTime = 0;
    var rollbackCount = 0;
    var desyncFrame = null;
    var authoritative = Object.create(null);
    var localInputs = Object.create(null);
    var sentInputs = Object.create(null);
    var sendRetryAt = Object.create(null);
    var simulatedInputs = Object.create(null);
    var snapshots = Object.create(null);
    var reportedChecksums = Object.create(null);
    var reportedSnapshots = Object.create(null);
    var unsubscribers = [];
    var sessionEpoch = 0;
    var bootstrapPending = false;
    var bootstrapQueued = false;
    var recoveryFailures = 0;
    var recoveryCooldown = 0;
    snapshots[0] = clone(state);

    function reportError(error) {
      if (typeof options.onError === 'function') options.onError(error);
      else if (global.console) console.error('[YorollLockstep]', error);
    }
    function isWatchError(error) {
      return /one \(or more\) of the watched keys has been changed|watch(?:ed)? key/i
        .test(String(error && error.message || error || ''));
    }
    function transientRoomError() {
      var error = new Error('房间连接异常，请稍候重试');
      error.transient = true;
      return error;
    }
    function playerIds() {
      var latest = transport.room && transport.room() || room;
      return (latest.players || []).map(function (player) { return String(player.id); }).sort();
    }
    function inputMap(frame) {
      var official = authoritative[frame];
      var result = Object.create(null);
      if (official) {
        official.inputs.forEach(function (entry) { result[String(entry.player_id)] = clone(entry.payload); });
        return result;
      }
      playerIds().forEach(function (playerId) {
        if (playerId === localId && localInputs[frame]) {
          result[playerId] = clone(localInputs[frame]);
          return;
        }
        if (playerId === localId && typeof options.previewInput === 'function') {
          result[playerId] = clone(options.previewInput(frame));
          return;
        }
        var predicted = null;
        for (var previous = frame - 1; previous >= Math.max(0, frame - historyFrames); previous -= 1) {
          if (playerId === localId && localInputs[previous]) {
            predicted = localInputs[previous];
            break;
          }
          var prior = authoritative[previous];
          if (!prior) continue;
          var found = prior.inputs.find(function (entry) { return String(entry.player_id) === playerId; });
          if (found) { predicted = found.payload; break; }
        }
        result[playerId] = clone(predicted || (typeof options.neutralInput === 'function'
          ? options.neutralInput(playerId, frame) : {}));
      });
      return result;
    }
    function sendInput(frame, payload) {
      if (sentInputs[frame]) return;
      if (sendRetryAt[frame] && Date.now() < sendRetryAt[frame]) return;
      sentInputs[frame] = true;
      Promise.resolve(transport.sendInput(frame, payload)).catch(function (error) {
        delete sentInputs[frame];
        sendRetryAt[frame] = Date.now() + 300;
        if (isWatchError(error)) requestBootstrap();
        else reportError(error);
      });
    }
    function pumpInputs() {
      var firstUnconfirmed = confirmedFrame + 1;
      var liveInputFrame = Math.max(firstUnconfirmed, nextFrame) + inputDelay;
      for (var frame = firstUnconfirmed; frame <= liveInputFrame; frame += 1) {
        if (!localInputs[frame]) localInputs[frame] = clone(typeof options.captureInput === 'function'
          ? options.captureInput(frame) : (typeof options.neutralInput === 'function'
            ? options.neutralInput(localId, frame) : {}));
        sendInput(frame, localInputs[frame]);
      }
    }
    function simulate(frame, replay) {
      snapshots[frame] = clone(state);
      var inputs = inputMap(frame);
      simulatedInputs[frame] = clone(inputs);
      var seed = ((Number(options.seed) || 0x12345678) ^ Math.imul(frame + 1, 2654435761)) >>> 0;
      var context = {
        state: state,
        frame: frame,
        inputs: inputs,
        dt: tickMs,
        fixedDt: Fixed.from(tickMs / 1000),
        random: new Random(seed),
        replaying: !!replay
      };
      var replacement = options.step(context);
      if (replacement !== undefined) state = replacement;
      nextFrame = frame + 1;
      snapshots[nextFrame] = clone(state);
    }
    function trimHistory() {
      var floor = Math.max(0, Math.min(confirmedFrame, nextFrame) - historyFrames);
      [authoritative, localInputs, sentInputs, simulatedInputs, snapshots,
        reportedChecksums, reportedSnapshots].forEach(function (collection) {
        Object.keys(collection).forEach(function (key) {
          if (Number(key) < floor) delete collection[key];
        });
      });
    }
    function reportConfirmedState(frame) {
      var value = snapshots[frame + 1];
      if (!value) return;
      var valueChecksum = (options.checksum || checksum)(value);
      if (frame % checksumInterval === 0 && !reportedChecksums[frame]) {
        reportedChecksums[frame] = true;
        Promise.resolve(transport.sendChecksum(frame, valueChecksum)).catch(reportError);
      }
      if (frame % snapshotInterval === 0 && transport.isHost && transport.isHost() && !reportedSnapshots[frame]) {
        reportedSnapshots[frame] = true;
        Promise.resolve(transport.sendSnapshot(frame, clone(value), valueChecksum)).catch(reportError);
      }
    }
    function rollback(frame) {
      var target = nextFrame;
      var saved = snapshots[frame];
      if (!saved) {
        reportError(new Error('Rollback history is unavailable for frame ' + frame));
        return;
      }
      state = clone(saved);
      nextFrame = frame;
      rollbackCount += 1;
      if (NET_DIAG) console.log('[yoroll-net] rollback #' + rollbackCount, 'frame=' + frame, 'depth=' + (target - frame), 'confirmed=' + confirmedFrame);
      Object.keys(snapshots).forEach(function (key) { if (Number(key) > frame) delete snapshots[key]; });
      Object.keys(simulatedInputs).forEach(function (key) { if (Number(key) >= frame) delete simulatedInputs[key]; });
      while (nextFrame < target) simulate(nextFrame, true);
    }
    function ingestFrames(value) {
      var frames = Array.isArray(value) ? value : value && value.frames;
      if (!Array.isArray(frames)) return;
      var mismatch = null;
      frames.slice().sort(function (left, right) { return left.frame - right.frame; }).forEach(function (frame) {
        var number = Math.trunc(Number(frame.frame));
        if (number < 0) return;
        authoritative[number] = clone(frame);
        if (NET_DIAG && localInputs[number]) {
          var authLocal = (frame.inputs || []).find(function (entry) { return String(entry.player_id) === localId; });
          if (authLocal && canonical(authLocal.payload) !== canonical(localInputs[number])) {
            console.log('[yoroll-net] input-overridden frame=' + number, 'sent=' + JSON.stringify(localInputs[number]), 'auth=' + JSON.stringify(authLocal.payload));
          }
        }
        if (number < nextFrame && simulatedInputs[number]) {
          var actual = inputMap(number);
          if (canonical(actual) !== canonical(simulatedInputs[number])) {
            mismatch = mismatch === null ? number : Math.min(mismatch, number);
          }
        }
      });
      if (mismatch !== null) rollback(mismatch);
      while (authoritative[confirmedFrame + 1]) {
        confirmedFrame += 1;
        reportConfirmedState(confirmedFrame);
      }
      trimHistory();
    }
    function applyBootstrap(value) {
      if (!value) return;
      room = value.room || room;
      authoritative = Object.create(null);
      localInputs = Object.create(null);
      sentInputs = Object.create(null);
      simulatedInputs = Object.create(null);
      reportedChecksums = Object.create(null);
      reportedSnapshots = Object.create(null);
      accumulator = 0;
      var baseFrame = 0;
      if (value.snapshot && value.snapshot.state) {
        state = clone(value.snapshot.state);
        baseFrame = Math.trunc(Number(value.snapshot.frame)) + 1;
      } else {
        state = clone(initialState);
      }
      nextFrame = baseFrame;
      confirmedFrame = baseFrame - 1;
      snapshots = Object.create(null);
      snapshots[nextFrame] = clone(state);
      var frames = Array.isArray(value.frames) ? value.frames : [];
      frames.sort(function (left, right) { return Number(left.frame) - Number(right.frame); });
      if (frames.length > 0 && Number(frames[0].frame) > baseFrame) {
        reportError(new Error('Reconnect timeline has a gap before frame ' + frames[0].frame));
        return;
      }
      for (var frameIndex = 1; frameIndex < frames.length; frameIndex += 1) {
        if (Number(frames[frameIndex].frame) > Number(frames[frameIndex - 1].frame) + 1) {
          reportError(new Error('Reconnect timeline has a gap before frame ' + frames[frameIndex].frame));
          return;
        }
      }
      frames.forEach(function (frame) { authoritative[Math.trunc(Number(frame.frame))] = clone(frame); });
      while (authoritative[nextFrame]) simulate(nextFrame, true);
      confirmedFrame = nextFrame - 1;
      trimHistory();
    }
    function applyRecoverySnapshot(value) {
      if (!value || !value.state || desyncFrame === null || Number(value.frame) < desyncFrame) return;
      var target = nextFrame;
      state = clone(value.state);
      nextFrame = Math.trunc(Number(value.frame)) + 1;
      snapshots[nextFrame] = clone(state);
      Object.keys(snapshots).forEach(function (key) {
        if (Number(key) > nextFrame) delete snapshots[key];
      });
      Object.keys(simulatedInputs).forEach(function (key) {
        if (Number(key) >= nextFrame) delete simulatedInputs[key];
      });
      while (nextFrame < target && authoritative[nextFrame]) simulate(nextFrame, true);
      desyncFrame = null;
      if (typeof options.onResync === 'function') options.onResync(value);
    }
    var diagTicks = 0;
    function advance(deltaMs) {
      if (NET_DIAG && (diagTicks += 1) % 300 === 0) {
        console.log('[yoroll-net] lockstep confirmed=' + confirmedFrame, 'predicted=' + Math.max(0, nextFrame - confirmedFrame - 1), 'rollbacks=' + rollbackCount);
      }
      if (bootstrapQueued && !bootstrapPending) {
        if (recoveryCooldown > 0) recoveryCooldown -= 1;
        else runBootstrap();
      }
      var elapsed = Math.max(0, Math.min(250, Number(deltaMs) || 0));
      accumulator += elapsed;
      pumpInputs();
      var steps = 0;
      while (accumulator >= tickMs && nextFrame <= confirmedFrame + maxPrediction && steps < 8) {
        accumulator -= tickMs;
        simulate(nextFrame, false);
        if (nextFrame - 1 <= confirmedFrame) reportConfirmedState(nextFrame - 1);
        steps += 1;
      }
      if (steps === 8) accumulator = Math.min(accumulator, tickMs);
      // Fast-forward through frames the server has already finalized: replaying
      // authoritative history is risk-free, and staying pinned to the live edge
      // keeps local-input-to-simulation latency at the prediction path (~1 tick)
      // instead of a full network round trip. Client stalls (tab load, GC) can
      // otherwise leave the simulation permanently behind the confirmation
      // stream, because the wall-clock accumulator never regains lost time.
      // Small gaps (typical jitter) drain gently over a few renders so any
      // resulting correction stays smooth; a large backlog (tab backgrounded,
      // long GC pause) drains in a couple of renders instead of trickling
      // visibly over several seconds — replaying finalized history is cheap
      // and risk-free regardless of how many frames are queued.
      var backlog = confirmedFrame - nextFrame + 1;
      var catchUpLimit = backlog > 30 ? Math.min(backlog, 300) : 3;
      var catchUp = 0;
      while (nextFrame <= confirmedFrame && catchUp < catchUpLimit) {
        simulate(nextFrame, false);
        if (nextFrame - 1 <= confirmedFrame) reportConfirmedState(nextFrame - 1);
        catchUp += 1;
      }
      if (typeof options.render === 'function') {
        options.render(state, Math.max(0, Math.min(1, accumulator / tickMs)), metrics());
      }
      return controller;
    }
    function metrics() {
      return {
        currentFrame: nextFrame - 1,
        confirmedFrame: confirmedFrame,
        predictedFrames: Math.max(0, nextFrame - confirmedFrame - 1),
        rollbackCount: rollbackCount,
        desyncFrame: desyncFrame,
        sessionEpoch: sessionEpoch
      };
    }
    function loop(time) {
      if (!running) return;
      if (!lastTime) lastTime = time;
      advance(time - lastTime);
      lastTime = time;
      raf = global.requestAnimationFrame(loop);
    }

    function subscribe() {
      if (unsubscribers.length) return;
      unsubscribers.push(transport.on('lockstep-frames', ingestFrames));
      unsubscribers.push(transport.on('lockstep-bootstrap', applyBootstrap));
      unsubscribers.push(transport.on('connected', function () {
        requestBootstrap(true);
        runBootstrap();
      }));
      unsubscribers.push(transport.on('lockstep-desync', function (value) {
        desyncFrame = Math.trunc(Number(value && value.frame));
        var recoveredState = snapshots[desyncFrame + 1];
        if (recoveredState && transport.isHost && transport.isHost()) {
          var recoveredChecksum = (options.checksum || checksum)(recoveredState);
          Promise.resolve(transport.sendSnapshot(
            desyncFrame,
            clone(recoveredState),
            recoveredChecksum
          )).catch(reportError);
        }
        if (typeof options.onDesync === 'function') options.onDesync(value);
      }));
      unsubscribers.push(transport.on('lockstep-snapshot', applyRecoverySnapshot));
    }
    function requestBootstrap(newSession) {
      if (!running) return;
      if (newSession) {
        sessionEpoch += 1;
        bootstrapPending = false;
        recoveryCooldown = 0;
      }
      bootstrapQueued = true;
      recoveryCooldown = Math.min(recoveryCooldown || 2, 2);
    }
    function runBootstrap() {
      if (!running || bootstrapPending || !transport.bootstrap) return;
      bootstrapPending = true;
      bootstrapQueued = false;
      var epoch = sessionEpoch;
      Promise.resolve(transport.bootstrap()).then(function (value) {
        if (!running || epoch !== sessionEpoch) return;
        recoveryFailures = 0;
        applyBootstrap(value);
      }).catch(function (error) {
        if (!running || epoch !== sessionEpoch) return;
        if (!isWatchError(error)) return reportError(error);
        recoveryFailures += 1;
        if (recoveryFailures >= 3) reportError(transientRoomError());
        else { bootstrapQueued = true; recoveryCooldown = 60; }
      }).finally(function () { bootstrapPending = false; });
    }
    subscribe();

    var controller = {
      start: function () {
        if (running) return controller;
        running = true;
        sessionEpoch += 1;
        subscribe();
        var beginLoop = function () {
          if (running && global.requestAnimationFrame && !raf) raf = global.requestAnimationFrame(loop);
        };
        if (transport.bootstrap) { requestBootstrap(); runBootstrap(); }
        beginLoop();
        return controller;
      },
      stop: function () {
        running = false;
        if (raf && global.cancelAnimationFrame) global.cancelAnimationFrame(raf);
        raf = 0;
        bootstrapPending = false;
        bootstrapQueued = false;
        unsubscribers.splice(0).forEach(function (unsubscribe) { if (unsubscribe) unsubscribe(); });
      },
      advance: advance,
      ingestFrames: ingestFrames,
      applyBootstrap: applyBootstrap,
      state: function () { return state; },
      confirmedState: function () { return snapshots[confirmedFrame + 1] || state; },
      metrics: metrics
    };
    return controller;
  }

  global.YorollLockstep = {
    Fixed: Fixed,
    Physics2D: Physics2D,
    Random: Random,
    canonical: canonical,
    checksum: checksum,
    createController: createController
  };
  if (NET_DIAG) console.log('[yoroll-net] lockstep runtime loaded, diagnostics on');
})(typeof window !== 'undefined' ? window : globalThis);
