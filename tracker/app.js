/* ============================================================
   JOOD Tracker — application logic
   Talks only to `store` (see supabase-client.js) so it runs the
   same in demo or live Supabase mode.
   ============================================================ */
'use strict';

const state = { user:null, units:[], data:{bookings:[],expenses:[],payouts:[]},
  unitId:'all', period:'', panel:'dashboard', calMonth:null };
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

  state.units = await store.units(state.user);
  buildUnitFilter();
  await loadData();
  buildPeriodFilter();
  wireChrome();
  show('dashboard');
})();

async function loadData(){
  const ids = state.units.map(u=>u.id);
  if (!ids.length){ state.data={bookings:[],expenses:[],payouts:[]}; return; }
  const [bookings,expenses,payouts] = await Promise.all([store.bookings(ids),store.expenses(ids),store.payouts(ids)]);
  state.data = { bookings, expenses, payouts };
}

function buildUnitFilter(){
  const sel=$('#unitFilter'); sel.innerHTML='';
  sel.appendChild(el(`<option value="all">All units (${state.units.length})</option>`));
  state.units.forEach(u=> sel.appendChild(el(`<option value="${u.id}">${esc(u.name)}</option>`)));
  sel.value=state.unitId;
  sel.onchange=()=>{ state.unitId=sel.value; rerender(); };
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

const TITLES = { dashboard:['Dashboard','Overview'], bookings:['Bookings','Guests & stays'], calendar:['Calendar','Occupancy map'], finances:['Finances','Income, expenses & net'], reports:['Reports','Trends & performance'] };
const ADD = { dashboard:'Add booking', bookings:'Add booking', calendar:'Add booking', finances:'Add expense', reports:'Add booking' };
function show(name){
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
  ({dashboard:renderDashboard, bookings:renderBookings, calendar:renderCalendar, finances:renderFinances, reports:renderReports}[state.panel])();
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
  $('#panel-finances').innerHTML=`
    <div class="section-head">
      <div><div class="eyebrow">Financials${state.period?'':' · all time'}</div><h2>Income &amp; expenses</h2></div>
      <div class="row-actions">
        <button class="btn-sm" onclick="exportFinanceCSV()"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3 5l3 3 3-3M1.5 10.5h9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>Export CSV</button>
        <button class="btn-sm" onclick="openPayoutModal()">+ Payout</button>
        <button class="btn-sm solid" onclick="openExpenseModal()"><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>Add expense</button>
      </div>
    </div>
    <div class="fin-summary">
      <div class="fin-cell"><div class="k">Gross income</div><div class="v">${money(gross)}</div></div>
      <div class="fin-cell"><div class="k">Platform fees</div><div class="v neg">-${money(fees)}</div></div>
      <div class="fin-cell"><div class="k">Expenses</div><div class="v neg">-${money(expTot)}</div></div>
      <div class="fin-cell"><div class="k">Net profit</div><div class="v ${net>=0?'pos':'neg'}">${money1(net)}</div></div>
      <div class="fin-cell"><div class="k">Owner payouts</div><div class="v">${money(payTot)}</div></div>
    </div>
    <div class="fin-tabs">
      <button class="fin-tab ${finTab==='ledger'?'active':''}" data-t="ledger">Income ledger</button>
      <button class="fin-tab ${finTab==='expenses'?'active':''}" data-t="expenses">Expenses</button>
      <button class="fin-tab ${finTab==='payouts'?'active':''}" data-t="payouts">Payouts</button>
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
  } else {
    wrap.innerHTML=`<div class="table-wrap"><table><thead><tr><th>Note</th><th>Unit</th><th>Date</th><th class="num">Amount</th><th></th></tr></thead><tbody id="ft"></tbody></table></div>`;
    const t=$('#ft'); const rows=pays.sort((a,b)=>a.date<b.date?1:-1);
    if(!rows.length) t.appendChild(el(`<tr><td colspan="5"><div class="empty-note">No payouts in this period.</div></td></tr>`));
    rows.forEach(p=> { const tr=el(`<tr><td class="cell-strong">${esc(p.note||'Owner payout')}</td><td>${esc(unitName(p.unit_id))}</td><td>${fmtDate(p.date)}</td><td class="num cell-strong">${money(p.amount)}</td><td class="num"><button class="row-btn del" data-dp="${p.id}">Delete</button></td></tr>`); t.appendChild(tr); });
    t.querySelectorAll('[data-dp]').forEach(x=>x.onclick=()=>confirmDelete('payouts',x.dataset.dp,'payout'));
  }
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
      <div style="flex:1;min-width:0"><div class="cell-strong">${esc(u.name)}</div><div class="cell-sub">${esc(u.location||'—')} · ${u.bedrooms||1} BR · ${cnt} booking${cnt!==1?'s':''}</div></div>
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
    <div class="modal-body" style="grid-template-columns:1fr"><div class="full" style="font-size:.88rem;color:var(--mid)">Removing <strong>${esc(u.name)}</strong> also deletes its ${cnt} booking${cnt!==1?'s':''} plus related expenses and payouts. This can't be undone.</div></div>
    <div class="modal-foot"><div></div><div class="modal-actions"><button class="btn-cancel" onclick="openUnitsModal()">Cancel</button><button class="btn-save" style="background:var(--garnet)" onclick="doDeleteUnit('${id}')">Remove unit</button></div></div>`);
}
async function doDeleteUnit(id){
  await store.removeUnit(id);
  if(state.unitId===id) state.unitId='all';
  state.units=await store.units(state.user); await loadData();
  buildUnitFilter(); buildPeriodFilter(); $('#periodFilter').value=state.period;
  toast('Unit removed'); rerender(); openUnitsModal();
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
  await store.save('bookings',row); await loadData(); buildPeriodFilter(); $('#periodFilter').value=state.period;
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
  await store.save('expenses',row); await loadData(); buildPeriodFilter(); $('#periodFilter').value=state.period;
  closeModal(); toast(id?'Expense updated':'Expense added'); rerender();
}

