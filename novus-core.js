/* ═══════════════════════════════════════════════════════════════
   novus-core.js — Shared IIFE
   Inventory Control Dashboard · Plant 1730

   Exposes: NovusCore
   Requires: supabase-js (CDN), msal-browser (CDN)
═══════════════════════════════════════════════════════════════ */

const NovusCore = (() => {

  /* ── Credentials ─────────────────────────────────────────── */
  const SUPABASE_URL = 'https://uaedzaghxmtgqxqnypwa.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhZWR6YWdoeG10Z3F4cW55cHdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NjI4MzcsImV4cCI6MjA5NTAzODgzN30.ceXfwcmFT7zRtFVB29dh_-WiVN5WJ1RZQkb23gzr700';

  const MSAL_CONFIG = {
    auth: {
      clientId:    '319eaae5-9137-4b50-a1eb-ffb52ca93401',
      authority:   'https://login.microsoftonline.com/56b8cda7-546e-49b1-ab41-957d6fafacdd',
      redirectUri: window.location.href.replace(/\/[^\/]*(\?.*)?$/, '/index.html'),
    },
    cache: { cacheLocation: 'sessionStorage' }
  };

  /* ── Constants ───────────────────────────────────────────── */

  const IRA_THRESHOLD = 0.5;

  // ── Fiscal Calendar (4-4-5, Novus Foods FY2026–FY2027) ──────
  // Each entry: { fy, period, qtr, start, end }
  // start/end are ISO date strings 'YYYY-MM-DD', inclusive.
  const FISCAL_CALENDAR = [
    // FY2026
    { fy:2026, period:1,  qtr:1, start:'2026-01-04', end:'2026-01-31' },
    { fy:2026, period:2,  qtr:1, start:'2026-02-01', end:'2026-02-28' },
    { fy:2026, period:3,  qtr:1, start:'2026-03-01', end:'2026-04-04' },
    { fy:2026, period:4,  qtr:2, start:'2026-04-05', end:'2026-05-02' },
    { fy:2026, period:5,  qtr:2, start:'2026-05-03', end:'2026-05-30' },
    { fy:2026, period:6,  qtr:2, start:'2026-05-31', end:'2026-07-04' },
    { fy:2026, period:7,  qtr:3, start:'2026-07-05', end:'2026-08-01' },
    { fy:2026, period:8,  qtr:3, start:'2026-08-02', end:'2026-08-29' },
    { fy:2026, period:9,  qtr:3, start:'2026-08-30', end:'2026-10-03' },
    { fy:2026, period:10, qtr:4, start:'2026-10-04', end:'2026-10-31' },
    { fy:2026, period:11, qtr:4, start:'2026-11-01', end:'2026-11-28' },
    { fy:2026, period:12, qtr:4, start:'2026-11-29', end:'2027-01-02' },
    // FY2027
    { fy:2027, period:1,  qtr:1, start:'2027-01-03', end:'2027-01-30' },
    { fy:2027, period:2,  qtr:1, start:'2027-01-31', end:'2027-02-27' },
    { fy:2027, period:3,  qtr:1, start:'2027-02-28', end:'2027-04-03' },
    { fy:2027, period:4,  qtr:2, start:'2027-04-04', end:'2027-05-01' },
    { fy:2027, period:5,  qtr:2, start:'2027-05-02', end:'2027-05-29' },
    { fy:2027, period:6,  qtr:2, start:'2027-05-30', end:'2027-07-03' },
    { fy:2027, period:7,  qtr:3, start:'2027-07-04', end:'2027-07-31' },
    { fy:2027, period:8,  qtr:3, start:'2027-08-01', end:'2027-08-28' },
    { fy:2027, period:9,  qtr:3, start:'2027-08-29', end:'2027-10-02' },
    { fy:2027, period:10, qtr:4, start:'2027-10-03', end:'2027-10-30' },
    { fy:2027, period:11, qtr:4, start:'2027-10-31', end:'2027-11-27' },
    { fy:2027, period:12, qtr:4, start:'2027-11-28', end:'2028-01-01' },
  ];

  // ── Warehouse zones (20 total) ────────────────────────────────
  // WI and WO intentionally excluded per plant layout.
  const ZONES = {
    'Main Warehouse': ['WA','WB','WC','WD','WE','WF','WG','WH','WJ','WK','WL','WM','WN','WP'],
    'Freezer':        ['FA','FB','FC','FD'],
    'GR-Zone':        ['GR-ZONE'],
    'Label Room':     ['LABEL ROOM'],
  };
  const ALL_ZONES = Object.values(ZONES).flat(); // 20 locations

  // ── Adjustment reason categories ──────────────────────────────
  const ADJ_CATEGORIES = [
    'Shipping Adjustment',
    'Sampling',
    'Inventory Difference',
    'Disposals',
    'Damaged',
  ];

  // ── Default weekly checklist tasks ────────────────────────────
  const DEFAULT_TASKS = [
    'Review SAP Error Logs',
    'Finalize & Submit Cycle Counts',
    'Update FEFO / Expiry Tracker',
    'Investigate High-Variance Items',
    'Confirm Pending Goods Receipts',
    'Audit Scrap Recording Accuracy',
    'Review Open Root Cause Tickets',
    'Send Weekly KPI Summary to Manager',
    'Update Knowledge Base (SOPs / OPLs)',
    'Confirm Physical Inventory Adjustments Posted',
  ];

  /* ── Fiscal period lookup ─────────────────────────────────────
     Returns the fiscal period object for a given JS Date,
     plus a short label ("FY2026-P05") and display string.
     Returns null if the date is outside all known periods.
  ──────────────────────────────────────────────────────────── */
  function getFiscalPeriod(date = new Date()) {
    const ds = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    const p  = FISCAL_CALENDAR.find(fp => ds >= fp.start && ds <= fp.end);
    if (!p) return null;
    const label = `FY${p.fy}-P${String(p.period).padStart(2,'0')}`;
    return {
      ...p, label,
      display: `FY${p.fy} · Period ${p.period} · Q${p.qtr}  (${p.start} → ${p.end})`,
    };
  }

  /* ── Supabase client (singleton) ─────────────────────────── */
  let _sb = null;
  function getSupabase() {
    if (!_sb) _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    return _sb;
  }

  /* ── MSAL client (singleton) ─────────────────────────────── */
  let _msal = null;
  function getMsal() {
    if (!_msal) _msal = new msal.PublicClientApplication(MSAL_CONFIG);
    return _msal;
  }

  /* ── Auth guard ──────────────────────────────────────────── */
  async function requireAuth() {
    const msalInstance = getMsal();
    await msalInstance.initialize();
    await msalInstance.handleRedirectPromise();
    const accounts = msalInstance.getAllAccounts();
    if (!accounts.length) { window.location.href = 'index.html'; return null; }
    return accounts[0];
  }

  async function signOut() {
    const msalInstance = getMsal();
    await msalInstance.initialize();
    await msalInstance.logoutRedirect({ postLogoutRedirectUri: 'index.html' });
  }

  /* ── Sidebar navigation ──────────────────────────────────── */
  const NAV_ITEMS = [
    { id:'hub',                  href:'hub.html',                  icon:'📊', label:'KPI Dashboard'       },
    { id:'cycle-count',          href:'cycle-count.html',          icon:'🔄', label:'Cycle Count'          },
    { id:'cycle-count-schedule', href:'cycle-count-schedule.html', icon:'📅', label:'Count Schedule'       },
    { id:'cycle-count-report',   href:'cycle-count-report.html',   icon:'📈', label:'Count Report'         },
    { id:'adjustment-tracker',   href:'adjustment-tracker.html',   icon:'📝', label:'Adjustment Tracker'   },
    { id:'root-cause',           href:'root-cause.html',           icon:'🔍', label:'Root Cause Log'       },
    { id:'knowledge-base',       href:'knowledge-base.html',       icon:'📚', label:'Knowledge Base'       },
  ];

  function renderNav(activePage, account) {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    const name  = account?.name || account?.username || 'Supervisor';
    const links = NAV_ITEMS.map(item => `
      <a href="${item.href}" class="nav-link ${activePage === item.id ? 'active' : ''}">
        <span class="nav-icon">${item.icon}</span>${item.label}
      </a>`).join('');
    sidebar.innerHTML = `
      <div class="sidebar-brand">
        <div class="plant">Novus Foods · Plant 1730</div>
        <div class="title">Inventory Control Hub</div>
      </div>
      <div class="sidebar-nav">
        <div class="sidebar-section">Navigation</div>
        ${links}
      </div>
      <div class="sidebar-footer">
        <div class="sidebar-user">
          <div class="name">${name}</div>
          <div>Inventory Control</div>
        </div>
        <button onclick="NovusCore.signOut()" class="btn btn-ghost btn-sm" style="width:100%">
          Sign Out
        </button>
      </div>`;
  }

  /* ── Toast ───────────────────────────────────────────────── */
  function toast(message, type = 'info') {
    let c = document.getElementById('toast-container');
    if (!c) { c = document.createElement('div'); c.id = 'toast-container'; document.body.appendChild(c); }
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    c.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  /* ── Utilities ───────────────────────────────────────────── */
  function fmtDate(iso)       { if (!iso) return '—'; return iso.slice(0,16).replace('T',' '); }
  function varColor(pct)      { const p = parseFloat(pct); return p <= IRA_THRESHOLD ? 'green' : p <= IRA_THRESHOLD*5 ? 'amber' : 'red'; }
  function calcIRA(rows)      {
    if (!rows?.length) return { ira:null, total:0, accurate:0, inaccurate:0 };
    const total    = rows.length;
    const accurate = rows.filter(r => parseFloat(r.variance_pct) <= IRA_THRESHOLD).length;
    return { ira:((accurate/total)*100).toFixed(1), total, accurate, inaccurate:total-accurate };
  }
  function isoWeek(date = new Date()) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    const y = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    return `${d.getUTCFullYear()}-W${String(Math.ceil(((d-y)/86400000+1)/7)).padStart(2,'0')}`;
  }
  // Today as YYYY-MM-DD local
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  /* ── Public API ──────────────────────────────────────────── */
  return {
    getSupabase, getMsal, requireAuth, signOut,
    renderNav, toast, fmtDate, varColor, calcIRA, isoWeek, todayStr,
    getFiscalPeriod, FISCAL_CALENDAR,
    IRA_THRESHOLD, DEFAULT_TASKS, ZONES, ALL_ZONES, ADJ_CATEGORIES,
  };

})();
