/*
 * juice.js — Reusable "juice" (game-feel) effects for Phaser 3 (3.60+).
 *
 * Plain script (NO module / NO imports). Defines globals `window.Juice`
 * and `window.VFX` (alias) so generated code can use either name safely.
 * Self-contained: needs NO external assets. Tiny textures are generated lazily
 * on first use, guarded so they are only created once per texture-manager.
 *
 * Every function no-ops safely if required args are missing, and wraps risky
 * particle/tween creation in try/catch so a bad call can never crash the game.
 *
 * ---------------------------------------------------------------------------
 * API (signatures + 1-line usage example)
 * ---------------------------------------------------------------------------
 * Juice.buttonPress(target, opts)                     // Juice.buttonPress(playBtn, { onClick: start })
 * Juice.pulse(target, scale=1.12, ms=180)             // Juice.pulse(scoreIcon, 1.2, 160)
 * Juice.idleBob(target, distance=6, ms=1200)          // Juice.idleBob(player, 5, 1000)
 * Juice.shake(scene, intensity=0.008, ms=200)         // Juice.shake(this, 0.01, 250)
 * Juice.screenShake(scene, intensity=0.008, ms=200)   // Juice.screenShake(this, 0.012, 220)
 * Juice.flash(scene, colorHex=0xffffff, ms=120)       // Juice.flash(this, 0xff0000, 150)
 * Juice.hitFlash(target, ms=90)                       // Juice.hitFlash(enemySprite, 90)
 * Juice.squash(target, amount=0.25, ms=120)           // Juice.squash(player, 0.3, 120)
 * Juice.popText(scene, x, y, text, color='#ffffff')   // Juice.popText(this, x, y, '-12', '#ff5555')
 * Juice.floatingText(scene, x, y, text, opts)         // Juice.floatingText(this, x, y, '+10', { color:'#ffd166' })
 * Juice.damageNumber(scene, x, y, amount, opts)       // Juice.damageNumber(this, enemy.x, enemy.y, 12)
 * Juice.burst(scene, x, y, color=0xffcc33, count=14)  // Juice.burst(this, x, y, 0xffcc33, 16)
 * Juice.sparks(scene, x, y, color=0xffffff, count=8)  // Juice.sparks(this, x, y, 0x88ddff, 10)
 * Juice.shockwave(scene, x, y, color=0xffffff)        // Juice.shockwave(this, x, y, 0xffffff)
 * Juice.healGlow(scene, x, y)                         // Juice.healGlow(this, player.x, player.y)
 * Juice.confetti(scene, opts)                         // Juice.confetti(this, { count: 90 })
 * Juice.coinFly(scene, from, to, opts)                // Juice.coinFly(this, coin, hudCoin, { count: 5 })
 * Juice.progressTween(scene, target, to, opts)        // Juice.progressTween(this, hpFill, hp / maxHp)
 * Juice.sceneTransition(scene, next, opts)            // Juice.sceneTransition(this, 'GameOver')
 * Juice.hitstop(scene, ms=60)                         // Juice.hitstop(this, 80)
 * Juice.trail(scene, target, ms=300)                  // Juice.trail(this, player, 300)
 * ---------------------------------------------------------------------------
 */
