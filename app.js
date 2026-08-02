/* =====================================================
   AssetTrack — app.js
   Equipment & Asset Tracker
   Supabase + Google OAuth Authentication
   ===================================================== */

const SUPABASE_URL = 'https://jluwcvspmybrqnrqjjbf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsdXdjdnNwbXlicnFucnFqamJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2NTA5NjMsImV4cCI6MjEwMTIyNjk2M30.X-m6KBjKrmS-TCxb6VTQLhhwP--PnorHeXFm2zoIi8I';
const REST_URL     = `${SUPABASE_URL}/rest/v1`;

/* ─────────────────────────────────────────────────────
   Supabase Client (Auth SDK)
───────────────────────────────────────────────────── */
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    autoRefreshToken : true,
    persistSession   : true,
    detectSessionInUrl: true       // ← จับ OAuth redirect hash อัตโนมัติ
  }
});

/* ─────────────────────────────────────────────────────
   App State
───────────────────────────────────────────────────── */
let currentUser  = null;
let authToken    = null;
let allEquipment = [];
let allLogs      = [];
let equipmentMap = {};

/* ─────────────────────────────────────────────────────
   Headers (ใช้ JWT ของ user เมื่อ login แล้ว)
───────────────────────────────────────────────────── */
function getHeaders() {
  return {
    'apikey'       : SUPABASE_KEY,
    'Authorization': `Bearer ${authToken || SUPABASE_KEY}`,
    'Content-Type' : 'application/json',
    'Prefer'       : 'return=representation'
  };
}

/* ─────────────────────────────────────────────────────
   ░░  AUTHENTICATION  ░░
───────────────────────────────────────────────────── */

/**
 * เข้าสู่ระบบด้วย Google OAuth
 * Supabase จะ redirect ไป Google แล้วกลับมาพร้อม access_token ใน URL hash
 */
async function signInWithGoogle() {
  const btn = document.getElementById('btn-google-login');
  const errBox = document.getElementById('login-error');
  errBox.classList.add('hidden');
  btn.disabled = true;
  btn.innerHTML = `
    <div class="spinner" style="width:20px;height:20px;border:2.5px solid #e0e7ff;border-top-color:#4c6ef5;flex-shrink:0;"></div>
    กำลังเชื่อมต่อ Google...`;

  try {
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname,
        queryParams: {
          access_type: 'offline',
          prompt      : 'select_account'   // บังคับให้เลือก account ทุกครั้ง
        }
      }
    });
    if (error) throw error;
    // หากไม่ redirect → error จะถูก throw ด้านบน
  } catch (err) {
    errBox.textContent = 'เข้าสู่ระบบไม่สำเร็จ: ' + err.message;
    errBox.classList.remove('hidden');
    resetGoogleBtn();
  }
}

/** ออกจากระบบ */
async function signOut() {
  closeDropdown();
  try {
    await sb.auth.signOut();
  } catch (_) {}
  currentUser = null;
  authToken   = null;
  goToLogin();
  showToast('ออกจากระบบเรียบร้อยแล้ว', 'info');
}

/** Reset ปุ่ม Google กลับสภาวะเดิม */
function resetGoogleBtn() {
  const btn = document.getElementById('btn-google-login');
  if (!btn) return;
  btn.disabled = false;
  btn.innerHTML = `
    <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" style="width:22px;height:22px;flex-shrink:0">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
    เข้าสู่ระบบด้วย Google`;
}

/* ─────────────────────────────────────────────────────
   UI Screen Transitions
───────────────────────────────────────────────────── */
function goToLogin() {
  document.getElementById('app').classList.add('hidden');
  document.getElementById('auth-loading').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  resetGoogleBtn();
}

function goToApp(user) {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('auth-loading').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  renderUserProfile(user);
  initApp();
}

function showLoading() {
  document.getElementById('auth-loading').classList.remove('hidden');
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.add('hidden');
}

/* ─────────────────────────────────────────────────────
   User Profile Rendering
───────────────────────────────────────────────────── */
function renderUserProfile(user) {
  const meta   = user.user_metadata || {};
  const name   = meta.full_name || meta.name || user.email?.split('@')[0] || 'ผู้ใช้';
  const email  = user.email || '';
  const avatar = meta.avatar_url || meta.picture || '';

  // Sidebar
  document.getElementById('sidebar-name').textContent  = name;
  document.getElementById('sidebar-email').textContent = email;
  document.getElementById('sidebar-avatar-wrap').innerHTML = makeAvatar(avatar, name, 36);

  // Topbar dropdown
  document.getElementById('topbar-avatar-wrap').innerHTML = makeAvatar(avatar, name, 36);
  document.getElementById('dropdown-name').textContent  = name;
  document.getElementById('dropdown-email').textContent = email;
}

