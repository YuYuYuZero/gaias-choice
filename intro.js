/*
 * intro.js — fullscreen opening-video overlay for H5 games.
 *
 * Plain script (NO module / NO imports). Exposes a global `window.Intro`.
 *
 * WHY THIS EXISTS: `generate_game_video` returns an mp4 URL, but the video is
 * useless unless it's actually PLAYED. Intro.play() drops a fullscreen overlay
 * ABOVE the game and plays the clip, then calls onDone() to start the game.
 *
 * ⛔ ASPECT RATIO: the clip is shown with `object-fit:contain` — the WHOLE frame
 * is visible and its ratio is preserved. A PORTRAIT (9:16) clip stays portrait
 * and is letterboxed; it is NEVER cropped or stretched to look landscape. Do not
 * override this with cover/fixed width — that's exactly the "shown like landscape,
 * cut off" bug.
 *
 * Robust by design: ends / skip button / load error / stall all lead to onDone(),
 * so a missing or failed video can never trap the player on a black screen.
 *
 * USAGE (in game.js — preload the game behind the intro):
 *   startGame();
 *   if (window.OPENING_VIDEO_URL) Intro.play(window.OPENING_VIDEO_URL);
 * Boot first so large game assets load while the video is playing.
 */
(function (root) {
  'use strict';

  function play(url, onDone, opts) {
    opts = opts || {};
    var done = false;
    var overlay = null;

    function finish() {
      if (done) return;
      done = true;
      if (overlay) {
        try {
          overlay.style.pointerEvents = 'none';
          overlay.style.opacity = '0';
          var video = overlay.querySelector('video');
          if (video) video.pause();
          setTimeout(function () {
            if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
          }, 300);
        } catch (e) {}
      }
      try { if (typeof onDone === 'function') onDone(); } catch (e) {}
    }

    // No url → never block the game.
    if (!url) { finish(); return; }

    try {
      overlay = document.createElement('div');
      overlay.style.cssText =
        'position:fixed;inset:0;z-index:99999;background:#000;display:flex;' +
        'align-items:center;justify-content:center;opacity:1;transition:opacity .3s ease;';

      var video = document.createElement('video');
      video.src = url;
      video.autoplay = true;
      video.controls = false;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      // contain = show the WHOLE frame, keep ratio. Portrait clip stays portrait.
      video.style.cssText =
        'max-width:100%;max-height:100%;width:auto;height:auto;' +
        'object-fit:contain;background:#000;display:block;';
      overlay.appendChild(video);

      var skip = document.createElement('button');
      skip.type = 'button';
      skip.textContent = opts.skipLabel || 'Skip ▸';
      skip.style.cssText =
        'position:absolute;bottom:22px;right:18px;padding:8px 16px;' +
        'font:600 14px system-ui,-apple-system,sans-serif;color:#fff;' +
        'background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.55);' +
        'border-radius:22px;cursor:pointer;z-index:1;';
      skip.addEventListener('click', finish);
      overlay.appendChild(skip);

      (document.body || document.documentElement).appendChild(overlay);

      video.addEventListener('ended', finish);
      video.addEventListener('error', finish);

      // Try with sound; browsers that block unmuted autoplay → retry muted.
      var tryPlay = function (muted) {
        video.muted = muted;
        var p = video.play && video.play();
        if (p && p.catch) p.catch(function () { if (!muted) tryPlay(true); });
      };
      tryPlay(opts.muted === true);

      // Watchdog 1: URL unreachable / never loads metadata → skip after 8s.
      setTimeout(function () { if (!done && video.readyState < 1) finish(); }, 8000);
      // Watchdog 2: once we know the duration, finish right after it (in case
      // 'ended' doesn't fire), and cap absolutely so nothing traps the player.
      video.addEventListener('loadedmetadata', function () {
        if (isFinite(video.duration) && video.duration > 0) {
          setTimeout(finish, video.duration * 1000 + 1200);
        }
      });
      setTimeout(finish, Math.max(8000, opts.maxMs || 25000));
    } catch (e) {
      finish();
    }
  }

  root.Intro = { play: play };
})(typeof window !== 'undefined' ? window : this);