(function (root) {
  'use strict';

  var DOT_KEY = '__juice_dot';
  var STAR_KEY = '__juice_star';
  var RING_KEY = '__juice_ring';

  // --- internal helpers ----------------------------------------------------

  function valid(scene) {
    return !!(scene && scene.add && scene.sys && scene.sys.isActive && scene.sys.isActive());
  }

  // Lazily generate a small white filled circle texture (used by particles).
  function ensureDot(scene) {
    try {
      if (!scene || !scene.textures) return DOT_KEY;
      if (scene.textures.exists(DOT_KEY)) return DOT_KEY;
      var g = scene.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xffffff, 1);
      g.fillCircle(8, 8, 8);
      g.generateTexture(DOT_KEY, 16, 16);
      g.destroy();
    } catch (e) {}
    return DOT_KEY;
  }

  // Lazily generate a small white 4-point star texture.
  function ensureStar(scene) {
    try {
      if (!scene || !scene.textures) return STAR_KEY;
      if (scene.textures.exists(STAR_KEY)) return STAR_KEY;
      var g = scene.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xffffff, 1);
      // diamond-ish star (cheap, readable as a spark)
      var c = 8;
      g.beginPath();
      g.moveTo(c, 0);
      g.lineTo(c + 2, c - 2);
      g.lineTo(16, c);
      g.lineTo(c + 2, c + 2);
      g.lineTo(c, 16);
      g.lineTo(c - 2, c + 2);
      g.lineTo(0, c);
      g.lineTo(c - 2, c - 2);
      g.closePath();
      g.fillPath();
      g.generateTexture(STAR_KEY, 16, 16);
      g.destroy();
    } catch (e) {}
    return STAR_KEY;
  }

  // Lazily generate a white ring (stroked circle) texture for shockwaves.
  function ensureRing(scene) {
    try {
      if (!scene || !scene.textures) return RING_KEY;
      if (scene.textures.exists(RING_KEY)) return RING_KEY;
      var g = scene.make.graphics({ x: 0, y: 0, add: false });
      g.lineStyle(6, 0xffffff, 1);
      g.strokeCircle(32, 32, 28);
      g.generateTexture(RING_KEY, 64, 64);
      g.destroy();
    } catch (e) {}
    return RING_KEY;
  }

  // Auto-destroy an emitter (or its manager) once particles have died out.
  function autoDestroy(scene, emitter, lifespanMs) {
    if (!emitter || !scene || !scene.time) return;
    var delay = (lifespanMs || 1000) + 250;
    scene.time.delayedCall(delay, function () {
      try {
        if (emitter && emitter.destroy) emitter.destroy();
      } catch (e) {}
    });
  }

  function isObj(value) {
    return !!(value && typeof value === 'object' && !Array.isArray(value));
  }

  function num(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function alive(target) {
    return !!(target && target.active !== false && target.destroyed !== true);
  }

  function sceneOf(target) {
    return target && target.scene;
  }

  function asOptions(value) {
    return isObj(value) ? value : {};
  }

  function hexColor(value, fallback) {
    if (typeof value === 'number' && isFinite(value)) return value;
    if (typeof value === 'string') {
      var s = value.trim();
      if (s.charAt(0) === '#') {
        var body = s.slice(1);
        if (body.length === 3) body = body.charAt(0) + body.charAt(0) + body.charAt(1) + body.charAt(1) + body.charAt(2) + body.charAt(2);
        if (body.length === 8) body = body.slice(0, 6);
        var parsed = parseInt(body, 16);
        if (isFinite(parsed)) return parsed;
      }
      if (s.indexOf('0x') === 0 || s.indexOf('0X') === 0) {
        var hex = parseInt(s.slice(2), 16);
        if (isFinite(hex)) return hex;
      }
    }
    return fallback == null ? 0xffffff : fallback;
  }

  function cssColor(value, fallback) {
    if (typeof value === 'string') return value;
    var hex = hexColor(value, fallback == null ? 0xffffff : fallback);
    var out = hex.toString(16);
    while (out.length < 6) out = '0' + out;
    return '#' + out.slice(-6);
  }

  function pointFrom(value, yFallback) {
    if (typeof value === 'number') {
      return { x: value, y: num(yFallback, 0) };
    }
    if (!value) return { x: 0, y: 0 };
    if (typeof value.getCenter === 'function') {
      try {
        var center = value.getCenter();
        if (center && isFinite(center.x) && isFinite(center.y)) return { x: center.x, y: center.y };
      } catch (e) {}
    }
    return {
      x: num(value.x, 0),
      y: num(value.y, 0)
    };
  }

  function safeTween(scene, config) {
    try {
      if (!valid(scene) || !scene.tweens || !config) return null;
      return scene.tweens.add(config);
    } catch (e) {
      return null;
    }
  }

  function destroyWhenDone(obj) {
    try { if (obj && obj.destroy) obj.destroy(); } catch (e) {}
  }

  function makeDot(scene, x, y, color, radius) {
    try {
      if (scene.add && scene.add.circle) {
        var c = scene.add.circle(x, y, radius || 5, hexColor(color, 0xffffff), 1);
        return c;
      }
      var key = ensureDot(scene);
      var img = scene.add.image(x, y, key);
      if (img.setTint) img.setTint(hexColor(color, 0xffffff));
      if (img.setScale) img.setScale((radius || 5) / 8);
      return img;
    } catch (e) {
      return null;
    }
  }

  function fallbackBurst(scene, x, y, color, count, opts) {
    if (!valid(scene)) return null;
    opts = opts || {};
    try {
      var n = Math.max(1, Math.floor(num(count, 10)));
      var life = num(opts.life, 520);
      var minSpeed = num(opts.minSpeed, 70);
      var maxSpeed = num(opts.maxSpeed, 220);
      var gravity = num(opts.gravity, 80);
      var dots = [];

      for (var i = 0; i < n; i++) {
        var angle = Math.random() * Math.PI * 2;
        var speed = minSpeed + Math.random() * (maxSpeed - minSpeed);
        var dot = makeDot(scene, x, y, color, num(opts.radius, 4));
        if (!dot) continue;
        if (dot.setDepth) dot.setDepth(num(opts.depth, 9999));
        if (dot.setBlendMode) dot.setBlendMode(opts.blendMode || 'ADD');
        dots.push(dot);
        safeTween(scene, {
          targets: dot,
          x: x + Math.cos(angle) * speed,
          y: y + Math.sin(angle) * speed + gravity,
          alpha: 0,
          scaleX: 0,
          scaleY: 0,
          duration: life,
          ease: opts.ease || 'Cubic.easeOut',
          onComplete: function (tween, targets) {
            destroyWhenDone(targets && targets[0]);
          }
        });
      }
      return dots;
    } catch (e) {
      return null;
    }
  }

  function fallbackConfetti(scene, opts) {
    if (!valid(scene)) return null;
    opts = opts || {};
    try {
      var cam = scene.cameras && scene.cameras.main;
      var w = cam ? cam.width : (scene.scale ? scene.scale.width : 800);
      var h = cam ? cam.height : (scene.scale ? scene.scale.height : 600);
      var colors = opts.colors || [0xff5555, 0xffcc33, 0x55ff77, 0x55aaff, 0xff66cc, 0xffffff];
      var count = Math.max(8, Math.floor(num(opts.count, 60)));
      var bits = [];

      for (var i = 0; i < count; i++) {
        var x = Math.random() * w;
        var y = -20 - Math.random() * h * 0.25;
        var color = colors[i % colors.length];
        var bit = null;
        if (scene.add && scene.add.rectangle) {
          bit = scene.add.rectangle(x, y, 5 + Math.random() * 6, 8 + Math.random() * 10, hexColor(color, 0xffffff), 1);
        } else {
          bit = makeDot(scene, x, y, color, 4);
        }
        if (!bit) continue;
        if (bit.setDepth) bit.setDepth(num(opts.depth, 9999));
        bits.push(bit);
        safeTween(scene, {
          targets: bit,
          x: x + (Math.random() - 0.5) * 180,
          y: h + 40,
          angle: (Math.random() > 0.5 ? 1 : -1) * (240 + Math.random() * 360),
          alpha: { from: 1, to: 0.75 },
          duration: num(opts.duration, 2400) + Math.random() * 600,
          delay: Math.random() * 350,
          ease: 'Sine.easeIn',
          onComplete: function (tween, targets) {
            destroyWhenDone(targets && targets[0]);
          }
        });
      }
      return bits;
    } catch (e) {
      return null;
    }
  }

  function floatingTextEffect(scene, x, y, text, opts) {
    if (!valid(scene)) return null;
    opts = (typeof opts === 'string') ? { color: opts } : asOptions(opts);
    try {
      var label = scene.add.text(x, y, String(text == null ? '' : text), {
        fontFamily: opts.fontFamily || 'Arial, sans-serif',
        fontSize: (opts.fontSize || 28) + 'px',
        fontStyle: opts.fontStyle || 'bold',
        color: cssColor(opts.color, 0xffffff),
        stroke: cssColor(opts.stroke, 0x000000),
        strokeThickness: num(opts.strokeThickness, 4)
      });
      if (label.setOrigin) label.setOrigin(num(opts.originX, 0.5), num(opts.originY, 0.5));
      if (label.setDepth) label.setDepth(num(opts.depth, 9999));
      if (label.setAlpha) label.setAlpha(num(opts.alpha, 1));
      if (label.setScale) label.setScale(num(opts.startScale, 1));

      safeTween(scene, {
        targets: label,
        y: y - num(opts.rise, 40),
        x: x + num(opts.driftX, 0),
        alpha: num(opts.endAlpha, 0),
        scaleX: num(opts.endScale, 1),
        scaleY: num(opts.endScale, 1),
        duration: num(opts.duration, 700),
        delay: num(opts.delay, 0),
        ease: opts.ease || 'Cubic.easeOut',
        onComplete: function () {
          destroyWhenDone(label);
        }
      });
      return label;
    } catch (e) {
      return null;
    }
  }

  // --- public API ----------------------------------------------------------

  var Juice = {

    buttonPress: function (target, opts) {
      if (!alive(target)) return null;
      opts = (typeof opts === 'function') ? { onClick: opts } : asOptions(opts);
      var scene = sceneOf(target);
      // Buttons are commonly registered from Scene.create(), before Phaser
      // reports the scene as active. The handlers remain safe because their
      // tweens use safeTween(), which checks scene activity at event time.
      if (!scene || !scene.tweens) return target;

      try {
        var baseX = num(opts.baseScaleX, (typeof target.scaleX === 'number') ? target.scaleX : 1);
        var baseY = num(opts.baseScaleY, (typeof target.scaleY === 'number') ? target.scaleY : 1);
        var downScale = num(opts.downScale, 0.94);
        var upScale = num(opts.upScale, 1.06);
        var downMs = num(opts.downMs, 70);
        var upMs = num(opts.upMs, 120);

        if (target.__juiceButtonPressHandlers && target.off) {
          try {
            target.off('pointerdown', target.__juiceButtonPressHandlers.down);
            target.off('pointerup', target.__juiceButtonPressHandlers.up);
            target.off('pointerout', target.__juiceButtonPressHandlers.cancel);
            target.off('pointerupoutside', target.__juiceButtonPressHandlers.cancel);
          } catch (e) {}
        }

        if (target.setInteractive && !target.input && opts.interactive !== false) {
          try { target.setInteractive({ useHandCursor: opts.cursor !== false }); } catch (e) {}
        } else if (target.input && target.input.cursor != null && opts.cursor !== false) {
          try { target.input.cursor = 'pointer'; } catch (e) {}
        }

        var toScale = function (sx, sy, duration, ease) {
          safeTween(scene, {
            targets: target,
            scaleX: sx,
            scaleY: sy,
            duration: duration,
            ease: ease || 'Quad.easeOut'
          });
        };
        var down = function () {
          if (!alive(target)) return;
          toScale(baseX * downScale, baseY * downScale, downMs, 'Quad.easeOut');
        };
        var up = function (pointer) {
          if (!alive(target)) return;
          safeTween(scene, {
            targets: target,
            scaleX: baseX * upScale,
            scaleY: baseY * upScale,
            duration: Math.max(50, upMs * 0.45),
            yoyo: true,
            ease: 'Back.easeOut',
            onComplete: function () {
              try {
                target.scaleX = baseX;
                target.scaleY = baseY;
              } catch (e) {}
            }
          });
          if (typeof opts.onClick === 'function') {
            try { opts.onClick.call(target, pointer, target); } catch (e) {}
          }
        };
        var cancel = function () {
          if (!alive(target)) return;
          toScale(baseX, baseY, downMs, 'Quad.easeOut');
        };

        target.__juiceButtonPressHandlers = { down: down, up: up, cancel: cancel };
        if (target.on) {
          target.on('pointerdown', down);
          target.on('pointerup', up);
          target.on('pointerout', cancel);
          target.on('pointerupoutside', cancel);
        }
        return target;
      } catch (e) {
        return target;
      }
    },

    pulse: function (target, scale, ms, opts) {
      if (!alive(target)) return null;
      if (isObj(scale)) {
        opts = scale;
        scale = opts.scale;
        ms = opts.ms || opts.duration;
      }
      opts = asOptions(opts);
      var scene = sceneOf(target);
      if (!valid(scene) || !scene.tweens) return null;
      try {
        var baseX = num(opts.baseScaleX, (typeof target.scaleX === 'number') ? target.scaleX : 1);
        var baseY = num(opts.baseScaleY, (typeof target.scaleY === 'number') ? target.scaleY : 1);
        var amount = num(scale, 1.12);
        var duration = num(ms, 180);
        var repeat = (opts.repeat == null) ? 0 : opts.repeat;
        return safeTween(scene, {
          targets: target,
          scaleX: baseX * amount,
          scaleY: baseY * amount,
          duration: Math.max(40, duration * 0.5),
          yoyo: true,
          repeat: repeat,
          repeatDelay: num(opts.repeatDelay, 0),
          ease: opts.ease || 'Sine.easeInOut',
          onComplete: function () {
            if (repeat === -1 || !alive(target)) return;
            try {
              target.scaleX = baseX;
              target.scaleY = baseY;
            } catch (e) {}
            if (typeof opts.onComplete === 'function') {
              try { opts.onComplete(target); } catch (e) {}
            }
          }
        });
      } catch (e) {
        return null;
      }
    },

    idleBob: function (target, distance, ms, opts) {
      if (!alive(target)) return null;
      if (isObj(distance)) {
        opts = distance;
        distance = opts.distance;
        ms = opts.ms || opts.duration;
      }
      opts = asOptions(opts);
      var scene = sceneOf(target);
      if (!valid(scene) || !scene.tweens) return null;
      try {
        if (target.__juiceIdleBobTween && target.__juiceIdleBobTween.stop) {
          try { target.__juiceIdleBobTween.stop(); } catch (e) {}
        }
        var baseY = (opts.baseY == null) ? ((target.__juiceIdleBobBaseY == null) ? target.y : target.__juiceIdleBobBaseY) : opts.baseY;
        target.__juiceIdleBobBaseY = baseY;
        target.y = baseY;
        var tween = safeTween(scene, {
          targets: target,
          y: baseY - num(distance, 6),
          duration: num(ms, 1200) * 0.5,
          yoyo: true,
          repeat: -1,
          repeatDelay: num(opts.repeatDelay, 0),
          ease: opts.ease || 'Sine.easeInOut'
        });
        target.__juiceIdleBobTween = tween;
        return tween;
      } catch (e) {
        return null;
      }
    },

    shake: function (scene, intensity, ms) {
      if (!valid(scene)) return;
      try {
        var cam = scene.cameras && scene.cameras.main;
        if (cam && cam.shake) {
          cam.shake(ms == null ? 200 : ms, intensity == null ? 0.008 : intensity);
        }
      } catch (e) {}
    },

    screenShake: function (scene, intensity, ms) {
      return Juice.shake(scene, intensity, ms);
    },

    flash: function (scene, colorHex, ms) {
      if (!valid(scene)) return;
      try {
        var cam = scene.cameras && scene.cameras.main;
        if (!cam || !cam.flash) return;
        var hex = hexColor(colorHex, 0xffffff);
        var r = (hex >> 16) & 0xff;
        var g = (hex >> 8) & 0xff;
        var b = hex & 0xff;
        cam.flash(ms == null ? 120 : ms, r, g, b);
      } catch (e) {}
    },

    hitFlash: function (target, ms) {
      if (!target || target.active === false) return;
      try {
        var dur = ms == null ? 90 : ms;
        // Remember original tint state so we can restore it exactly.
        var hadTint = !!target.isTinted;
        var original = (typeof target.tintTopLeft === 'number') ? target.tintTopLeft : 0xffffff;

        if (target.setTintFill) {
          target.setTintFill(0xffffff);
        } else if (target.setTint) {
          target.setTint(0xffffff);
        } else {
          return;
        }

        var scene = target.scene;
        var restore = function () {
          try {
            if (!target || target.active === false) return;
            if (hadTint && target.setTint) {
              target.setTint(original);
            } else if (target.clearTint) {
              target.clearTint();
            }
          } catch (e) {}
        };

        if (scene && scene.time) {
          scene.time.delayedCall(dur, restore);
        } else {
          setTimeout(restore, dur);
        }
      } catch (e) {}
    },

    squash: function (target, amount, ms) {
      if (!target || target.active === false) return;
      var scene = target.scene;
      if (!scene || !scene.tweens) return;
      try {
        var amt = amount == null ? 0.25 : amount;
        var dur = ms == null ? 120 : ms;
        var baseX = (typeof target.scaleX === 'number') ? target.scaleX : 1;
        var baseY = (typeof target.scaleY === 'number') ? target.scaleY : 1;
        scene.tweens.add({
          targets: target,
          scaleX: baseX * (1 + amt),
          scaleY: baseY * (1 - amt),
          duration: dur,
          yoyo: true,
          ease: 'Quad.easeOut',
          onComplete: function () {
            try {
              if (target && target.setScale) target.setScale(baseX, baseY);
            } catch (e) {}
          }
        });
      } catch (e) {}
    },

    popText: function (scene, x, y, text, color) {
      return floatingTextEffect(scene, x, y, text, color || '#ffffff');
    },

    floatingText: function (scene, x, y, text, opts) {
      return floatingTextEffect(scene, x, y, text, opts);
    },

    damageNumber: function (scene, x, y, amount, opts) {
      opts = asOptions(opts);
      var text = opts.text;
      if (text == null) {
        if (typeof amount === 'number') {
          text = opts.heal ? '+' + Math.abs(amount) : '-' + Math.abs(amount);
        } else {
          text = String(amount == null ? '' : amount);
        }
      }
      return floatingTextEffect(scene, x, y, text, {
        color: opts.color || (opts.heal ? '#66ff99' : '#ff5d5d'),
        stroke: opts.stroke || '#1b0b0b',
        fontSize: opts.fontSize || 30,
        rise: opts.rise || 48,
        driftX: opts.driftX == null ? (Math.random() - 0.5) * 14 : opts.driftX,
        duration: opts.duration || 760,
        depth: opts.depth
      });
    },

    burst: function (scene, x, y, color, count, opts) {
      if (!valid(scene)) return null;
      if (isObj(color)) {
        opts = color;
        color = opts.color;
        count = opts.count;
      } else if (isObj(count)) {
        opts = count;
        count = opts.count;
      }
      opts = asOptions(opts);
      try {
        var key = ensureDot(scene);
        var n = count == null ? 14 : count;
        var life = num(opts.life, 650);
        var emitter = scene.add.particles(x, y, key, {
          speed: { min: num(opts.minSpeed, 80), max: num(opts.maxSpeed, 240) },
          angle: { min: 0, max: 360 },
          lifespan: life,
          quantity: n,
          scale: { start: num(opts.startScale, 0.6), end: 0 },
          alpha: { start: 1, end: 0 },
          gravityY: num(opts.gravityY, 300),
          tint: hexColor(color, 0xffcc33),
          blendMode: opts.blendMode || 'ADD',
          emitting: false
        });
        if (emitter && emitter.explode) emitter.explode(n, x, y);
        autoDestroy(scene, emitter, life);
        return emitter;
      } catch (e) {
        return fallbackBurst(scene, x, y, color == null ? 0xffcc33 : color, count == null ? 14 : count, opts);
      }
    },

    sparks: function (scene, x, y, color, count, opts) {
      if (!valid(scene)) return null;
      if (isObj(color)) {
        opts = color;
        color = opts.color;
        count = opts.count;
      } else if (isObj(count)) {
        opts = count;
        count = opts.count;
      }
      opts = asOptions(opts);
      try {
        var key = ensureStar(scene);
        var n = count == null ? 8 : count;
        var life = num(opts.life, 350);
        var emitter = scene.add.particles(x, y, key, {
          speed: { min: num(opts.minSpeed, 150), max: num(opts.maxSpeed, 380) },
          angle: { min: 0, max: 360 },
          lifespan: life,
          quantity: n,
          scale: { start: num(opts.startScale, 0.4), end: 0 },
          alpha: { start: 1, end: 0 },
          gravityY: num(opts.gravityY, 80),
          tint: hexColor(color, 0xffffff),
          blendMode: opts.blendMode || 'ADD',
          emitting: false
        });
        if (emitter && emitter.explode) emitter.explode(n, x, y);
        autoDestroy(scene, emitter, life);
        return emitter;
      } catch (e) {
        return fallbackBurst(scene, x, y, color == null ? 0xffffff : color, count == null ? 8 : count, {
          life: num(opts.life, 350),
          minSpeed: num(opts.minSpeed, 140),
          maxSpeed: num(opts.maxSpeed, 320),
          gravity: num(opts.gravity, 40),
          radius: num(opts.radius, 3),
          blendMode: opts.blendMode || 'ADD'
        });
      }
    },

    shockwave: function (scene, x, y, color) {
      if (!valid(scene)) return null;
      try {
        var key = ensureRing(scene);
        var ring = scene.add.image(x, y, key);
        if (ring.setTint) ring.setTint(hexColor(color, 0xffffff));
        if (ring.setScale) ring.setScale(0.1);
        if (ring.setAlpha) ring.setAlpha(0.9);
        if (ring.setBlendMode) ring.setBlendMode('ADD');
        if (ring.setDepth) ring.setDepth(9998);

        scene.tweens.add({
          targets: ring,
          scale: 2.5,
          alpha: 0,
          duration: 450,
          ease: 'Cubic.easeOut',
          onComplete: function () {
            try { if (ring && ring.destroy) ring.destroy(); } catch (e) {}
          }
        });
        return ring;
      } catch (e) {
        return null;
      }
    },

    healGlow: function (scene, x, y) {
      if (!valid(scene)) return null;
      try {
        var key = ensureDot(scene);
        var life = 900;
        var emitter = scene.add.particles(x, y, key, {
          speedY: { min: -90, max: -40 },
          speedX: { min: -25, max: 25 },
          lifespan: life,
          quantity: 1,
          frequency: 70,
          scale: { start: 0.5, end: 0 },
          alpha: { start: 0.9, end: 0 },
          tint: [0x66ff99, 0x33cc66, 0xaaffcc],
          blendMode: 'ADD'
        });
        // Stop emitting after a short while, then clean up.
        scene.time.delayedCall(700, function () {
          try { if (emitter && emitter.stop) emitter.stop(); } catch (e) {}
        });
        autoDestroy(scene, emitter, 700 + life);
        return emitter;
      } catch (e) {
        return null;
      }
    },

    confetti: function (scene, opts) {
      if (!valid(scene)) return null;
      if (typeof opts === 'number') opts = { count: opts };
      opts = asOptions(opts);
      try {
        var key = ensureDot(scene);
        var cam = scene.cameras && scene.cameras.main;
        var w = cam ? cam.width : (scene.scale ? scene.scale.width : 800);
        var rawColors = opts.colors || [0xff5555, 0xffcc33, 0x55ff77, 0x55aaff, 0xff66cc, 0xffffff];
        var colors = [];
        for (var i = 0; i < rawColors.length; i++) colors.push(hexColor(rawColors[i], 0xffffff));
        var life = num(opts.life, 2600);
        var rainMs = num(opts.duration, 2200);
        var quantity = opts.quantity == null
          ? (opts.count == null ? 4 : Math.max(2, Math.min(10, Math.floor(num(opts.count, 80) / Math.max(12, rainMs / 60)))))
          : num(opts.quantity, 4);
        var emitter = scene.add.particles(0, -20, key, {
          x: { min: 0, max: w },
          y: -20,
          speedY: { min: num(opts.minSpeedY, 120), max: num(opts.maxSpeedY, 300) },
          speedX: { min: num(opts.minSpeedX, -80), max: num(opts.maxSpeedX, 80) },
          accelerationY: num(opts.accelerationY, 120),
          lifespan: life,
          quantity: quantity,
          frequency: num(opts.frequency, 60),
          scale: { min: num(opts.minScale, 0.3), max: num(opts.maxScale, 0.7) },
          rotate: { min: 0, max: 360 },
          alpha: { start: 1, end: 0.7 },
          tint: colors,
          gravityY: num(opts.gravityY, 200)
        });
        if (emitter && emitter.setDepth) emitter.setDepth(num(opts.depth, 9999));
        // Rain briefly, then stop and clean up.
        scene.time.delayedCall(rainMs, function () {
          try { if (emitter && emitter.stop) emitter.stop(); } catch (e) {}
        });
        autoDestroy(scene, emitter, rainMs + life);
        return emitter;
      } catch (e) {
        return fallbackConfetti(scene, opts);
      }
    },

    coinFly: function (scene, fromX, fromY, toX, toY, opts) {
      if (!valid(scene)) return null;
      var from;
      var to;
      if (typeof fromX === 'number' && typeof fromY === 'number') {
        from = pointFrom(fromX, fromY);
        to = pointFrom(toX, toY);
      } else {
        from = pointFrom(fromX);
        to = pointFrom(fromY);
        opts = toX;
      }
      opts = asOptions(opts);

      try {
        var count = Math.max(1, Math.floor(num(opts.count, 1)));
        var color = hexColor(opts.color, 0xffcc33);
        var duration = num(opts.duration, 520);
        var stagger = num(opts.stagger, 55);
        var coins = [];
        var completed = 0;

        for (var i = 0; i < count; i++) {
          var delay = num(opts.delay, 0) + i * stagger;
          var sx = from.x + (Math.random() - 0.5) * num(opts.spread, 18);
          var sy = from.y + (Math.random() - 0.5) * num(opts.spread, 18);
          var coin = makeDot(scene, sx, sy, color, num(opts.radius, 6));
          if (!coin) continue;
          if (coin.setDepth) coin.setDepth(num(opts.depth, 10000));
          if (coin.setBlendMode) coin.setBlendMode(opts.blendMode || 'ADD');
          if (coin.setAlpha) coin.setAlpha(num(opts.alpha, 1));
          if (coin.setScale) coin.setScale(num(opts.startScale, 1));
          coins.push(coin);

          safeTween(scene, {
            targets: coin,
            x: to.x,
            y: to.y,
            scaleX: num(opts.endScale, 0.55),
            scaleY: num(opts.endScale, 0.55),
            alpha: num(opts.endAlpha, 0.85),
            angle: 360,
            duration: duration + Math.random() * num(opts.randomDuration, 120),
            delay: delay,
            ease: opts.ease || 'Cubic.easeIn',
            onComplete: function (tween, targets) {
              destroyWhenDone(targets && targets[0]);
              completed += 1;
              if (completed === coins.length) {
                if (opts.burst !== false) Juice.sparks(scene, to.x, to.y, color, num(opts.burstCount, 8));
                if (typeof opts.onComplete === 'function') {
                  try { opts.onComplete(); } catch (e) {}
                }
              }
            }
          });
        }
        return coins;
      } catch (e) {
        return null;
      }
    },

    progressTween: function (scene, target, to, opts) {
      if (!valid(scene) || !scene.tweens) return null;
      opts = (typeof opts === 'function') ? { onUpdate: opts } : asOptions(opts);
      try {
        var property = opts.property || 'scaleX';
        var start;
        if (opts.from != null) start = num(opts.from, 0);
        else if (target && target.__juiceProgress != null) start = num(target.__juiceProgress, 0);
        else if (target && typeof target[property] === 'number') start = target[property];
        else start = 0;

        var end = num(to, start);
        if (opts.clamp !== false) {
          start = clamp(start, 0, 1);
          end = clamp(end, 0, 1);
        }

        var state = { value: start };
        var apply = function (value) {
          try {
            if (opts.clamp !== false) value = clamp(value, 0, 1);
            if (target && typeof target === 'function') {
              target(value);
            } else if (typeof opts.onUpdate === 'function') {
              opts.onUpdate(value, target);
            } else if (target && opts.draw && typeof opts.draw === 'function') {
              opts.draw(value, target);
            } else if (target && target.setScale && property === 'scaleX') {
              target.setScale(value, num(opts.scaleY, target.scaleY == null ? 1 : target.scaleY));
            } else if (target) {
              target[property] = value;
            }
            if (target && typeof target === 'object') target.__juiceProgress = value;
          } catch (e) {}
        };

        apply(start);
        return safeTween(scene, {
          targets: state,
          value: end,
          duration: num(opts.duration, 320),
          ease: opts.ease || 'Cubic.easeOut',
          onUpdate: function () {
            apply(state.value);
          },
          onComplete: function () {
            apply(end);
            if (typeof opts.onComplete === 'function') {
              try { opts.onComplete(end, target); } catch (e) {}
            }
          }
        });
      } catch (e) {
        return null;
      }
    },

    sceneTransition: function (scene, next, opts) {
      if (!valid(scene)) return null;
      if (isObj(next)) {
        opts = next;
        next = opts.toScene || opts.next || opts.onMid;
      }
      opts = asOptions(opts);
      try {
        var cam = scene.cameras && scene.cameras.main;
        var w = cam ? cam.width : (scene.scale ? scene.scale.width : 800);
        var h = cam ? cam.height : (scene.scale ? scene.scale.height : 600);
        var color = hexColor(opts.color, 0x000000);
        var duration = Math.max(80, num(opts.duration, 520));
        var half = opts.mode === 'in' ? duration : Math.max(40, duration * 0.5);
        var overlay = null;

        if (scene.add && scene.add.rectangle) {
          overlay = scene.add.rectangle(w / 2, h / 2, w * 2, h * 2, color, opts.mode === 'in' ? 1 : 0);
        } else {
          overlay = makeDot(scene, w / 2, h / 2, color, Math.max(w, h));
          if (overlay && overlay.setAlpha) overlay.setAlpha(opts.mode === 'in' ? 1 : 0);
        }
        if (!overlay) return null;
        if (overlay.setScrollFactor) overlay.setScrollFactor(0);
        if (overlay.setDepth) overlay.setDepth(num(opts.depth, 20000));

        var runNext = function () {
          try {
            if (typeof opts.onMid === 'function') opts.onMid(scene, overlay);
          } catch (e) {}
          try {
            if (typeof next === 'function') next(scene, overlay);
            else if (typeof next === 'string' && scene.scene && scene.scene.start) scene.scene.start(next, opts.data);
          } catch (e) {}
        };

        if (opts.mode === 'in') {
          safeTween(scene, {
            targets: overlay,
            alpha: 0,
            duration: duration,
            ease: opts.ease || 'Cubic.easeOut',
            onComplete: function () {
              destroyWhenDone(overlay);
              if (typeof opts.onComplete === 'function') {
                try { opts.onComplete(); } catch (e) {}
              }
            }
          });
          return overlay;
        }

        safeTween(scene, {
          targets: overlay,
          alpha: num(opts.alpha, 1),
          duration: half,
          ease: opts.ease || 'Cubic.easeInOut',
          onComplete: function () {
            runNext();
            if (opts.fadeIn === false || opts.mode === 'out' || !valid(scene) || !overlay || overlay.active === false) {
              if (typeof opts.onComplete === 'function') {
                try { opts.onComplete(); } catch (e) {}
              }
              return;
            }
            safeTween(scene, {
              targets: overlay,
              alpha: 0,
              duration: half,
              ease: opts.easeIn || 'Cubic.easeOut',
              onComplete: function () {
                destroyWhenDone(overlay);
                if (typeof opts.onComplete === 'function') {
                  try { opts.onComplete(); } catch (e) {}
                }
              }
            });
          }
        });
        return overlay;
      } catch (e) {
        return null;
      }
    },

    hitstop: function (scene, ms) {
      if (!valid(scene)) return;
      try {
        var dur = ms == null ? 60 : ms;
        var restored = false;

        var hasPhysics = !!(scene.physics && scene.physics.world);
        var prevPhysics = hasPhysics ? scene.physics.world.timeScale : null;

        var hasTweens = !!(scene.tweens && typeof scene.tweens.timeScale === 'number');
        var prevTweens = hasTweens ? scene.tweens.timeScale : null;

        // Slow physics (note: Phaser physics timeScale is inverted — higher = slower).
        if (hasPhysics) {
          try { scene.physics.world.timeScale = 5; } catch (e) {}
        }
        // Slow tweens (scene tween timeScale: lower = slower).
        if (hasTweens) {
          try { scene.tweens.timeScale = 0.1; } catch (e) {}
        }

        var restore = function () {
          if (restored) return;
          restored = true;
          try { if (hasPhysics) scene.physics.world.timeScale = prevPhysics; } catch (e) {}
          try { if (hasTweens) scene.tweens.timeScale = prevTweens; } catch (e) {}
        };

        // Use real-time wall clock so the hitstop itself isn't slowed.
        if (typeof setTimeout === 'function') {
          setTimeout(restore, dur);
        } else if (scene.time) {
          scene.time.delayedCall(dur, restore);
        }
      } catch (e) {}
    },

    trail: function (scene, target, ms) {
      if (!valid(scene) || !target) return;
      try {
        var dur = ms == null ? 300 : ms;
        var ghostCount = 4;
        var step = Math.max(20, Math.floor(dur / ghostCount));
        var texKey = target.texture && target.texture.key;
        if (!texKey) return; // need a texture to clone

        for (var i = 0; i < ghostCount; i++) {
          (function (idx) {
            scene.time.delayedCall(idx * step, function () {
              try {
                if (!target || target.active === false) return;
                var ghost = scene.add.image(target.x, target.y, texKey,
                  target.frame ? target.frame.name : undefined);
                if (ghost.setAlpha) ghost.setAlpha(0.5);
                if (ghost.setScale) ghost.setScale(target.scaleX || 1, target.scaleY || 1);
                if (ghost.setRotation && typeof target.rotation === 'number') ghost.setRotation(target.rotation);
                if (ghost.setOrigin && target.originX != null) ghost.setOrigin(target.originX, target.originY);
                if (ghost.setFlip) ghost.setFlip(!!target.flipX, !!target.flipY);
                if (ghost.setTint) ghost.setTint(0x88aaff);
                if (ghost.setBlendMode) ghost.setBlendMode('ADD');
                if (ghost.setDepth && typeof target.depth === 'number') ghost.setDepth(target.depth - 1);

                scene.tweens.add({
                  targets: ghost,
                  alpha: 0,
                  duration: dur,
                  ease: 'Quad.easeOut',
                  onComplete: function () {
                    try { if (ghost && ghost.destroy) ghost.destroy(); } catch (e) {}
                  }
                });
              } catch (e) {}
            });
          })(i);
        }
      } catch (e) {}
    }
  };

  root.Juice = Juice;
  root.VFX = root.VFX || Juice;

})(typeof window !== 'undefined' ? window : this);
