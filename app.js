/* =============================================
   AssetTrack — app.js
   Equipment & Asset Tracker | Supabase Edition
   ============================================= */

const SUPABASE_URL = 'https://jluwcvspmybrqnrqjjbf.supabase.co/rest/v1';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsdXdjdnNwbXlicnFucnFqamJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2NTA5NjMsImV4cCI6MjEwMTIyNjk2M30.X-m6KBjKrmS-TCxb6VTQLhhwP--PnorHeXFm2zoIi8I';

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

// State
let allEquipment = [];
let allLogs = [];
let equipmentMap = {}; // id -> equipment obj

/* ─────────────────────────────────────────────
   API helpers
───────────────────────────────────────────── */
async function sbGet(table, query = '') {
  const res = await fetch(`${SUPABASE_URL}/${table}?${query}`, { headers });
  if (!res.ok) throw new Error(`GET ${table} failed: ${res.status}`);
  return res.json();
}

async function sbPost(table, body) {
  const res = await fetch(`${SUPABASE_URL}/${table}`, {
    method: 'POST', headers, body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`POST ${table} failed: ${err}`);
  }
  return res.json();
}

async function sbPatch(table, id, body) {
  const res = await fetch(`${SUPABASE_URL}/${table}?id=eq.${id}`, {
    method: 'PATCH', headers, body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PATCH ${table} failed: ${err}`);
  }
  return res.json();
}

/* ─────────────────────────────────────────────
   Data Loaders
───────────────────────────────────────────── */
async function loadEquipment() {
  try {
    const data = await sbGet('equipment', 'order=id.asc');
    allEquipment = data;
    equipmentMap = {};
    data.forEach(e => { equipmentMap[e.id] = e; });
    populateCategoryFilter(data);
    renderEquipmentTable(data);
    renderStats(data);
  } catch (e) {
    showToast('โหลดข้อมูลอุปกรณ์ไม่สำเร็จ: ' + e.message, 'error');
    document.getElementById('equipment-tbody').innerHTML =
      '<tr><td colspan="5" class="text-center py-8 text-red-400">เกิดข้อผิดพลาด กรุณาลองใหม่</td></tr>';
  }
}

async function loadLogs(limit = 10) {
  try {
    let query = 'order=id.desc';
    if (limit) query += `&limit=${limit}`;
    const data = await sbGet('borrow_logs', query);
    allLogs = data;
    renderLogsTable(data, 'logs-tbody', true);
    document.getElementById('log-count-label').textContent = `${allLogs.length} รายการ`;
    return data;
  } catch (e) {
    showToast('โหลดประวัติการยืมไม่สำเร็จ: ' + e.message, 'error');
    return [];
  }
}

async function loadAllLogs() {
  const data = await loadLogs(null);
  renderLogsTable(data, 'logs-tbody-full', false);
}

/* ─────────────────────────────────────────────
   Renderers
───────────────────────────────────────────── */
function statusBadge(status) {
  const map = {
    'Available':   { cls: 'badge-green',  icon: 'fa-circle-check',    label: 'ว่าง' },
    'Borrowed':    { cls: 'badge-orange', icon: 'fa-hand-holding',    label: 'ถูกยืม' },
    'Maintenance': { cls: 'badge-red',    icon: 'fa-screwdriver-wrench', label: 'ซ่อม' }
  };
  const s = map[status] || { cls: 'badge-gray', icon: 'fa-circle', label: status };
  return `<span class="badge ${s.cls}"><i class="fas ${s.icon} text-xs"></i>${s.label}</span>`;
}

function logStatusBadge(status) {
  if (status === 'Active') return `<span class="badge badge-orange"><i class="fas fa-clock text-xs"></i>กำลังยืม</span>`;
  return `<span class="badge badge-blue"><i class="fas fa-check text-xs"></i>คืนแล้ว</span>`;
}

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' });
}

function isOverdue(log) {
  if (log.status !== 'Active') return false;
  const due = new Date(log.expected_return_date);
  return due < new Date();
}

function renderEquipmentTable(data, tbodyId = 'equipment-tbody') {
  const tbody = document.getElementById(tbodyId);
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-12 text-gray-400">
      <div class="flex flex-col items-center gap-2">
        <i class="fas fa-box-open text-3xl text-gray-200"></i>
        <p class="text-sm">ยังไม่มีอุปกรณ์ในระบบ</p>
        <button class="btn-primary mt-1 text-xs" onclick="openModal('modal-add-equipment')">+ บันทึกอุปกรณ์แรก</button>
      </div>
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
          : `<span class="text-xs text-gray-400">ไม่พร้อมใช้งาน</span>`}
      </td>
    </tr>
  `).join('');
}

function renderLogsTable(data, tbodyId, limit = false) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  const rows = limit ? data.slice(0, 10) : data;
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-gray-400">
      <i class="fas fa-clipboard-list text-2xl text-gray-200 block mb-2"></i> ยังไม่มีประวัติการยืม
    </td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(log => {
    const eq = equipmentMap[log.equipment_id];
    const overdue = isOverdue(log);
    return `
    <tr class="${overdue ? 'overdue-row' : ''}">
      <td>
        <div class="font-medium text-gray-700">${eq ? eq.name : `ID:${log.equipment_id}`}</div>
        <div class="text-xs text-indigo-400 font-mono">${eq ? eq.asset_code : ''}</div>
      </td>
      <td class="font-medium">${log.borrower_name}</td>
      <td>${fmtDate(log.borrow_date)}</td>
      <td>
        <span class="${overdue ? 'text-red-500 font-semibold' : ''}">${fmtDate(log.expected_return_date)}</span>
        ${overdue ? '<span class="ml-1 badge badge-red text-xs py-0">เกินกำหนด!</span>' : ''}
      </td>
      <td>${fmtDate(log.actual_return_date)}</td>
      <td>${logStatusBadge(log.status)}</td>
    </tr>`;
  }).join('');
}

