/* Load once before the game; await YorollFonts.ready before drawing Canvas/Phaser text. */
(function (global) {
  'use strict';
  const source = document.currentScript && document.currentScript.src;
  if (!source) throw new Error('Load font-runtime.js as an external script.');
  const selection = {"title":{"id":"source-han-sans-sc-medium","family":"Source Han Sans SC","weight":500,"style":"normal","path":"assets/fonts/yoroll/source-han-sans-sc-medium/source-han-sans-sc-medium-443153c3de06.woff2"},"body":{"id":"source-han-sans-sc-medium","family":"Source Han Sans SC","weight":500,"style":"normal","path":"assets/fonts/yoroll/source-han-sans-sc-medium/source-han-sans-sc-medium-443153c3de06.woff2"},"hud":{"id":"source-han-sans-sc-medium","family":"Source Han Sans SC","weight":500,"style":"normal","path":"assets/fonts/yoroll/source-han-sans-sc-medium/source-han-sans-sc-medium-443153c3de06.woff2"},"fallback":{"id":"source-han-sans-sc-medium","family":"Source Han Sans SC","weight":500,"style":"normal","path":"assets/fonts/yoroll/source-han-sans-sc-medium/source-han-sans-sc-medium-443153c3de06.woff2"}};
  const faces = [{"id":"source-han-sans-sc-medium","family":"Source Han Sans SC","weight":500,"style":"normal","path":"assets/fonts/yoroll/source-han-sans-sc-medium/source-han-sans-sc-medium-443153c3de06.woff2","alias":"Yoroll_source-han-sans-sc-medium","relative":"source-han-sans-sc-medium/source-han-sans-sc-medium-443153c3de06.woff2"}];
  let promise;
  function load() {
    if (promise) return promise;
    promise = Promise.all(faces.map(async function (face) {
      const existing = Array.from(document.fonts).find(function (item) {
        return item.family.replace(/^["']|["']$/g, '') === face.alias
          && item.weight === String(face.weight) && item.style === face.style;
      });
      if (existing) return existing.load();
      const url = new URL(face.relative, source).href;
      const fontFace = new FontFace(face.alias, 'url(' + JSON.stringify(url) + ')', { weight: String(face.weight), style: face.style, display: 'swap' });
      await fontFace.load();
      document.fonts.add(fontFace);
      return fontFace;
    }));
    return promise;
  }
  function font(role, pixels) {
    const face = selection[role || 'body'];
    if (!face) throw new Error('Unknown font role: ' + role);
    if (!Number.isFinite(pixels) || pixels <= 0) throw new Error('Font pixels must be positive.');
    const names = Array.from(new Set([face.id, selection.fallback.id])).map(function (id) { return JSON.stringify('Yoroll_' + id); });
    return face.style + ' ' + face.weight + ' ' + pixels + 'px ' + names.join(', ');
  }
  const api = { selection: selection, load: load, font: font, ready: load() };
  /* Keep failures observable without an unhandled rejection when a caller awaits ready later. */
  api.ready.catch(function (error) { console.error('Yoroll game fonts failed to load', error); });
  global.YorollFonts = api;
})(globalThis);
