/*
 * fit.js — aspect-safe scaling + 9-slice helpers for Phaser 3 (3.60+).
 *
 * Plain script (NO module / NO imports). Defines a global `window.Fit`.
 * Prevents the #1 art bug: images stretched to the wrong aspect ratio
 * (characters turned into noodles, square panels squashed into thin strips).
 * Every function is safe (try/catch) and returns the object for chaining.
 *
 * WHY: generated art comes at fixed ratios (1024x1024 / 1024x1536 / 1536x1024).
 * NEVER size an image with `setDisplaySize(w,h)` at a different ratio, and NEVER
 * `setScale(sx,sy)` with sx!==sy — both distort. Use these helpers instead.
 *
 * ---------------------------------------------------------------------------
 * API
 * ---------------------------------------------------------------------------
 * Fit.contain(obj, boxW, boxH)  // uniform-scale so the WHOLE image fits in the box (icons, characters, cards)
 * Fit.cover(obj, boxW, boxH)    // uniform-scale so the image FILLS the box, overflow cropped (backgrounds, title splash)
 * Fit.height(obj, px)           // scale so the sprite is exactly `px` tall, width follows (characters: Fit.height(cat, 120))
 * Fit.width(obj, px)            // scale so the sprite is exactly `px` wide, height follows
 * Fit.text(textObj, boxW, boxH, minPx?) // wrap + shrink text until it fits inside the box
 * Fit.label(scene, x, y, text, style, boxW, boxH, minPx?) // create a fitted centered label
 * Fit.panel(scene, x, y, key, w, h, inset?)
 *      // a 9-slice panel/bar/button: corners+edges keep their size, only the center
 *      // stretches — so a square panel image becomes ANY w/h with no distortion.
 *      // `inset` = un-stretched border thickness in source px (default ~26% of the
 *      // smaller side). Returns the nineslice game object (add it to containers/HUD).
 * Fit.icon(scene, x, y, key, cols, rows, index, size)
 *      // draw ONE cell of a cols×rows combined image (load.image) as an icon
 *      // CENTERED at (x,y), scaled to `size`. Use this instead of hand-rolling
 *      // add.image(...).setCrop(...) — setCrop alone does NOT recenter the cell, so
 *      // every icon lands at a different offset (the classic scattered-icon bug).
 * ---------------------------------------------------------------------------
 * Examples:
 *   Fit.height(this.player, 120);                       // cat is 120px tall, never stretched
 *   Fit.cover(this.add.image(400,300,'bg'), 800, 600);  // background fills, keeps ratio
 *   const hud = Fit.panel(this, 400, 58, 'hud', 744, 96);   // wide HUD bar, borders stay crisp
 *   const btn = Fit.panel(this, 400, 452, 'button', 260, 92).setInteractive({useHandCursor:true});
 */