function renderStats(data) {
  document.getElementById('stat-total').textContent = data.length;
  document.getElementById('stat-available').textContent = data.filter(e => e.status === 'Available').length;
  document.getElementById('stat-borrowed').textContent = data.filter(e => e.status === 'Borrowed').length;
  document.getElementById('stat-maintenance').textContent = data.filter(e => e.status === 'Maintenance').length;
}

function populateCategoryFilter(data) {
  const cats = [...new Set(data.map(e => e.category).filter(Boolean))].sort();
  const sel = document.getElementById('filter-category');
  sel.innerHTML = '<option value="">— หมวดหมู่ทั้งหมด —</option>' +
    cats.map(c => `<option value="${c}">${c}</option>`).join('');
}

/* ─────────────────────────────────────────────
   Filters & Search
───────────────────────────────────────────── */
function applyFilters() {
  const cat = document.getElementById('filter-category').value;
  const status = document.getElementById('filter-status').value;
  const search = document.getElementById('global-search').value.toLowerCase().trim();
  let filtered = allEquipment;
  if (cat) filtered = filtered.filter(e => e.category === cat);
  if (status) filtered = filtered.filter(e => e.status === status);
  if (search) filtered = filtered.filter(e =>
    e.name.toLowerCase().includes(search) ||
    e.asset_code.toLowerCase().includes(search)
  );
  renderEquipmentTable(filtered, 'equipment-tbody');
}

function handleSearch() { applyFilters(); }

/* ─────────────────────────────────────────────
   Navigation
───────────────────────────────────────────── */
const sections = ['dashboard', 'equipment', 'history'];
const sectionTitles = {
  dashboard: ['Pages / Dashboard', 'Main Dashboard'],
  equipment: ['Pages / อุปกรณ์', 'อุปกรณ์ทั้งหมด'],
  history: ['Pages / ประวัติ', 'ประวัติการยืม-คืน']
};

function showSection(name) {
  sections.forEach(s => {
    document.getElementById(`section-${s}`).classList.toggle('hidden', s !== name);
  });
  document.querySelectorAll('.sidebar-link').forEach((el, i) => {
    el.classList.toggle('active', ['dashboard', 'equipment', 'history'][i] === name);
  });
  const [bc, title] = sectionTitles[name] || ['', ''];
  document.getElementById('breadcrumb').textContent = bc;
  document.getElementById('page-title').textContent = title;

  if (name === 'equipment') {
    renderEquipmentTable(allEquipment, 'equipment-tbody-2');
  } else if (name === 'history') {
    loadAllLogs();
  }
}

/* ─────────────────────────────────────────────
   Modals
───────────────────────────────────────────── */
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function closeModalOutside(e, id) { if (e.target === e.currentTarget) closeModal(id); }

/* ─────────────────────────────────────────────
   Add Equipment
───────────────────────────────────────────── */
async function saveEquipment() {
  const code = document.getElementById('eq-asset-code').value.trim();
  const name = document.getElementById('eq-name').value.trim();
  const category = document.getElementById('eq-category').value.trim();
  const status = document.getElementById('eq-status').value;

  if (!code || !name || !category) {
    showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'error'); return;
  }

  const btn = document.getElementById('btn-save-equipment');
  setLoading(btn, true, 'บันทึกอุปกรณ์');
  try {
    await sbPost('equipment', { asset_code: code, name, category, status });
    closeModal('modal-add-equipment');
    showToast('บันทึกอุปกรณ์สำเร็จ!');
    clearForm(['eq-asset-code', 'eq-name', 'eq-category']);
    await loadEquipment();
  } catch (e) {
    showToast('บันทึกไม่สำเร็จ: ' + e.message, 'error');
  } finally {
    setLoading(btn, false, 'บันทึกอุปกรณ์');
  }
}

/* ─────────────────────────────────────────────
   Borrow
───────────────────────────────────────────── */
function openBorrowModal(eqId) {
  const eq = equipmentMap[eqId];
  if (!eq) return;
  document.getElementById('borrow-eq-id').value = eqId;
  document.getElementById('borrow-eq-name').textContent = `${eq.asset_code} — ${eq.name}`;
  document.getElementById('borrow-name').value = '';
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('borrow-date').value = today;
  document.getElementById('return-date').value = '';
  openModal('modal-borrow');
}

