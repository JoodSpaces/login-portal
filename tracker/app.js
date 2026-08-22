/* ============================================================
   JOOD Tracker — application logic
   Talks only to `store` (see supabase-client.js) so it runs the
   same in demo or live Supabase mode.
   ============================================================ */
'use strict';

const state = { user:null, units:[], data:{bookings:[],expenses:[],payouts:[],guests:[],directory:[]},
  unitId:'all', period:'', panel:'dashboard', calMonth:null,
  gQuery:'', gFilter:'all' };
const charts = {};
const CCY = 'EGP';
const SOURCES = ['Airbnb','Booking.com','Direct','VRBO'];
const CATS = ['Cleaning','Maintenance','Utilities','Supplies','Other'];
const CAT_COLOR = { Cleaning:'#A0C9CB', Maintenance:'#FF6037', Utilities:'#733635', Supplies:'#8A6663', Other:'#D9D6C3' };
const SRC_COLOR = { 'Airbnb':'#FF6037', 'Booking.com':'#A0C9CB', 'Direct':'#351E1C', 'VRBO':'#8A6663' };

/* ── helpers ─────────────────────────────────────────────── */
const $ = s => document.querySelector(s);
const money = n => CCY+' '+Math.round(+n||0).toLocaleString();
const money1 = n => { const v=+n||0; return (v<0?'-':'')+CCY+' '+Math.abs(Math.round(v)).toLocaleString(); };
const el = html => { const t=document.createElement('template'); t.innerHTML=html.trim(); return t.content.firstChild; };
const initials = s => (s||'').trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'—';
const esc = s => (s==null?'':String(s)).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function fmtDate(iso){ if(!iso) return '—'; const d=new Date(iso+'T00:00:00'); return d.toLocaleDateString('en-GB',{day:'numeric',month:'short'}); }
function fmtRange(a,b){ return fmtDate(a)+' → '+fmtDate(b); }
function ymOf(x){ return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0'); }
function daysInMonth(ym){ const [y,m]=ym.split('-').map(Number); return new Date(y,m,0).getDate(); }
function nightsBetween(a,b){ return Math.max(0,Math.round((new Date(b)-new Date(a))/864e5)); }
function unitName(id){ const u=state.units.find(u=>u.id===id); return u?u.name:'—'; }
function scopedUnitIds(){ return state.unitId==='all' ? state.units.map(u=>u.id) : [state.unitId]; }
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(window.__tt); window.__tt=setTimeout(()=>t.classList.remove('show'),2200); }
function srcClass(s){ return s==='Airbnb'?'airbnb':s==='Booking.com'?'booking':s==='VRBO'?'vrbo':'direct'; }

/* period filtering: '' = all time, else 'YYYY-MM' */
function inPeriod(dateIso){ return !state.period || (dateIso||'').slice(0,7)===state.period; }
function periodBookings(){ return state.data.bookings.filter(b=>scopedUnitIds().includes(b.unit_id) && inPeriod(b.checkin)); }
function periodExpenses(){ return state.data.expenses.filter(e=>scopedUnitIds().includes(e.unit_id) && inPeriod(e.date)); }
/* ── INVESTMENT MODELS ─────────────────────────────────────
   Terms come from the JOOD proposal:
     commission  (Model 01 · Furnished Unit)   JOOD keeps commission_pct
     partnership (Model 02 · Full Partnership) owner keeps owner_split_pct (60/40)
     guaranteed  (Model 03 · Guaranteed Income) fixed monthly rent to the owner

   Basis: net after platform fees only. JOOD absorbs operating expenses, and
   the guest cleaning fee is a pass-through to JOOD (never owner income).     */
const MODELS = {
  commission : { label:'Furnished Unit',    tag:'Commission',  no:'01' },
  partnership: { label:'Full Partnership',  tag:'Revenue split', no:'02' },
  guaranteed : { label:'Guaranteed Income', tag:'Fixed rent',  no:'03' },
};
function unitModel(u){ return (u && MODELS[u.model]) ? u.model : 'commission'; }
function modelSummary(u){
  const m = unitModel(u);
  if (m==='commission')  return `JOOD ${+u.commission_pct||25}% commission`;
  if (m==='partnership') return `${+u.owner_split_pct||60}/${100-(+u.owner_split_pct||60)} owner / JOOD split`;
  return `${money(+u.guaranteed_rent||0)} fixed / month`;
}

/* how many months the current scope covers — guaranteed rent accrues per month */
function periodMonthCount(){
  if (state.period) return 1;
  const ids=scopedUnitIds();
  const ds=[...state.data.bookings.filter(b=>ids.includes(b.unit_id)).map(b=>b.checkin),
            ...state.data.expenses.filter(e=>ids.includes(e.unit_id)).map(e=>e.date)]
            .filter(Boolean).map(d=>d.slice(0,7)).sort();
  if(!ds.length) return 0;
  const [y1,m1]=ds[0].split('-').map(Number), [y2,m2]=ds[ds.length-1].split('-').map(Number);
  return (y2-y1)*12 + (m2-m1) + 1;
}

/* owner's entitlement for one unit over the current period */
function ownerDueForUnit(unitId){
  const u=state.units.find(x=>x.id===unitId); if(!u) return 0;
  const bks=state.data.bookings.filter(b=>b.unit_id===unitId && inPeriod(b.checkin));
  const base=bks.reduce((s,b)=>s + (+b.total - +b.platform_fee), 0);
  const m=unitModel(u);
  if (m==='guaranteed') return (+u.guaranteed_rent||0) * periodMonthCount();
  if (m==='partnership') return base * ((+u.owner_split_pct||60)/100);
  return base * (1 - (+u.commission_pct||25)/100);
}
function ownerDueTotal(){ return scopedUnitIds().reduce((s,id)=>s+ownerDueForUnit(id),0); }
function paidForUnit(unitId){
  return state.data.payouts.filter(p=>p.unit_id===unitId && inPeriod(p.date)).reduce((s,p)=>s+ +p.amount,0);
}

function periodPayouts(){ return state.data.payouts.filter(p=>scopedUnitIds().includes(p.unit_id) && inPeriod(p.date)); }

/* occupancy for the current period + scope */
function occupancy(){
  const units = scopedUnitIds().length || 1;
  let start, end, avail;
  const bks = state.data.bookings.filter(b=>scopedUnitIds().includes(b.unit_id));
  if (state.period){
    start = new Date(state.period+'-01T00:00:00');
    end = new Date(start.getFullYear(), start.getMonth()+1, 1);
    avail = units * daysInMonth(state.period);
  } else {
    if (!bks.length) return 0;
    const mins = bks.map(b=>+new Date(b.checkin)), maxs = bks.map(b=>+new Date(b.checkout));
    start = new Date(Math.min(...mins)); end = new Date(Math.max(...maxs));
    avail = units * Math.max(1, Math.round((end-start)/864e5));
  }
  let occ=0;
  bks.forEach(b=>{
    const s=Math.max(+new Date(b.checkin), +start), e=Math.min(+new Date(b.checkout), +end);
    if (e>s) occ += Math.round((e-s)/864e5);
  });
  return Math.min(100, Math.round(occ/avail*100));
}

/* ── boot ────────────────────────────────────────────────── */
(async function init(){
  state.user = await store.currentUser();
  if (!state.user){ location.href='index.html'; return; }

  $('#sbAvatar').textContent = initials(state.user.name);
  $('#sbName').textContent = state.user.name;
  $('#sbRole').textContent = state.user.role==='admin' ? 'Admin · all units' : 'Owner';
  // Only JOOD staff may write: hide every add/edit/delete affordance for owners.
  document.body.dataset.role = state.user.role === 'admin' ? 'admin' : 'owner';

  state.units = await store.units(state.user);
  buildUnitFilter();
  await loadData();
  buildPeriodFilter();
  wireChrome();
  show('dashboard');
})();

// A failed read used to look identical to an empty database. Now it says so.
window.__joodReadError = msg => {
  const t=$('#toast'); if(!t) return;
  t.textContent = /deleted_at|column/.test(msg) ? 'Database needs the latest migration — run supabase-schema.sql' : 'Could not load data: '+msg;
  t.classList.add('show'); clearTimeout(window.__tt); window.__tt=setTimeout(()=>t.classList.remove('show'), 6000);
};

function invalidateDirectory(){ dirLoaded=false; }

async function loadData(){
  const ids = state.units.map(u=>u.id);
  if (!ids.length){ state.data={bookings:[],expenses:[],payouts:[],guests:[],directory:[]}; return; }
  const isAdmin = state.user.role==='admin';
  const [bookings,expenses,payouts,guests] = await Promise.all([
    store.bookings(ids), store.expenses(ids), store.payouts(ids),
    isAdmin ? store.guests() : Promise.resolve([])
  ]);
  // The owner directory is only needed by the Guests panel — fetched there,
  // so a pending migration can never break the dashboard.
  state.data = { bookings, expenses, payouts, guests, directory: state.data.directory || [] };
}

