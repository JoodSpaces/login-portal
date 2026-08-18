/* Main app: state, snap animation, tweaks, render. */
const { useState, useRef, useEffect, useCallback } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/ {
  mode: "dark",
  accent: ["#FF6037", "rgba(255,96,55,0.16)"],
  display: "Instrument Serif",
  ratio: "4 / 3",
  snapSpeed: 1,
} /*EDITMODE-END*/;

// Brand palette accents (Toxic Orange / Aqua Mist / Garnet)
const ACCENTS = {
  "Toxic Orange": ["#FF6037", "rgba(255,96,55,0.16)"],
  "Aqua Mist": ["#A0C9CB", "rgba(160,201,203,0.18)"],
  Garnet: ["#9A4B49", "rgba(154,75,73,0.18)"],
};

function App() {
  const stages = window.ROOM_STAGES;
  const N = stages.length;
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [lang, setLang] = useState(window.ROOM_LANG || "ar");
  const ui = window.ROOM_UI[lang];
  const rtl = lang === "ar";

  useEffect(() => {
    const el = document.documentElement;
    el.lang = lang;
    el.dir = ui.dir;
    el.dataset.lang = lang;
    document.title = ui.docTitle;
    try { localStorage.setItem("jood_lang", lang); } catch (e) {}
  }, [lang]);

  // position along the timeline, 0 .. N-1 (float). Integer = settled on a stage.
  const _lsKey = "room_pos_" + (window.ROOM_ID || 'default');
  const [pos, setPos] = useState(0);
  // while true, layers track the finger 1:1 with no CSS transition (live morph);
  // when false, CSS transitions animate the crossfade between settled stages.
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    localStorage.setItem(_lsKey, String(pos));
  }, [pos]);

  const onScrub = useCallback((v) => {
    setDragging(true);
    setPos(v);
  }, []);
  const onSnap = useCallback(() => {
    setDragging(false);
    setPos((p) => clamp(Math.round(p), 0, N - 1));
  }, [N]);
  const onJump = useCallback(
    (i) => {
      setDragging(false);
      setPos(clamp(i, 0, N - 1));
    },
    [N]
  );

  // autoplay — advances one stage at a time and loops, pausing while the
  // user is actively scrubbing so it never fights a drag.
  const loopsRef = useRef(0);
  const stoppedRef = useRef(false);
  useEffect(() => {
    if (dragging || stoppedRef.current) return;
    const STEP = 0.014;
    let raf;
    const tick = () => {
      setPos((p) => {
        let next = p + STEP;
        if (next > N - 1) {
          // Second pass ends on the last stage (the finished room) and holds.
          if (loopsRef.current >= 1) {
            stoppedRef.current = true;
            return N - 1;
          }
          loopsRef.current += 1;
          next = 0;
        }
        return next;
      });
      if (!stoppedRef.current) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [dragging, N]);

  // keyboard
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        setDragging(false);
        setPos((p) => clamp(Math.round(p) + 1, 0, N - 1));
        e.preventDefault();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        setDragging(false);
        setPos((p) => clamp(Math.round(p) - 1, 0, N - 1));
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [N]);

  const morphMs = Math.round(620 / (t.snapSpeed || 1));

  // apply theme mode to <html> so body bg + tokens switch
  useEffect(() => {
    document.documentElement.dataset.mode = t.mode === "light" ? "light" : "dark";
  }, [t.mode]);

  // apply tweak vars
  const accent = Array.isArray(t.accent) ? t.accent : ACCENTS["Toxic Orange"];
  const rparts = String(t.ratio).split("/").map((x) => parseFloat(x));
  const ratioNum = rparts.length === 2 && rparts[1] ? rparts[0] / rparts[1] : 1.5;
  const rootStyle = {
    "--accent": accent[0],
    "--accent-soft": accent[1],
    "--font-display": rtl ? "'Amiri', 'Instrument Serif', Georgia, serif" : `'${t.display}', Georgia, serif`,
    "--frame-ratio": t.ratio,
    "--frame-max-w": `calc(50vh * ${ratioNum})`,
  };

  return (
    <div className="app" style={rootStyle}>
      <header className="topbar">
        <div className="topbar-left">
          <a href="portal/dashboard.html" style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 40, border: "1.5px solid var(--line-strong)", color: "var(--muted)", fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", textDecoration: "none", flexShrink: 0 }}>
            <svg className="backarrow" width="12" height="10" viewBox="0 0 14 9" fill="none"><path d="M13 4.5H1M6 1 1 4.5 6 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            {ui.portal}
          </a>
          <button className="langbtn" onClick={() => setLang(rtl ? "en" : "ar")} aria-label={ui.langBtnAria} title={ui.langBtnAria}>
            {ui.langBtn}
          </button>
        </div>
        <div className="brand">
          <img src="images/jood-logo-dark.png" alt="JOOD" style={{ height: "clamp(30px, 4.5vw, 42px)", width: "auto", display: "block", filter: t.mode === "light" ? "none" : "brightness(0) invert(1)" }} />
        </div>
        <div className="project">
          <span className="project-name">{ui.projectName} <em>{ui.projectEm}</em></span>
          <span className="project-meta">{ui.projectMeta}</span>
        </div>
      </header>

      <main className="stagewrap">
        <div className="viewer">
          <StageFrame stages={stages} pos={pos} dragging={dragging} morphMs={80} lang={lang} ui={ui} />
          <div className="scrub-hint">
            <span className="hint-arrows">‹ ›</span> {ui.scrubHint}
          </div>
          <Scrubber stages={stages} pos={pos} onScrub={onScrub} onSnap={onSnap} onJump={onJump} lang={lang} />
        </div>
        <InfoPanel stages={stages} pos={pos} onJump={onJump} lang={lang} ui={ui} />
      </main>

      <TweaksPanel>
        <TweakSection label="Theme" />
        <TweakRadio
          label="Mode"
          value={t.mode}
          options={["dark", "light"]}
          onChange={(v) => setTweak("mode", v)}
        />
        <TweakColor
          label="Accent"
          value={t.accent}
          options={[ACCENTS["Toxic Orange"], ACCENTS["Aqua Mist"], ACCENTS.Garnet]}
          onChange={(v) => setTweak("accent", v)}
        />
        <TweakSelect
          label="Display font"
          value={t.display}
          options={["Instrument Serif", "Playfair Display", "Spectral"]}
          onChange={(v) => setTweak("display", v)}
        />
        <TweakSection label="Frame" />
        <TweakRadio
          label="Photo ratio"
          value={t.ratio}
          options={["3 / 2", "4 / 3", "16 / 9"]}
          onChange={(v) => setTweak("ratio", v)}
        />
        <TweakSlider
          label="Morph speed"
          value={t.snapSpeed}
          min={0.5}
          max={2}
          step={0.1}
          unit="×"
          onChange={(v) => setTweak("snapSpeed", v)}
        />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