function makeAvatar(src, name, size) {
  const initial = (name || '?')[0].toUpperCase();
  if (src) {
    return `<img src="${src}" alt="${name}"
      style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;border:2px solid #e0e7ff;"
      onerror="this.outerHTML=makeFallbackAvatar('${initial}',${size})" />`;
  }
  return fallbackAvatarHtml(initial, size);
}

function fallbackAvatarHtml(initial, size) {
  return `<div class="user-avatar-fallback"
    style="width:${size}px;height:${size}px;font-size:${Math.round(size*0.38)}px">${initial}</div>`;
}

/* ─────────────────────────────────────────────────────
   Dropdown Menu
───────────────────────────────────────────────────── */
function toggleDropdown() {
  document.getElementById('user-dropdown').classList.toggle('hidden');
}
function closeDropdown() {
  document.getElementById('user-dropdown')?.classList.add('hidden');
}
document.addEventListener('click', (e) => {
  if (!document.getElementById('topbar-avatar-btn')?.contains(e.target)) {
    closeDropdown();
  }
});

/* ─────────────────────────────────────────────────────
   ░░  AUTH STATE LISTENER — Entry Point  ░░
   onAuthStateChange จะถูกเรียกทันทีที่โหลดหน้า
   และทุกครั้งที่ session เปลี่ยนแปลง (login/logout/refresh)
───────────────────────────────────────────────────── */
sb.auth.onAuthStateChange((event, session) => {
  console.log('[Auth]', event, session?.user?.email || 'no user');

  if (event === 'SIGNED_IN' && session?.user) {
    // ✅ Login สำเร็จ (ทั้ง OAuth redirect และ session ที่มีอยู่เดิม)
    currentUser = session.user;
    authToken   = session.access_token;
    goToApp(session.user);

  } else if (event === 'TOKEN_REFRESHED' && session?.user) {
    // ✅ Token ถูก refresh อัตโนมัติ → อัปเดต token ใหม่
    authToken = session.access_token;

  } else if (event === 'SIGNED_OUT' || (!session && event === 'INITIAL_SESSION')) {
    // ❌ ไม่มี session → ไปหน้า Login
    currentUser = null;
    authToken   = null;
    goToLogin();
  }
});

/* ─────────────────────────────────────────────────────
   REST API Helpers
───────────────────────────────────────────────────── */
async function sbGet(table, query = '') {
  const res = await fetch(`${REST_URL}/${table}?${query}`, { headers: getHeaders() });
  if (!res.ok) throw new Error(`GET ${table}: ${res.status}`);
  return res.json();
}

async function sbPost(table, body) {
  const res = await fetch(`${REST_URL}/${table}`, {
    method: 'POST', headers: getHeaders(), body: JSON.stringify(body)
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`POST ${table}: ${t}`); }
  return res.json();
}

async function sbPatch(table, id, body) {
  const res = await fetch(`${REST_URL}/${table}?id=eq.${id}`, {
    method: 'PATCH', headers: getHeaders(), body: JSON.stringify(body)
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`PATCH ${table}: ${t}`); }
  return res.json();
}

/* ─────────────────────────────────────────────────────
   Data Loaders
───────────────────────────────────────────────────── */
async function loadEquipment() {
  try {
    const data = await sbGet('equipment', 'order=id.asc');
    allEquipment = data;
    equipmentMap = {};
    data.forEach(e => { equipmentMap[e.id] = e; });
    populateCategoryFilter(data);
    renderEquipmentTable(data, 'equipment-tbody');
    renderStats(data);
  } catch (e) {
    showToast('โหลดข้อมูลอุปกรณ์ไม่สำเร็จ: ' + e.message, 'error');
    setTableError('equipment-tbody', 5, 'ไม่สามารถโหลดข้อมูลได้');
  }
}

async function loadLogs(limit = 10) {
  try {
    let q = 'order=id.desc';
    if (limit) q += `&limit=${limit}`;
    const data = await sbGet('borrow_logs', q);
    allLogs = data;
    const lbl = document.getElementById('log-count-label');
    if (lbl) lbl.textContent = `${data.length} รายการ`;
    return data;
  } catch (e) {
    showToast('โหลดประวัติการยืมไม่สำเร็จ: ' + e.message, 'error');
    return [];
  }
}

async function loadAllLogs() {
  const data = await loadLogs(null);
  renderLogsTable(data, 'logs-tbody-full');
}