function buildUnitFilter(){
  const sel=$('#unitFilter'); sel.innerHTML='';
  sel.appendChild(el(`<option value="all">All units (${state.units.length})</option>`));
  state.units.forEach(u=> sel.appendChild(el(`<option value="${u.id}">${esc(u.name)}</option>`)));
  sel.value=state.unitId;
  sel.onchange=()=>{ state.unitId=sel.value; invalidateDirectory(); rerender(); };
}
function buildPeriodFilter(){
  const months=new Set();
  [...state.data.bookings.map(b=>b.checkin), ...state.data.expenses.map(e=>e.date), ...state.data.payouts.map(p=>p.date)]
    .forEach(d=>{ if(d) months.add(d.slice(0,7)); });
  const list=[...months].sort().reverse();
  const now=ymOf(new Date());
  if(!list.includes(now)) list.unshift(now);
  const sel=$('#periodFilter'); sel.innerHTML='';
  sel.appendChild(el(`<option value="">All time</option>`));
  list.forEach(m=>{ const [y,mo]=m.split('-'); const lbl=new Date(y,mo-1,1).toLocaleDateString('en-GB',{month:'long',year:'numeric'}); sel.appendChild(el(`<option value="${m}">${lbl}</option>`)); });
  state.period = list.includes(now)? now : (list[0]||'');
  sel.value=state.period;
  sel.onchange=()=>{ state.period=sel.value; rerender(); };
}

function wireChrome(){
  $('#nav').querySelectorAll('.sb-item').forEach(b=> b.onclick=()=>show(b.dataset.panel));
  $('#signOutBtn').onclick=async()=>{ await store.signOut(); location.href='index.html'; };
  $('#addBtn').onclick=()=>{ if(state.panel==='finances') openExpenseModal(); else openBookingModal(); };
  $('#menuToggle').onclick=()=>{ $('#sidebar').classList.add('open'); $('#sidebarBackdrop').classList.add('open'); };
  $('#manageUnitsBtn').onclick=openUnitsModal;
  $('#sidebarBackdrop').onclick=closeSidebar;
  $('#modalBg').onclick=e=>{ if(e.target===$('#modalBg')) closeModal(); };
  state.calMonth = state.period || ymOf(new Date());
}
function closeSidebar(){ $('#sidebar').classList.remove('open'); $('#sidebarBackdrop').classList.remove('open'); }

const TITLES = { backup:['Backup & trash','Your data, in your hands'], dashboard:['Dashboard','Overview'], bookings:['Bookings','Guests & stays'], calendar:['Calendar','Occupancy map'], guests:['Guest book','Everyone who has stayed'], finances:['Finances','Income, expenses & net'], reports:['Reports','Trends & performance'] };
const ADD = { backup:'Add booking', dashboard:'Add booking', bookings:'Add booking', calendar:'Add booking', guests:'Add booking', finances:'Add expense', reports:'Add booking' };
const ADMIN_PANELS = ['backup'];
function show(name){
  // Never render a staff-only panel for an owner, even via a stale URL or hash.
  if (ADMIN_PANELS.includes(name) && (!state.user || state.user.role !== 'admin')) name = 'dashboard';
  state.panel=name;
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  $('#panel-'+name).classList.add('active');
  $('#nav').querySelectorAll('.sb-item').forEach(b=>b.classList.toggle('active', b.dataset.panel===name));
  $('#tbTitle').textContent=TITLES[name][0]; $('#tbSub').textContent=TITLES[name][1];
  $('#addLabel').textContent=ADD[name];
  closeSidebar();
  rerender();
}
function rerender(){
  const r=({dashboard:renderDashboard, bookings:renderBookings, calendar:renderCalendar, guests:renderGuests, backup:renderBackup, finances:renderFinances, reports:renderReports}[state.panel])();
  if (r && typeof r.catch === 'function') r.catch(e=>console.error('[jood] render failed:', e));
}

/* ── DASHBOARD ───────────────────────────────────────────── */
function renderDashboard(){
  const bks=periodBookings(), exps=periodExpenses();
  const gross=bks.reduce((s,b)=>s+ +b.total,0);
  const fees=bks.reduce((s,b)=>s+ +b.platform_fee,0);
  const expTot=exps.reduce((s,e)=>s+ +e.amount,0);
  const net=gross-fees-expTot;
  const pending=bks.filter(b=>b.payment_status==='Pending');
  const pendTot=pending.reduce((s,b)=>s+ +b.total,0);
  const occ=occupancy();
  // prev month delta
  let deltaHtml='';
  if(state.period){
    const [y,m]=state.period.split('-').map(Number); const prev=ymOf(new Date(y,m-2,1));
    const pg=state.data.bookings.filter(b=>scopedUnitIds().includes(b.unit_id)&&b.checkin.slice(0,7)===prev).reduce((s,b)=>s+ +b.total,0);
    if(pg){ const d=Math.round((gross-pg)/pg*100); deltaHtml=`<div class="d ${d>=0?'up':'down'}">${d>=0?'▲':'▼'} ${Math.abs(d)}% vs last month</div>`; }
  }
  const upcoming=state.data.bookings.filter(b=>scopedUnitIds().includes(b.unit_id)&&new Date(b.checkin)>=new Date(new Date().toDateString()))
    .sort((a,b)=>a.checkin<b.checkin?-1:1).slice(0,5);
  const recent=[...bks].sort((a,b)=>a.checkin<b.checkin?1:-1).slice(0,5);

  $('#panel-dashboard').innerHTML=`
    <div class="stat-grid">
      <div class="stat"><div class="k"><span class="dot k"></span>Gross income</div><div class="v">${money(gross)}</div>${deltaHtml||`<div class="d">${bks.length} booking${bks.length!==1?'s':''}</div>`}</div>
      <div class="stat"><div class="k"><span class="dot o"></span>Net profit</div><div class="v">${money1(net)}</div><div class="d">after fees &amp; expenses</div></div>
      <div class="stat"><div class="k"><span class="dot a"></span>Occupancy</div><div class="v">${occ}%</div><div class="d">${state.period?'this month':'overall'}</div></div>
      <div class="stat"><div class="k"><span class="dot g"></span>Pending payments</div><div class="v">${money(pendTot)}</div><div class="d">${pending.length} to collect</div></div>
    </div>
    <div class="grid2">
      <div class="card">
        <h3>Upcoming check-ins</h3><div class="lede">Next arrivals across your units</div>
        <div id="dash-upcoming"></div>
      </div>
      <div class="card">
        <h3>Recent bookings</h3><div class="lede">${state.period?'This period':'Latest'}</div>
        <div id="dash-recent"></div>
      </div>
    </div>`;
  const up=$('#dash-upcoming');
  if(!upcoming.length) up.appendChild(el(`<div class="empty-note">No upcoming check-ins.</div>`));
  upcoming.forEach(b=> up.appendChild(el(`
    <div class="list-row" style="display:flex;align-items:center;gap:13px;padding:12px 0;border-bottom:1px solid var(--border)">
      <div style="width:40px;text-align:center"><div style="font-family:var(--serif);font-size:1.2rem;line-height:1">${new Date(b.checkin+'T00:00:00').getDate()}</div><div style="font-family:var(--mono);font-size:.56rem;text-transform:uppercase;color:var(--mid)">${new Date(b.checkin+'T00:00:00').toLocaleDateString('en',{month:'short'})}</div></div>
      <div style="flex:1;min-width:0"><div class="cell-strong">${esc(b.guest_name)}</div><div class="cell-sub">${esc(unitName(b.unit_id))} · ${b.nights} nights · ${b.guests} guests</div></div>
      <span class="tag ${srcClass(b.source)}">${b.source}</span>
    </div>`)));
  const rc=$('#dash-recent');
  if(!recent.length) rc.appendChild(el(`<div class="empty-note">No bookings in this period.</div>`));
  recent.forEach(b=> rc.appendChild(el(`
    <div style="display:flex;align-items:center;gap:13px;padding:12px 0;border-bottom:1px solid var(--border)">
      <div style="flex:1;min-width:0"><div class="cell-strong">${esc(b.guest_name)}</div><div class="cell-sub">${fmtRange(b.checkin,b.checkout)} · ${esc(unitName(b.unit_id))}</div></div>
      <div style="text-align:right"><div class="cell-strong">${money(b.total)}</div><span class="tag ${b.payment_status==='Paid'?'paid':'pending'}" style="margin-top:3px">${b.payment_status}</span></div>
    </div>`)));
}

