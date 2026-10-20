import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// The package is "type": "module", so load the plain browser script by hand: it
// exports through `module.exports` when one exists.
const mod = { exports: {} };
new Function("module", readFileSync("public/analytics.js", "utf8"))(mod);
const { create, GA_ID, KEY } = mod.exports;

class El {
  constructor(tag) {
    this.tag = tag; this.children = []; this.attrs = {}; this.handlers = {};
    this.parentNode = null; this.hidden = true; this.focused = false;
  }
  setAttribute(k, v) { this.attrs[k] = v; }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  insertBefore(c, ref) { c.parentNode = this; const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); return c; }
  get firstChild() { return this.children[0] || null; }
  classList = { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } };
  removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; }
  addEventListener(t, f) { this.handlers[t] = f; }
  click() { this.handlers.click.call(this); }
  focus(opts) { this.focused = true; this.focusOpts = opts; }
  getBoundingClientRect() { return this.rect || { top: 0, bottom: 0, height: 0 }; }
  contains(c) { return c === this || this.children.some((x) => x.contains && x.contains(c)); }
  find(pred) {
    for (const c of this.children) {
      if (pred(c)) return c;
      const r = c.find ? c.find(pred) : null;
      if (r) return r;
    }
    return null;
  }
  button(text) { return this.find((c) => c.tag === "button" && c.textContent === text); }
}

function env({ host = "modelspec.org", href = "https://modelspec.org/docs/?q=secret#frag", referrer = "", stored, brokenStorage = false, cookies = [] } = {}) {
  const store = new Map(stored === undefined ? [] : [[KEY, stored]]);
  const jar = cookies.map(([name, domain]) => ({ name, domain: domain || null }));
  const head = new El("head"), body = new El("body");
  const opener = new El("button");
  const listeners = {};
  const docListeners = {};
  const doc = {
    head, body, documentElement: new El("html"), referrer, createElement: (t) => new El(t),
    createTextNode: (t) => ({ textContent: t }),
    querySelectorAll: () => [opener],
    querySelector: () => opener,
    addEventListener: (t, f) => { docListeners[t] = f; },
    removeEventListener: (t) => { delete docListeners[t]; },
    get cookie() { return [...new Set(jar.map((c) => c.name))].map((n) => `${n}=1`).join("; "); },
    set cookie(v) {
      const parts = v.split(";").map((x) => x.trim());
      const name = parts[0].split("=")[0];
      const domain = (parts.find((p) => p.startsWith("domain=")) || "").slice(7) || null;
      if (parts.some((p) => p.startsWith("expires=Thu, 01 Jan 1970"))) {
        for (let i = jar.length - 1; i >= 0; i--) if (jar[i].name === name && jar[i].domain === domain) jar.splice(i, 1);
      } else jar.push({ name, domain });
    },
  };
  const win = {
    document: doc, dataLayer: undefined,
    scrollBy: (o) => win.scrolls.push(o),
    location: { hostname: host, href, origin: new URL(href).origin },
    addEventListener: (t, f) => { listeners[t] = f; },
    localStorage: brokenStorage
      ? { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } }
      : { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) },
  };
  const scripts = () => head.children.filter((c) => c.tag === "script").map((c) => c.src);
  const banner = () => body.find((c) => c.attrs.role === "region");
  return { docListeners, scrolls: (win.scrolls = []), body, win, doc, store, jar, scripts, banner, opener, listeners };
}

const calls = (win) => (win.dataLayer || []).map((a) => Array.from(a));

test("measurement ID is the ModelSpec property stream", () => {
  assert.equal(GA_ID, "G-1F96L8YS39");
});

test("no choice: banner shown, no gtag, no dataLayer entries, no script", () => {
  const e = env();
  create(e.win).start();
  assert.deepEqual(e.scripts(), []);
  assert.equal(e.win.dataLayer, undefined);
  const b = e.banner();
  assert.equal(b.attrs["aria-label"], "Analytics choice");
  assert.ok(b.button("Accept analytics"));
  assert.ok(b.button("Reject"));
  assert.equal(b.find((c) => c.tag === "a").href, "/privacy/#analytics");
  assert.equal(e.opener.hidden, false);
});

test("invalid stored value counts as no choice", () => {
  const e = env({ stored: "yes" });
  create(e.win).start();
  assert.ok(e.banner());
  assert.deepEqual(e.scripts(), []);
});

