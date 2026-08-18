/* ==========================================================
   JOOD — Fun layer
     1. Revenue calculator
     2. Logo easter egg (5 clicks on the dot → confetti)
     3. Hero cursor parallax
   ========================================================== */
(function () {
  'use strict';

  /* ============================================================
     1. REVENUE CALCULATOR
     ============================================================ */
  const calc = document.getElementById('calc');
  if (calc) {
    const state = { location: 'newcairo', br: '3', type: 'apt', tier: '01' };

    // Base ADR (EGP/night for 1BR apartment Model-01 at this location), and base occupancy
    const locBase = {
      newcairo:   { adr: 1450, occ: 0.78, label: 'New Cairo' },
      zayed:      { adr: 1500, occ: 0.78, label: 'Sheikh Zayed' },
      downtown:   { adr: 1700, occ: 0.74, label: 'Downtown' },
      marassi:    { adr: 2450, occ: 0.62, label: 'Marassi · Coast' },
      hacienda:   { adr: 2200, occ: 0.60, label: 'Hacienda · Coast' },
      othercairo: { adr: 1150, occ: 0.72, label: 'Other Cairo' }
    };
    const brMult   = { '1': 1.00, '2': 1.60, '3': 2.35, '4': 3.30, '5': 4.40 };
    const typeMult = { apt: 1.00, villa: 1.40, chalet: 1.30 };
    // Tier impacts ADR (Model 02 commands premium, Model 03 is below-market fixed lease)
    const tierMult = { '01': 1.00, '02': 1.30, '03': 0.85 };
    // JOOD share (annual % of gross) by model
    const tierShare = { '01': 0.20, '02': 0.40, '03': 1.00 }; // Model 03 = full lease, JOOD pays fixed
    const tierJoodLabel = { '01': '≈20% · Model 01', '02': '≈40% · Model 02', '03': 'Fixed lease · Model 03' };
    // Typical long-term let yield as fraction of short-term gross (illustrative — Cairo benchmark)
    const ltShareByLoc = {
      newcairo: 0.42, zayed: 0.42, downtown: 0.36, marassi: 0.32, hacienda: 0.32, othercairo: 0.45
    };

    const shortNum = (n) => {
      if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
      if (n >= 1_000)     return Math.round(n / 1000) + 'K';
      return Math.round(n).toString();
    };

    function recalc() {
      const loc = locBase[state.location];
      const adr = loc.adr * brMult[state.br] * typeMult[state.type] * tierMult[state.tier];
      let monthly = adr * 30 * loc.occ;

      // Model 03 is a fixed lease — landlord receives a fixed monthly amount roughly = 55% of gross potential
      if (state.tier === '03') {
        monthly = monthly * 0.55;
      }

      const lo = monthly * 0.88;
      const hi = monthly * 1.12;
      const annual = monthly * 12;
      const ltYearly = annual * (ltShareByLoc[state.location] || 0.40);
      const vsLT = Math.round(((annual - ltYearly) / ltYearly) * 100);

      let joodShare, net;
      if (state.tier === '03') {
        // Net to landlord = gross (since they get fixed lease); JOOD "share" line shows differently
        joodShare = 0;
        net = annual;
      } else {
        joodShare = annual * tierShare[state.tier];
        net = annual - joodShare;
      }

      const set = (sel, v) => {
        const el = calc.querySelector(sel);
        if (el) el.textContent = v;
      };

      // Trigger color flash on the big number
      const shell = calc.querySelector('.calc-shell');
      shell.classList.add('is-recalc');
      setTimeout(() => shell.classList.remove('is-recalc'), 250);

      set('[data-calc-monthly-lo]', shortNum(lo));
      set('[data-calc-monthly-hi]', shortNum(hi));
      set('[data-calc-annual]', shortNum(annual));
      set('[data-calc-vs-lt]', (vsLT >= 0 ? '+' : '') + vsLT + '%');
      set('[data-calc-occ]', Math.round(loc.occ * 100));

      const joodEl  = calc.querySelector('[data-calc-jood]');
      const joodLbl = calc.querySelector('.calc-row-d');
      if (joodEl) joodEl.textContent = state.tier === '03' ? '— Fixed' : '−' + shortNum(joodShare);
      if (joodLbl) joodLbl.textContent = tierJoodLabel[state.tier];

      set('[data-calc-net]', shortNum(net) + ' EGP');

      // Net row already has " EGP" suffix in markup; we overwrote, fix label
      const netSpan = calc.querySelector('[data-calc-net]');
      if (netSpan) netSpan.textContent = shortNum(net);
    }

    calc.querySelectorAll('.calc-options').forEach(group => {
      const key = group.dataset.key;
      group.querySelectorAll('.calc-opt').forEach(btn => {
        btn.addEventListener('click', () => {
          group.querySelectorAll('.calc-opt').forEach(b => b.classList.remove('is-on'));
          btn.classList.add('is-on');
          state[key] = btn.dataset.v;
          recalc();
        });
      });
    });

    recalc();
  }

  /* ============================================================
     2. LOGO EASTER EGG
     ============================================================ */
  const logoDot = document.querySelector('.nav-logo .dot');
  if (logoDot) {
    const logoLink = document.querySelector('.nav-logo');
    let clicks = 0;
    let resetTimer;

    // Suppress nav-logo's anchor jump when clicking the dot
    logoDot.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      clicks++;
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => clicks = 0, 1500);

      // Mini bounce on every click
      try {
        logoDot.animate(
          [
            { transform: 'translateY(-4px) scale(1)' },
            { transform: 'translateY(-4px) scale(1.7)' },
            { transform: 'translateY(-4px) scale(1)' }
          ],
          { duration: 260, easing: 'ease-out' }
        );
      } catch (_) {}

      if (clicks >= 5) {
        clicks = 0;
        triggerEgg(logoLink || logoDot);
      }
    });
    // Some browsers will navigate from the parent <a>; ensure dot click is captured
    if (logoLink) {
      logoLink.addEventListener('click', (e) => {
        if (e.target === logoDot) e.preventDefault();
      }, true);
    }
  }

  function triggerEgg(origin) {
    const r = origin.getBoundingClientRect();
    const ox = r.left + r.width / 2;
    const oy = r.top + r.height / 2;

    // Confetti
    const colors = ['#FF6037', '#A0C9CB', '#733635', '#351E1C', '#D9D6C3', '#5E8A8B'];
    const N = 32;
    for (let i = 0; i < N; i++) {
      const p = document.createElement('div');
      const sz = 5 + Math.random() * 8;
      const color = colors[i % colors.length];
      const round = Math.random() > 0.55;
      p.className = 'egg-confetti';
      p.style.cssText =
        `left:${ox - sz/2}px; top:${oy - sz/2}px; width:${sz}px; height:${sz}px;` +
        `background:${color}; border-radius:${round ? '50%' : '1px'};`;
      document.body.appendChild(p);
      const angle = (Math.PI * 2 * i / N) + (Math.random() - 0.5) * 0.6;
      const speed = 180 + Math.random() * 260;
      const tx = Math.cos(angle) * speed * (0.6 + Math.random() * 0.7);
      const ty = Math.sin(angle) * speed * (0.4 + Math.random() * 0.6) + 280; // gravity
      const rot = (Math.random() * 2 - 1) * 720;
      try {
        const anim = p.animate(
          [
            { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
            { transform: `translate(${tx}px, ${ty}px) rotate(${rot}deg)`, opacity: 0 }
          ],
          { duration: 1100 + Math.random() * 700, easing: 'cubic-bezier(0.18, 0.6, 0.3, 1)' }
        );
        anim.onfinish = () => p.remove();
      } catch (_) {
        setTimeout(() => p.remove(), 1800);
      }
    }

    // Toast
    const toast = document.createElement('div');
    toast.className = 'egg-toast';
    toast.innerHTML = '👋 You found it. <span class="em">— Hussam</span>';
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('is-on'));
    setTimeout(() => {
      toast.classList.remove('is-on');
      setTimeout(() => toast.remove(), 400);
    }, 2600);
  }

  /* ============================================================
     3. HERO CURSOR PARALLAX
     ============================================================ */
  const heroSection = document.querySelector('section.hero');
  const heroTitle = document.querySelector('h1.hero-title');
  if (heroSection && heroTitle && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    let tx = 0, ty = 0, cx = 0, cy = 0, rafId = null;
    const maxX = 14, maxY = 8;

    function tick() {
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      heroTitle.style.transform = `translate3d(${cx.toFixed(2)}px, ${cy.toFixed(2)}px, 0)`;
      if (Math.abs(tx - cx) > 0.1 || Math.abs(ty - cy) > 0.1) {
        rafId = requestAnimationFrame(tick);
      } else {
        rafId = null;
      }
    }
    heroSection.addEventListener('mousemove', (e) => {
      const r = heroSection.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      tx = x * maxX;
      ty = y * maxY;
      if (!rafId) rafId = requestAnimationFrame(tick);
    });
    heroSection.addEventListener('mouseleave', () => {
      tx = 0; ty = 0;
      if (!rafId) rafId = requestAnimationFrame(tick);
    });
  }

})();