/* ── BOOKINGS ────────────────────────────────────────────── */
function renderBookings(){
  const bks=periodBookings().sort((a,b)=>a.checkin<b.checkin?1:-1);
  $('#panel-bookings').innerHTML=`
    <div class="section-head">
      <div><div class="eyebrow">${bks.length} record${bks.length!==1?'s':''}${state.period?'':' · all time'}</div><h2>Guests &amp; bookings</h2></div>
      <div class="row-actions">
        <button class="btn-sm" onclick="exportBookingsCSV()"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3 5l3 3 3-3M1.5 10.5h9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>Export CSV</button>
        <button class="btn-sm solid" onclick="openBookingModal()"><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>Add booking</button>
      </div>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Guest</th><th>Unit</th><th>Stay</th><th>Source</th><th class="num">Nights</th><th class="num">Total</th><th>Status</th><th></th></tr></thead>
      <tbody id="bk-body"></tbody>
    </table></div>`;
  const body=$('#bk-body');
  if(!bks.length){ body.appendChild(el(`<tr><td colspan="8"><div class="empty-note">No bookings yet. Click <strong>Add booking</strong> to create one.</div></td></tr>`)); return; }
  bks.forEach(b=> body.appendChild(el(`
    <tr>
      <td><div class="cell-strong">${esc(b.guest_name)}</div><div class="cell-sub">${b.guests} guest${b.guests!=1?'s':''}${b.email?' · '+esc(b.email):''}</div></td>
      <td>${esc(unitName(b.unit_id))}</td>
      <td>${fmtRange(b.checkin,b.checkout)}</td>
      <td><span class="tag ${srcClass(b.source)}">${b.source}</span></td>
      <td class="num">${b.nights}</td>
      <td class="num cell-strong">${money(b.total)}</td>
      <td><span class="tag ${b.payment_status==='Paid'?'paid':'pending'}">${b.payment_status}</span></td>
      <td class="num" style="white-space:nowrap"><button class="row-btn" data-edit="${b.id}">Edit</button><button class="row-btn del" data-del="${b.id}">Delete</button></td>
    </tr>`)));
  body.querySelectorAll('[data-edit]').forEach(x=> x.onclick=()=>openBookingModal(state.data.bookings.find(b=>b.id===x.dataset.edit)));
  body.querySelectorAll('[data-del]').forEach(x=> x.onclick=()=>confirmDelete('bookings',x.dataset.del,'booking'));
}

/* ── CALENDAR ────────────────────────────────────────────── */
function renderCalendar(){
  const ym=state.calMonth; const [y,m]=ym.split('-').map(Number);
  const first=new Date(y,m-1,1), startDow=(first.getDay()+6)%7, dim=daysInMonth(ym);
  const label=first.toLocaleDateString('en-GB',{month:'long',year:'numeric'});
  const todayIso=new Date().toISOString().slice(0,10);
  const dows=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const units=scopedUnitIds();
  $('#panel-calendar').innerHTML=`
    <div class="cal-head">
      <button class="cal-nav" id="calPrev"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M8 2.5 4 6.5l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      <div class="cal-month">${label}</div>
      <button class="cal-nav" id="calNext"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M5 2.5 9 6.5l-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      <button class="btn-sm" style="margin-left:auto" id="calToday">Today</button>
    </div>
    <div class="cal-grid" id="calGrid">${dows.map(d=>`<div class="cal-dow">${d}</div>`).join('')}</div>
    <div class="cal-legend" id="calLegend"></div>`;
  const grid=$('#calGrid');
  for(let i=0;i<startDow;i++) grid.appendChild(el(`<div class="cal-cell out"></div>`));
  for(let d=1;d<=dim;d++){
    const iso=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const cell=el(`<div class="cal-cell${iso===todayIso?' today':''}"><div class="cal-date">${d}</div></div>`);
    state.data.bookings.filter(b=>units.includes(b.unit_id)&&iso>=b.checkin&&iso<b.checkout).forEach(b=>{
      const ev=el(`<div class="cal-ev" style="background:${SRC_COLOR[b.source]||'#351E1C'}" title="${esc(b.guest_name)} · ${esc(unitName(b.unit_id))}">${iso===b.checkin?'▸ ':''}${esc(b.guest_name.split(' ')[0])}</div>`);
      ev.onclick=()=>openBookingModal(b); cell.appendChild(ev);
    });
    grid.appendChild(cell);
  }
  const lg=$('#calLegend');
  SOURCES.forEach(s=> lg.appendChild(el(`<span><span class="lg-sw" style="background:${SRC_COLOR[s]}"></span>${s}</span>`)));
  $('#calPrev').onclick=()=>{ state.calMonth=shiftMonth(ym,-1); renderCalendar(); };
  $('#calNext').onclick=()=>{ state.calMonth=shiftMonth(ym,1); renderCalendar(); };
  $('#calToday').onclick=()=>{ state.calMonth=ymOf(new Date()); renderCalendar(); };
}
function shiftMonth(ym,delta){ const [y,m]=ym.split('-').map(Number); return ymOf(new Date(y,m-1+delta,1)); }

/* ── FINANCES ────────────────────────────────────────────── */
let finTab='ledger';
function renderFinances(){
  const bks=periodBookings(), exps=periodExpenses(), pays=periodPayouts();
  const gross=bks.reduce((s,b)=>s+ +b.total,0);
  const fees=bks.reduce((s,b)=>s+ +b.platform_fee,0);
  const expTot=exps.reduce((s,e)=>s+ +e.amount,0);
  const net=gross-fees-expTot;
  const payTot=pays.reduce((s,p)=>s+ +p.amount,0);
  const cleaning=bks.reduce((s,b)=>s+ +(b.cleaning_fee||0),0);
  const base=gross-fees;                       // net after platform fees
  const ownerDue=ownerDueTotal();              // calculated from each unit's model
  const joodMargin=base-ownerDue+cleaning-expTot;
  const balance=ownerDue-payTot;
  const scoped=state.units.filter(u=>scopedUnitIds().includes(u.id));
  const modelLine = scoped.length===1
    ? `Model ${MODELS[unitModel(scoped[0])].no} · ${MODELS[unitModel(scoped[0])].label} — ${modelSummary(scoped[0])}`
    : `${scoped.length} units · mixed models`;
  $('#panel-finances').innerHTML=`
    <div class="section-head">
      <div><div class="eyebrow">${modelLine}${state.period?'':' · all time'}</div><h2>Income &amp; expenses</h2></div>
      <div class="row-actions">
        <button class="btn-sm" onclick="exportFinanceCSV()"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3 5l3 3 3-3M1.5 10.5h9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>Export CSV</button>
        <button class="btn-sm" onclick="openPayoutModal()">+ Payout</button>
        <button class="btn-sm solid" onclick="openExpenseModal()"><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>Add expense</button>
      </div>
    </div>
    <div class="fin-summary">
      <div class="fin-cell"><div class="k">Gross income</div><div class="v">${money(gross)}</div></div>
      <div class="fin-cell"><div class="k">Platform fees</div><div class="v neg">-${money(fees)}</div></div>
      <div class="fin-cell"><div class="k">Net after fees</div><div class="v">${money(base)}</div></div>
      <div class="fin-cell"><div class="k">Expenses · JOOD</div><div class="v neg">-${money(expTot)}</div></div>
      <div class="fin-cell"><div class="k">Net profit</div><div class="v ${net>=0?'pos':'neg'}">${money1(net)}</div></div>
    </div>
    <div class="fin-summary" style="margin-top:12px">
      <div class="fin-cell"><div class="k">Owner payout · due</div><div class="v">${money1(ownerDue)}</div></div>
      <div class="fin-cell"><div class="k">Paid to owner</div><div class="v">${money(payTot)}</div></div>
      <div class="fin-cell"><div class="k">Balance owed</div><div class="v ${balance>0.5?'neg':'pos'}">${money1(balance)}</div></div>
      <div class="fin-cell"><div class="k">Cleaning fees</div><div class="v">${money(cleaning)}</div></div>
      <div class="fin-cell"><div class="k">JOOD margin</div><div class="v ${joodMargin>=0?'pos':'neg'}">${money1(joodMargin)}</div></div>
    </div>
    <div class="fin-tabs">
      <button class="fin-tab ${finTab==='ledger'?'active':''}" data-t="ledger">Income ledger</button>
      <button class="fin-tab ${finTab==='expenses'?'active':''}" data-t="expenses">Expenses</button>
      <button class="fin-tab ${finTab==='payouts'?'active':''}" data-t="payouts">Payouts</button>
      <button class="fin-tab ${finTab==='accrual'?'active':''}" data-t="accrual">Owner statement</button>
    </div>
    <div id="fin-table"></div>`;
  $('#panel-finances').querySelectorAll('.fin-tab').forEach(b=> b.onclick=()=>{ finTab=b.dataset.t; renderFinances(); });
  const wrap=$('#fin-table');
  if(finTab==='ledger'){
    wrap.innerHTML=`<div class="table-wrap"><table><thead><tr><th>Guest / booking</th><th>Unit</th><th>Date</th><th class="num">Gross</th><th class="num">Fee</th><th class="num">Net</th><th>Status</th></tr></thead><tbody id="ft"></tbody></table></div>`;
    const t=$('#ft'); const rows=bks.sort((a,b)=>a.checkin<b.checkin?1:-1);
    if(!rows.length) t.appendChild(el(`<tr><td colspan="7"><div class="empty-note">No income in this period.</div></td></tr>`));
    rows.forEach(b=> t.appendChild(el(`<tr><td class="cell-strong">${esc(b.guest_name)}</td><td>${esc(unitName(b.unit_id))}</td><td>${fmtDate(b.checkin)}</td><td class="num">${money(b.total)}</td><td class="num" style="color:var(--garnet)">-${money(b.platform_fee)}</td><td class="num cell-strong">${money(b.total-b.platform_fee)}</td><td><span class="tag ${b.payment_status==='Paid'?'paid':'pending'}">${b.payment_status}</span></td></tr>`)));
  } else if(finTab==='expenses'){
    wrap.innerHTML=`<div class="table-wrap"><table><thead><tr><th>Description</th><th>Unit</th><th>Category</th><th>Date</th><th class="num">Amount</th><th></th></tr></thead><tbody id="ft"></tbody></table></div>`;
    const t=$('#ft'); const rows=exps.sort((a,b)=>a.date<b.date?1:-1);
    if(!rows.length) t.appendChild(el(`<tr><td colspan="6"><div class="empty-note">No expenses in this period.</div></td></tr>`));
    rows.forEach(e=> { const tr=el(`<tr><td class="cell-strong">${esc(e.description||'—')}</td><td>${esc(unitName(e.unit_id))}</td><td><span class="cat-dot"><span class="dot" style="background:${CAT_COLOR[e.category]}"></span>${e.category}</span></td><td>${fmtDate(e.date)}</td><td class="num cell-strong">${money(e.amount)}</td><td class="num"><button class="row-btn" data-ee="${e.id}">Edit</button><button class="row-btn del" data-de="${e.id}">Delete</button></td></tr>`); t.appendChild(tr); });
    t.querySelectorAll('[data-ee]').forEach(x=>x.onclick=()=>openExpenseModal(state.data.expenses.find(e=>e.id===x.dataset.ee)));
    t.querySelectorAll('[data-de]').forEach(x=>x.onclick=()=>confirmDelete('expenses',x.dataset.de,'expense'));
  } else if(finTab==='payouts'){
    wrap.innerHTML=`<div class="table-wrap"><table><thead><tr><th>Note</th><th>Unit</th><th>Date</th><th class="num">Amount</th><th></th></tr></thead><tbody id="ft"></tbody></table></div>`;
    const t=$('#ft'); const rows=pays.sort((a,b)=>a.date<b.date?1:-1);
    if(!rows.length) t.appendChild(el(`<tr><td colspan="5"><div class="empty-note">No payouts in this period.</div></td></tr>`));
    rows.forEach(p=> { const tr=el(`<tr><td class="cell-strong">${esc(p.note||'Owner payout')}</td><td>${esc(unitName(p.unit_id))}</td><td>${fmtDate(p.date)}</td><td class="num cell-strong">${money(p.amount)}</td><td class="num"><button class="row-btn del" data-dp="${p.id}">Delete</button></td></tr>`); t.appendChild(tr); });
    t.querySelectorAll('[data-dp]').forEach(x=>x.onclick=()=>confirmDelete('payouts',x.dataset.dp,'payout'));
  } else {
    wrap.innerHTML=`<div class="table-wrap"><table><thead><tr><th>Unit</th><th>Model</th><th>Terms</th><th class="num">Net after fees</th><th class="num">Owner due</th><th class="num">Paid</th><th class="num">Balance</th></tr></thead><tbody id="ft"></tbody></table></div>`;
    const t=$('#ft');
    if(!scoped.length) t.appendChild(el(`<tr><td colspan="7"><div class="empty-note">No units in scope.</div></td></tr>`));
    scoped.forEach(u=>{
      const ub=state.data.bookings.filter(b=>b.unit_id===u.id && inPeriod(b.checkin));
      const ubase=ub.reduce((s,b)=>s + (+b.total - +b.platform_fee),0);
      const due=ownerDueForUnit(u.id), paid=paidForUnit(u.id), bal=due-paid;
      t.appendChild(el(`<tr>
        <td class="cell-strong">${esc(u.name)}</td>
        <td><span class="tag">${MODELS[unitModel(u)].no} · ${MODELS[unitModel(u)].tag}</span></td>
        <td class="cell-sub">${esc(modelSummary(u))}</td>
        <td class="num">${money(ubase)}</td>
        <td class="num cell-strong">${money1(due)}</td>
        <td class="num">${money(paid)}</td>
        <td class="num cell-strong" style="color:${bal>0.5?'var(--garnet)':'inherit'}">${money1(bal)}</td>
      </tr>`));
    });
  }
}