async function confirmBorrow() {
  const eqId = document.getElementById('borrow-eq-id').value;
  const borrower = document.getElementById('borrow-name').value.trim();
  const borrowDate = document.getElementById('borrow-date').value;
  const returnDate = document.getElementById('return-date').value;

  if (!borrower || !borrowDate || !returnDate) {
    showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'error'); return;
  }
  if (returnDate < borrowDate) {
    showToast('วันคืนต้องไม่น้อยกว่าวันยืม', 'error'); return;
  }

  const btn = document.getElementById('btn-confirm-borrow');
  setLoading(btn, true, 'ยืนยันการยืม');
  try {
    // Insert borrow log
    await sbPost('borrow_logs', {
      equipment_id: parseInt(eqId),
      borrower_name: borrower,
      borrow_date: borrowDate,
      expected_return_date: returnDate,
      actual_return_date: null,
      status: 'Active'
    });
    // Update equipment status
    await sbPatch('equipment', eqId, { status: 'Borrowed' });
    closeModal('modal-borrow');
    showToast(`บันทึกการยืม "${document.getElementById('borrow-eq-name').textContent}" สำเร็จ!`);
    await Promise.all([loadEquipment(), loadLogs(10)]);
  } catch (e) {
    showToast('บันทึกการยืมไม่สำเร็จ: ' + e.message, 'error');
  } finally {
    setLoading(btn, false, 'ยืนยันการยืม');
  }
}

/* ─────────────────────────────────────────────
   Return
───────────────────────────────────────────── */
async function openReturnModal(eqId) {
  const eq = equipmentMap[eqId];
  if (!eq) return;
  // Fetch active log for this equipment
  try {
    const logs = await sbGet('borrow_logs', `equipment_id=eq.${eqId}&status=eq.Active&order=id.desc&limit=1`);
    if (!logs.length) {
      showToast('ไม่พบรายการยืมที่ active สำหรับอุปกรณ์นี้', 'error'); return;
    }
    const log = logs[0];
    document.getElementById('return-eq-id').value = eqId;
    document.getElementById('return-log-id').value = log.id;
    document.getElementById('return-eq-name').textContent = `${eq.asset_code} — ${eq.name}`;
    document.getElementById('return-borrower-name').textContent = log.borrower_name;
    document.getElementById('return-borrow-date-display').textContent = fmtDate(log.borrow_date);
    document.getElementById('return-due-date-display').textContent = fmtDate(log.expected_return_date);
    document.getElementById('actual-return-date').value = new Date().toISOString().split('T')[0];
    openModal('modal-return');
  } catch (e) {
    showToast('โหลดข้อมูลการยืมไม่สำเร็จ: ' + e.message, 'error');
  }
}

async function confirmReturn() {
  const eqId = document.getElementById('return-eq-id').value;
  const logId = document.getElementById('return-log-id').value;
  const actualDate = document.getElementById('actual-return-date').value;
  if (!actualDate) {
    showToast('กรุณาระบุวันที่คืนจริง', 'error'); return;
  }
  const btn = document.getElementById('btn-confirm-return');
  setLoading(btn, true, 'ยืนยันการคืน');
  try {
    // Update borrow log
    await sbPatch('borrow_logs', logId, { actual_return_date: actualDate, status: 'Returned' });
    // Update equipment status
    await sbPatch('equipment', eqId, { status: 'Available' });
    closeModal('modal-return');
    showToast(`คืนอุปกรณ์ "${document.getElementById('return-eq-name').textContent}" สำเร็จ!`);
    await Promise.all([loadEquipment(), loadLogs(10)]);
  } catch (e) {
    showToast('บันทึกการคืนไม่สำเร็จ: ' + e.message, 'error');
  } finally {
    setLoading(btn, false, 'ยืนยันการคืน');
  }
}

/* ─────────────────────────────────────────────
   UI Helpers
───────────────────────────────────────────── */
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  const inner = document.getElementById('toast-inner');
  const icon = document.getElementById('toast-icon');
  const msgEl = document.getElementById('toast-msg');
  inner.className = `toast-inner ${type === 'success' ? 'toast-success' : 'toast-error'}`;
  icon.className = `fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`;
  msgEl.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3200);
}

function setLoading(btn, loading, label) {
  if (loading) {
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner" style="border-top-color:#fff;border-color:#ffffff44;width:16px;height:16px;"></div> กำลังบันทึก...`;
  } else {
    btn.disabled = false;
    btn.innerHTML = `<i class="fas fa-save text-xs"></i> ${label}`;
  }
}

function clearForm(ids) {
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
}

/* ─────────────────────────────────────────────
   Init
───────────────────────────────────────────── */
async function init() {
  await loadEquipment();
  const logs = await loadLogs(10);
  renderLogsTable(logs, 'logs-tbody', true);
}

document.addEventListener('DOMContentLoaded', init);