/* ─────────────────────────────────────────────────────
   Renderers
───────────────────────────────────────────────────── */
function statusBadge(status) {
  const map = {
    Available  : ['badge-green',  'fa-circle-check',       'ว่าง'],
    Borrowed   : ['badge-orange', 'fa-hand-holding',       'ถูกยืม'],
    Maintenance: ['badge-red',    'fa-screwdriver-wrench', 'ซ่อม']
  };
  const [cls, icon, label] = map[status] || ['badge-gray', 'fa-circle', status];
  return `<span class="badge ${cls}"><i class="fas ${icon} text-xs"></i>${label}</span>`;
}

function logStatusBadge(status) {
  return status === 'Active'
    ? `<span class="badge badge-orange"><i class="fas fa-clock text-xs"></i>กำลังยืม</span>`
    : `<span class="badge badge-blue"><i class="fas fa-check text-xs"></i>คืนแล้ว</span>`;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('th-TH', { day:'2-digit', month:'short', year:'2-digit' });
}

function isOverdue(log) {
  return log.status === 'Active' && new Date(log.expected_return_date) < new Date();
}

function renderEquipmentTable(data, tbodyId = 'equipment-tbody') {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  if (!data.length) {
    tbody.innerHTML = `
      <tr><td colspan="5" class="text-center py-14 text-gray-400">
        <i class="fas fa-box-open text-3xl text-gray-200 block mb-3"></i>
        <p class="text-sm mb-3">ยังไม่มีอุปกรณ์ในระบบ</p>
        <button class="btn-primary text-xs" onclick="openModal('modal-add-equipment')">
          <i class="fas fa-plus text-xs"></i> เพิ่มอุปกรณ์แรก
        </button>
      </td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(eq => `
    <tr>
      <td><span class="font-mono text-indigo-500 font-semibold text-xs bg-indigo-50 px-2 py-1 rounded-md">${eq.asset_code}</span></td>
      <td class="font-medium text-gray-700">${eq.name}</td>
      <td><span class="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-md font-medium">${eq.category}</span></td>
      <td>${statusBadge(eq.status)}</td>
      <td class="text-center">
        ${eq.status === 'Available'
          ? `<button class="btn-success" onclick="openBorrowModal(${eq.id})"><i class="fas fa-hand-holding text-xs"></i> ยืม</button>`
          : eq.status === 'Borrowed'
          ? `<button class="btn-warning" onclick="openReturnModal(${eq.id})"><i class="fas fa-undo text-xs"></i> คืน</button>`
          : `<span class="text-xs text-gray-400 italic">กำลังซ่อม</span>`}
      </td>
    </tr>`).join('');
}

function renderLogsTable(data, tbodyId) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-12 text-gray-400">
      <i class="fas fa-clipboard-list text-3xl text-gray-200 block mb-2"></i>
      <p class="text-sm">ยังไม่มีประวัติการยืม</p>
    </td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(log => {
    const eq = equipmentMap[log.equipment_id];
    const od = isOverdue(log);
    return `
    <tr class="${od ? 'overdue-row' : ''}">
      <td>
        <div class="font-medium text-gray-700">${eq ? eq.name : `(ID: ${log.equipment_id})`}</div>
        <div class="text-xs text-indigo-400 font-mono">${eq ? eq.asset_code : ''}</div>
      </td>
      <td class="font-medium">${log.borrower_name}</td>
      <td>${fmtDate(log.borrow_date)}</td>
      <td>
        <span class="${od ? 'text-red-500 font-semibold' : ''}">${fmtDate(log.expected_return_date)}</span>
        ${od ? '<span class="ml-1 badge badge-red" style="font-size:10px;padding:1px 7px">เกิน!</span>' : ''}
      </td>
      <td>${fmtDate(log.actual_return_date)}</td>
      <td>${logStatusBadge(log.status)}</td>
    </tr>`;
  }).join('');
}

function renderStats(data) {
  document.getElementById('stat-total').textContent       = data.length;
  document.getElementById('stat-available').textContent   = data.filter(e => e.status === 'Available').length;
  document.getElementById('stat-borrowed').textContent    = data.filter(e => e.status === 'Borrowed').length;
  document.getElementById('stat-maintenance').textContent = data.filter(e => e.status === 'Maintenance').length;
}

function populateCategoryFilter(data) {
  const cats = [...new Set(data.map(e => e.category).filter(Boolean))].sort();
  const sel  = document.getElementById('filter-category');
  sel.innerHTML = '<option value="">— หมวดหมู่ทั้งหมด —</option>' +
    cats.map(c => `<option value="${c}">${c}</option>`).join('');
}

function setTableError(tbodyId, cols, msg) {
  const el = document.getElementById(tbodyId);
  if (el) el.innerHTML = `<tr><td colspan="${cols}" class="text-center py-8 text-red-400">${msg}</td></tr>`;
}

/* ─────────────────────────────────────────────────────
   Filters & Search
───────────────────────────────────────────────────── */
function applyFilters() {
  const cat    = document.getElementById('filter-category').value;
  const status = document.getElementById('filter-status').value;
  const search = document.getElementById('global-search').value.toLowerCase().trim();
  let filtered = allEquipment;
  if (cat)    filtered = filtered.filter(e => e.category === cat);
  if (status) filtered = filtered.filter(e => e.status === status);
  if (search) filtered = filtered.filter(e =>
    e.name.toLowerCase().includes(search) || e.asset_code.toLowerCase().includes(search));
  renderEquipmentTable(filtered, 'equipment-tbody');
}
function handleSearch() { applyFilters(); }

/* ─────────────────────────────────────────────────────
   Navigation
───────────────────────────────────────────────────── */
const SECTIONS = ['dashboard', 'equipment', 'history'];
const TITLES   = {
  dashboard : ['Pages / Dashboard', 'Main Dashboard'],
  equipment : ['Pages / อุปกรณ์',   'อุปกรณ์ทั้งหมด'],
  history   : ['Pages / ประวัติ',   'ประวัติการยืม-คืน']
};

function showSection(name) {
  SECTIONS.forEach(s => document.getElementById(`section-${s}`).classList.toggle('hidden', s !== name));
  document.querySelectorAll('.sidebar-link').forEach((el, i) => {
    el.classList.toggle('active', SECTIONS[i] === name);
  });
  const [bc, title] = TITLES[name] || ['', ''];
  document.getElementById('breadcrumb').textContent = bc;
  document.getElementById('page-title').textContent  = title;
  if (name === 'equipment') renderEquipmentTable(allEquipment, 'equipment-tbody-2');
  else if (name === 'history') loadAllLogs();
}

/* ─────────────────────────────────────────────────────
   Modals
───────────────────────────────────────────────────── */
function openModal(id)  { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function closeModalOutside(e, id) { if (e.target === e.currentTarget) closeModal(id); }

/* ─────────────────────────────────────────────────────
   Add Equipment
───────────────────────────────────────────────────── */
async function saveEquipment() {
  const code     = document.getElementById('eq-asset-code').value.trim();
  const name     = document.getElementById('eq-name').value.trim();
  const category = document.getElementById('eq-category').value.trim();
  const status   = document.getElementById('eq-status').value;
  if (!code || !name || !category) { showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'error'); return; }

  const btn = document.getElementById('btn-save-equipment');
  setBtnLoading(btn, true);
  try {
    await sbPost('equipment', { asset_code: code, name, category, status });
    closeModal('modal-add-equipment');
    showToast('บันทึกอุปกรณ์สำเร็จ!');
    ['eq-asset-code','eq-name','eq-category'].forEach(id => document.getElementById(id).value = '');
    await loadEquipment();
  } catch (e) {
    showToast('บันทึกไม่สำเร็จ: ' + e.message, 'error');
  } finally {
    setBtnLoading(btn, false, '<i class="fas fa-save text-xs"></i> บันทึกอุปกรณ์');
  }
}

/* ─────────────────────────────────────────────────────
   Borrow
───────────────────────────────────────────────────── */
function openBorrowModal(eqId) {
  const eq = equipmentMap[eqId];
  if (!eq) return;
  document.getElementById('borrow-eq-id').value          = eqId;
  document.getElementById('borrow-eq-name').textContent  = `${eq.asset_code} — ${eq.name}`;
  // Pre-fill ชื่อผู้ login
  const uName = currentUser?.user_metadata?.full_name
              || currentUser?.user_metadata?.name
              || currentUser?.email?.split('@')[0] || '';
  document.getElementById('borrow-name').value = uName;
  document.getElementById('borrow-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('return-date').value = '';
  openModal('modal-borrow');
}

async function confirmBorrow() {
  const eqId     = document.getElementById('borrow-eq-id').value;
  const borrower = document.getElementById('borrow-name').value.trim();
  const bDate    = document.getElementById('borrow-date').value;
  const rDate    = document.getElementById('return-date').value;
  if (!borrower || !bDate || !rDate) { showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'error'); return; }
  if (rDate < bDate) { showToast('วันคืนต้องไม่น้อยกว่าวันยืม', 'error'); return; }

  const btn = document.getElementById('btn-confirm-borrow');
  setBtnLoading(btn, true);
  try {
    await sbPost('borrow_logs', {
      equipment_id: parseInt(eqId), borrower_name: borrower,
      borrow_date: bDate, expected_return_date: rDate,
      actual_return_date: null, status: 'Active'
    });
    await sbPatch('equipment', eqId, { status: 'Borrowed' });
    closeModal('modal-borrow');
    showToast(`บันทึกการยืม "${document.getElementById('borrow-eq-name').textContent}" สำเร็จ!`);
    await Promise.all([loadEquipment(), loadLogs(10)
      .then(d => renderLogsTable(d, 'logs-tbody'))]);
  } catch (e) {
    showToast('บันทึกการยืมไม่สำเร็จ: ' + e.message, 'error');
  } finally {
    setBtnLoading(btn, false, '<i class="fas fa-hand-holding text-xs"></i> ยืนยันการยืม');
  }
}

/* ─────────────────────────────────────────────────────
   Return
───────────────────────────────────────────────────── */
async function openReturnModal(eqId) {
  const eq = equipmentMap[eqId];
  if (!eq) return;
  try {
    const logs = await sbGet('borrow_logs',
      `equipment_id=eq.${eqId}&status=eq.Active&order=id.desc&limit=1`);
    if (!logs.length) { showToast('ไม่พบรายการยืมที่ Active สำหรับอุปกรณ์นี้', 'error'); return; }
    const log = logs[0];
    document.getElementById('return-eq-id').value              = eqId;
    document.getElementById('return-log-id').value             = log.id;
    document.getElementById('return-eq-name').textContent      = `${eq.asset_code} — ${eq.name}`;
    document.getElementById('return-borrower-name').textContent = log.borrower_name;
    document.getElementById('return-borrow-date-display').textContent = fmtDate(log.borrow_date);
    document.getElementById('return-due-date-display').textContent    = fmtDate(log.expected_return_date);
    document.getElementById('actual-return-date').value = new Date().toISOString().split('T')[0];
    openModal('modal-return');
  } catch (e) {
    showToast('โหลดข้อมูลการยืมไม่สำเร็จ: ' + e.message, 'error');
  }
}

async function confirmReturn() {
  const eqId   = document.getElementById('return-eq-id').value;
  const logId  = document.getElementById('return-log-id').value;
  const actual = document.getElementById('actual-return-date').value;
  if (!actual) { showToast('กรุณาระบุวันที่คืนจริง', 'error'); return; }

  const btn = document.getElementById('btn-confirm-return');
  setBtnLoading(btn, true);
  try {
    await sbPatch('borrow_logs', logId, { actual_return_date: actual, status: 'Returned' });
    await sbPatch('equipment',   eqId,  { status: 'Available' });
    closeModal('modal-return');
    showToast(`คืนอุปกรณ์ "${document.getElementById('return-eq-name').textContent}" สำเร็จ!`);
    await Promise.all([loadEquipment(), loadLogs(10)
      .then(d => renderLogsTable(d, 'logs-tbody'))]);
  } catch (e) {
    showToast('บันทึกการคืนไม่สำเร็จ: ' + e.message, 'error');
  } finally {
    setBtnLoading(btn, false, '<i class="fas fa-check text-xs"></i> ยืนยันการคืน');
  }
}

/* ─────────────────────────────────────────────────────
   UI Helpers
───────────────────────────────────────────────────── */
function showToast(msg, type = 'success') {
  const map = { success: ['toast-success','fa-check-circle'], error: ['toast-error','fa-exclamation-circle'], info: ['toast-info','fa-circle-info'] };
  const [cls, icon] = map[type] || map.success;
  document.getElementById('toast-inner').className = `toast-inner ${cls}`;
  document.getElementById('toast-icon').className  = `fas ${icon}`;
  document.getElementById('toast-msg').textContent  = msg;
  const t = document.getElementById('toast');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3400);
}

function setBtnLoading(btn, loading, restoreHtml = '') {
  if (loading) {
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner" style="width:16px;height:16px;border:2px solid #ffffff44;border-top-color:#fff;flex-shrink:0"></div> กำลังบันทึก...`;
  } else {
    btn.disabled  = false;
    btn.innerHTML = restoreHtml;
  }
}

/* ─────────────────────────────────────────────────────
   App Init (เรียกหลัง login สำเร็จ)
───────────────────────────────────────────────────── */
async function initApp() {
  await loadEquipment();
  const logs = await loadLogs(10);
  renderLogsTable(logs, 'logs-tbody');
}