/* ── GUEST BOOK ───────────────────────────────────────────
   The guest list is JOOD's asset: repeat rate, lifetime value and a real
   direct-booking audience. Built from bookings.guest_id, so it spans units
   and platforms — the same person is one record, not one row per stay.     */
function guestStats(g){
  const bks=state.data.bookings.filter(b=>b.guest_id===g.id);
  const nights=bks.reduce((s,b)=>s + (+b.nights || nightsBetween(b.checkin,b.checkout)), 0);
  const value=bks.reduce((s,b)=>s + +b.total, 0);
  const dates=bks.map(b=>b.checkin).filter(Boolean).sort();
  return { stays:bks.length, nights, value,
           first:dates[0]||g.first_stay||null, last:dates[dates.length-1]||null,
           units:[...new Set(bks.map(b=>unitName(b.unit_id)))],
           sources:[...new Set(bks.map(b=>b.source))] };
}
function guestRows(){
  const q=state.gQuery.trim().toLowerCase();
  return state.data.guests.map(g=>({ g, s:guestStats(g) }))
    .filter(({g,s})=>{
      if(q && !((g.full_name||'').toLowerCase().includes(q) || (g.email||'').toLowerCase().includes(q) || (g.phone||'').includes(q))) return false;
      if(state.gFilter==='repeat'   && s.stays<2) return false;
      if(state.gFilter==='vip'      && !(g.tags||[]).includes('VIP')) return false;
      if(state.gFilter==='reachable'&& !(g.email||g.phone)) return false;
      if(state.gFilter==='missing'  && (g.email||g.phone)) return false;
      return true;
    })
    .sort((a,b)=> b.s.value-a.s.value || (a.g.full_name||'').localeCompare(b.g.full_name||''));
}
function renderGuests(){
  if (!state.user || state.user.role !== 'admin') return renderGuestsOwner();
  const all=state.data.guests.map(g=>({ g, s:guestStats(g) }));
  const rows=guestRows();
  const repeat=all.filter(x=>x.s.stays>1).length;
  const reachable=all.filter(x=>x.g.email||x.g.phone).length;
  const consented=all.filter(x=>x.g.marketing_ok).length;
  const lifetime=all.reduce((s,x)=>s+x.s.value,0);
  const FILTERS=[['all','Everyone'],['repeat','Repeat guests'],['vip','VIP'],['reachable','Contactable'],['missing','No contact details']];
  $('#panel-guests').innerHTML=`
    <div class="section-head">
      <div><div class="eyebrow">${all.length} guest${all.length!==1?'s':''} · ${repeat} repeat</div><h2>Guest book</h2></div>
      <div class="row-actions">
        <input class="g-search" id="gSearch" placeholder="Search name, email or phone" value="${esc(state.gQuery)}">
        <button class="btn-sm" onclick="exportGuestsCSV()"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3 5l3 3 3-3M1.5 10.5h9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>Export CSV</button>
      </div>
    </div>
    <div class="fin-summary" style="margin-bottom:20px">
      <div class="fin-cell"><div class="k">Guests</div><div class="v">${all.length}</div></div>
      <div class="fin-cell"><div class="k">Repeat rate</div><div class="v">${all.length?Math.round(repeat/all.length*100):0}%</div></div>
      <div class="fin-cell"><div class="k">Contactable</div><div class="v">${reachable}</div></div>
      <div class="fin-cell"><div class="k">Marketing consent</div><div class="v">${consented}</div></div>
      <div class="fin-cell"><div class="k">Lifetime value</div><div class="v">${money(lifetime)}</div></div>
    </div>
    <div class="g-chips">${FILTERS.map(([k,l])=>`<button class="g-chip ${state.gFilter===k?'active':''}" data-gf="${k}">${l}</button>`).join('')}</div>
    <div class="table-wrap"><table><thead><tr><th>Guest</th><th>Contact</th><th>Units</th><th class="num">Stays</th><th class="num">Nights</th><th class="num">Lifetime value</th><th>Last stay</th><th>Tags</th><th></th></tr></thead><tbody id="gt"></tbody></table></div>`;
  const t=$('#gt');
  if(!rows.length) t.appendChild(el(`<tr><td colspan="9"><div class="empty-note">${all.length?'No guests match this filter.':'No guests yet — they appear here as soon as you add bookings.'}</div></td></tr>`));
  rows.forEach(({g,s})=>{
    const contact = (g.phone||g.email)
      ? `${g.phone?esc(g.phone):''}${g.phone&&g.email?'<br>':''}${g.email?'<span class="cell-sub">'+esc(g.email)+'</span>':''}`
      : '<span class="g-missing">not captured</span>';
    t.appendChild(el(`<tr>
      <td class="cell-strong">${esc(g.full_name)}${s.stays>1?' <span class="g-tag">Repeat</span>':''}<div class="cell-sub">${g.marketing_ok?'<span class="g-consent yes">Consented</span>':'<span class="g-consent">No consent</span>'}</div></td>
      <td>${contact}</td>
      <td class="cell-sub">${s.units.map(esc).join(', ')||'—'}</td>
      <td class="num">${s.stays}</td>
      <td class="num">${s.nights}</td>
      <td class="num cell-strong">${money(s.value)}</td>
      <td>${s.last?fmtDate(s.last):'—'}</td>
      <td><div class="g-tags">${(g.tags||[]).map(x=>`<span class="g-tag ${x.toLowerCase()}">${esc(x)}</span>`).join('')}</div></td>
      <td class="num"><button class="row-btn" data-ge="${g.id}">Edit</button></td>
    </tr>`));
  });
  const s=$('#gSearch');
  s.oninput=()=>{ const v=s.value; state.gQuery=v; renderGuests(); const n=$('#gSearch'); n.focus(); n.setSelectionRange(v.length,v.length); };
  $('#panel-guests').querySelectorAll('[data-gf]').forEach(b=> b.onclick=()=>{ state.gFilter=b.dataset.gf; renderGuests(); });
  $('#panel-guests').querySelectorAll('[data-ge]').forEach(b=> b.onclick=()=>openGuestModal(b.dataset.ge));
}

