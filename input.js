/** CCGInput: shared keyboard + pointer input for Phaser, DOM and Three.js.
 * const input = CCGInput.create({ surface: document.querySelector('canvas') });
 * input.bindButton(jumpButton, 'jump'); input.bindStick(stickElement);
 * Each frame: input.axis() => {x,y}; input.down('jump').
 * Optional keys: { actionName: ['Space', 'KeyE'] }. Call destroy on scene exit.
 * Style touch controls with min 44px targets and safe-area insets. This module
 * binds controls supplied by the game; it does not impose a HUD or hide mouse.
 */
(function (root) {
  'use strict';
  function create(options) {
    options = options || {};
    const doc = root.document;
    const keys = Object.assign({ left: ['KeyA','ArrowLeft'], right: ['KeyD','ArrowRight'], up: ['KeyW','ArrowUp'], down: ['KeyS','ArrowDown'], jump: ['Space'], action: ['KeyE'] }, options.keys);
    const held = new Set();
    const pointers = new Map();
    const sticks = new Map();
    const cleanup = [];
    const resets = [];
    function listen(target, name, fn, opts) {
      target.addEventListener(name, fn, opts);
      cleanup.push(() => target.removeEventListener(name, fn, opts));
    }
    function reset() { held.clear(); pointers.clear(); sticks.clear(); resets.forEach(fn => fn()); }
    function editable(target) { return target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)); }
    function keyboard(event) {
      if (event.type === 'keyup') { held.delete(event.code); return; }
      if (editable(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (Object.values(keys).some(codes => codes.includes(event.code))) {
        event.preventDefault(); held.add(event.code);
      }
    }
    listen(root, 'keydown', keyboard);
    listen(root, 'keyup', keyboard);
    listen(root, 'blur', reset);
    listen(doc, 'visibilitychange', () => { if (doc.hidden) reset(); });
    // Keyboard events must reach the game's iframe after touch/click.
    if (options.surface) listen(options.surface, 'pointerdown', () => root.focus());
    function bindButton(element, action) {
      const oldTouchAction = element.style.touchAction;
      element.style.touchAction = 'none';
      const release = event => { if (pointers.get(event.pointerId)?.element === element) pointers.delete(event.pointerId); };
      listen(element, 'pointerdown', event => {
        if (event.button !== 0) return;
        event.preventDefault(); root.focus();
        pointers.set(event.pointerId, { element, action });
        element.setPointerCapture(event.pointerId);
      });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => listen(element, type, release));
      cleanup.push(() => { element.style.touchAction = oldTouchAction; });
    }
    function bindStick(element, onMove) {
      let pointer = null;
      const oldTouchAction = element.style.touchAction;
      element.style.touchAction = 'none';
      const report = (x, y) => { sticks.set(element, { x, y }); if (onMove) onMove(x, y); };
      const clear = () => { pointer = null; sticks.delete(element); if (onMove) onMove(0, 0); };
      resets.push(clear);
      function move(event) {
        if (event.pointerId !== pointer) return;
        const rect = element.getBoundingClientRect();
        const radius = Math.max(1, Math.min(rect.width, rect.height) / 2);
        let x = (event.clientX - rect.left - rect.width / 2) / radius;
        let y = (event.clientY - rect.top - rect.height / 2) / radius;
        const length = Math.hypot(x, y);
        if (length < 0.12) { x = 0; y = 0; }
        else if (length > 1) { x /= length; y /= length; }
        report(x, y);
      }
      listen(element, 'pointerdown', event => {
        if (pointer !== null || event.button !== 0) return;
        event.preventDefault(); root.focus(); pointer = event.pointerId;
        element.setPointerCapture(pointer); move(event);
      });
      listen(element, 'pointermove', move);
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => listen(element, type, event => { if (pointer === event.pointerId) clear(); }));
      cleanup.push(() => { element.style.touchAction = oldTouchAction; });
    }
    function down(action) { return (keys[action] || []).some(key => held.has(key)) || [...pointers.values()].some(value => value.action === action); }
    function axis() {
      let x = Number(down('right')) - Number(down('left'));
      let y = Number(down('down')) - Number(down('up'));
      for (const stick of sticks.values()) { x += stick.x; y += stick.y; }
      const length = Math.max(1, Math.hypot(x, y));
      return { x: x / length, y: y / length };
    }
    return { down, axis, bindButton, bindStick, reset, destroy() { reset(); cleanup.splice(0).forEach(fn => fn()); } };
  }
  root.CCGInput = { create };
})(window);