test("Accept: consent default denied then update, scrubbed config, gtag.js once", () => {
  const e = env({ referrer: "https://example.org/a/b?x=1#y" });
  create(e.win).start();
  e.banner().button("Accept analytics").click();
  assert.equal(e.store.get(KEY), "granted");
  assert.equal(e.banner(), null);
  const c = calls(e.win);
  assert.deepEqual(c[0], ["consent", "default", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" }]);
  assert.deepEqual(c[1], ["consent", "update", { analytics_storage: "granted" }]);
  assert.equal(c[2][0], "js");
  assert.equal(c[4][0], "set");
  assert.deepEqual(c[3], ["config", "G-1F96L8YS39", {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    page_location: "https://modelspec.org/docs/",
    page_referrer: "https://example.org/a/b",
  }]);
  assert.deepEqual(c[4], ["set", { page_location: "https://modelspec.org/docs/", page_referrer: "https://example.org/a/b" }]);
  assert.deepEqual(e.scripts(), ["https://www.googletagmanager.com/gtag/js?id=G-1F96L8YS39"]);
  assert.equal(e.win["ga-disable-G-1F96L8YS39"], false);
});

test("stored granted loads on start without banner; page loads tag once", () => {
  const e = env({ stored: "granted" });
  const a = create(e.win);
  a.start();
  a.decide("granted");
  assert.equal(e.banner(), null);
  assert.equal(e.scripts().length, 1);
});

test("Reject / stored denied: nothing loads, stale _ga cookies are removed", () => {
  const e = env({ cookies: [["_ga"], ["_ga_ABC", ".modelspec.org"], ["keep"]] });
  create(e.win).start();
  e.banner().button("Reject").click();
  assert.equal(e.store.get(KEY), "denied");
  assert.deepEqual(e.scripts(), []);
  assert.equal(e.win.dataLayer, undefined);
  assert.deepEqual(e.jar.map((c) => c.name), ["keep"]);
});

test("withdrawal after grant: consent denied, ga-disable set, host and parent cookies deleted", () => {
  const e = env({ host: "www.modelspec.org", href: "https://www.modelspec.org/", stored: "granted",
    cookies: [["_ga"], ["_ga", ".modelspec.org"], ["_ga_X1", "modelspec.org"], ["_ga_X1", ".www.modelspec.org"], ["other"]] });
  const a = create(e.win);
  a.start();
  e.opener.click();
  assert.ok(e.banner());
  assert.equal(e.banner().focused, true);
  e.banner().button("Reject").click();
  assert.deepEqual(calls(e.win).at(-1), ["consent", "update", { analytics_storage: "denied" }]);
  assert.equal(e.win["ga-disable-G-1F96L8YS39"], true);
  assert.deepEqual(e.jar.map((c) => c.name), ["other"]);
  assert.equal(e.opener.focused, true);
});

test("localhost and 127.0.0.1: banner shows, no tag even after Accept", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]", "app.localhost", "x.y.localhost"]) {
    const e = env({ host, href: `http://${host}/` });
    create(e.win).start();
    assert.ok(e.banner());
    e.banner().button("Accept analytics").click();
    assert.deepEqual(e.scripts(), []);
    assert.equal(e.win.dataLayer, undefined);
  }
});

test("storage unavailable: banner, no tag at load; Accept loads for this page only", () => {
  const e = env({ brokenStorage: true });
  const a = create(e.win);
  a.start();
  assert.ok(e.banner());
  assert.deepEqual(e.scripts(), []);
  a.decide("granted");
  assert.equal(e.scripts().length, 1);
  assert.equal(a.choice(), "granted");
  // a new page has no memory of it
  const e2 = env({ brokenStorage: true });
  create(e2.win).start();
  assert.deepEqual(e2.scripts(), []);
});

test("another tab's choice is followed through the storage event", () => {
  const e = env();
  create(e.win).start();
  e.store.set(KEY, "granted");
  e.listeners.storage({ key: KEY });
  assert.equal(e.banner(), null);
  assert.equal(e.scripts().length, 1);
  e.store.set(KEY, "denied");
  e.listeners.storage({ key: KEY });
  assert.equal(e.win["ga-disable-G-1F96L8YS39"], true);
  e.listeners.storage({ key: "unrelated" });
  e.store.delete(KEY);
  e.listeners.storage({ key: KEY });
  assert.ok(e.banner());
});

test("the landing page and the privacy page load analytics.js, offer Analytics choices and link the privacy page", () => {
  for (const p of ["public/index.html", "public/privacy/index.html"]) {
    const html = readFileSync(p, "utf8");
    assert.match(html, /<script src="\/analytics\.js" defer><\/script>/, p);
    assert.match(html, /data-analytics-choices/, p);
    assert.match(html, /href="\/privacy\/"/, p);
  }
});