/* Owners see who stayed and when — name, country, dates. Nothing else:
   contact details never leave the guest_directory view. Read-only.        */
let dirLoaded=false;
async function renderGuestsOwner(){
  if(!dirLoaded){
    $('#panel-guests').innerHTML='<div class="empty-note">Loading…</div>';
    state.data.directory = await store.guestDirectory(scopedUnitIds());
    dirLoaded = true;
  }
  if(store.directoryMissing){
    $('#panel-guests').innerHTML='<div class="empty-note">Guest list unavailable — the database needs the latest migration.</div>';
    return;
  }
  const stays=(state.data.directory||[]).filter(r=>inPeriod(r.checkin));
  const people=new Map();
  stays.forEach(r=>{
    const k=r.guest_id;
    const cur=people.get(k) || { name:r.full_name, country:r.nationality, stays:0, nights:0, last:null };
    cur.stays++; cur.nights += +r.nights||0;
    if(!cur.last || r.checkin>cur.last) cur.last=r.checkin;
    if(!cur.country && r.nationality) cur.country=r.nationality;
    people.set(k,cur);
  });
  const rows=[...people.values()].sort((a,b)=>(b.last||'').localeCompare(a.last||''));
  const nights=rows.reduce((s,r)=>s+r.nights,0);
  $('#panel-guests').innerHTML=`
    <div class="section-head"><div><div class="eyebrow">${rows.length} guest${rows.length!==1?'s':''}${state.period?'':' · all time'}</div><h2>Who stayed</h2></div></div>
    <div class="fin-summary" style="margin-bottom:20px">
      <div class="fin-cell"><div class="k">Guests</div><div class="v">${rows.length}</div></div>
      <div class="fin-cell"><div class="k">Stays</div><div class="v">${stays.length}</div></div>
      <div class="fin-cell"><div class="k">Nights</div><div class="v">${nights}</div></div>
    </div>
    <div class="table-wrap"><table><thead><tr><th>Guest</th><th>Country</th><th class="num">Stays</th><th class="num">Nights</th><th>Last stay</th></tr></thead><tbody id="got"></tbody></table></div>
    <div class="bk-note" style="margin-top:20px">Guest contact details are held by JOOD and aren't shown here.</div>`;
  const t=$('#got');
  if(!rows.length) t.appendChild(el(`<tr><td colspan="5"><div class="empty-note">No guests in this period yet.</div></td></tr>`));
  rows.forEach(r=> t.appendChild(el(`<tr>
    <td class="cell-strong">${esc(r.name||'—')}</td>
    <td>${r.country?esc(r.country):'<span class="g-missing">—</span>'}</td>
    <td class="num">${r.stays}</td>
    <td class="num">${r.nights}</td>
    <td>${r.last?fmtDate(r.last):'—'}</td>
  </tr>`)));
}

const GUEST_TAGS=['VIP','Corporate','Family','Long stay','Blocked'];
function openGuestModal(id){
  const g=state.data.guests.find(x=>x.id===id); if(!g) return;
  const s=guestStats(g); const tags=g.tags||[];
  openModal(`
    <div class="modal-head"><h3>${esc(g.full_name)}</h3><button class="modal-x" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="fld"><label>Full name</label><input id="g-name" value="${esc(g.full_name||'')}"></div>
      <div class="fld"><label>Nationality</label><input id="g-nat" value="${esc(g.nationality||'')}" placeholder="Optional"></div>
      <div class="fld"><label>Phone</label><input id="g-phone" value="${esc(g.phone||'')}" placeholder="Real number, captured at check-in"></div>
      <div class="fld"><label>Email</label><input id="g-email" value="${esc(g.email||'')}" placeholder="Direct email, not the platform alias"></div>
      <div class="fld full"><label>Tags</label><div class="g-chips" id="g-tagpick" style="margin:0">${GUEST_TAGS.map(x=>`<button type="button" class="g-chip ${tags.includes(x)?'active':''}" data-tag="${x}">${x}</button>`).join('')}</div></div>
      <div class="fld full"><label>Notes</label><input id="g-notes" value="${esc(g.notes||'')}" placeholder="Preferences, complaints, anything worth remembering"></div>
      <div class="fld full"><label><input id="g-consent" type="checkbox" ${g.marketing_ok?'checked':''} style="width:auto;margin-right:8px">Happy to be contacted directly by JOOD</label></div>
      <div class="full" style="font-size:.82rem;color:var(--mid);line-height:1.7;border-top:1px solid var(--border);padding-top:12px">
        <strong>${s.stays}</strong> stay${s.stays!==1?'s':''} · <strong>${s.nights}</strong> night${s.nights!==1?'s':''} · lifetime <strong>${money(s.value)}</strong><br>
        ${s.first?'First stay '+fmtDate(s.first):''}${s.last&&s.last!==s.first?' · last '+fmtDate(s.last):''}${s.units.length?' · '+esc(s.units.join(', ')):''}${s.sources.length?' · via '+esc(s.sources.join(', ')):''}
      </div>
    </div>
    <div class="modal-foot"><div class="modal-note" id="m-note"></div><div class="modal-actions"><button class="btn-cancel" onclick="closeModal()">Cancel</button><button class="btn-save" onclick="saveGuest('${g.id}')">Save guest</button></div></div>`);
  $('#g-tagpick').querySelectorAll('[data-tag]').forEach(b=> b.onclick=()=>b.classList.toggle('active'));
}
async function saveGuest(id){
  const name=$('#g-name').value.trim();
  if(!name){ $('#m-note').textContent='Enter a name.'; return; }
  const tags=[...$('#g-tagpick').querySelectorAll('[data-tag].active')].map(b=>b.dataset.tag);
  const row={ id, full_name:name, nationality:$('#g-nat').value.trim()||null,
    phone:$('#g-phone').value.trim()||null, email:$('#g-email').value.trim()||null,
    tags, notes:$('#g-notes').value.trim()||null, marketing_ok:$('#g-consent').checked };
  try { await store.saveGuest(row); }
  catch(e){ $('#m-note').textContent = e.message; return; }
  await loadData(); closeModal(); toast('Guest updated'); rerender();
}
function exportGuestsCSV(){
  const rows=[['Guest','Phone','Email','Nationality','Tags','Consent','Stays','Nights','Lifetime value','First stay','Last stay','Units','Sources','Notes']];
  guestRows().forEach(({g,s})=>rows.push([g.full_name,g.phone||'',g.email||'',g.nationality||'',(g.tags||[]).join(' / '),g.marketing_ok?'Yes':'No',s.stays,s.nights,s.value,s.first||'',s.last||'',s.units.join(' / '),s.sources.join(' / '),g.notes||'']));
  download('jood-guests.csv',rows); toast('Guest list exported');
}

/* ── BACKUP & TRASH ────────────────────────────────────────
   Two safety nets: a full export you hold yourself, and a trash view so
   nothing removed in the app is ever actually destroyed.               */
