/* Yoroll native ad protocol v1. No ad credentials or reward authority in game code. */
(() => {
  if (window.Yoroll?.ads) return;
  const pending = new Map();
  const routes = new Map();
  const native = window === window.top ? window.YorollNativeAds : null;
  // Older Android APKs inject v1 first; generated games also use the app UA fallback.
  const available = Boolean(native || (typeof navigator !== 'undefined' && /YorollCodeAndroid\//.test(navigator.userAgent)));
  const parentOrigin = (() => { try { return new URL(document.referrer).origin; } catch { return '*'; } })();
  const emit = detail => window.dispatchEvent(new CustomEvent('yoroll:ad', { detail }));
  function settle(data) {
    const task = pending.get(data.id);
    if (!task) return;
    emit(data);
    if (['completed', 'cancelled', 'failed', 'unavailable'].includes(data.status)) {
      clearTimeout(task.timer); pending.delete(data.id); task.resolve(data);
    }
  }
  function deliver(data) {
    const route = routes.get(data.id);
    if (!route) { settle(data); return; }
    if (route.frame.isConnected && route.frame.contentWindow === route.source && route.frame.src === route.src) {
      route.source.postMessage(data, route.origin);
    }
    if (['completed', 'cancelled', 'failed', 'unavailable'].includes(data.status)) {
      clearTimeout(route.timer); routes.delete(data.id);
    }
  }
  function submit(data) {
    if (window !== window.top) window.parent.postMessage(data, parentOrigin);
    else if (native) native.postMessage(JSON.stringify(data));
    else deliver({ channel: 'yoroll.ads.result', id: data.id, status: 'unavailable', rewarded: false });
  }
  if (native) native.onmessage = event => {
    try { const data = JSON.parse(event.data); if (data.channel === 'yoroll.ads.result') deliver(data); } catch { /* Ignore malformed messages. */ }
  };
  window.addEventListener('message', event => {
    const data = event.data;
    if (!data || typeof data !== 'object' || !/^[A-Za-z0-9-]{1,100}$/.test(data.id)) return;
    if (data.channel === 'yoroll.ads.result' && window !== window.top && event.source === window.parent && (parentOrigin === '*' || event.origin === parentOrigin)) {
      deliver(data); return;
    }
    if (data.channel !== 'yoroll.ads.request' || !['rewarded','interstitial'].includes(data.kind) || routes.has(data.id) || pending.has(data.id)) return;
    const frame = [...document.querySelectorAll('iframe')].find(f => f.contentWindow === event.source);
    if (!frame || !frame.src || event.origin === 'null') return;
    try { if (new URL(frame.src, location.href).origin !== event.origin) return; } catch { return; }
    const timer = setTimeout(() => routes.delete(data.id), 300000);
    routes.set(data.id, { frame, src: frame.src, source: event.source, origin: event.origin, timer });
    // Forward a bounded protocol object, never arbitrary native method calls or ad unit IDs.
    submit({ channel: data.channel, id: data.id, kind: data.kind, placement: String(data.placement || '').slice(0,80) });
  });
  function request(kind, options = {}) {
    if (!available) return Promise.resolve({status:'unavailable',rewarded:false});
    if (pending.size) return Promise.resolve({status:'failed',error:'busy',rewarded:false});
    const id = crypto.randomUUID();
    return new Promise(resolve => {
      const timer = setTimeout(() => settle({ id, status:'failed', error:'bridge_timeout', rewarded:false }), 240000);
      pending.set(id, { resolve, timer });
      emit({ id, status:'requested', kind });
      submit({channel:'yoroll.ads.request',id,kind,placement:String(options.placement || '').slice(0,80)});
    });
  }
  window.Yoroll = window.Yoroll || {};
  window.Yoroll.ads = Object.freeze({
    available,
    rewarded: options => request('rewarded', options),
    interstitial: options => request('interstitial', options),
    version: 1,
  });
})();
