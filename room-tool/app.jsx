/* Main app: state, snap animation, tweaks, render. */
const { useState, useRef, useEffect, useCallback } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/ {
  mode: "light",
  accent: ["#FF6037", "rgba(255,96,55,0.16)"],
  display: "Instrument Serif",
  ratio: "3 / 2",
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

  // position along the timeline, 0 .. N-1 (float). Integer = settled on a stage.
  const _lsKey = "room_pos_" + (window.ROOM_ID || 'default');
  const [pos, setPos] = useState(() => {
    const saved = parseFloat(localStorage.getItem(_lsKey));
    return isNaN(saved) ? 0 : clamp(Math.round(saved), 0, N - 1);
  });
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
    "--font-display": `'${t.display}', Georgia, serif`,
    "--frame-ratio": t.ratio,
    "--frame-max-w": `calc(50vh * ${ratioNum})`,
  };

  return (
    <div className="app" style={rootStyle}>
      <header className="topbar">
        <a href="portal/dashboard.html" style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 40, border: "1.5px solid var(--line-strong)", color: "var(--muted)", fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", textDecoration: "none", flexShrink: 0, marginRight: 6 }}>
          <svg width="12" height="10" viewBox="0 0 14 9" fill="none"><path d="M13 4.5H1M6 1 1 4.5 6 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Owner Portal
        </a>
        <div className="brand">
          <img src="images/jood-logo-dark.png" alt="JOOD" style={{ height: "clamp(30px, 4.5vw, 42px)", width: "auto", display: "block", filter: t.mode === "light" ? "none" : "brightness(0) invert(1)" }} />
        </div>
        <div className="project">
          <span className="project-name">Villa <em>El Rehab</em></span>
          <span className="project-meta">New Cairo · Model 01 — Operate</span>
        </div>
      </header>

      <main className="stagewrap">
        <div className="viewer">
          <StageFrame stages={stages} pos={pos} dragging={dragging} morphMs={morphMs} />
          <div className="scrub-hint">
            <span className="hint-arrows">‹ ›</span> Drag to transform — or tap a stage
          </div>
          <Scrubber stages={stages} pos={pos} onScrub={onScrub} onSnap={onSnap} onJump={onJump} />
        </div>
        <InfoPanel stages={stages} pos={pos} onJump={onJump} />
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