let trashCache=null;
async function renderBackup(){
  const p=$('#panel-backup');
  if (!state.user || state.user.role !== 'admin'){
    p.innerHTML='<div class="empty-note">Backup and trash are available to JOOD staff only.</div>';
    return;
  }
  p.innerHTML=`
    <div class="section-head"><div><div class="eyebrow">Safety net</div><h2>Backup &amp; trash</h2></div></div>
    <div class="bk-grid">
      <div class="bk-card">
        <h3>Download everything</h3>
        <p>One JSON file with every unit, guest, booking, expense and payout — including trashed records. Keep a copy outside Supabase.</p>
        <button class="btn-sm solid" onclick="downloadBackup('json')">Download JSON</button>
        <button class="btn-sm" onclick="downloadBackup('csv')">CSV bundle</button>
      </div>
      <div class="bk-card">
        <h3>What's in the database</h3>
        <p>Live records right now, for the units in your scope.</p>
        <div class="bk-counts">
          <span>Units<b>${state.units.length}</b></span>
          <span>Guests<b>${state.data.guests.length}</b></span>
          <span>Bookings<b>${state.data.bookings.length}</b></span>
          <span>Expenses<b>${state.data.expenses.length}</b></span>
          <span>Payouts<b>${state.data.payouts.length}</b></span>
        </div>
      </div>
    </div>
    <div class="section-head" style="margin-bottom:14px"><div><div class="eyebrow">Recoverable</div><h2 style="font-size:1.35rem">Trash</h2></div>
      <div class="row-actions"><button class="btn-sm" onclick="loadTrash(true)">Refresh</button></div></div>
    <div id="bk-trash"><div class="empty-note">Loading…</div></div>
    <div class="bk-note" style="margin-top:26px">
      Removing anything in this app only hides it — the row keeps its data and shows up here until you restore it. For protection against losing the whole Supabase project, turn on daily backups in your Supabase plan, and take an occasional full dump:
      <br><br><code>pg_dump "postgres://postgres:[PASSWORD]@db.pbhudkzimquvwfsecslw.supabase.co:5432/postgres" &gt; jood-backup.sql</code>
    </div>`;
  loadTrash(!trashCache);
}
const TRASH_LABEL={units:'Unit',bookings:'Booking',expenses:'Expense',payouts:'Payout',guests:'Guest'};
function trashTitle(table,r){
  if(table==='units')    return r.name;
  if(table==='bookings') return r.guest_name+' · '+fmtRange(r.checkin,r.checkout);
  if(table==='expenses') return (r.description||r.category)+' · '+money(r.amount);
  if(table==='payouts')  return (r.note||'Owner payout')+' · '+money(r.amount);
  return r.full_name;
}
async function loadTrash(reload){
  const box=$('#bk-trash'); if(!box) return;
  if (!state.user || state.user.role !== 'admin'){ box.innerHTML=''; return; }
  if(reload||!trashCache){
    box.innerHTML='<div class="empty-note">Loading…</div>';
    try { trashCache=await store.trash(); } catch(e){ box.innerHTML='<div class="empty-note">'+esc(e.message)+'</div>'; return; }
  }
  const rows=[];
  Object.keys(TRASH_LABEL).forEach(t=>(trashCache[t]||[]).forEach(r=>rows.push({t,r})));
  rows.sort((a,b)=> (b.r.deleted_at||'').localeCompare(a.r.deleted_at||''));
  if(!rows.length){ box.innerHTML='<div class="empty-note">Trash is empty — nothing has been removed.</div>'; return; }
  box.innerHTML='<div class="table-wrap"><table><thead><tr><th>Type</th><th>Record</th><th>Unit</th><th>Removed</th><th></th></tr></thead><tbody id="tt"></tbody></table></div>';
  const t=$('#tt');
  rows.forEach(({t:tbl,r})=>{
    t.appendChild(el(`<tr>
      <td><span class="tag">${TRASH_LABEL[tbl]}</span></td>
      <td class="cell-strong">${esc(trashTitle(tbl,r))}</td>
      <td class="cell-sub">${tbl==='units'||tbl==='guests'?'—':esc(unitName(r.unit_id))}</td>
      <td class="cell-sub">${r.deleted_at?fmtDate(r.deleted_at.slice(0,10)):'—'}</td>
      <td class="num"><button class="row-btn" data-rs="${tbl}:${r.id}">Restore</button></td>
    </tr>`));
  });
  t.querySelectorAll('[data-rs]').forEach(b=> b.onclick=()=>restoreRow(b.dataset.rs));
}
async function restoreRow(key){
  const [table,id]=key.split(':');
  try { await store.restore(table,id); } catch(e){ toast(e.message); return; }
  if(table==='units') state.units=await store.units(state.user);
  await loadData(); buildUnitFilter(); buildPeriodFilter(); $('#periodFilter').value=state.period;
  trashCache=null; toast(TRASH_LABEL[table]+' restored'); renderBackup();
}
async function downloadBackup(fmt){
  if (!state.user || state.user.role !== 'admin'){ toast('JOOD staff only.'); return; }
  toast('Preparing backup…');
  let all; try { all=await store.everything(); } catch(e){ toast(e.message); return; }
  const stamp=new Date().toISOString().slice(0,10);
  if(fmt==='json'){
    const blob=new Blob([JSON.stringify({ exported_at:new Date().toISOString(), source:'JOOD Guest & Finance Tracker', data:all }, null, 2)],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='jood-backup-'+stamp+'.json'; a.click();
    toast('Backup downloaded'); return;
  }
  // CSV bundle: one file per table, fired sequentially so browsers don't drop them
  const tables=Object.keys(all).filter(t=>all[t].length);
  for(let i=0;i<tables.length;i++){
    const t=tables[i], recs=all[t];
    const cols=[...new Set(recs.flatMap(r=>Object.keys(r)))];
    const rows=[cols, ...recs.map(r=>cols.map(c=>{ const v=r[c]; return v==null?'':(typeof v==='object'?JSON.stringify(v):v); }))];
    setTimeout(()=>download('jood-'+t+'-'+stamp+'.csv',rows), i*350);
  }
  toast(tables.length+' CSV files downloading');
}

/* ── REPORTS ─────────────────────────────────────────────── */
function renderReports(){
  $('#panel-reports').innerHTML=`
    <div class="section-head"><div><div class="eyebrow">Performance · all data in scope</div><h2>Reports &amp; trends</h2></div></div>
    <div class="rep-grid">
      <div class="chart-card"><h3>Revenue vs expenses</h3><div class="lede">Monthly gross income and costs</div><div class="chart-box"><canvas id="cRev"></canvas></div></div>
      <div class="chart-card"><h3>Income by source</h3><div class="lede">Share of gross bookings</div><div class="chart-box sm"><canvas id="cSrc"></canvas></div></div>
    </div>
    <div class="rep-grid">
      <div class="chart-card"><h3>Occupancy trend</h3><div class="lede">% of nights booked per month</div><div class="chart-box"><canvas id="cOcc"></canvas></div></div>
      <div class="chart-card"><h3>Expenses by category</h3><div class="lede">Where money goes</div><div class="chart-box sm"><canvas id="cCat"></canvas></div></div>
    </div>`;
  Object.values(charts).forEach(c=>c&&c.destroy());
  const ids=scopedUnitIds();
  const months=lastMonths(6);
  const font={ family:'Geist, sans-serif' }; Chart.defaults.font.family='Geist, sans-serif'; Chart.defaults.color='#8A6663';
  const gross=months.map(m=>state.data.bookings.filter(b=>ids.includes(b.unit_id)&&b.checkin.slice(0,7)===m).reduce((s,b)=>s+ +b.total,0));
  const costs=months.map(m=>{
    const e=state.data.expenses.filter(x=>ids.includes(x.unit_id)&&x.date.slice(0,7)===m).reduce((s,x)=>s+ +x.amount,0);
    const f=state.data.bookings.filter(b=>ids.includes(b.unit_id)&&b.checkin.slice(0,7)===m).reduce((s,b)=>s+ +b.platform_fee,0);
    return e+f;
  });
  const labels=months.map(m=>new Date(m+'-01').toLocaleDateString('en',{month:'short'}));
  charts.rev=new Chart($('#cRev'),{ type:'bar', data:{ labels, datasets:[
    { label:'Gross income', data:gross, backgroundColor:'#351E1C', borderRadius:5, maxBarThickness:26 },
    { label:'Costs', data:costs, backgroundColor:'#FF6037', borderRadius:5, maxBarThickness:26 } ]},
    options:{ maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{boxWidth:10,boxHeight:10,usePointStyle:true,pointStyle:'circle'}}}, scales:{ y:{ grid:{color:'rgba(53,30,28,.08)'}, ticks:{callback:v=>v>=1000?(v/1000)+'k':v} }, x:{grid:{display:false}} } } });

  const srcData=SOURCES.map(s=>state.data.bookings.filter(b=>ids.includes(b.unit_id)&&b.source===s).reduce((sum,b)=>sum+ +b.total,0));
  charts.src=new Chart($('#cSrc'),{ type:'doughnut', data:{ labels:SOURCES, datasets:[{ data:srcData, backgroundColor:SOURCES.map(s=>SRC_COLOR[s]), borderWidth:2, borderColor:'#F5F4ED' }]},
    options:{ maintainAspectRatio:false, cutout:'62%', plugins:{legend:{position:'right',labels:{boxWidth:9,boxHeight:9,usePointStyle:true,pointStyle:'circle',padding:12}}} } });

  const occData=months.map(m=>occupancyFor(m,ids));
  charts.occ=new Chart($('#cOcc'),{ type:'line', data:{ labels, datasets:[{ data:occData, borderColor:'#A0C9CB', backgroundColor:'rgba(160,201,203,.18)', fill:true, tension:.35, pointBackgroundColor:'#351E1C', pointRadius:4 }]},
    options:{ maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y:{min:0,max:100,grid:{color:'rgba(53,30,28,.08)'},ticks:{callback:v=>v+'%'}}, x:{grid:{display:false}} } } });

  const catData=CATS.map(c=>state.data.expenses.filter(e=>ids.includes(e.unit_id)&&e.category===c).reduce((s,e)=>s+ +e.amount,0));
  charts.cat=new Chart($('#cCat'),{ type:'doughnut', data:{ labels:CATS, datasets:[{ data:catData, backgroundColor:CATS.map(c=>CAT_COLOR[c]), borderWidth:2, borderColor:'#F5F4ED' }]},
    options:{ maintainAspectRatio:false, cutout:'62%', plugins:{legend:{position:'right',labels:{boxWidth:9,boxHeight:9,usePointStyle:true,pointStyle:'circle',padding:10}}} } });
}
function lastMonths(n){ const out=[]; const d=new Date(); for(let i=n-1;i>=0;i--){ out.push(ymOf(new Date(d.getFullYear(),d.getMonth()-i,1))); } return out; }
function occupancyFor(ym,ids){
  const units=ids.length||1, avail=units*daysInMonth(ym);
  const start=+new Date(ym+'-01'), end=+new Date(new Date(ym+'-01').getFullYear(),new Date(ym+'-01').getMonth()+1,1);
  let occ=0; state.data.bookings.filter(b=>ids.includes(b.unit_id)).forEach(b=>{ const s=Math.max(+new Date(b.checkin),start),e=Math.min(+new Date(b.checkout),end); if(e>s) occ+=Math.round((e-s)/864e5); });
  return Math.min(100,Math.round(occ/avail*100));
}

