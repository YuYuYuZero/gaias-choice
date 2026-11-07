(function () {
  'use strict';

  var EDIT_MODE = new URLSearchParams(location.search).get('ccg_ui_edit') === '1';
  var state = { version: 1, dom: {}, phaser: {} };
  var selected = null;
  var drag = null;
  var overlay = null;
  var label = null;
  var hoverOverlay = null;
  var hoverLabel = null;
  var lastPick = null; // { x, y, index } — cycles overlapping canvas objects on repeated clicks
  var BUTTON_TEXT_ATTRIBUTE = 'data-ccg-ui-button-text';

  function finite(value, fallback) {
    return typeof value === 'number' && isFinite(value) ? value : fallback;
  }

  function itemScale(item) {
    var s = item && finite(item.s, 1);
    return s > 0 ? s : 1;
  }

  function normalize(raw) {
    var next = { version: 1, dom: {}, phaser: {} };
    ['dom', 'phaser'].forEach(function (kind) {
      var entries = raw && raw[kind];
      if (!entries || typeof entries !== 'object') return;
      Object.keys(entries).slice(0, 200).forEach(function (key) {
        var value = entries[key];
        if (!value || typeof value !== 'object') return;
        var item = {
          x: Math.max(-10000, Math.min(10000, finite(value.x, 0))),
          y: Math.max(-10000, Math.min(10000, finite(value.y, 0)))
        };
        var s = finite(value.s, 1);
        if (s > 0 && Math.abs(s - 1) > 0.001) item.s = Math.max(0.25, Math.min(4, s));
        next[kind][key] = item;
      });
    });
    return next;
  }

  function post(type, extra) {
    try {
      window.parent.postMessage(Object.assign({ type: type, overrides: state }, extra || {}), '*');
    } catch (_) {}
  }

  function cssEscape(value) {
    if (window.CSS && CSS.escape) return CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function prepareButtonTextTargets(root) {
    var buttons = [];
    if (root && root.nodeType === 3 && root.parentElement && root.parentElement.matches('button')) {
      buttons.push(root.parentElement);
    }
    if (root && root.nodeType === 1 && root.matches && root.matches('button')) buttons.push(root);
    if (root && root.querySelectorAll) {
      Array.prototype.forEach.call(root.querySelectorAll('button'), function (button) {
        buttons.push(button);
      });
    }

    buttons.forEach(function (button) {
      var textIndex = 0;
      Array.prototype.slice.call(button.childNodes).forEach(function (node) {
        if (node.nodeType === 1 && node.hasAttribute && node.hasAttribute(BUTTON_TEXT_ATTRIBUTE)) {
          node.setAttribute(BUTTON_TEXT_ATTRIBUTE, String(textIndex++));
          node.style.pointerEvents = EDIT_MODE ? 'auto' : 'none';
          return;
        }
        if (node.nodeType !== 3 || !node.textContent || !node.textContent.trim()) return;
        var span = document.createElement('span');
        span.setAttribute(BUTTON_TEXT_ATTRIBUTE, String(textIndex++));
        span.style.display = 'inline-block';
        // Preserve the game's original button event target outside edit mode.
        // Edit mode enables pointer events so the text layer can be selected.
        span.style.pointerEvents = EDIT_MODE ? 'auto' : 'none';
        button.replaceChild(span, node);
        span.appendChild(node);
      });
    });
  }

  function observeButtonTextTargets() {
    prepareButtonTextTargets(document);
    if (!window.MutationObserver || !document.documentElement) return;
    new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        Array.prototype.forEach.call(mutation.addedNodes || [], function (node) {
          prepareButtonTextTargets(node);
        });
      });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  function domKey(element) {
    if (element.hasAttribute && element.hasAttribute(BUTTON_TEXT_ATTRIBUTE) && element.parentElement) {
      return domKey(element.parentElement) + '>[' + BUTTON_TEXT_ATTRIBUTE + '="' +
        element.getAttribute(BUTTON_TEXT_ATTRIBUTE) + '"]';
    }
    if (element.id) return '#' + cssEscape(element.id);
    var parts = [];
    var current = element;
    while (current && current !== document.body && parts.length < 6) {
      var tag = current.tagName.toLowerCase();
      var parent = current.parentElement;
      if (!parent) break;
      var siblings = Array.prototype.filter.call(parent.children, function (item) {
        return item.tagName === current.tagName;
      });
      var index = siblings.indexOf(current) + 1;
      parts.unshift(tag + ':nth-of-type(' + index + ')');
      current = parent;
    }
    return 'body>' + parts.join('>');
  }

  function ensureDomBase(element) {
    if (Object.prototype.hasOwnProperty.call(element, '__ccgUiBaseTranslate')) return;
    var computed = getComputedStyle(element).translate;
    var parts = computed && computed !== 'none' ? computed.trim().split(/\s+/) : [];
    element.__ccgUiBaseTranslate = {
      inline: element.style.translate,
      inlineScale: element.style.scale,
      x: parts[0] || '0px',
      y: parts[1] || '0px'
    };
  }

  function setDomOffset(element, item) {
    ensureDomBase(element);
    var base = element.__ccgUiBaseTranslate;
    element.style.translate = 'calc(' + base.x + ' + ' + item.x + 'px) calc(' + base.y + ' + ' + item.y + 'px)';
    var scale = itemScale(item);
    if (Math.abs(scale - 1) > 0.001) element.style.scale = String(scale);
    else element.style.scale = base.inlineScale;
    element.dataset.ccgUiAdjusted = '1';
  }

  function resetDomOffset(element) {
    ensureDomBase(element);
    element.style.translate = element.__ccgUiBaseTranslate.inline;
    element.style.scale = element.__ccgUiBaseTranslate.inlineScale;
    delete element.dataset.ccgUiAdjusted;
  }

  function applyDom() {
    Object.keys(state.dom).forEach(function (key) {
      var element;
      try { element = document.querySelector(key); } catch (_) { return; }
      if (!element) return;
      setDomOffset(element, state.dom[key]);
    });
  }

  // Phaser 3 has no global registry (Phaser.GAMES is Phaser 2 API); the page
  // injection wraps `Phaser.Game` so instances land in __CCG_PHASER_GAMES.
  // Keep the Phaser.GAMES fallback for legacy Phaser 2 content.
  function phaserGames() {
    var games = [];
    var hooked = window.__CCG_PHASER_GAMES;
    if (hooked && hooked.length) {
      for (var i = 0; i < hooked.length; i++) games.push(hooked[i]);
    } else if (window.Phaser && Array.isArray(window.Phaser.GAMES)) {
      window.Phaser.GAMES.forEach(function (game) { games.push(game); });
    }
    return games.filter(function (game) {
      return game && game.scene && game.canvas && game.canvas.isConnected !== false;
    });
  }

  function phaserObjects() {
    var result = [];
    phaserGames().forEach(function (game) {
      var scenes;
      try { scenes = game.scene.getScenes(true); } catch (_) { return; }
      scenes.forEach(function (scene) {
        var seen = {};
        var list = scene.children && scene.children.list || [];
        list.forEach(function (object) {
          if (!object || typeof object.getBounds !== 'function') return;
          var type = object.type || (object.constructor && object.constructor.name) || 'Object';
          if (!/Text|Image|Sprite|Container|DOMElement|NineSlice|Graphics|BitmapText/i.test(type)) return;
          var identity = object.name || object.text || (object.texture && object.texture.key) || type;
          var signature = [scene.sys.settings.key || 'scene', type, String(identity).slice(0, 80)].join('|');
          var occurrence = seen[signature] || 0;
          seen[signature] = occurrence + 1;
          result.push({
            key: signature + '|' + occurrence,
            object: object,
            game: game,
            scene: scene,
            label: type + (identity && identity !== type ? ' · ' + String(identity).slice(0, 24) : '')
          });
        });
      });
    });
    return result;
  }

  function ensurePhaserBase(object) {
    if (!object.__ccgUiBasePosition) {
      object.__ccgUiBasePosition = { x: finite(object.x, 0), y: finite(object.y, 0) };
    }
    if (!object.__ccgUiBaseScale) {
      object.__ccgUiBaseScale = { x: finite(object.scaleX, 1), y: finite(object.scaleY, 1) };
    }
  }

  function applyPhaserItem(entry, item) {
    ensurePhaserBase(entry.object);
    if (typeof entry.object.setPosition === 'function') entry.object.setPosition(item.x, item.y);
    else { entry.object.x = item.x; entry.object.y = item.y; }
    var scale = itemScale(item);
    var base = entry.object.__ccgUiBaseScale;
    if (typeof entry.object.setScale === 'function') {
      entry.object.setScale(base.x * scale, base.y * scale);
    }
  }

  function applyPhaser() {
    phaserObjects().forEach(function (entry) {
      var item = state.phaser[entry.key];
      if (!item) return;
      applyPhaserItem(entry, item);
    });
  }

  function makeOverlay(color, dashed) {
    var box = document.createElement('div');
    box.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;border:2px ' +
      (dashed ? 'dashed' : 'solid') + ' ' + color + ';border-radius:4px;box-shadow:0 0 0 1px rgba(255,255,255,.9) inset;display:none;';
    var tag = document.createElement('div');
    tag.style.cssText = 'position:absolute;left:-2px;bottom:calc(100% + 4px);max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-radius:4px;background:#21242c;color:white;padding:3px 6px;font:11px/1.3 system-ui,sans-serif;';
    box.appendChild(tag);
    document.documentElement.appendChild(box);
    return { box: box, tag: tag };
  }

  function ensureOverlay() {
    if (overlay) return;
    var selectedParts = makeOverlay('#ff8652', false);
    overlay = selectedParts.box;
    label = selectedParts.tag;
    var hoverParts = makeOverlay('#5b9dff', true);
    hoverOverlay = hoverParts.box;
    hoverLabel = hoverParts.tag;
  }

  function showRect(box, tag, rect, text) {
    ensureOverlay();
    box.style.display = 'block';
    box.style.left = rect.left + 'px';
    box.style.top = rect.top + 'px';
    box.style.width = Math.max(0, rect.width) + 'px';
    box.style.height = Math.max(0, rect.height) + 'px';
    tag.textContent = text;
  }

  function phaserRect(entry) {
    var bounds = entry.object.getBounds();
    var canvasRect = entry.game.canvas.getBoundingClientRect();
    var sx = canvasRect.width / entry.game.canvas.width;
    var sy = canvasRect.height / entry.game.canvas.height;
    return {
      left: canvasRect.left + bounds.x * sx,
      top: canvasRect.top + bounds.y * sy,
      width: bounds.width * sx,
      height: bounds.height * sy
    };
  }

  function selectionSuffix(item) {
    var scale = itemScale(item);
    return Math.abs(scale - 1) > 0.001 ? ' · ×' + scale.toFixed(2) : '';
  }

  function refreshSelection() {
    if (!selected) return;
    var item = selected.kind === 'dom' ? state.dom[selected.key] : state.phaser[selected.entry.key];
    var text = selected.label + selectionSuffix(item || {});
    if (selected.kind === 'dom') {
      showRect(overlay, label, selected.element.getBoundingClientRect(), text);
      return;
    }
    try {
      showRect(overlay, label, phaserRect(selected.entry), text);
    } catch (_) {}
  }

  function pickPhaserCandidates(event, canvas) {
    var rect = canvas.getBoundingClientRect();
    var x = (event.clientX - rect.left) * canvas.width / rect.width;
    var y = (event.clientY - rect.top) * canvas.height / rect.height;
    return phaserObjects().filter(function (entry) {
      if (entry.game.canvas !== canvas || entry.object.visible === false || entry.object.alpha === 0) return false;
      var bounds;
      try { bounds = entry.object.getBounds(); } catch (_) { return false; }
      return bounds && bounds.width >= 3 && bounds.height >= 3 && bounds.contains(x, y);
    }).sort(function (a, b) {
      var aa = a.object.getBounds();
      var bb = b.object.getBounds();
      return aa.width * aa.height - bb.width * bb.height;
    });
  }

  // Repeated clicks on (almost) the same point cycle through overlapping
  // objects, so items buried under a larger sprite stay reachable. Shift-click
  // keeps the old "second candidate" shortcut.
  function pickPhaser(event, canvas) {
    var matches = pickPhaserCandidates(event, canvas);
    if (!matches.length) return null;
    var index = 0;
    if (event.shiftKey && matches.length > 1) {
      index = 1;
    } else if (
      lastPick &&
      Math.abs(event.clientX - lastPick.x) < 6 &&
      Math.abs(event.clientY - lastPick.y) < 6
    ) {
      index = (lastPick.index + 1) % matches.length;
    }
    lastPick = { x: event.clientX, y: event.clientY, index: index };
    return matches[index];
  }

  function hover(event) {
    if (drag) return;
    var target = event.target;
    if (!(target instanceof Element)) return;
    if (target.tagName === 'CANVAS') {
      var matches = pickPhaserCandidates(event, target);
      if (!matches.length) {
        if (hoverOverlay) hoverOverlay.style.display = 'none';
        return;
      }
      try {
        showRect(hoverOverlay, hoverLabel, phaserRect(matches[0]),
          matches[0].label + (matches.length > 1 ? ' (+' + (matches.length - 1) + ')' : ''));
      } catch (_) {}
      return;
    }
    if (/^(HTML|BODY|SCRIPT|STYLE|LINK|META)$/.test(target.tagName)) {
      if (hoverOverlay) hoverOverlay.style.display = 'none';
      return;
    }
    var isButtonText = target.hasAttribute && target.hasAttribute(BUTTON_TEXT_ATTRIBUTE);
    showRect(hoverOverlay, hoverLabel, target.getBoundingClientRect(),
      (isButtonText ? 'button text' : target.tagName.toLowerCase()) +
      (target.textContent ? ' · ' + target.textContent.trim().slice(0, 24) : ''));
  }

  function begin(event) {
    if (!EDIT_MODE || event.button !== 0) return;
    var target = event.target;
    if (!(target instanceof Element)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (hoverOverlay) hoverOverlay.style.display = 'none';

    if (target.tagName === 'CANVAS') {
      var entry = pickPhaser(event, target);
      if (!entry) return;
      ensurePhaserBase(entry.object);
      var current = state.phaser[entry.key] || { x: finite(entry.object.x, 0), y: finite(entry.object.y, 0) };
      state.phaser[entry.key] = current;
      selected = { kind: 'phaser', entry: entry, label: entry.label };
      drag = {
        startX: event.clientX,
        startY: event.clientY,
        x: current.x,
        y: current.y,
        scaleX: target.width / target.getBoundingClientRect().width,
        scaleY: target.height / target.getBoundingClientRect().height
      };
    } else {
      var element = event.shiftKey && target.parentElement && target.parentElement !== document.body
        ? target.parentElement
        : target;
      if (/^(HTML|BODY|SCRIPT|STYLE|LINK|META)$/.test(element.tagName)) return;
      lastPick = null;
      var key = domKey(element);
      var currentDom = state.dom[key] || { x: 0, y: 0 };
      state.dom[key] = currentDom;
      var isButtonText = element.hasAttribute && element.hasAttribute(BUTTON_TEXT_ATTRIBUTE);
      selected = { kind: 'dom', key: key, element: element, label: (isButtonText ? 'button text' : element.tagName.toLowerCase()) + (element.textContent ? ' · ' + element.textContent.trim().slice(0, 24) : '') };
      drag = { startX: event.clientX, startY: event.clientY, x: currentDom.x, y: currentDom.y };
    }
    refreshSelection();
    post('ccg-ui-editor-selection', { selection: selected.label });
  }

  function move(event) {
    if (!drag || !selected) {
      hover(event);
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    var dx = event.clientX - drag.startX;
    var dy = event.clientY - drag.startY;
    if (selected.kind === 'dom') {
      var domItem = state.dom[selected.key];
      domItem.x = Math.round(drag.x + dx);
      domItem.y = Math.round(drag.y + dy);
      setDomOffset(selected.element, domItem);
    } else {
      var phaserItem = state.phaser[selected.entry.key];
      phaserItem.x = Math.round((drag.x + dx * drag.scaleX) * 100) / 100;
      phaserItem.y = Math.round((drag.y + dy * drag.scaleY) * 100) / 100;
      applyPhaserItem(selected.entry, phaserItem);
    }
    refreshSelection();
  }

  function finish(event) {
    if (!drag) return;
    if (event) { event.preventDefault(); event.stopImmediatePropagation(); }
    drag = null;
    post('ccg-ui-overrides-change', { selection: selected && selected.label });
  }

  function selectedItem() {
    if (!selected) return null;
    return selected.kind === 'dom' ? state.dom[selected.key] : state.phaser[selected.entry.key];
  }

  function applySelected() {
    if (!selected) return;
    var item = selectedItem();
    if (!item) return;
    if (selected.kind === 'dom') setDomOffset(selected.element, item);
    else applyPhaserItem(selected.entry, item);
    refreshSelection();
    post('ccg-ui-overrides-change', { selection: selected.label });
  }

  function nudge(dx, dy) {
    var item = selectedItem();
    if (!item) return;
    item.x += dx;
    item.y += dy;
    applySelected();
  }

  function scaleSelected(delta) {
    var item = selectedItem();
    if (!item) return;
    var next = Math.max(0.25, Math.min(4, itemScale(item) + delta));
    if (Math.abs(next - 1) <= 0.001) delete item.s;
    else item.s = Math.round(next * 1000) / 1000;
    applySelected();
  }

  function deselect() {
    selected = null;
    drag = null;
    if (overlay) overlay.style.display = 'none';
    post('ccg-ui-editor-selection', { selection: null });
  }

  function resetSelected() {
    if (!selected) return;
    if (selected.kind === 'dom') {
      delete state.dom[selected.key];
      resetDomOffset(selected.element);
    } else {
      ensurePhaserBase(selected.entry.object);
      var base = selected.entry.object.__ccgUiBasePosition;
      var baseScale = selected.entry.object.__ccgUiBaseScale;
      delete state.phaser[selected.entry.key];
      if (base) selected.entry.object.setPosition(base.x, base.y);
      if (baseScale && typeof selected.entry.object.setScale === 'function') {
        selected.entry.object.setScale(baseScale.x, baseScale.y);
      }
    }
    refreshSelection();
    post('ccg-ui-overrides-change', { selection: selected.label });
  }

  function resetAll() {
    Object.keys(state.dom).forEach(function (key) {
      try { var el = document.querySelector(key); if (el) resetDomOffset(el); } catch (_) {}
    });
    phaserObjects().forEach(function (entry) {
      if (!state.phaser[entry.key]) return;
      var base = entry.object.__ccgUiBasePosition;
      var baseScale = entry.object.__ccgUiBaseScale;
      if (base) entry.object.setPosition(base.x, base.y);
      if (baseScale && typeof entry.object.setScale === 'function') {
        entry.object.setScale(baseScale.x, baseScale.y);
      }
    });
    state = { version: 1, dom: {}, phaser: {} };
    selected = null;
    if (overlay) overlay.style.display = 'none';
    if (hoverOverlay) hoverOverlay.style.display = 'none';
    post('ccg-ui-overrides-change', { selection: null });
  }

  function enableEditing() {
    ensureOverlay();
    document.documentElement.style.cursor = 'move';
    // Without this, touch drags scroll/zoom the page instead of moving the
    // selected element — edit mode on mobile was effectively broken.
    document.documentElement.style.touchAction = 'none';
    if (document.body) document.body.style.touchAction = 'none';
    document.addEventListener('pointerdown', begin, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', finish, true);
    document.addEventListener('pointerleave', function () {
      if (hoverOverlay) hoverOverlay.style.display = 'none';
    }, true);
    document.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
    document.addEventListener('wheel', function (event) {
      if (!selected || !event.altKey) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      scaleSelected(event.deltaY < 0 ? 0.05 : -0.05);
    }, { capture: true, passive: false });
    window.addEventListener('keydown', function (event) {
      var amount = event.shiftKey ? 10 : 1;
      if (event.key === 'ArrowLeft') nudge(-amount, 0);
      else if (event.key === 'ArrowRight') nudge(amount, 0);
      else if (event.key === 'ArrowUp') nudge(0, -amount);
      else if (event.key === 'ArrowDown') nudge(0, amount);
      else if (event.key === '+' || event.key === '=') scaleSelected(event.shiftKey ? 0.1 : 0.05);
      else if (event.key === '-' || event.key === '_') scaleSelected(event.shiftKey ? -0.1 : -0.05);
      else if (event.key === 'Escape') deselect();
      else if (event.key === 'Backspace' || event.key === 'Delete') resetSelected();
      else return;
      event.preventDefault();
    }, true);
    window.addEventListener('message', function (event) {
      var data = event.data || {};
      if (data.type !== 'ccg-ui-editor-command') return;
      if (data.command === 'reset') resetAll();
      if (data.command === 'reset-selected') resetSelected();
    });
    post('ccg-ui-editor-ready');
  }

  observeButtonTextTargets();

  fetch('ccg-ui-overrides.json?t=' + Date.now(), { cache: 'no-store' })
    .then(function (response) { return response.ok ? response.json() : null; })
    .then(function (raw) {
      state = normalize(raw);
      applyDom();
      applyPhaser();
      setInterval(function () { prepareButtonTextTargets(document); applyDom(); applyPhaser(); refreshSelection(); }, 500);
      if (EDIT_MODE) enableEditing();
    })
    .catch(function () {
      if (EDIT_MODE) enableEditing();
    });
})();
