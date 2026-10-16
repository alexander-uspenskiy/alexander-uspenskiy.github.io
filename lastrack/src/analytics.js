// Tiny safe GA4 wrapper. track(name, params) never throws, sends nothing in Node/tests, on localhost, without gtag,
// after an opt-out or with Do Not Track on. `?ga=debug` lets a localhost run push to window.dataLayer (the remote
// script is never loaded there, so nothing leaves the machine) for verification.
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;
export const MAX_STR = 100, MAX_PARAMS = 25;

/** Pure: GA-safe params: snake_case keys, strings <= 100 chars, numbers rounded to 2 dp, booleans as 0/1, no null/NaN/objects. */
export function sanitizeParams(params) {
  const out = {};
  if (!params || typeof params !== 'object') return out;
  let n = 0;
  for (const [k0, v] of Object.entries(params)) {
    if (n >= MAX_PARAMS) break;
    const k = String(k0).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
    if (!k || /^[0-9]/.test(k)) continue;
    let val;
    if (typeof v === 'string') val = v.trim().slice(0, MAX_STR);
    else if (typeof v === 'number') { if (!Number.isFinite(v)) continue; val = Math.round(v * 100) / 100; }
    else if (typeof v === 'boolean') val = v ? 1 : 0;
    else continue;
    out[k] = val; n++;
  }
  return out;
}
export function sanitizeName(name) { return String(name || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40); }

/** Pure: should anything be sent? */
export function analyticsEnabled({ hostname = '', hasGtag = false, optIn = true, dnt = false, debug = false } = {}) {
  if (!hasGtag || !optIn || dnt) return false;
  return debug || !LOCAL.test(hostname);
}

export function createAnalytics({ win = typeof window !== 'undefined' ? window : null, getOptIn = () => true, now = () => Date.now(), debounceMs = 1500 } = {}) {
  const recent = new Map();
  let sent = 0;
  const env = () => {
    try {
      const loc = (win && win.location) || {};
      const nav = (win && win.navigator) || {};
      return {
        hostname: loc.hostname || '', hasGtag: !!(win && typeof win.gtag === 'function'), optIn: !!getOptIn(),
        dnt: nav.doNotTrack === '1' || win?.doNotTrack === '1', debug: /(^|[?&])ga=debug(&|$)/.test(loc.search || ''),
      };
    } catch { return { hasGtag: false }; }
  };
  const api = {
    get sent() { return sent; },
    enabled() { return analyticsEnabled(env()); },
    /** Send one event (deduplicated within debounceMs). Returns true if it was handed to gtag. */
    track(name, params) {
      try {
        const n = sanitizeName(name);
        if (!n || !api.enabled()) return false;
        const p = sanitizeParams(params);
        const key = n + JSON.stringify(p), t = now(), last = recent.get(key);
        if (last !== undefined && t - last < debounceMs) return false;
        recent.set(key, t);
        if (recent.size > 200) for (const [k, v] of recent) if (t - v > debounceMs) recent.delete(k);
        win.gtag('event', n, p); sent++;
        return true;
      } catch { return false; }
    },
    /** Opt in/out: keeps GA consent in step (the toggle also gates track()). */
    setOptIn(on) {
      try { if (win && typeof win.gtag === 'function') win.gtag('consent', 'update', { analytics_storage: on ? 'granted' : 'denied' }); } catch { /* ignore */ }
    },
  };
  return api;
}