/* ── MODALS / CRUD ───────────────────────────────────────── */
function unitOptions(sel){ return state.units.map(u=>`<option value="${u.id}" ${u.id===sel?'selected':''}>${esc(u.name)}</option>`).join(''); }
function openModal(html){ $('#modal').innerHTML=html; $('#modalBg').classList.add('show'); }
function closeModal(){ $('#modalBg').classList.remove('show'); }

function openUnitsModal(){
  const rows=state.units.map(u=>{
    const cnt=state.data.bookings.filter(b=>b.unit_id===u.id).length;
    return `<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)">
      <div style="flex:1;min-width:0"><div class="cell-strong">${esc(u.name)}</div><div class="cell-sub">${esc(u.location||'—')} · ${u.bedrooms||1} BR · ${cnt} booking${cnt!==1?'s':''}</div>
        <div class="cell-sub" style="color:var(--orange)">Model ${MODELS[unitModel(u)].no} · ${esc(modelSummary(u))}</div></div>
      <button class="row-btn" data-mu="${u.id}">Model</button>
      <button class="row-btn del" style="opacity:1" data-du="${u.id}">Remove</button></div>`;
  }).join('') || `<div class="empty-note" style="padding:20px 0">No units yet — add your first below.</div>`;
  openModal(`
    <div class="modal-head"><h3>Manage units</h3><button class="modal-x" onclick="closeModal()">✕</button></div>
    <div class="modal-body" style="grid-template-columns:1fr">
      <div class="full">${rows}</div>
      <div class="full" style="border-top:1px solid var(--border);padding-top:16px;margin-top:2px">
        <div class="eyebrow">Add a unit</div>
        <div style="display:grid;grid-template-columns:1.4fr 1.4fr .7fr;gap:10px;margin-top:8px">
          <div class="fld"><label>Name</label><input id="nu-name" placeholder="e.g. Zamalek Nile View 07B"></div>
          <div class="fld"><label>Location</label><input id="nu-loc" placeholder="Zamalek · Cairo"></div>
          <div class="fld"><label>Bedrooms</label><input id="nu-br" type="number" min="0" value="1"></div>
        </div>
      </div>
    </div>
    <div class="modal-foot"><div class="modal-note" id="m-note"></div><div class="modal-actions"><button class="btn-cancel" onclick="closeModal()">Close</button><button class="btn-save" onclick="addUnit()">Add unit</button></div></div>`);
  $('#modal').querySelectorAll('[data-du]').forEach(x=>x.onclick=()=>confirmDeleteUnit(x.dataset.du));
  $('#modal').querySelectorAll('[data-mu]').forEach(x=>x.onclick=()=>openModelModal(x.dataset.mu));
}

/* Investment model per unit — this is what makes the owner payout automatic. */
function openModelModal(id){
  const u=state.units.find(x=>x.id===id); if(!u) return;
  const m=unitModel(u);
  openModal(`
    <div class="modal-head"><h3>Investment model — ${esc(u.name)}</h3><button class="modal-x" onclick="openUnitsModal()">✕</button></div>
    <div class="modal-body" style="grid-template-columns:1fr">
      <div class="fld full"><label>Model</label><select id="mm-model">
        <option value="commission"  ${m==='commission'?'selected':''}>01 · Furnished Unit — JOOD commission</option>
        <option value="partnership" ${m==='partnership'?'selected':''}>02 · Full Partnership — revenue split</option>
        <option value="guaranteed"  ${m==='guaranteed'?'selected':''}>03 · Guaranteed Income — fixed monthly rent</option>
      </select></div>
      <div class="fld full" id="mm-f-commission"><label>JOOD commission (%)</label><input id="mm-comm" type="number" min="0" max="100" step="0.5" value="${u.commission_pct!=null?u.commission_pct:25}"></div>
      <div class="fld full" id="mm-f-partnership"><label>Owner's share (%) — remainder is JOOD's</label><input id="mm-split" type="number" min="0" max="100" step="0.5" value="${u.owner_split_pct!=null?u.owner_split_pct:60}"></div>
      <div class="fld full" id="mm-f-guaranteed"><label>Fixed monthly rent (${CCY})</label><input id="mm-rent" type="number" min="0" value="${u.guaranteed_rent||0}"></div>
      <div class="fld full"><label>Note (contract reference, review date…)</label><input id="mm-note" value="${esc(u.model_note||'')}" placeholder="e.g. 5-year contract signed Mar 2026"></div>
      <div class="full" style="font-size:.82rem;color:var(--mid);line-height:1.65;border-top:1px solid var(--border);padding-top:12px">
        Owner payout is calculated on <strong>net after platform fees</strong>. JOOD absorbs operating expenses, and the guest cleaning fee is treated as a pass-through to JOOD — neither reduces nor adds to the owner's entitlement.
      </div>
    </div>
    <div class="modal-foot"><div class="modal-note" id="m-note"></div><div class="modal-actions"><button class="btn-cancel" onclick="openUnitsModal()">Cancel</button><button class="btn-save" onclick="saveModel('${id}')">Save model</button></div></div>`);
  const sync=()=>{ const v=$('#mm-model').value;
    ['commission','partnership','guaranteed'].forEach(k=>{ $('#mm-f-'+k).style.display = k===v?'':'none'; }); };
  $('#mm-model').onchange=sync; sync();
}
async function saveModel(id){
  const row={ id, model:$('#mm-model').value,
    commission_pct:+$('#mm-comm').value||0,
    owner_split_pct:+$('#mm-split').value||0,
    guaranteed_rent:+$('#mm-rent').value||0,
    model_note:$('#mm-note').value.trim() };
  try { await store.save('units', row); }
  catch(e){ $('#m-note').textContent = e.message; return; }
  state.units=await store.units(state.user);
  toast('Model updated'); rerender(); openUnitsModal();
}
async function addUnit(){
  const name=$('#nu-name').value.trim();
  if(!name){ $('#m-note').textContent='Enter a unit name.'; return; }
  await store.addUnit(name,$('#nu-loc').value.trim(),$('#nu-br').value,state.user);
  state.units=await store.units(state.user); await loadData();
  buildUnitFilter(); buildPeriodFilter(); $('#periodFilter').value=state.period;
  toast('Unit added'); openUnitsModal();
}
function confirmDeleteUnit(id){
  const u=state.units.find(u=>u.id===id); const cnt=state.data.bookings.filter(b=>b.unit_id===id).length;
  openModal(`<div class="modal-head"><h3>Remove unit?</h3><button class="modal-x" onclick="openUnitsModal()">✕</button></div>
    <div class="modal-body" style="grid-template-columns:1fr"><div class="full" style="font-size:.88rem;color:var(--mid)">Removing <strong>${esc(u.name)}</strong> hides it along with its ${cnt} booking${cnt!==1?'s':''} and related records. Nothing is deleted — restore the unit from <strong>Backup &amp; trash</strong> and its full history comes back.</div></div>
    <div class="modal-foot"><div></div><div class="modal-actions"><button class="btn-cancel" onclick="openUnitsModal()">Cancel</button><button class="btn-save" style="background:var(--garnet)" onclick="doDeleteUnit('${id}')">Remove unit</button></div></div>`);
}
async function doDeleteUnit(id){
  await store.removeUnit(id);
  if(state.unitId===id) state.unitId='all';
  state.units=await store.units(state.user); await loadData();
  buildUnitFilter(); buildPeriodFilter(); $('#periodFilter').value=state.period;
  trashCache=null; toast('Unit moved to trash'); rerender(); openUnitsModal();
}