(function (root) {
  'use strict';

  function nativeSize(obj) {
    var w = (obj && obj.width) || (obj && obj.frame && obj.frame.realWidth) || (obj && obj.displayWidth) || 1;
    var h = (obj && obj.height) || (obj && obj.frame && obj.frame.realHeight) || (obj && obj.displayHeight) || 1;
    return { w: w, h: h };
  }

  function sourceSize(scene, key) {
    try {
      var tex = scene.textures.get(key);
      var img = tex && tex.getSourceImage ? tex.getSourceImage() : null;
      if (img && img.width) return { w: img.width, h: img.height };
    } catch (e) {}
    return { w: 0, h: 0 };
  }

  var Fit = {
    contain: function (obj, boxW, boxH) {
      try { var n = nativeSize(obj); obj.setScale(Math.min(boxW / n.w, boxH / n.h)); } catch (e) {}
      return obj;
    },
    cover: function (obj, boxW, boxH) {
      try { var n = nativeSize(obj); obj.setScale(Math.max(boxW / n.w, boxH / n.h)); } catch (e) {}
      return obj;
    },
    height: function (obj, px) {
      try { var n = nativeSize(obj); obj.setScale(px / n.h); } catch (e) {}
      return obj;
    },
    width: function (obj, px) {
      try { var n = nativeSize(obj); obj.setScale(px / n.w); } catch (e) {}
      return obj;
    },
    text: function (textObj, boxW, boxH, minPx) {
      try {
        minPx = minPx || 12;
        if (!textObj) return textObj;
        if (textObj.setWordWrapWidth) textObj.setWordWrapWidth(Math.max(1, boxW));
        if (textObj.setAlign) textObj.setAlign('center');
        var style = textObj.style || {};
        var size = parseInt((style.fontSize || textObj._fontSize || 24), 10) || 24;
        var guard = 80;
        while (guard-- > 0 && size > minPx) {
          if (textObj.displayWidth <= boxW && textObj.displayHeight <= boxH) break;
          size -= 1;
          if (textObj.setFontSize) textObj.setFontSize(size);
          if (textObj.setWordWrapWidth) textObj.setWordWrapWidth(Math.max(1, boxW));
        }
      } catch (e) {}
      return textObj;
    },
    label: function (scene, x, y, text, style, boxW, boxH, minPx) {
      try {
        style = Object.assign({ align: 'center', wordWrap: { width: boxW, useAdvancedWrap: true } }, style || {});
        var label = scene.add.text(x, y, text, style).setOrigin(0.5);
        return Fit.text(label, boxW, boxH, minPx);
      } catch (e) {
        return null;
      }
    },
    panel: function (scene, x, y, key, w, h, inset) {
      // Prefer a true 9-slice so borders never distort.
      try {
        if (scene && scene.add && typeof scene.add.nineslice === 'function') {
          var s = sourceSize(scene, key);
          var pad = inset || Math.round(Math.min(s.w || 96, s.h || 96) * 0.26) || 24;
          if (s.w && pad * 2 >= s.w) pad = Math.max(2, Math.floor(s.w / 2) - 1);
          if (s.h && pad * 2 >= s.h) pad = Math.max(2, Math.floor(s.h / 2) - 1);
          // Phaser: add.nineslice(x, y, texture, frame, width, height, leftW, rightW, topH, botH)
          return scene.add.nineslice(x, y, key, null, w, h, pad, pad, pad, pad);
        }
      } catch (e) {}
      // Fallback (older Phaser without nineslice): do not stretch the source
      // image into a wrong aspect ratio. A clean programmatic panel is safer
      // than distorted generated chrome.
      try {
        if (scene && scene.add && typeof scene.add.rectangle === 'function') {
          return scene.add
            .rectangle(x, y, w, h, 0x172033, 0.92)
            .setStrokeStyle(2, 0xffffff, 0.22);
        }
      } catch (e) {}
      return null;
    },
    icon: function (scene, x, y, key, cols, rows, index, size) {
      // Draw ONE cell of a cols×rows combined image (loaded via load.image) as an
      // icon centered at (x,y), uniformly scaled to fit `size` (longest side).
      //
      // WHY this exists: the naive `add.image(x,y,sheet).setCrop(col*cw,row*ch,cw,ch)`
      // is the #1 icon bug — setCrop only MASKS the texture, it does NOT move the
      // cell, so the cropped cell stays anchored to the FULL image's footprint and
      // every index lands at a different offset (top-left cell floats up-left,
      // bottom-right floats down-right), amplified by setScale. Anchoring the
      // display ORIGIN to the cell's own center makes (x,y) and the scale act on
      // the CELL, so it centers correctly for any index. (If you loaded the art via
      // load.spritesheet with frameWidth/frameHeight, prefer add.image(x,y,key,index)
      // + Fit.contain instead — that's already frame-centered.)
      try {
        cols = cols || 1; rows = rows || 1; index = index || 0;
        var img = scene.add.image(x, y, key);
        var s = sourceSize(scene, key);
        var cw = (s.w || img.width || 1) / cols;
        var ch = (s.h || img.height || 1) / rows;
        var col = index % cols, row = Math.floor(index / cols);
        img.setOrigin((col + 0.5) / cols, (row + 0.5) / rows);
        img.setCrop(col * cw, row * ch, cw, ch);
        img.setPosition(x, y);
        img.setScale(size / Math.max(cw, ch));
        return img;
      } catch (e) { return null; }
    },
  };

  root.Fit = Fit;
})(typeof window !== 'undefined' ? window : this);
