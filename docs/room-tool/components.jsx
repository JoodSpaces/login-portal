/* Components for the staged room-transformation viewer.
   Loaded as Babel. Exports to window at the end. */
const { useState, useRef, useEffect, useCallback } = React;

/* ---------- helpers ---------- */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ---------- The fixed-camera frame: stacked photo slots that crossfade ---------- */
function StageFrame({ stages, pos, dragging, morphMs }) {
  const nearest = Math.round(pos);
  const lower = Math.floor(pos);
  const f = pos - lower;
  // Ease the dissolve so it lingers less in the ambiguous middle.
  const eased = f * f * (3 - 2 * f);
  return (
    <div className="frame">
      <div className="frame-layers">
        {stages.map((s, i) => {
          // True cross-dissolve: the outgoing layer stays fully opaque and the
          // incoming one fades in ON TOP of it. Fading both at once leaves each
          // at 50% mid-transition, letting the background show through and
          // washing the image out — that was the muddy "merge".
          const opacity = i < lower ? 1 : i === lower ? 1 : i === lower + 1 ? eased : 0;
          const active = nearest === i;
          return (
            <div
              key={s.key}
              className="layer"
              style={{
                opacity,
                pointerEvents: active && !dragging ? "auto" : "none",
                // Natural stacking — later stages sit above earlier ones, so the
                // incoming layer always dissolves in over the settled one.
                zIndex: i,
                transition: dragging ? "none" : `opacity ${morphMs}ms linear`,
              }}
            >
              <image-slot
                id={`${window.ROOM_ID||'room'}-stage-${s.key}`}
                shape="rect"
                fit="cover"
                src={(window.ROOM_IMAGES && window.ROOM_IMAGES[window.ROOM_ID] && window.ROOM_IMAGES[window.ROOM_ID][s.key]) || ""}
                placeholder={`Drop the "${s.name}" photo`}
                style={{ width: "100%", height: "100%", display: "block" }}
              ></image-slot>
            </div>
          );
        })}
        {/* corner registration ticks for the "fixed camera" feel */}
        <span className="reg reg-tl"></span>
        <span className="reg reg-tr"></span>
        <span className="reg reg-bl"></span>
        <span className="reg reg-br"></span>
      </div>
      <div className="frame-tag">
        <span className="frame-tag-n">{stages[nearest].n}</span>
        <span className="frame-tag-name">{stages[nearest].name}</span>
      </div>
    </div>
  );
}

/* ---------- The scrubber timeline ---------- */
function Scrubber({ stages, pos, onScrub, onSnap, onJump }) {
  const trackRef = useRef(null);
  const draggingRef = useRef(false);
  const N = stages.length;

  const posFromClientX = useCallback(
    (clientX) => {
      const el = trackRef.current;
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      const t = clamp((clientX - r.left) / r.width, 0, 1);
      return t * (N - 1);
    },
    [N]
  );

  useEffect(() => {
    const move = (e) => {
      if (!draggingRef.current) return;
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      onScrub(posFromClientX(cx));
      e.preventDefault();
    };
    const up = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.classList.remove("scrubbing");
      onSnap();
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
    };
  }, [posFromClientX, onScrub, onSnap]);

  const start = (e) => {
    draggingRef.current = true;
    document.body.classList.add("scrubbing");
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    onScrub(posFromClientX(cx));
  };

  const pct = (pos / (N - 1)) * 100;
  const nearest = Math.round(pos);

  return (
    <div className="scrubber">
      <div className="scrub-track-wrap">
        <div className="scrub-track" ref={trackRef} onMouseDown={start} onTouchStart={start}>
          <div className="scrub-fill" style={{ width: `${pct}%` }}></div>
          {stages.map((s, i) => {
            const left = (i / (N - 1)) * 100;
            return (
              <button
                key={s.key}
                className={"scrub-tick" + (nearest === i ? " is-near" : "") + (i <= pos ? " is-passed" : "")}
                style={{ left: `${left}%` }}
                onClick={() => onJump(i)}
                aria-label={s.name}
              >
                <span className="tick-dot"></span>
                <span className="tick-num">{s.n}</span>
              </button>
            );
          })}
          <div className="scrub-handle" style={{ left: `${pct}%` }}>
            <span className="handle-grip"></span>
          </div>
        </div>
      </div>
      <div className="scrub-labels">
        {stages.map((s, i) => (
          <button
            key={s.key}
            className={"scrub-label" + (nearest === i ? " is-near" : "")}
            style={{ left: `${(i / (N - 1)) * 100}%` }}
            onClick={() => onJump(i)}
          >
            {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- The info / materials panel ---------- */
function InfoPanel({ stages, pos, onJump }) {
  const nearest = Math.round(pos);
  const s = stages[nearest];
  const N = stages.length;
  const [open, setOpen] = useState(false);
  return (
    <aside className="info">
      <button className="info-top" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <div className="info-eyebrow">
          <span className={"state-dot state-" + s.state}></span>
          <span>{s.tag}</span>
        </div>
        <div className="info-top-right">
          <div className="info-count">
            Stage <b>{s.n}</b> <span className="of">/ {String(N).padStart(2, "0")}</span>
          </div>
          <span className={"info-chevron" + (open ? " is-open" : "")}>
            <svg width="12" height="8" viewBox="0 0 12 8" fill="none"><path d="M1 1.5 6 6.5 11 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <span className="info-toggle-label">{open ? "Hide details" : "View details"}</span>
        </div>
      </button>

      {open && (
        <React.Fragment>
          <div className="info-body" key={s.key}>
            <h2 className="info-name">{s.name}</h2>
            <p className="info-blurb">{s.blurb}</p>

            <div className="mat-head">Materials &amp; products</div>
            <ul className="mat-list">
              {s.items.map((it, i) => (
                <li className="mat-row" key={i} style={{ animationDelay: `${i * 55}ms` }}>
                  <span className="mat-name">{it.name}</span>
                  <span className="mat-dots"></span>
                  <span className="mat-spec">{it.spec}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="info-nav">
            <button
              className="navbtn"
              onClick={() => onJump(clamp(nearest - 1, 0, N - 1))}
              disabled={nearest === 0}
            >
              <span className="navarrow">←</span> Prev
            </button>
            <div className="navprog">
              {stages.map((st, i) => (
                <span key={st.key} className={"prog-pip" + (i <= nearest ? " on" : "")}></span>
              ))}
            </div>
            <button
              className="navbtn"
              onClick={() => onJump(clamp(nearest + 1, 0, N - 1))}
              disabled={nearest === N - 1}
            >
              Next <span className="navarrow">→</span>
            </button>
          </div>
        </React.Fragment>
      )}
    </aside>
  );
}

Object.assign(window, { StageFrame, Scrubber, InfoPanel, clamp });