function openBookingModal(b){
  const isNew=!b; b=b||{};
  const defUnit=b.unit_id||(state.unitId!=='all'?state.unitId:state.units[0]&&state.units[0].id);
  openModal(`
    <div class="modal-head"><h3>${isNew?'Add booking':'Edit booking'}</h3><button class="modal-x" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="fld full"><label>Guest name</label><input id="f-guest" value="${esc(b.guest_name||'')}" placeholder="Full name"></div>
      <div class="fld"><label>Unit</label><select id="f-unit">${unitOptions(defUnit)}</select></div>
      <div class="fld"><label>Source</label><select id="f-source">${SOURCES.map(s=>`<option ${s===(b.source||'Direct')?'selected':''}>${s}</option>`).join('')}</select></div>
      <div class="fld"><label>Check-in</label><input id="f-in" type="date" value="${b.checkin||''}"></div>
      <div class="fld"><label>Check-out</label><input id="f-out" type="date" value="${b.checkout||''}"></div>
      <div class="fld"><label>Guests</label><input id="f-guests" type="number" min="1" value="${b.guests||2}"></div>
      <div class="fld"><label>Nightly rate (${CCY})</label><input id="f-rate" type="number" min="0" value="${b.nightly_rate||''}" placeholder="0"></div>
      <div class="fld"><label>Platform fee (${CCY})</label><input id="f-fee" type="number" min="0" value="${b.platform_fee||0}"></div>
      <div class="fld"><label>Cleaning fee (${CCY})</label><input id="f-clean" type="number" min="0" value="${b.cleaning_fee||0}"></div>
      <div class="fld"><label>Payment status</label><select id="f-status"><option ${b.payment_status==='Paid'?'selected':''}>Paid</option><option ${b.payment_status!=='Paid'?'selected':''}>Pending</option></select></div>
      <div class="fld"><label>Total override (${CCY})</label><input id="f-total" type="number" min="0" value="${b.total||''}" placeholder="auto = rate × nights"></div>
      <div class="fld"><label>Phone</label><input id="f-phone" value="${esc(b.phone||'')}"></div>
      <div class="fld"><label>Email</label><input id="f-email" type="email" value="${esc(b.email||'')}"></div>
      <div class="fld full"><label>Notes</label><textarea id="f-notes" placeholder="Requests, preferences…">${esc(b.notes||'')}</textarea></div>
    </div>
    <div class="modal-foot"><div class="modal-note" id="m-note"></div><div class="modal-actions"><button class="btn-cancel" onclick="closeModal()">Cancel</button><button class="btn-save" onclick="saveBooking('${b.id||''}')">${isNew?'Add booking':'Save'}</button></div></div>`);
}
async function saveBooking(id){
  const g=$('#f-guest').value.trim(); const ci=$('#f-in').value, co=$('#f-out').value;
  if(!g){ $('#m-note').textContent='Guest name is required.'; return; }
  if(!ci||!co||co<=ci){ $('#m-note').textContent='Enter a valid check-in / check-out.'; return; }
  const nights=nightsBetween(ci,co); const rate=+$('#f-rate').value||0;
  const total=+$('#f-total').value || rate*nights;
  const row={ unit_id:$('#f-unit').value, guest_name:g, source:$('#f-source').value, checkin:ci, checkout:co,
    nights, guests:+$('#f-guests').value||1, nightly_rate:rate, total, platform_fee:+$('#f-fee').value||0,
    cleaning_fee:+$('#f-clean').value||0, payment_status:$('#f-status').value, phone:$('#f-phone').value.trim(),
    email:$('#f-email').value.trim(), notes:$('#f-notes').value.trim() };
  if(id) row.id=id;
  try {
    // keep the guest book in step: one record per person, across units and platforms
    if (state.user.role==='admin')
      row.guest_id = await store.linkGuest({ name:g, phone:row.phone, email:row.email });
  } catch(e){ /* guest linking must never block the booking itself */ }
  try { await store.save('bookings',row); } catch(e){ $('#m-note').textContent = e.message; return; }
  await loadData(); buildPeriodFilter(); $('#periodFilter').value=state.period;
  closeModal(); toast(id?'Booking updated':'Booking added'); rerender();
}

function openExpenseModal(e){
  const isNew=!e; e=e||{};
  const defUnit=e.unit_id||(state.unitId!=='all'?state.unitId:state.units[0]&&state.units[0].id);
  openModal(`
    <div class="modal-head"><h3>${isNew?'Add expense':'Edit expense'}</h3><button class="modal-x" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="fld full"><label>Description</label><input id="e-desc" value="${esc(e.description||'')}" placeholder="e.g. AC servicing"></div>
      <div class="fld"><label>Unit</label><select id="e-unit">${unitOptions(defUnit)}</select></div>
      <div class="fld"><label>Category</label><select id="e-cat">${CATS.map(c=>`<option ${c===(e.category||'Cleaning')?'selected':''}>${c}</option>`).join('')}</select></div>
      <div class="fld"><label>Date</label><input id="e-date" type="date" value="${e.date||new Date().toISOString().slice(0,10)}"></div>
      <div class="fld"><label>Amount (${CCY})</label><input id="e-amt" type="number" min="0" value="${e.amount||''}" placeholder="0"></div>
    </div>
    <div class="modal-foot"><div class="modal-note" id="m-note"></div><div class="modal-actions"><button class="btn-cancel" onclick="closeModal()">Cancel</button><button class="btn-save" onclick="saveExpense('${e.id||''}')">${isNew?'Add expense':'Save'}</button></div></div>`);
}
async function saveExpense(id){
  const amt=+$('#e-amt').value; if(!amt){ $('#m-note').textContent='Enter an amount.'; return; }
  const row={ unit_id:$('#e-unit').value, description:$('#e-desc').value.trim(), category:$('#e-cat').value, date:$('#e-date').value, amount:amt };
  if(id) row.id=id;
  try { await store.save('expenses',row); } catch(e){ $('#m-note').textContent = e.message; return; }
  await loadData(); buildPeriodFilter(); $('#periodFilter').value=state.period;
  closeModal(); toast(id?'Expense updated':'Expense added'); rerender();
}

function openPayoutModal(){
  const defUnit=state.unitId!=='all'?state.unitId:state.units[0]&&state.units[0].id;
  const due=defUnit?ownerDueForUnit(defUnit):0, paid=defUnit?paidForUnit(defUnit):0;
  const owed=Math.max(0, Math.round((due-paid)*100)/100);
  const u=state.units.find(x=>x.id===defUnit);
  openModal(`
    <div class="modal-head"><h3>Record payout</h3><button class="modal-x" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="fld"><label>Unit</label><select id="p-unit">${unitOptions(defUnit)}</select></div>
      <div class="fld"><label>Date</label><input id="p-date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
      <div class="fld"><label>Amount (${CCY})</label><input id="p-amt" type="number" min="0" value="${owed||''}" placeholder="0"></div>
      <div class="fld"><label>Note</label><input id="p-note" placeholder="Owner payout"></div>
      <div class="full" style="font-size:.82rem;color:var(--mid);line-height:1.6">
        ${u?`<strong>${esc(u.name)}</strong> — ${esc(modelSummary(u))}. `:''}Calculated entitlement for this period ${money1(due)}, already paid ${money(paid)} → <strong>${money1(owed)} outstanding</strong>. Amount is pre-filled; override it if you're transferring something else.
      </div>
    </div>
    <div class="modal-foot"><div class="modal-note" id="m-note"></div><div class="modal-actions"><button class="btn-cancel" onclick="closeModal()">Cancel</button><button class="btn-save" onclick="savePayout()">Record</button></div></div>`);
}
async function savePayout(){
  const amt=+$('#p-amt').value; if(!amt){ $('#m-note').textContent='Enter an amount.'; return; }
  try { await store.save('payouts',{ unit_id:$('#p-unit').value, date:$('#p-date').value, amount:amt, note:$('#p-note').value.trim()||'Owner payout' }); }
  catch(e){ $('#m-note').textContent = e.message; return; }
  await loadData(); buildPeriodFilter(); $('#periodFilter').value=state.period; closeModal(); toast('Payout recorded'); rerender();
}

function confirmDelete(table,id,label){
  openModal(`<div class="modal-head"><h3>Delete ${label}?</h3><button class="modal-x" onclick="closeModal()">✕</button></div>
    <div class="modal-body"><div class="full" style="font-size:.88rem;color:var(--mid)">This ${label} moves to the trash. Nothing is destroyed — you can restore it any time from <strong>Backup &amp; trash</strong>.</div></div>
    <div class="modal-foot"><div></div><div class="modal-actions"><button class="btn-cancel" onclick="closeModal()">Cancel</button><button class="btn-save" style="background:var(--garnet)" onclick="doDelete('${table}','${id}','${label}')">Delete</button></div></div>`);
}
async function doDelete(table,id,label){
  try { await store.remove(table,id); } catch(e){ const n=$('#m-note'); if(n) n.textContent = e.message; return; }
  await loadData(); buildPeriodFilter(); $('#periodFilter').value=state.period; closeModal(); trashCache=null; toast(label[0].toUpperCase()+label.slice(1)+' deleted'); rerender(); }

/* ── CSV EXPORT ──────────────────────────────────────────── */
function download(name,rows){
  const csv=rows.map(r=>r.map(c=>{ const s=(c==null?'':String(c)); return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; }).join(',')).join('\n');
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download=name; a.click();
}
function exportBookingsCSV(){
  const rows=[['Guest','Unit','Source','Check-in','Check-out','Nights','Guests','Nightly rate','Total','Platform fee','Cleaning fee','Status','Phone','Email','Notes']];
  periodBookings().sort((a,b)=>a.checkin<b.checkin?1:-1).forEach(b=>rows.push([b.guest_name,unitName(b.unit_id),b.source,b.checkin,b.checkout,b.nights,b.guests,b.nightly_rate,b.total,b.platform_fee,b.cleaning_fee,b.payment_status,b.phone,b.email,b.notes]));
  download(`jood-bookings${state.period?'-'+state.period:''}.csv`,rows); toast('Bookings exported');
}
function exportFinanceCSV(){
  const rows=[['Type','Description','Unit','Category/Source','Date','Amount']];
  periodBookings().forEach(b=>rows.push(['Income',b.guest_name,unitName(b.unit_id),b.source,b.checkin,b.total]));
  periodExpenses().forEach(e=>rows.push(['Expense',e.description,unitName(e.unit_id),e.category,e.date,-e.amount]));
  periodPayouts().forEach(p=>rows.push(['Payout',p.note,unitName(p.unit_id),'',p.date,-p.amount]));
  state.units.filter(u=>scopedUnitIds().includes(u.id)).forEach(u=>{
    rows.push(['Owner due','Calculated · '+modelSummary(u),u.name,MODELS[unitModel(u)].label,state.period||'all time',ownerDueForUnit(u.id)]);
  });
  download(`jood-finances${state.period?'-'+state.period:''}.csv`,rows); toast('Finances exported');
}
