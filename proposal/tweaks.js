/* ==========================================================
   JOOD — Tweaks panel
   Three expressive controls that reshape the editorial feel:
     - Mood     · palette presets (paper + ink + accent together)
     - Rhythm   · vertical scale + display sizes
     - Material · paper texture & decorative rules
   ========================================================== */
(function () {
  'use strict';

  /* ---------- defaults (persisted via __edit_mode_set_keys) ---------- */
  const TWEAKS_DEFAULTS = /*EDITMODE-BEGIN*/{
    "mood": "sandstone",
    "rhythm": "editorial",
    "material": "grain"
  }/*EDITMODE-END*/;

  const state = Object.assign({}, TWEAKS_DEFAULTS);

  /* ---------- inject CSS overrides ---------- */
  const css = `
  /* ===== MOOD : palette presets =================================== */
  body[data-mood="olive"] {
    --paper:    #ECEAE0;
    --paper-2:  #E1DECF;
    --paper-3:  #D0CCB6;
    --ink:      #1A1E1A;
    --ink-2:    #2C322D;
    --ink-3:    #4A5048;
    --ink-mute: #7C8278;
    --ink-soft: #A8AC9F;
    --line:     rgba(26,30,26,0.12);
    --line-2:   rgba(26,30,26,0.06);
    --terra:    #6F8A5C;
    --terra-d:  #4E6B3F;
    --terra-l:  #92A77F;
    --gold:     #B9A35A;
  }
  body[data-mood="noir"] {
    --paper:    #1A1814;
    --paper-2:  #221F1A;
    --paper-3:  #2E2A22;
    --ink:      #F1ECE1;
    --ink-2:    #E0D9C7;
    --ink-3:    #C2B89E;
    --ink-mute: #8E8470;
    --ink-soft: #5A5346;
    --line:     rgba(241,236,225,0.14);
    --line-2:   rgba(241,236,225,0.07);
    --terra:    #E4825A;
    --terra-d:  #C2542B;
    --terra-l:  #F2A584;
    --gold:     #D4A86A;
  }
  body[data-mood="noir"] nav.top { background: rgba(26,24,20,0.85); }
  body[data-mood="noir"] section.ink-bg { background: #0C0B08; }
  body[data-mood="noir"] .btn-ghost { border-color: var(--ink); color: var(--ink); }
  body[data-mood="noir"] .btn-ghost:hover { background: var(--ink); color: var(--paper); }
  body[data-mood="noir"]::before { mix-blend-mode: screen; opacity: 0.18; }
  body[data-mood="noir"] .compare-table,
  body[data-mood="noir"] .unit-card,
  body[data-mood="noir"] .ba-stat-strip,
  body[data-mood="noir"] .booking-shell { background: var(--paper-2); }

  /* ===== RHYTHM : vertical scale + display sizes ================== */
  body[data-rhythm="intimate"]  { --scale: 0.78; --display-scale: 0.86; }
  body[data-rhythm="editorial"] { --scale: 1.00; --display-scale: 1.00; }
  body[data-rhythm="cinema"]    { --scale: 1.32; --display-scale: 1.20; }

  body[data-rhythm] section          { padding: calc(120px * var(--scale, 1)) 0; }
  body[data-rhythm] section.dense    { padding: calc(80px  * var(--scale, 1)) 0; }
  body[data-rhythm] .section-head    { margin-bottom: calc(64px * var(--scale, 1)); }
  body[data-rhythm] .hero-stats      { margin-top: calc(80px * var(--scale, 1)); padding: calc(32px * var(--scale, 1)) 0; }
  body[data-rhythm] h1.hero-title    { font-size: calc(clamp(80px, 12vw, 200px) * var(--display-scale, 1)); }
  body[data-rhythm] .section-head .title { font-size: calc(clamp(48px, 6vw, 88px) * var(--display-scale, 1)); }
  body[data-rhythm] .hero-stat .num  { font-size: calc(clamp(40px, 5vw, 64px) * var(--display-scale, 1)); }
  body[data-rhythm="cinema"] h1.hero-title { letter-spacing: -0.04em; }
  body[data-rhythm="intimate"] h1.hero-title { letter-spacing: -0.02em; }

  /* ===== MATERIAL : paper texture & decorative rules ============== */
  body[data-material="polished"]::before { opacity: 0; }
  body[data-material="polished"] .unit-card,
  body[data-material="polished"] .compare-table,
  body[data-material="polished"] .ba-stat-strip,
  body[data-material="polished"] .booking-shell { background: var(--paper); border-color: var(--line-2); }

  body[data-material="pressed"]::before { opacity: 0.55; }
  body[data-material="pressed"]::after {
    content:""; position:fixed; inset:0; pointer-events:none; z-index:998;
    background-image:
      repeating-linear-gradient(0deg, transparent 0 23px, var(--line-2) 23px 24px),
      repeating-linear-gradient(90deg, transparent 0 23px, var(--line-2) 23px 24px);
    opacity: 0.6;
  }
  body[data-material="pressed"] .section-head .title em::before,
  body[data-material="pressed"] h1.hero-title em::before {
    content:""; position:absolute; left:-2%; right:-2%; bottom:-4px; height:2px;
    background: currentColor; opacity: 0.55;
  }
  body[data-material="pressed"] .section-head .title em,
  body[data-material="pressed"] h1.hero-title em { position: relative; }

  /* ===== Panel chrome ============================================ */
  .tweaks-panel {
    position: fixed; right: 20px; bottom: 20px; z-index: 9999;
    width: 296px; padding: 18px;
    background: #FAF6EC; color: #16140F;
    border: 1px solid rgba(22,20,15,0.18);
    box-shadow: 0 30px 80px -20px rgba(22,20,15,0.35), 0 0 0 1px rgba(0,0,0,0.02);
    font-family: "Geist", system-ui, sans-serif;
    display: none;
    border-radius: 2px;
  }
  .tweaks-panel.is-open { display: block; }
  .tweaks-panel header {
    display: flex; justify-content: space-between; align-items: baseline;
    padding-bottom: 14px; margin-bottom: 14px;
    border-bottom: 1px solid rgba(22,20,15,0.12);
  }
  .tweaks-panel header h4 {
    font-family: "Instrument Serif", serif; font-weight: 400;
    font-size: 22px; line-height: 1; letter-spacing: -0.02em;
  }
  .tweaks-panel header h4 em { color: #C2542B; font-style: italic; }
  .tweaks-panel header .close {
    width: 20px; height: 20px; line-height: 1; cursor: pointer;
    color: #847864; font-size: 18px;
  }
  .tweaks-panel header .close:hover { color: #16140F; }

  .tweak-group { margin-bottom: 16px; }
  .tweak-group:last-child { margin-bottom: 0; }
  .tweak-group > .lbl {
    display: flex; justify-content: space-between;
    font-family: "Geist Mono", ui-monospace, monospace;
    font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase;
    color: #847864; margin-bottom: 8px;
  }
  .tweak-group > .lbl .val { color: #C2542B; }

  .tw-swatches { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .tw-swatch {
    position: relative; aspect-ratio: 1; cursor: pointer;
    border: 1px solid rgba(22,20,15,0.12);
    overflow: hidden;
    transition: transform 0.18s, border-color 0.18s;
  }
  .tw-swatch:hover { transform: translateY(-1px); }
  .tw-swatch.is-on { border-color: #16140F; }
  .tw-swatch .ink-bar { position: absolute; left:0; right:0; bottom:0; height:34%; }
  .tw-swatch .accent { position: absolute; left:50%; bottom:9%; transform: translateX(-50%); width:30%; height:14%; border-radius:1px; }
  .tw-swatch .name {
    position: absolute; top: 6px; left: 7px;
    font-family: "Instrument Serif", serif; font-style: italic;
    font-size: 12px; line-height: 1;
  }
  .tw-swatch.s-sand { background: #ECECDC; }
  .tw-swatch.s-sand .ink-bar { background: #351E1C; }
  .tw-swatch.s-sand .accent { background: #FF6037; }
  .tw-swatch.s-sand .name { color: #351E1C; }
  .tw-swatch.s-olive { background: #ECEAE0; }
  .tw-swatch.s-olive .ink-bar { background: #1A1E1A; }
  .tw-swatch.s-olive .accent { background: #6F8A5C; }
  .tw-swatch.s-olive .name { color: #1A1E1A; }
  .tw-swatch.s-noir { background: #1A1814; }
  .tw-swatch.s-noir .ink-bar { background: #F1ECE1; }
  .tw-swatch.s-noir .accent { background: #E4825A; }
  .tw-swatch.s-noir .name { color: #F1ECE1; }
  .tw-swatch.is-on::after {
    content:""; position: absolute; top: 5px; right: 5px;
    width: 6px; height: 6px; border-radius: 50%; background: #C2542B;
    box-shadow: 0 0 0 2px #FAF6EC;
  }

  .tw-seg {
    display: grid; grid-template-columns: repeat(3, 1fr);
    border: 1px solid rgba(22,20,15,0.16);
    overflow: hidden;
  }
  .tw-seg button {
    padding: 9px 6px; font-size: 11px;
    font-family: "Geist Mono", ui-monospace, monospace;
    letter-spacing: 0.1em; text-transform: uppercase;
    color: #4A4339; background: transparent;
    border-left: 1px solid rgba(22,20,15,0.10);
    transition: background 0.15s, color 0.15s;
  }
  .tw-seg button:first-child { border-left: none; }
  .tw-seg button:hover { background: rgba(22,20,15,0.04); }
  .tw-seg button.is-on { background: #16140F; color: #F1ECE1; }

  .tw-foot {
    margin-top: 16px; padding-top: 12px;
    border-top: 1px solid rgba(22,20,15,0.08);
    font-family: "Geist Mono", ui-monospace, monospace;
    font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase;
    color: #B3A48A; display: flex; justify-content: space-between;
  }
  .tw-foot .reset { color: #847864; cursor: pointer; }
  .tw-foot .reset:hover { color: #C2542B; }
  `;

  const styleTag = document.createElement('style');
  styleTag.id = '__tweaks-css';
  styleTag.textContent = css;
  document.head.appendChild(styleTag);

  /* ---------- apply state to <body> ---------- */
  function apply() {
    document.body.dataset.mood = state.mood;
    document.body.dataset.rhythm = state.rhythm;
    document.body.dataset.material = state.material;
    syncUI();
  }

  function set(key, val) {
    state[key] = val;
    apply();
    try {
      window.parent.postMessage(
        { type: '__edit_mode_set_keys', edits: { [key]: val } },
        '*'
      );
    } catch (e) {}
  }

  /* ---------- panel DOM ---------- */
  const panel = document.createElement('div');
  panel.className = 'tweaks-panel';
  panel.innerHTML = `
    <header>
      <h4>Tweaks <em>·</em></h4>
      <div class="close" title="Close">×</div>
    </header>

    <div class="tweak-group" data-group="mood">
      <div class="lbl"><span>Mood</span><span class="val" data-show="mood">Sandstone</span></div>
      <div class="tw-swatches">
        <div class="tw-swatch s-sand"  data-val="sandstone"><span class="name">Sand</span><div class="ink-bar"></div><div class="accent"></div></div>
        <div class="tw-swatch s-olive" data-val="olive"><span class="name">Olive</span><div class="ink-bar"></div><div class="accent"></div></div>
        <div class="tw-swatch s-noir"  data-val="noir"><span class="name">Noir</span><div class="ink-bar"></div><div class="accent"></div></div>
      </div>
    </div>

    <div class="tweak-group" data-group="rhythm">
      <div class="lbl"><span>Rhythm</span><span class="val" data-show="rhythm">Editorial</span></div>
      <div class="tw-seg">
        <button data-val="intimate">Intimate</button>
        <button data-val="editorial">Editorial</button>
        <button data-val="cinema">Cinema</button>
      </div>
    </div>

    <div class="tweak-group" data-group="material">
      <div class="lbl"><span>Material</span><span class="val" data-show="material">Grain</span></div>
      <div class="tw-seg">
        <button data-val="polished">Polished</button>
        <button data-val="grain">Grain</button>
        <button data-val="pressed">Pressed</button>
      </div>
    </div>

    <div class="tw-foot">
      <span>JD · 2026</span>
      <span class="reset">Reset</span>
    </div>
  `;
  document.body.appendChild(panel);

  /* ---------- wire interactions ---------- */
  const labels = {
    mood: { sandstone: 'Sandstone', olive: 'Olive', noir: 'Noir' },
    rhythm: { intimate: 'Intimate', editorial: 'Editorial', cinema: 'Cinema' },
    material: { polished: 'Polished', grain: 'Grain', pressed: 'Pressed' }
  };

  function syncUI() {
    panel.querySelectorAll('.tweak-group').forEach(g => {
      const key = g.dataset.group;
      const val = state[key];
      g.querySelectorAll('[data-val]').forEach(el => {
        el.classList.toggle('is-on', el.dataset.val === val);
      });
      const show = g.querySelector('[data-show]');
      if (show) show.textContent = labels[key][val] || val;
    });
  }

  panel.querySelectorAll('.tweak-group').forEach(g => {
    const key = g.dataset.group;
    g.querySelectorAll('[data-val]').forEach(el => {
      el.addEventListener('click', () => set(key, el.dataset.val));
    });
  });

  panel.querySelector('.close').addEventListener('click', () => {
    panel.classList.remove('is-open');
    try { window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*'); } catch (e) {}
  });

  panel.querySelector('.reset').addEventListener('click', () => {
    Object.keys(TWEAKS_DEFAULTS).forEach(k => set(k, TWEAKS_DEFAULTS[k]));
  });

  /* ---------- host protocol ---------- */
  window.addEventListener('message', (ev) => {
    const d = ev.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === '__activate_edit_mode') panel.classList.add('is-open');
    if (d.type === '__deactivate_edit_mode') panel.classList.remove('is-open');
  });

  try {
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
  } catch (e) {}

  /* ---------- initial paint ---------- */
  apply();
})();