function openPayoutModal(){
  const defUnit=state.unitId!=='all'?state.unitId:state.units[0]&&state.units[0].id;
  openModal(`
    <div class="modal-head"><h3>Record payout</h3><button class="modal-x" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="fld"><label>Unit</label><select id="p-unit">${unitOptions(defUnit)}</select></div>
      <div class="fld"><label>Date</label><input id="p-date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
      <div class="fld"><label>Amount (${CCY})</label><input id="p-amt" type="number" min="0" placeholder="0"></div>
      <div class="fld"><label>Note</label><input id="p-note" placeholder="Owner payout"></div>
    </div>
    <div class="modal-foot"><div class="modal-note" id="m-note"></div><div class="modal-actions"><button class="btn-cancel" onclick="closeModal()">Cancel</button><button class="btn-save" onclick="savePayout()">Record</button></div></div>`);
}
async function savePayout(){
  const amt=+$('#p-amt').value; if(!amt){ $('#m-note').textContent='Enter an amount.'; return; }
  await store.save('payouts',{ unit_id:$('#p-unit').value, date:$('#p-date').value, amount:amt, note:$('#p-note').value.trim()||'Owner payout' });
  await loadData(); buildPeriodFilter(); $('#periodFilter').value=state.period; closeModal(); toast('Payout recorded'); rerender();
}

function confirmDelete(table,id,label){
  openModal(`<div class="modal-head"><h3>Delete ${label}?</h3><button class="modal-x" onclick="closeModal()">✕</button></div>
    <div class="modal-body"><div class="full" style="font-size:.88rem;color:var(--mid)">This ${label} will be permanently removed. This can't be undone.</div></div>
    <div class="modal-foot"><div></div><div class="modal-actions"><button class="btn-cancel" onclick="closeModal()">Cancel</button><button class="btn-save" style="background:var(--garnet)" onclick="doDelete('${table}','${id}','${label}')">Delete</button></div></div>`);
}
async function doDelete(table,id,label){ await store.remove(table,id); await loadData(); buildPeriodFilter(); $('#periodFilter').value=state.period; closeModal(); toast(label[0].toUpperCase()+label.slice(1)+' deleted'); rerender(); }

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
  download(`jood-finances${state.period?'-'+state.period:''}.csv`,rows); toast('Finances exported');
}
