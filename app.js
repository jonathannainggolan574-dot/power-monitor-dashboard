// ============================================================
//  POWER MONITOR — app.js
//  STM32 Nucleo-F446RE + ESP32 + Thinger.io
// ============================================================

// ============ AUTH CONFIG ============
// Hash SHA-256 dari password. Ganti hash ini jika ingin ganti password.
// Default password: "admin123"
// Cara generate hash baru: buka browser console → run:
//   crypto.subtle.digest('SHA-256', new TextEncoder().encode('passwordbaru'))
//     .then(b => console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')))
const PASSWORD_HASH = "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9";
// =====================================

async function hashPassword(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
}

async function checkLogin() {
  const input = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');
  const btnText = document.getElementById('login-btn-text');

  if (!input) { errorEl.textContent = 'Please enter a password.'; return; }

  // Tampilkan loading state di tombol
  btn.disabled = true;
  btnText.textContent = 'Verifying...';

  const inputHash = await hashPassword(input);

  if (inputHash === PASSWORD_HASH) {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    errorEl.textContent = '';
    document.getElementById('login-password').value = '';
    startMonitoring();
  } else {
    errorEl.textContent = 'Wrong password. Please try again.';
    document.getElementById('login-password').value = '';
    document.getElementById('login-password').focus();
    btn.disabled = false;
    btnText.textContent = 'LOGIN';
  }
}

// Enter key juga bisa login
document.getElementById('login-password').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') checkLogin();
});

function logout() {
  stopMonitoring();
  // Reset raw buffer & chart
  rawBuffer.length = 0;
  chart.data.labels           = [];
  chart.data.datasets[0].data = [];
  chart.data.datasets[1].data = [];
  chart.data.datasets[2].data = [];
  chart.update('none');
  // Reset metric selector
  document.getElementById('chartMetricSelect').value = 'voltage';
  currentMetric = 'voltage';
  // Reset status
  setConnectionStatus('connecting');
  document.getElementById('last-update-time').textContent = '--:--:--';
  // Tampilkan login
  document.getElementById('dashboard').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('login-password').focus();
  document.getElementById('login-btn').disabled = false;
  document.getElementById('login-btn-text').textContent = 'LOGIN';
}

// ============ THINGER.IO CONFIG ============
const THINGER_USER = "WERR";
const DEVICE_ID    = "stm32_power_monitor";
const TOKEN        = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJzdG0zMl9wb3dlcl9tb25pdG9yIiwic3ZyIjoiYXAtc291dGhlYXN0LmF3cy50aGluZ2VyLmlvIiwidXNyIjoiV0VSUiJ9.qHE0FTr87v2M_cU5yTrIRF-3ahnpfLUYUz-_R8f2qdI";
const API_BASE     = `https://backend.thinger.io/v3/users/${THINGER_USER}/devices/${DEVICE_ID}`;
// ===========================================