test("the shell reused by generated registry pages carries the loader, footer button and privacy link", () => {
  const landing = readFileSync("public/index.html", "utf8");
  const footer = /<footer class="site-foot">[\s\S]*?<\/footer>/.exec(landing)[0];
  assert.match(footer, /<a href="\/privacy\/">Privacy<\/a>/);
  assert.match(footer, /<button type="button" class="linklike" data-analytics-choices hidden>Analytics choices<\/button>/);
  assert.match(readFileSync("src/render.mjs", "utf8"), /<script src="\/analytics\.js" defer><\/script>/);
});

test("no other Google Analytics tag or Firebase Analytics ships", () => {
  for (const p of ["public/index.html", "public/privacy/index.html", "public/analytics.js", "public/script.js", "src/render.mjs"]) {
    const t = readFileSync(p, "utf8");
    assert.doesNotMatch(t, /G-(?!1F96L8YS39)[A-Z0-9]{8,}|firebase-analytics/, p);
  }
});

test("privacy page states the analytics terms", () => {
  const t = readFileSync("public/privacy/index.html", "utf8");
  for (const s of ['id="analytics"', "Google Ireland Limited", "_ga_&lt;id&gt;", "two years", "14 months", "consent", "Analytics choices", "modelspec.analytics-consent.v1"]) {
    assert.ok(t.includes(s), s);
  }
});

test("query values never reach any gtag call", () => {
  const q = "?token=tok123&next=https%3A%2F%2Fapp.example%2Fcb&state=st4te";
  const e = env({ href: `https://modelspec.org/registry/${q}#f`, referrer: `https://app.example/x${q}` });
  create(e.win).start();
  e.banner().button("Accept analytics").click();
  const all = JSON.stringify(calls(e.win));
  for (const v of ["tok123", "app.example%2Fcb", "st4te", "token", "state="]) assert.ok(!all.includes(v), v);
  assert.ok(calls(e.win).some((c) => c[0] === "set"));
});

test("choice cleared in another tab while GA runs here is treated as withdrawal", () => {
  const e = env({ stored: "granted", cookies: [["_ga"], ["_ga_Q"]] });
  create(e.win).start();
  e.store.delete(KEY);
  e.listeners.storage({ key: KEY });
  assert.deepEqual(calls(e.win).at(-1), ["consent", "update", { analytics_storage: "denied" }]);
  assert.equal(e.win["ga-disable-G-1F96L8YS39"], true);
  assert.deepEqual(e.jar, []);
  assert.ok(e.banner());
});

test("privacy page discloses Google Fonts, loaded before any choice", () => {
  const t = readFileSync("public/privacy/index.html", "utf8");
  assert.match(t, /Google Fonts/);
  assert.match(t, /fonts\.googleapis\.com/);
  assert.match(t, /fonts\.gstatic\.com/);
  assert.match(t, /IP address/);
});

test("banner is first in DOM order, reserves space (html class), and focus returns to the footer control after a choice", () => {
  const e = env();
  e.body.appendChild(new El("main"));
  create(e.win).start();
  assert.equal(e.body.children[0].attrs.role, "region");
  assert.ok(e.doc.documentElement.classList.contains("has-consent-banner"));
  e.banner().button("Reject").click();
  assert.equal(e.doc.documentElement.classList.contains("has-consent-banner"), false);
  assert.equal(e.opener.focused, true);
});

test("focus returns without scrolling, and a control focused under the banner is scrolled clear", () => {
  const e = env();
  create(e.win).start();
  assert.ok(e.docListeners.focusin);
  e.banner().rect = { top: 500, bottom: 700, height: 200 };
  const under = new El("a");
  under.rect = { top: 560, bottom: 600, height: 40 };
  e.docListeners.focusin({ target: under });
  assert.deepEqual(e.scrolls, [{ top: 560 + 20 - 250, behavior: "instant" }]);
  const clear = new El("a");
  clear.rect = { top: 100, bottom: 140, height: 40 };
  e.docListeners.focusin({ target: clear });
  e.docListeners.focusin({ target: e.banner().button("Reject") });
  assert.equal(e.scrolls.length, 1);
  e.banner().button("Reject").click();
  assert.deepEqual(e.opener.focusOpts, { preventScroll: true });
  assert.equal(e.docListeners.focusin, undefined);
});

test("focus that follows a pointer press is never scrolled; keyboard focus is again after a key press", () => {
  const e = env();
  create(e.win).start();
  e.banner().rect = { top: 500, bottom: 700, height: 200 };
  const under = new El("a");
  under.rect = { top: 560, bottom: 600, height: 40 };
  e.docListeners.pointerdown({});
  e.docListeners.focusin({ target: under });
  assert.equal(e.scrolls.length, 0);
  e.docListeners.keydown({});
  e.docListeners.focusin({ target: under });
  assert.equal(e.scrolls.length, 1);
  e.docListeners.touchstart({});
  e.docListeners.focusin({ target: under });
  assert.equal(e.scrolls.length, 1);
});
