/* JOOD bilingual layer — EN ⇄ AR.
   Loads a dictionary (window.JOOD_AR) and swaps text in place, so the same
   markup serves both languages. Works on JS-rendered content too. */
(function () {
  var KEY = "jood_lang";
  var D = window.JOOD_AR || { text: {}, attr: {}, html: {}, title: "" };
  var lang = (function () {
    var p = new URLSearchParams(location.search).get("lang");
    if (p === "ar" || p === "en") return p;
    try { return localStorage.getItem(KEY) || "ar"; } catch (e) { return "ar"; }
  })();

  var textOrig = new WeakMap(), htmlOrig = new WeakMap(), attrOrig = new WeakMap();
  var touchedText = [], touchedHtml = [], touchedAttr = [];
  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1 };
  var ATTRS = ["placeholder", "title", "aria-label"];
  var busy = false;

  function norm(s) { return s.replace(/\s+/g, " ").trim(); }

  function rules(s) {
    var out = s;
    if (/\bEGP\b/.test(out)) out = out.replace(/\bEGP\b/g, "ج.م");
    if (/\bm²/.test(out)) out = out.replace(/\bm²/g, "م²");
    return out === s ? null : out;
  }

  function eachText(root, fn) {
    var list = [];
    if (root.nodeType === 3) list.push(root);
    else {
      var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          if (n.parentNode && SKIP[n.parentNode.nodeName]) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      var n; while ((n = w.nextNode())) list.push(n);
    }
    list.forEach(fn);
  }

  function arText(node) {
    if (node.parentNode && node.parentNode.closest && node.parentNode.closest("[data-i18n-skip]")) return;
    if (!textOrig.has(node)) { textOrig.set(node, node.nodeValue); touchedText.push(node); }
    var src = textOrig.get(node);
    var key = norm(src);
    var out = D.text[key];
    if (out === undefined) out = rules(key);
    if (out == null) return;
    var lead = /^\s/.test(src) ? " " : "", tail = /\s$/.test(src) ? " " : "";
    node.nodeValue = lead + out + tail;
  }

  function arAttrs(root) {
    var els = root.querySelectorAll ? root.querySelectorAll("*") : [];
    [].forEach.call(els, function (el) {
      ATTRS.forEach(function (a) {
        if (!el.hasAttribute(a)) return;
        var store = attrOrig.get(el) || {};
        if (!(a in store)) { store[a] = el.getAttribute(a); attrOrig.set(el, store); touchedAttr.push(el); }
        var t = D.attr[norm(store[a])] || D.text[norm(store[a])];
        if (t) el.setAttribute(a, t);
      });
    });
  }

  function arHtml() {
    Object.keys(D.html || {}).forEach(function (sel) {
      var el = document.querySelector(sel);
      if (!el) return;
      if (!htmlOrig.has(el)) { htmlOrig.set(el, el.innerHTML); touchedHtml.push(el); }
      el.innerHTML = D.html[sel];
    });
  }

  function toArabic(root) {
    eachText(root, arText);
    arAttrs(root);
  }

  function restore() {
    touchedText.forEach(function (n) { if (textOrig.has(n)) n.nodeValue = textOrig.get(n); });
    touchedHtml.forEach(function (el) { if (htmlOrig.has(el)) el.innerHTML = htmlOrig.get(el); });
    touchedAttr.forEach(function (el) {
      var store = attrOrig.get(el) || {};
      Object.keys(store).forEach(function (a) { el.setAttribute(a, store[a]); });
    });
  }

  var enTitle = document.title;

  function apply() {
    busy = true;
    var h = document.documentElement;
    h.lang = lang; h.dir = lang === "ar" ? "rtl" : "ltr"; h.dataset.lang = lang;
    if (lang === "ar") {
      arHtml();
      toArabic(document.body);
      if (D.title) document.title = D.title;
    } else {
      restore();
      document.title = enTitle;
    }
    updateBtns();
    busy = false;
    window.dispatchEvent(new CustomEvent("joodlang", { detail: { lang: lang } }));
  }

  /* ---- toggle button ---- */
  function updateBtns() {
    [].forEach.call(document.querySelectorAll(".jood-lang-btn"), function (b) {
      b.textContent = lang === "ar" ? "EN" : "عربي";
      b.setAttribute("aria-label", lang === "ar" ? "Switch to English" : "التبديل إلى العربية");
    });
  }
  function mountBtn() {
    var slots = document.querySelectorAll("[data-lang-slot]");
    var targets = slots.length ? slots : [document.body];
    [].forEach.call(targets, function (slot) {
      var b = document.createElement("button");
      b.className = "jood-lang-btn" + (slots.length ? "" : " jood-lang-btn-float");
      b.type = "button";
      b.onclick = function () {
        lang = lang === "ar" ? "en" : "ar";
        try { localStorage.setItem(KEY, lang); } catch (e) {}
        apply();
      };
      slot.appendChild(b);
    });
    updateBtns();
  }

  /* ---- Arabic fonts + RTL patches ---- */
  function injectAssets() {
    var l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600&family=Amiri:ital,wght@0,400;0,700;1,400&display=swap";
    document.head.appendChild(l);
    var s = document.createElement("style");
    s.textContent = [
      "html[data-lang=ar]{--sans:'IBM Plex Sans Arabic',system-ui,sans-serif;--mono:'IBM Plex Sans Arabic',ui-monospace,monospace;--serif:'Amiri',Georgia,serif}",
      "html[data-lang=ar] body,html[data-lang=ar] body *{letter-spacing:0!important}",
      "html[data-lang=ar] .hero-title{line-height:1.5;letter-spacing:0}",
      "html[data-lang=ar] .s-head .title,html[data-lang=ar] .balcony-quote{line-height:1.45;letter-spacing:0}",
      "html[data-lang=ar] .dc-name,html[data-lang=ar] .info-name{line-height:1.35}",
      "html[data-lang=ar] .i-val,html[data-lang=ar] .est-value,html[data-lang=ar] .modal-item-price,html[data-lang=ar] .modal-total-val{white-space:nowrap;direction:ltr;text-align:end}",
      ".jood-lang-btn{display:inline-flex;align-items:center;justify-content:center;min-width:52px;padding:7px 14px;border-radius:40px;border:1.5px solid currentColor;background:none;font-family:inherit;font-size:.78rem;font-weight:600;color:inherit;opacity:.75;cursor:pointer;transition:opacity .2s,border-color .2s;flex-shrink:0}",
      ".jood-lang-btn:hover{opacity:1}",
      ".jood-lang-btn-float{position:fixed;bottom:18px;inset-inline-start:18px;z-index:900;background:#351E1C;color:#F5F4ED;border-color:transparent;opacity:.9}",
      /* generic RTL flips */
      "[dir=rtl] .btn svg,[dir=rtl] .approve-btn svg,[dir=rtl] .qa-btn svg,[dir=rtl] .backarrow,[dir=rtl] .nav-right svg,[dir=rtl] .sb-signout svg{transform:scaleX(-1)}",
      "[dir=rtl] .ticker-track{animation-direction:reverse}",
      "[dir=rtl] .spec-cell{border-right:none;border-left:1px solid var(--border)}",
      "[dir=rtl] .spec-cell:last-child{border-left:none}",
      "[dir=rtl] .spec-v .unit{margin-left:0;margin-right:2px}",
      "[dir=rtl] .room-tab{border-right:none;border-left:1px solid var(--border)}",
      "[dir=rtl] .room-tab:last-child{border-left:none}",
      "[dir=rtl] .pal-item{border-right:none;border-left:1px solid var(--border)}",
      "[dir=rtl] .hero-meta>.h-meta:last-child{text-align:left!important}",
      "[dir=rtl] .footer-right{text-align:left}",
      "[dir=rtl] .footer-actions{justify-content:flex-start}",
      "[dir=rtl] .ex-disc-cue{margin-left:0;margin-right:auto}",
      "[dir=rtl] .i-hint{margin-left:0;margin-right:7px}",
      "[dir=rtl] .ph-before{border-right:none;border-left:1.5px dashed var(--border)}",
      "[dir=rtl] .ps:first-child{border-radius:0 var(--r) var(--r) 0}",
      "[dir=rtl] .ps:last-child{border-radius:var(--r) 0 0 var(--r)}",
      "[dir=rtl] .d-card::before{left:0;right:0}",
      /* portal */
      "[dir=rtl] .sb-item{text-align:right}",
      "[dir=rtl] #msgDot{margin-left:0!important;margin-right:auto!important}",
      "[dir=rtl] .sb-account-unit{max-width:130px}",
      "@media(max-width:900px){[dir=rtl] .sidebar{left:auto;right:0;transform:translateX(100%)}[dir=rtl] .sidebar.open{transform:translateX(0)}}",
      "html[data-lang=ar] .tb-sub,html[data-lang=ar] .eyebrow,html[data-lang=ar] .spec-k,html[data-lang=ar] .ex-spec{text-transform:none}",
    ].join("");
    document.head.appendChild(s);
  }

  function boot() {
    injectAssets();
    mountBtn();
    apply();
    new MutationObserver(function (muts) {
      if (busy || lang !== "ar") return;
      busy = true;
      muts.forEach(function (m) {
        [].forEach.call(m.addedNodes, function (n) {
          if (n.nodeType === 1 || n.nodeType === 3) toArabic(n);
        });
      });
      busy = false;
    }).observe(document.body, { childList: true, subtree: true });
  }

  window.JOOD_I18N = { get lang() { return lang; }, apply: apply, translate: toArabic };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
