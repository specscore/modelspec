// Google Analytics 4 with Consent Mode (default denied) and a consent banner.
// Nothing is sent to Google, and gtag.js is never fetched, until the visitor
// chooses "Accept analytics". Disabled on localhost so local development
// traffic is never tracked (the banner still shows there).
//
// Stored choice: localStorage "modelspec.analytics-consent.v1" = "granted" | "denied".
// Plain script (no build step); also loadable from Node for unit tests.
(function (root) {
  "use strict";

  var GA_ID = "G-1F96L8YS39";
  var KEY = "modelspec.analytics-consent.v1";
  var PRIVACY_URL = "/privacy/#analytics";
  var TEXT =
    "We’d like to use Google Analytics to count visits and see which pages help. " +
    "It sets cookies only if you accept.";

  function create(win) {
    var doc = win.document;
    var loc = win.location;
    var memory = null; // accepted choice held when storage is unavailable
    var loaded = false;
    var banner = null;
    var opener = null;
    var observer = null;

    function isLocal() {
      var h = loc.hostname;
      return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1" ||
        h === "" || /\.local$/.test(h) || /\.localhost$/.test(h);
    }

    function readStored() {
      try {
        var v = win.localStorage.getItem(KEY);
        return v === "granted" || v === "denied" ? v : null;
      } catch (e) {
        return null;
      }
    }

    function choice() {
      return readStored() || memory;
    }

    function store(value) {
      memory = null;
      try {
        win.localStorage.setItem(KEY, value);
        if (win.localStorage.getItem(KEY) === value) return;
      } catch (e) {}
      if (value === "granted") memory = value; // this page only
    }

    function scrub(url) {
      try {
        var u = new URL(url, loc.href);
        return u.origin + u.pathname;
      } catch (e) {
        return "";
      }
    }

    function gtagFn() {
      win.dataLayer = win.dataLayer || [];
      if (!win.gtag) {
        win.gtag = function () { win.dataLayer.push(arguments); };
      }
      return win.gtag;
    }

    function load() {
      if (isLocal()) return;
      win["ga-disable-" + GA_ID] = false;
      if (loaded) {
        gtagFn()("consent", "update", { analytics_storage: "granted" });
        return;
      }
      loaded = true;
      var gtag = gtagFn();
      gtag("consent", "default", {
        analytics_storage: "denied",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied"
      });
      gtag("consent", "update", { analytics_storage: "granted" });
      gtag("js", new Date());
      var cfg = {
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        page_location: scrub(loc.href)
      };
      var ref = doc.referrer ? scrub(doc.referrer) : "";
      if (ref) cfg.page_referrer = ref;
      gtag("config", GA_ID, cfg);
      // Enhanced-measurement events read page_location/page_referrer from here.
      var set = { page_location: cfg.page_location };
      if (ref) set.page_referrer = ref;
      gtag("set", set);
      var s = doc.createElement("script");
      s.async = true;
      s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
      doc.head.appendChild(s);
    }

    function expireCookies() {
      var host = loc.hostname;
      var labels = host.split(".");
      var scopes = [""]; // host-only cookie
      var names = [host];
      if (labels.length > 2 && !/^[\d.]+$/.test(host)) names.push(labels.slice(-2).join("."));
      names.forEach(function (d) { scopes.push("; domain=" + d, "; domain=." + d); });
      doc.cookie.split(";").forEach(function (c) {
        var name = c.split("=")[0].trim();
        if (name !== "_ga" && name.indexOf("_ga_") !== 0) return;
        scopes.forEach(function (scope) {
          doc.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/" + scope;
        });
      });
    }

    function withdraw() {
      if (loaded) {
        win.gtag("consent", "update", { analytics_storage: "denied" });
      }
      win["ga-disable-" + GA_ID] = true;
      expireCookies();
    }

    function apply(value) {
      if (value === "granted") load();
      else {
        if (value === "denied") win["ga-disable-" + GA_ID] = true;
        expireCookies();
      }
    }

    function hideBanner() {
      if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
      banner = null;
      if (doc.removeEventListener) {
        doc.removeEventListener("focusin", keepFocusClear);
        doc.removeEventListener("pointerdown", pointerDown, true);
        doc.removeEventListener("touchstart", pointerDown, true);
        doc.removeEventListener("keydown", keyDown, true);
      }
      pointerActive = false;
      var root = doc.documentElement;
      if (observer) { observer.disconnect(); observer = null; }
      if (root && root.classList) root.classList.remove("has-consent-banner");
      if (root && root.style && root.style.removeProperty) root.style.removeProperty("--consent-banner-h");
    }

    // While the banner is open the page reserves its measured height as bottom
    // padding (--consent-banner-h on <html>, see style.css), so the banner never
    // covers content and the footer stays reachable by scrolling.
    function reserveSpace() {
      var root = doc.documentElement;
      if (!root || !root.classList || !banner) return;
      root.classList.add("has-consent-banner");
      var h = banner.getBoundingClientRect ? banner.getBoundingClientRect().height : 0;
      if (root.style && h) root.style.setProperty("--consent-banner-h", Math.ceil(h) + "px");
    }

    // After a choice focus goes to the footer "Analytics choices" control (or the
    // button that reopened the banner), never back to <body>.
    function returnFocus() {
      var target = opener || doc.querySelector("[data-analytics-choices]");
      if (target) target.focus({ preventScroll: true });
    }

    // Focus not obscured (WCAG 2.4.11): while the banner is open, a control that
    // takes focus under it is scrolled clear of it. Scroll-padding alone cannot do this.
    // Only keyboard-initiated focus is moved: scrolling between pointer-down and
    // click would swallow the click, so focus that follows a pointer or touch
    // press is left alone. The flag has no timer (a long press must not expire it) and
    // clears on the next key press, which starts every keyboard-driven focus.
    var pointerActive = false;
    function pointerDown() {
      pointerActive = true;
    }
    function keyDown() { pointerActive = false; }

    function keepFocusClear(e) {
      var t = e.target;
      if (pointerActive) return;
      if (!banner || !t || !t.getBoundingClientRect || (banner.contains && banner.contains(t))) return;
      var top = banner.getBoundingClientRect().top;
      var r = t.getBoundingClientRect();
      if (r.bottom <= top - 8) return;
      var mid = r.top + r.height / 2;
      win.scrollBy({ top: mid - top / 2, behavior: "instant" });
    }

    function button(label, value) {
      var b = doc.createElement("button");
      b.type = "button";
      b.className = "consent-btn";
      b.textContent = label;
      b.addEventListener("click", function () { decide(value); });
      return b;
    }

    function showBanner(focus) {
      if (banner) {
        if (focus) banner.focus({ preventScroll: true });
        return;
      }
      banner = doc.createElement("section");
      banner.className = "consent-banner";
      banner.id = "analytics-consent";
      banner.setAttribute("role", "region");
      banner.setAttribute("aria-label", "Analytics choice");
      banner.tabIndex = -1;
      var p = doc.createElement("p");
      p.appendChild(doc.createTextNode(TEXT + " "));
      var a = doc.createElement("a");
      a.href = PRIVACY_URL;
      a.textContent = "Privacy notice";
      p.appendChild(a);
      var row = doc.createElement("div");
      row.className = "consent-actions";
      row.appendChild(button("Accept analytics", "granted"));
      row.appendChild(button("Reject", "denied"));
      banner.appendChild(p);
      banner.appendChild(row);
      // Before the page header or main content (after any build notice), so keyboard
      // users reach it in a few Tab presses; it is fixed to the bottom by CSS.
      var ref = doc.body.querySelector ? doc.body.querySelector(":scope > header, :scope > main") : null;
      doc.body.insertBefore(banner, ref && ref.parentNode === doc.body ? ref : doc.body.firstChild);
      reserveSpace();
      if (win.ResizeObserver) { observer = new win.ResizeObserver(reserveSpace); observer.observe(banner); }
      if (doc.addEventListener) {
        doc.addEventListener("focusin", keepFocusClear);
        doc.addEventListener("pointerdown", pointerDown, true);
        doc.addEventListener("touchstart", pointerDown, true);
        doc.addEventListener("keydown", keyDown, true);
      }
      if (focus) banner.focus({ preventScroll: true });
    }

    function decide(value) {
      store(value);
      hideBanner();
      if (value === "granted") apply("granted");
      else withdraw();
      returnFocus();
    }

    function wireOpeners() {
      var els = doc.querySelectorAll("[data-analytics-choices]");
      for (var i = 0; i < els.length; i++) {
        els[i].hidden = false;
        els[i].addEventListener("click", function () {
          opener = this;
          showBanner(true);
        });
      }
    }

    function start() {
      var c = choice();
      apply(c);
      if (c === null) showBanner(false);
      wireOpeners();
      if (win.addEventListener) win.addEventListener("resize", reserveSpace);
      win.addEventListener("storage", function (e) {
        if (e.key !== KEY && e.key !== null) return;
        var v = readStored();
        if (v === "granted") { hideBanner(); apply("granted"); }
        else if (v === "denied") { hideBanner(); withdraw(); }
        else { withdraw(); showBanner(false); } // choice cleared elsewhere
      });
    }

    return { start: start, decide: decide, choice: choice, GA_ID: GA_ID, KEY: KEY };
  }

  var api = { create: create, GA_ID: GA_ID, KEY: KEY };
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else if (root && root.document) {
    var run = function () { create(root).start(); };
    if (root.document.readyState === "loading") {
      root.document.addEventListener("DOMContentLoaded", run);
    } else {
      run();
    }
  }
})(typeof window !== "undefined" ? window : null);
