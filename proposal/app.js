/* ==========================================================
   JOOD Proposal — interactive layer
   ========================================================== */
(function () {
  // ─────────────── DATA ───────────────
  var UNITS = [
    { name: "Mivida", area: "New Cairo", region: "cairo", type: "2-3BR", units: 6, rate: "$160–250", rateNum: 200, lat: 30.0123, lng: 31.5397 },
    { name: "Cairo Festival City", area: "New Cairo", region: "cairo", type: "2-3BR", units: 4, rate: "$160–250", rateNum: 200, lat: 30.0272, lng: 31.4957 },
    { name: "Katameya Dunes", area: "New Cairo", region: "cairo", type: "Premium 2-3BR", units: 3, rate: "$300–500", rateNum: 400, lat: 29.971, lng: 31.426 },
    { name: "Stone Residence", area: "New Cairo", region: "cairo", type: "2-3BR", units: 1, rate: "$100–120", rateNum: 110, lat: 30.005, lng: 31.456 },
    { name: "Hilton Residences", area: "Maadi", region: "cairo", type: "2-3BR", units: 4, rate: "$180–700", rateNum: 350, lat: 29.959, lng: 31.249 },
    { name: "Villette by SODIC", area: "New Cairo", region: "cairo", type: "Luxury 3BR", units: 1, rate: "≈ $5,000", rateNum: 5000, lat: 30.058, lng: 31.528 },
    { name: "Lake View", area: "New Cairo", region: "cairo", type: "2-3BR", units: 2, rate: "$150–250", rateNum: 200, lat: 29.992, lng: 31.443 },
    { name: "Hostels @ Downtown", area: "Downtown Cairo", region: "cairo", type: "Hostel", units: 0, rate: "Coming Soon", rateNum: 0, soon: true, lat: 30.0444, lng: 31.2357 },
    { name: "Marouf Tower", area: "Downtown Cairo", region: "cairo", type: "2-3BR", units: 4, rate: "$80–120", rateNum: 100, lat: 30.05, lng: 31.238 },
    { name: "Garden City", area: "Cairo", region: "cairo", type: "Mixed", units: 20, rate: "$11–300", rateNum: 150, lat: 30.0383, lng: 31.2308 },
    { name: "Almaza Bay", area: "North Coast", region: "coast", type: "Seasonal Chalet", units: 1, rate: "Peak Season", rateNum: 250, lat: 31.075, lng: 27.98 },
    { name: "Silversands", area: "North Coast", region: "coast", type: "Coming Soon", units: 0, rate: "Coming Soon", rateNum: 0, soon: true, lat: 30.97, lng: 28.22 },
    { name: "Seashel", area: "North Coast", region: "coast", type: "Seasonal Chalet", units: 1, rate: "Peak Season", rateNum: 250, lat: 30.91, lng: 28.52 },
    { name: "Marassi", area: "North Coast", region: "coast", type: "Seasonal Villa", units: 1, rate: "Peak Season", rateNum: 350, lat: 30.87, lng: 28.65 },
    { name: "Hacienda Bay", area: "North Coast", region: "coast", type: "Seasonal Chalet", units: 1, rate: "Peak Season", rateNum: 280, lat: 30.835, lng: 28.84 }
  ];

  // ─────────────── HERO REVEAL ───────────────
  function onReady(fn){ if (document.readyState !== "loading") fn(); else document.addEventListener("DOMContentLoaded", fn); }

  onReady(function () {
    // Hero kinetic title — set .in class after a beat
    setTimeout(function () {
      var t = document.querySelector("h1.hero-title");
      if (t) t.classList.add("in");
    }, 200);

    // ─────── nav: theme switching based on section
    var nav = document.querySelector("nav.top");
    var darkSections = ["#models", "#contact"];
    var navLinks = document.querySelectorAll(".nav-links a");
    window.addEventListener("scroll", function () {
      var y = window.scrollY + 100;
      var dark = false;
      darkSections.forEach(function (s) {
        var el = document.querySelector(s);
        if (!el) return;
        var top = el.offsetTop;
        var bot = top + el.offsetHeight;
        if (y >= top && y < bot) dark = true;
      });
      nav.classList.toggle("is-dark", dark);

      // active link
      var cur = "";
      document.querySelectorAll("section[id]").forEach(function (s) {
        if (window.scrollY >= s.offsetTop - 200) cur = s.id;
      });
      navLinks.forEach(function (a) {
        a.classList.toggle("active", a.getAttribute("href") === "#" + cur);
      });
    }, { passive: true });

    // ─────── reveals
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });

    // ─────── stat counters
    var countio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        var target = parseFloat(el.dataset.count);
        var dec = parseInt(el.dataset.dec || "0", 10);
        var prefix = el.dataset.prefix || "";
        var suffix = el.dataset.suffix || "";
        var comma = el.dataset.comma === "1";
        var dur = parseInt(el.dataset.dur || "1400", 10);
        var start = performance.now();
        function fmt(v) {
          var s = v.toFixed(dec);
          if (comma) {
            var parts = s.split('.');
            parts[0] = parseInt(parts[0], 10).toLocaleString('en-US');
            s = parts.join('.');
          }
          return s;
        }
        function step(now) {
          var p = Math.min(1, (now - start) / dur);
          var eased = 1 - Math.pow(1 - p, 3);
          var v = target * eased;
          el.innerHTML = prefix + fmt(v) + (suffix ? '<span class="unit">' + suffix + "</span>" : "");
          if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
        countio.unobserve(el);
      });
    }, { threshold: 0.4 });
    document.querySelectorAll("[data-count]").forEach(function (el) { countio.observe(el); });
  });

  // ─────────────── LEAFLET MAP ───────────────
  onReady(function () {
    if (typeof L === "undefined") return;
    var map = L.map("joodMap", {
      zoomControl: true, attributionControl: true, scrollWheelZoom: false
    }).setView([30.4, 30.4], 7);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OSM &copy; CARTO",
      maxZoom: 19
    }).addTo(map);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png", {
      pane: "shadowPane", maxZoom: 19
    }).addTo(map);

    var markers = {};
    UNITS.forEach(function (u, i) {
      var pinHtml = '<div class="jood-pin ' + (u.region === "coast" ? "coast" : "") + '"><div class="pulse"></div><div class="dot"></div></div>';
      var icon = L.divIcon({ className: "", html: pinHtml, iconSize: [28, 28], iconAnchor: [14, 14] });
      var m = L.marker([u.lat, u.lng], { icon: icon }).addTo(map);
      m.bindPopup(
        '<div class="popup-name">' + u.name + "</div>" +
        '<div class="popup-meta">' + u.area + (u.units ? " · " + u.units + " unit" + (u.units > 1 ? "s" : "") : "") + "</div>" +
        '<div class="popup-rate">' + u.rate + "</div>"
      );
      m.on("click", function () {
        document.querySelectorAll(".unit-row").forEach(function (r) { r.classList.remove("is-active"); });
        var row = document.querySelector('.unit-row[data-i="' + i + '"]');
        if (row) { row.classList.add("is-active"); row.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
      });
      markers[i] = m;
    });

    // build list
    function rowHtml(u, i) {
      return '<div class="unit-row' + (u.region === "coast" ? " coast" : "") + (u.soon ? " soon" : "") + '" data-i="' + i + '" data-region="' + u.region + '" data-rate="' + u.rateNum + '">' +
        '<div><div class="u-name">' + u.name + "</div><div class=\"u-meta\">" + u.area + " · " + u.type + (u.units ? " · " + u.units + " unit" + (u.units > 1 ? "s" : "") : "") + "</div></div>" +
        '<div class="u-rate">' + u.rate + (u.soon ? "" : "<small>/night</small>") + "</div>" +
        "</div>";
    }
    var listEl = document.getElementById("unitList");
    listEl.innerHTML = UNITS.map(rowHtml).join("");

    listEl.querySelectorAll(".unit-row").forEach(function (row) {
      row.addEventListener("click", function () {
        var i = parseInt(row.dataset.i, 10);
        var m = markers[i];
        if (!m) return;
        document.querySelectorAll(".unit-row").forEach(function (r) { r.classList.remove("is-active"); });
        row.classList.add("is-active");
        map.flyTo(m.getLatLng(), 11, { duration: 0.8 });
        setTimeout(function () { m.openPopup(); }, 500);
      });
    });

    // filter
    function applyFilter() {
      var region = document.querySelector(".chip[data-fk='region'].active").dataset.fv;
      var rate = document.querySelector(".chip[data-fk='rate'].active").dataset.fv;
      var visibleCount = 0;
      UNITS.forEach(function (u, i) {
        var rowEl = listEl.querySelector('.unit-row[data-i="' + i + '"]');
        var marker = markers[i];
        var pass = true;
        if (region !== "all" && u.region !== region) pass = false;
        if (rate === "lt200" && (u.rateNum >= 200 || u.rateNum === 0)) pass = false;
        if (rate === "200to500" && (u.rateNum < 200 || u.rateNum > 500)) pass = false;
        if (rate === "500plus" && u.rateNum <= 500) pass = false;
        rowEl.style.display = pass ? "" : "none";
        if (pass) { marker.addTo(map); visibleCount++; }
        else { map.removeLayer(marker); }
      });
      var c = document.getElementById("filterCount");
      if (c) c.textContent = visibleCount;
    }
    document.querySelectorAll(".chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        var k = chip.dataset.fk;
        document.querySelectorAll('.chip[data-fk="' + k + '"]').forEach(function (c) { c.classList.remove("active"); });
        chip.classList.add("active");
        applyFilter();
      });
    });
    applyFilter();
  });

  // ─────────────── 3D unit card tilt ───────────────
  onReady(function () {
    document.querySelectorAll(".unit-card").forEach(function (card) {
      card.addEventListener("mousemove", function (e) {
        var r = card.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5;
        var y = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = "rotateX(" + (-y * 6) + "deg) rotateY(" + (x * 8) + "deg) translateY(-4px)";
      });
      card.addEventListener("mouseleave", function () {
        card.style.transform = "";
      });
    });
  });

  // ─────────────── BEFORE/AFTER SLIDER ───────────────
  onReady(function () {
    var shell = document.querySelector(".ba-shell");
    if (!shell) return;
    var after = shell.querySelector(".ba-img.after");
    var handle = shell.querySelector(".ba-handle");
    var knob = shell.querySelector(".ba-knob");
    var dragging = false;
    function setPct(pct) {
      pct = Math.max(0, Math.min(100, pct));
      after.style.clipPath = "inset(0 " + (100 - pct) + "% 0 0)";
      handle.style.left = pct + "%";
      knob.style.left = pct + "%";
    }
    function onMove(clientX) {
      var r = shell.getBoundingClientRect();
      setPct(((clientX - r.left) / r.width) * 100);
    }
    shell.addEventListener("mousedown", function (e) { dragging = true; onMove(e.clientX); });
    window.addEventListener("mousemove", function (e) { if (dragging) onMove(e.clientX); });
    window.addEventListener("mouseup", function () { dragging = false; });
    shell.addEventListener("touchstart", function (e) { dragging = true; onMove(e.touches[0].clientX); }, { passive: true });
    shell.addEventListener("touchmove", function (e) { if (dragging) onMove(e.touches[0].clientX); }, { passive: true });
    shell.addEventListener("touchend", function () { dragging = false; });

    // auto-demo: pulse the handle a few seconds in
    var hovered = false;
    shell.addEventListener("mouseenter", function () { hovered = true; });
    var t = 0;
    function demo() {
      if (hovered) return;
      t += 0.012;
      var pct = 50 + Math.sin(t) * 18;
      setPct(pct);
      requestAnimationFrame(demo);
    }
    setTimeout(demo, 1200);
  });

  // ─────────────── PARTNERSHIP TABS ───────────────
  onReady(function () {
    var tabs = document.querySelectorAll(".model-tab");
    var panels = document.querySelectorAll(".model-panel");
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        var key = tab.dataset.k;
        tabs.forEach(function (t) { t.classList.toggle("active", t === tab); });
        panels.forEach(function (p) { p.style.display = p.dataset.k === key ? "" : "none"; });
      });
    });
  });

  // ─────────────── PROCESS TIMELINE ───────────────
  onReady(function () {
    var shell = document.querySelector(".timeline-shell");
    if (!shell) return;
    var progressEl = shell.querySelector(".progress");
    var rows = shell.querySelectorAll(".tl-row");
    function update() {
      var r = shell.getBoundingClientRect();
      var vh = window.innerHeight;
      var trigger = vh * 0.55;
      var totalH = r.height;
      var passed = Math.max(0, Math.min(totalH, trigger - r.top));
      progressEl.style.height = passed + "px";
      rows.forEach(function (row) {
        var dotR = row.querySelector(".tl-dot").getBoundingClientRect();
        var reached = (dotR.top + dotR.height / 2) < trigger;
        row.classList.toggle("is-reached", reached);
      });
    }
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
  });

  // ─────────────── BOOKING DEMO ───────────────
  onReady(function () {
    var checkin = new Date(); checkin.setDate(checkin.getDate() + 14);
    var checkout = new Date(checkin); checkout.setDate(checkout.getDate() + 4);
    var guests = 2;
    var nightlyBase = 220;

    var checkinEl = document.getElementById("checkinDate");
    var checkoutEl = document.getElementById("checkoutDate");
    var guestEl = document.getElementById("guestCount");
    var minus = document.getElementById("gMinus");
    var plus = document.getElementById("gPlus");
    var feeNights = document.getElementById("feeNights");
    var feeSubtotal = document.getElementById("feeSubtotal");
    var feeCleaning = document.getElementById("feeCleaning");
    var feeService = document.getElementById("feeService");
    var feeTotal = document.getElementById("feeTotal");
    var bookBtn = document.getElementById("bookBtn");
    var rateLine = document.getElementById("rateLine");
    var ledger = document.getElementById("landlordLedger");
    var ledNet = document.getElementById("ledNet");
    var ledFee = document.getElementById("ledFee");
    var ledGross = document.getElementById("ledGross");

    function fmtDate(d) {
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    }
    function nightsBetween(a, b) {
      return Math.max(1, Math.round((b - a) / (1000 * 60 * 60 * 24)));
    }
    function recalc() {
      var n = nightsBetween(checkin, checkout);
      var subtotal = n * nightlyBase;
      var cleaning = 65;
      var service = Math.round(subtotal * 0.14);
      var total = subtotal + cleaning + service;
      checkinEl.textContent = fmtDate(checkin);
      checkoutEl.textContent = fmtDate(checkout);
      guestEl.textContent = guests;
      rateLine.innerHTML = "$" + nightlyBase + '<span class="per">/ night</span>';
      feeNights.textContent = "$" + nightlyBase + " × " + n + " nights";
      feeSubtotal.textContent = "$" + subtotal.toLocaleString();
      feeCleaning.textContent = "$" + cleaning;
      feeService.textContent = "$" + service.toLocaleString();
      feeTotal.querySelector(".num").textContent = "$" + total.toLocaleString();

      // landlord ledger
      var gross = subtotal + cleaning;
      var fee = Math.round(gross * 0.25);
      var net = gross - fee;
      ledGross.textContent = "$" + gross.toLocaleString();
      ledFee.textContent = "− $" + fee.toLocaleString();
      ledNet.textContent = "$" + net.toLocaleString();
    }
    minus.addEventListener("click", function () { guests = Math.max(1, guests - 1); recalc(); });
    plus.addEventListener("click", function () { guests = Math.min(8, guests + 1); recalc(); });
    bookBtn.addEventListener("click", function () {
      if (bookBtn.classList.contains("confirmed")) return;
      bookBtn.classList.add("confirmed");
      bookBtn.innerHTML = "✓ Booking confirmed";
      ledger.classList.add("show");
      setTimeout(function () {
        bookBtn.classList.remove("confirmed");
        bookBtn.innerHTML = "Reserve";
        ledger.classList.remove("show");
      }, 6000);
    });
    recalc();
  });

  // ─────────────── FAQ ───────────────
  onReady(function () {
    document.querySelectorAll(".faq-q").forEach(function (q) {
      q.addEventListener("click", function () {
        var item = q.closest(".faq-item");
        var isOpen = item.classList.contains("open");
        document.querySelectorAll(".faq-item").forEach(function (i) {
          i.classList.remove("open");
          i.querySelector(".faq-a").style.maxHeight = "0";
        });
        if (!isOpen) {
          item.classList.add("open");
          var ans = item.querySelector(".faq-a");
          ans.style.maxHeight = ans.scrollHeight + "px";
        }
      });
    });
  });
})();