async function fetchThinger(endpoint, options = {}) {
  const headers = {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json'
  };
  const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

// ============ INTERVAL MANAGEMENT ============
let fetchIntervalId = null;
let consecutiveErrors = 0;
const MAX_ERRORS = 5;

function startMonitoring() {
  consecutiveErrors = 0;
  setConnectionStatus('connecting');
  fetchData();
  fetchIntervalId = setInterval(fetchData, 1000);
}

function stopMonitoring() {
  if (fetchIntervalId !== null) {
    clearInterval(fetchIntervalId);
    fetchIntervalId = null;
  }
}

// ============ CONNECTION STATUS ============
// state: 'online' | 'offline' | 'connecting'
function setConnectionStatus(state) {
  const dot  = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  dot.className = 'dot';
  if (state === 'online')      { dot.classList.add('dot-online');  text.textContent = 'Online'; }
  else if (state === 'offline'){ dot.classList.add('dot-offline'); text.textContent = 'Device Offline'; }
  else                         { dot.classList.add('dot-connecting'); text.textContent = 'Connecting...'; }
}

// ============ TOAST NOTIFICATION ============
let toastTimer = null;
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast toast-${type}`;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = 'toast hidden'; }, 3000);
}

// ============ CHART.JS ============
const ctx = document.getElementById('trendChart').getContext('2d');

// ----------------------------------------------------------------
// RAW BUFFER — menyimpan SEMUA data selama 24 jam (86400 sampel).
// Setiap entry: { ts: Date, v1,v2,v3, i1,i2,i3, p1..p3,
//                 s1..s3, q1..q3, f1..f3, pf1..pf3 }
// ----------------------------------------------------------------
const RAW_MAX    = 86400;           // 24 jam × 3600 detik
const rawBuffer  = [];              // buffer mentah

// Window pilihan user (detik)
const WINDOWS = {
  '1h':  3600,
  '6h':  21600,
  '24h': 86400
};
const MAX_CHART_POINTS = 720;       // titik maksimum di chart (ringan di browser)

let currentMetric = 'voltage';
let currentWindow = '24h';          // default 24 jam

// Mapping field per metric & fase
const METRIC_FIELDS = {
  voltage:   { r:'v1',  s:'v2',  t:'v3'  },
  current:   { r:'i1',  s:'i2',  t:'i3'  },
  power:     { r:'p1',  s:'p2',  t:'p3'  },
  apparent:  { r:'s1',  s:'s2',  t:'s3'  },
  reactive:  { r:'q1',  s:'q2',  t:'q3'  },
  frequency: { r:'f1',  s:'f2',  t:'f3'  },
  pf:        { r:'pf1', s:'pf2', t:'pf3' }
};

const CHART_Y_SCALES = {
  voltage:  { min: 180, max: 250  },
  current:  { min: 0,   max: 15   },
  power:    { min: 0,   max: 3000 },
  apparent: { min: 0,   max: 3000 },
  reactive: { min: 0,   max: 3000 },
  frequency:{ min: 48,  max: 52   },
  pf:       { min: 0,   max: 1.0  }
};

const chart = new Chart(ctx, {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      { label: 'Phase R', data: [], borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.08)',  tension: 0.4, borderWidth: 2, pointRadius: 0, fill: true },
      { label: 'Phase S', data: [], borderColor: '#fbbf24', backgroundColor: 'rgba(251,191,36,0.08)', tension: 0.4, borderWidth: 2, pointRadius: 0, fill: true },
      { label: 'Phase T', data: [], borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.08)',  tension: 0.4, borderWidth: 2, pointRadius: 0, fill: true }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      y: {
        suggestedMin: 180, suggestedMax: 250,
        grid:  { color: 'rgba(255,255,255,0.05)' },
        ticks: { color: '#9ca3af' }
      },
      x: {
        grid:  { color: 'rgba(255,255,255,0.05)' },
        ticks: { color: '#9ca3af', maxTicksLimit: 10 }
      }
    },
    plugins: {
      legend: { labels: { color: '#e4e6eb', usePointStyle: true, pointStyleWidth: 10 } },
      tooltip: { enabled: true }
    }
  }
});

// ----------------------------------------------------------------
// Fungsi format label waktu — singkat untuk window pendek,
// tampilkan jam:menit untuk window panjang
// ----------------------------------------------------------------
function formatLabel(date, windowSec) {
  const h  = date.getHours().toString().padStart(2, '0');
  const m  = date.getMinutes().toString().padStart(2, '0');
  const s  = date.getSeconds().toString().padStart(2, '0');
  if (windowSec <= 3600)  return `${h}:${m}:${s}`;   // 1 jam → HH:MM:SS
  return `${h}:${m}`;                                  // 6 jam / 24 jam → HH:MM
}

// ----------------------------------------------------------------
// Render ulang chart dari rawBuffer sesuai window & metric aktif
// ----------------------------------------------------------------
function rebuildChart() {
  const windowSec  = WINDOWS[currentWindow];
  const cutoffTime = Date.now() - windowSec * 1000;

  // Filter buffer sesuai window
  const slice = rawBuffer.filter(e => e.ts.getTime() >= cutoffTime);
  if (slice.length === 0) {
    chart.data.labels        = [];
    chart.data.datasets[0].data = [];
    chart.data.datasets[1].data = [];
    chart.data.datasets[2].data = [];
    chart.update();
    return;
  }

  // Downsample: ambil rata-rata setiap N sampel agar ≤ MAX_CHART_POINTS
  const step = Math.max(1, Math.ceil(slice.length / MAX_CHART_POINTS));
  const fields = METRIC_FIELDS[currentMetric];

  const labels = [], dr = [], ds = [], dt = [];

  for (let i = 0; i < slice.length; i += step) {
    // Rata-rata dalam satu bucket
    const bucket = slice.slice(i, i + step);
    const avg = field => bucket.reduce((sum, e) => sum + (e[field] || 0), 0) / bucket.length;

    // Label diambil dari titik tengah bucket
    const midEntry = bucket[Math.floor(bucket.length / 2)];
    labels.push(formatLabel(midEntry.ts, windowSec));
    dr.push(parseFloat(avg(fields.r).toFixed(3)));
    ds.push(parseFloat(avg(fields.s).toFixed(3)));
    dt.push(parseFloat(avg(fields.t).toFixed(3)));
  }

  chart.data.labels           = labels;
  chart.data.datasets[0].data = dr;
  chart.data.datasets[1].data = ds;
  chart.data.datasets[2].data = dt;

  const scale = CHART_Y_SCALES[currentMetric];
  chart.options.scales.y.suggestedMin = scale.min;
  chart.options.scales.y.suggestedMax = scale.max;
  chart.update('none');   // 'none' = skip animasi agar tetap mulus
}

// ----------------------------------------------------------------
// Dipanggil saat user ganti metric atau window
// ----------------------------------------------------------------
function changeChartMetric() {
  currentMetric = document.getElementById('chartMetricSelect').value;
  rebuildChart();
}

function changeChartWindow() {
  currentWindow = document.getElementById('chartWindowSelect').value;
  // Update label subtitle
  const labels = { '1h': 'Last 1 Hour', '6h': 'Last 6 Hours', '24h': 'Last 24 Hours' };
  document.getElementById('chart-window-label').textContent = labels[currentWindow];
  rebuildChart();
}

// ----------------------------------------------------------------
// Dipanggil tiap 1 detik saat data baru masuk
// ----------------------------------------------------------------
function updateChart(ts, data) {
  // Simpan ke raw buffer
  rawBuffer.push({
    ts,
    v1: data.v1,  v2: data.v2,  v3: data.v3,
    i1: data.i1,  i2: data.i2,  i3: data.i3,
    p1: data.p1,  p2: data.p2,  p3: data.p3,
    s1: data.s1,  s2: data.s2,  s3: data.s3,
    q1: data.q1,  q2: data.q2,  q3: data.q3,
    f1: data.f1,  f2: data.f2,  f3: data.f3,
    pf1: data.pf1, pf2: data.pf2, pf3: data.pf3
  });

  // Buang data lebih dari 24 jam
  if (rawBuffer.length > RAW_MAX) rawBuffer.shift();

  // Rebuild chart hanya tiap 5 detik agar tidak membebani CPU
  // (karena downsample butuh iterasi besar saat window = 24 jam)
  if (rawBuffer.length % 5 === 0) rebuildChart();
}

// ============ FETCH DATA & UPDATE UI ============
let lastPfr = false, lastOvr = false, lastOcr = false;

async function fetchData() {
  try {
    const response = await fetchThinger('/resources/semua_data');
    const data = response.out !== undefined ? response.out : response;

    if (!data || data.v1 === undefined) {
      consecutiveErrors++;
      if (consecutiveErrors >= MAX_ERRORS) setConnectionStatus('offline');
      console.warn('Data belum siap / STM32 offline:', response);
      return;
    }

    // Data valid → reset error counter
    consecutiveErrors = 0;
    setConnectionStatus('online');

    const now = new Date();
    document.getElementById('last-update-time').textContent =
      now.getHours().toString().padStart(2,'0') + ':' +
      now.getMinutes().toString().padStart(2,'0') + ':' +
      now.getSeconds().toString().padStart(2,'0');

    // ---- Phase R ----
    document.getElementById('v1').textContent  = data.v1.toFixed(1);
    document.getElementById('i1').textContent  = data.i1.toFixed(2);
    document.getElementById('p1').textContent  = data.p1.toFixed(1);
    document.getElementById('s1').textContent  = data.s1.toFixed(1);
    document.getElementById('q1').textContent  = data.q1.toFixed(1);
    document.getElementById('f1').textContent  = data.f1.toFixed(1);
    document.getElementById('pf1').textContent = data.pf1.toFixed(2);

    // ---- Phase S ----
    document.getElementById('v2').textContent  = data.v2.toFixed(1);
    document.getElementById('i2').textContent  = data.i2.toFixed(2);
    document.getElementById('p2').textContent  = data.p2.toFixed(1);
    document.getElementById('s2').textContent  = data.s2.toFixed(1);
    document.getElementById('q2').textContent  = data.q2.toFixed(1);
    document.getElementById('f2').textContent  = data.f2.toFixed(1);
    document.getElementById('pf2').textContent = data.pf2.toFixed(2);

    // ---- Phase T ----
    document.getElementById('v3').textContent  = data.v3.toFixed(1);
    document.getElementById('i3').textContent  = data.i3.toFixed(2);
    document.getElementById('p3').textContent  = data.p3.toFixed(1);
    document.getElementById('s3').textContent  = data.s3.toFixed(1);
    document.getElementById('q3').textContent  = data.q3.toFixed(1);
    document.getElementById('f3').textContent  = data.f3.toFixed(1);
    document.getElementById('pf3').textContent = data.pf3.toFixed(2);

    // ---- Environment ----
    document.getElementById('temp').textContent = (data.temp || 0).toFixed(1);
    document.getElementById('hum').textContent  = (data.hum  || 0).toFixed(1);

    // ---- Fan ----
    const fanEl = document.getElementById('fan-status');
    fanEl.textContent = data.fan ? 'ON' : 'OFF';
    fanEl.className   = data.fan ? 'status-badge bg-green' : 'status-badge bg-gray';

    // ---- Setpoint Display (sinkron dari device) ----
    if (data.set_ovr !== undefined) {
      document.getElementById('set-ovr-display').textContent = data.set_ovr;
      // Sinkron slider HANYA jika user tidak sedang drag
      if (document.activeElement !== document.getElementById('slider-ovr')) {
        document.getElementById('slider-ovr').value = data.set_ovr;
      }
    }
    if (data.set_ocr !== undefined) {
      document.getElementById('set-ocr-display').textContent = data.set_ocr;
      if (document.activeElement !== document.getElementById('slider-ocr')) {
        document.getElementById('slider-ocr').value = data.set_ocr;
      }
    }

    // ---- Protection Status ----
    updateProtectionStatus('pfr', data.pfr);
    updateProtectionStatus('ovr', data.ovr);
    updateProtectionStatus('ocr', data.ocr);

    // ---- Reset OCR Button ----
    const btnResetOcr = document.getElementById('btn-reset-ocr');
    btnResetOcr.classList.toggle('hidden', !data.ocr);

    // ---- Trip Logging (rising edge) ----
    if (data.pfr && !lastPfr) addLogEvent('PFR Trip', 'Phase Failure / Loss Detected', 'danger');
    if (data.ovr && !lastOvr) addLogEvent('OVR Trip', `Over Voltage Detected (> ${data.set_ovr ?? '?'} V)`, 'danger');
    if (data.ocr && !lastOcr) addLogEvent('OCR Trip', `Over Current Detected (> ${data.set_ocr ?? '?'} A)`, 'danger');

    lastPfr = data.pfr;
    lastOvr = data.ovr;
    lastOcr = data.ocr;

    // ---- Chart ----
    updateChart(now, data);

  } catch (error) {
    consecutiveErrors++;
    if (consecutiveErrors >= MAX_ERRORS) setConnectionStatus('offline');
    console.error('fetchData error:', error);
  }
}

function updateProtectionStatus(id, isTripped) {
  const el = document.getElementById(id + '-status');
  if (isTripped) {
    el.textContent = 'TRIPPED';
    el.className   = 'status-badge bg-red';
  } else {
    el.textContent = 'OK';
    el.className   = 'status-badge bg-green';
  }
}

// ============ SETPOINTS & COMMANDS ============
async function applyOVR() {
  const val = parseFloat(document.getElementById('slider-ovr').value);
  try {
    await fetchThinger('/resources/atur_ovr', { method: 'POST', body: JSON.stringify({ in: val }) });
    showToast(`OVR Setpoint updated: ${val} V`, 'success');
  } catch {
    showToast('Failed to update OVR. Check connection.', 'error');
  }
}

async function applyOCR() {
  const val = parseFloat(document.getElementById('slider-ocr').value);
  try {
    await fetchThinger('/resources/atur_ocr', { method: 'POST', body: JSON.stringify({ in: val }) });
    showToast(`OCR Setpoint updated: ${val} A`, 'success');
  } catch {
    showToast('Failed to update OCR. Check connection.', 'error');
  }
}

async function resetOCR() {
  try {
    await fetchThinger('/resources/reset_ocr', { method: 'POST', body: JSON.stringify({ in: true }) });
    showToast('Reset OCR command sent to device.', 'success');
  } catch {
    showToast('Failed to send Reset OCR command.', 'error');
  }
}

// ============ SLIDER LIVE UPDATE ============
document.getElementById('slider-ovr').addEventListener('input', function () {
  document.getElementById('set-ovr-display').textContent = this.value;
});
document.getElementById('slider-ocr').addEventListener('input', function () {
  document.getElementById('set-ocr-display').textContent = this.value;
});

// ============ TRIP LOG ============
const LOG_KEY = 'powerMonitorLogs_v2';

function addLogEvent(type, description, severity) {
  const tbody   = document.getElementById('log-tbody');
  const emptyRow = tbody.querySelector('.log-empty-row');
  if (emptyRow) emptyRow.remove();

  const now     = new Date();
  const timeStr = now.toLocaleDateString('id-ID', { day:'2-digit', month:'2-digit', year:'numeric' })
                + ' ' + now.toLocaleTimeString('id-ID');

  const tr = document.createElement('tr');
  tr.className = 'log-new';
  const statusColor = severity === 'danger' ? '#ef4444' : '#00d9ff';
  tr.innerHTML = `
    <td>${timeStr}</td>
    <td><strong>${type}</strong></td>
    <td>${description}</td>
    <td style="color:${statusColor};font-weight:bold">${severity === 'danger' ? 'FAULT' : 'INFO'}</td>
  `;
  tbody.insertBefore(tr, tbody.firstChild);

  // Hapus class animasi setelah selesai
  setTimeout(() => tr.classList.remove('log-new'), 600);

  updateLogCount();
  saveLog();
}

function updateLogCount() {
  const rows = document.querySelectorAll('#log-tbody tr:not(.log-empty-row)');
  const countEl = document.getElementById('log-count');
  countEl.textContent = rows.length > 0 ? `${rows.length} event${rows.length > 1 ? 's' : ''}` : '0 events';
}

function saveLog() {
  const tbody = document.getElementById('log-tbody');
  try {
    localStorage.setItem(LOG_KEY, tbody.innerHTML);
  } catch { /* storage penuh / incognito */ }
}

function loadLog() {
  try {
    const saved = localStorage.getItem(LOG_KEY);
    if (saved) {
      document.getElementById('log-tbody').innerHTML = saved;
      updateLogCount();
    }
  } catch { /* tidak bisa akses localStorage */ }
}

function clearLog() {
  if (!confirm('Clear all trip history logs? This cannot be undone.')) return;
  document.getElementById('log-tbody').innerHTML =
    '<tr class="log-empty-row"><td colspan="4" class="log-empty">No trip events recorded yet</td></tr>';
  try { localStorage.removeItem(LOG_KEY); } catch { /* ignore */ }
  updateLogCount();
}

// ============ INIT ============
window.onload = () => {
  loadLog();
  // Pastikan dashboard tersembunyi di awal
  document.getElementById('dashboard').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
};
