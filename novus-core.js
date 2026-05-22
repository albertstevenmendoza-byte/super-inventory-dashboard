/* ═══════════════════════════════════════════════════════════════
   novus-core.js — Shared IIFE
   Inventory Control Dashboard · Plant 1730

   Exposes: NovusCore
   Requires: supabase-js (CDN), msal-browser (CDN)
═══════════════════════════════════════════════════════════════ */

const NovusCore = (() => {

  /* ── Config ──────────────────────────────────────────────────
     Credentials for the inv-control-1730 Supabase project.
     MSAL credentials match the existing Ops Hub Azure AD app.
  ──────────────────────────────────────────────────────────── */
  const SUPABASE_URL = 'https://uaedzaghxmtgqxqnypwa.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhZWR6YWdoeG10Z3F4cW55cHdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NjI4MzcsImV4cCI6MjA5NTAzODgzN30.ceXfwcmFT7zRtFVB29dh_-WiVN5WJ1RZQkb23gzr700';

  const MSAL_CONFIG = {
    auth: {
      clientId:    '319eaae5-9137-4b50-a1eb-ffb52ca93401',
      authority:   'https://login.microsoftonline.com/56b8cda7-546e-49b1-ab41-957d6fafacdd',
      // Dynamically builds the redirect URI so it works on localhost AND GitHub Pages
      redirectUri: window.location.href.replace(/\/[^\/]*(\?.*)?$/, '/index.html'),
    },
    cache: { cacheLocation: 'sessionStorage' }
  };

  // IRA accuracy threshold — items within ±0.5% count as accurate
  const IRA_THRESHOLD = 0.5;

  // Default weekly supervisor tasks
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

  /* ── Auth guard ──────────────────────────────────────────────
     Call at the top of every post-login page's init() function.
     Returns the logged-in account, or redirects to index.html.
  ──────────────────────────────────────────────────────────── */
  async function requireAuth() {
    const msalInstance = getMsal();
    await msalInstance.initialize();
    // Process any auth code that MSAL appended to the URL after redirect
    await msalInstance.handleRedirectPromise();
    const accounts = msalInstance.getAllAccounts();
    if (!accounts.length) {
      window.location.href = 'index.html';
      return null;
    }
    return accounts[0];
  }

  /* ── Sign out ─────────────────────────────────────────────── */
  async function signOut() {
    const msalInstance = getMsal();
    await msalInstance.initialize();
    await msalInstance.logoutRedirect({ postLogoutRedirectUri: 'index.html' });
  }

  /* ── Sidebar navigation ──────────────────────────────────────
     Renders into <nav id="sidebar">.
     activePage: 'hub' | 'cycle-count' | 'root-cause' | 'knowledge-base'
  ──────────────────────────────────────────────────────────── */
  const NAV_ITEMS = [
    { id: 'hub',            href: 'hub.html',            icon: '📊', label: 'KPI Dashboard'   },
    { id: 'cycle-count',    href: 'cycle-count.html',    icon: '🔄', label: 'Cycle Count'      },
    { id: 'root-cause',     href: 'root-cause.html',     icon: '🔍', label: 'Root Cause Log'   },
    { id: 'knowledge-base', href: 'knowledge-base.html', icon: '📚', label: 'Knowledge Base'   },
  ];

  function renderNav(activePage, account) {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    const name = account?.name || account?.username || 'Supervisor';
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

  /* ── Toast notification ──────────────────────────────────────
     type: 'success' | 'error' | 'info'
  ──────────────────────────────────────────────────────────── */
  function toast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  /* ── Utility functions ───────────────────────────────────────*/

  // Format ISO timestamp to readable "YYYY-MM-DD HH:MM"
  function fmtDate(iso) {
    if (!iso) return '—';
    return iso.slice(0, 16).replace('T', ' ');
  }

  // Variance color class (for CSS)
  function varColor(pct) {
    const p = parseFloat(pct);
    if (p <= IRA_THRESHOLD)     return 'green';
    if (p <= IRA_THRESHOLD * 5) return 'amber';
    return 'red';
  }

  // Calculate IRA from an array of cycle count rows
  function calcIRA(rows) {
    if (!rows || !rows.length) return { ira: null, total: 0, accurate: 0, inaccurate: 0 };
    const total     = rows.length;
    const accurate  = rows.filter(r => parseFloat(r.variance_pct) <= IRA_THRESHOLD).length;
    return {
      ira:        ((accurate / total) * 100).toFixed(1),
      total,
      accurate,
      inaccurate: total - accurate,
    };
  }

  // Returns current ISO week label e.g. "2025-W28"
  function isoWeek(date = new Date()) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNum   = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }

  /* ── Public API ──────────────────────────────────────────── */
  return {
    getSupabase, getMsal, requireAuth, signOut,
    renderNav, toast, fmtDate, varColor, calcIRA, isoWeek,
    IRA_THRESHOLD, DEFAULT_TASKS,
  };

})();
