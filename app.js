// ============ LOGIN CONFIG ============
const PASSWORD = "admin123";
// ======================================

function checkLogin(event) {
  event.preventDefault();
  const input = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  if (input === PASSWORD) {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    errorEl.textContent = '';
    fetchData(); 
    setInterval(fetchData, 1000); 
  } else {
    errorEl.textContent = 'Wrong password!';
    document.getElementById('login-password').value = '';
    document.getElementById('login-password').focus();
  }
}

// ============ THINGER.IO CONFIG ============
const THINGER_USER = "WERR";
const DEVICE_ID = "stm32_power_monitor";
const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJzdG0zMl9wb3dlcl9tb25pdG9yIiwic3ZyIjoiYXAtc291dGhlYXN0LmF3cy50aGluZ2VyLmlvIiwidXNyIjoiV0VSUiJ9.qHE0FTr87v2M_cU5yTrIRF-3ahnpfLUYUz-_R8f2qdI";
// ===========================================

const API_BASE = `https://backend.thinger.io/v3/users/${THINGER_USER}/devices/${DEVICE_ID}`;

async function fetchThinger(endpoint, options = {}) {
  const headers = {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json'
  };
  const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  if (!response.ok) throw new Error('Network response was not ok');
  return response.json();
}

// ============ CHART.JS CONFIGURATION ============
const ctx = document.getElementById('trendChart').getContext('2d');

// Memori 60 detik untuk 7 parameter grafik
const trendHistory = {
  labels: [],
  voltage:  { r: [], s: [], t: [] },
  current:  { r: [], s: [], t: [] },
  power:    { r: [], s: [], t: [] },
  apparent: { r: [], s: [], t: [] },
  reactive: { r: [], s: [], t: [] },
  frequency:{ r: [], s: [], t: [] },
  pf:       { r: [], s: [], t: [] }
};

let currentMetric = 'voltage';

const chart = new Chart(ctx, {
  type: 'line',
  data: {
    labels: trendHistory.labels,
    datasets: [
      { label: 'Phase R', data: trendHistory.voltage.r, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', tension: 0.4, borderWidth: 2, pointRadius: 0, fill: true },
      { label: 'Phase S', data: trendHistory.voltage.s, borderColor: '#fbbf24', backgroundColor: 'rgba(251,191,36,0.1)', tension: 0.4, borderWidth: 2, pointRadius: 0, fill: true },
      { label: 'Phase T', data: trendHistory.voltage.t, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', tension: 0.4, borderWidth: 2, pointRadius: 0, fill: true }
    ]
  },
  options: {
    responsive: true, 
    maintainAspectRatio: false,
    animation: false, // Matikan animasi untuk update realtime yg mulus
    interaction: { mode: 'index', intersect: false },
    scales: {
      y: { 
        suggestedMin: 180, suggestedMax: 250, 
        grid: { color: '#1f2937' }, 
        ticks: { color: '#9ca3af' } 
      },
      x: { 
        grid: { color: '#1f2937' }, 
        ticks: { color: '#9ca3af', maxTicksLimit: 8 } 
      }
    },
    plugins: { 
      legend: { labels: { color: '#e4e6eb', usePointStyle: true } },
      tooltip: { enabled: true }
    }
  }
});

// Fungsi untuk mengganti data & skala grafik
function changeChartMetric() {
  currentMetric = document.getElementById('chartMetricSelect').value;
  
  chart.data.datasets[0].data = trendHistory[currentMetric].r;
  chart.data.datasets[1].data = trendHistory[currentMetric].s;
  chart.data.datasets[2].data = trendHistory[currentMetric].t;

  // Auto-Scaling Y Axis sesuai parameter
  if (currentMetric === 'voltage') {
    chart.options.scales.y.suggestedMin = 180; chart.options.scales.y.suggestedMax = 250;
  } else if (currentMetric === 'current') {
    chart.options.scales.y.suggestedMin = 0; chart.options.scales.y.suggestedMax = 15; 
  } else if (currentMetric === 'power' || currentMetric === 'apparent' || currentMetric === 'reactive') {
    chart.options.scales.y.suggestedMin = 0; chart.options.scales.y.suggestedMax = 3000;
  } else if (currentMetric === 'frequency') {
    chart.options.scales.y.suggestedMin = 48; chart.options.scales.y.suggestedMax = 52;
  } else if (currentMetric === 'pf') {
    chart.options.scales.y.suggestedMin = 0; chart.options.scales.y.suggestedMax = 1.0;
  }
  
  chart.update();
}

function updateChart(timeLabel, data) {
  trendHistory.labels.push(timeLabel);
  
  trendHistory.voltage.r.push(data.v1); trendHistory.voltage.s.push(data.v2); trendHistory.voltage.t.push(data.v3);
  trendHistory.current.r.push(data.i1); trendHistory.current.s.push(data.i2); trendHistory.current.t.push(data.i3);
  trendHistory.power.r.push(data.p1);   trendHistory.power.s.push(data.p2);   trendHistory.power.t.push(data.p3);
  trendHistory.apparent.r.push(data.s1);trendHistory.apparent.s.push(data.s2);trendHistory.apparent.t.push(data.s3);
  trendHistory.reactive.r.push(data.q1);trendHistory.reactive.s.push(data.q2);trendHistory.reactive.t.push(data.q3);
  trendHistory.frequency.r.push(data.f1);trendHistory.frequency.s.push(data.f2);trendHistory.frequency.t.push(data.f3);
  trendHistory.pf.r.push(data.pf1);     trendHistory.pf.s.push(data.pf2);     trendHistory.pf.t.push(data.pf3);

  // Buang data paling lama jika sudah melebihi 60 titik (60 detik)
  if (trendHistory.labels.length > 60) {
    trendHistory.labels.shift();
    trendHistory.voltage.r.shift(); trendHistory.voltage.s.shift(); trendHistory.voltage.t.shift();
    trendHistory.current.r.shift(); trendHistory.current.s.shift(); trendHistory.current.t.shift();
    trendHistory.power.r.shift();   trendHistory.power.s.shift();   trendHistory.power.t.shift();
    trendHistory.apparent.r.shift();trendHistory.apparent.s.shift();trendHistory.apparent.t.shift();
    trendHistory.reactive.r.shift();trendHistory.reactive.s.shift();trendHistory.reactive.t.shift();
    trendHistory.frequency.r.shift();trendHistory.frequency.s.shift();trendHistory.frequency.t.shift();
    trendHistory.pf.r.shift();      trendHistory.pf.s.shift();      trendHistory.pf.t.shift();
  }
  chart.update();
}

// ============ FETCH DATA & UPDATE UI ============
let lastPfr = false, lastOvr = false, lastOcr = false;

async function fetchData() {
  try {
    const response = await fetchThinger('/resources/semua_data');
    
    // PERBAIKAN 1: Pastikan kita mengambil data dari properti yang benar. 
    // Kadang Thinger mengirim langsung tanpa bungkus "out" jika offline/error.
    const data = response.out !== undefined ? response.out : response;

    // PERBAIKAN 2: Validasi Krusial. Jika 'data' tidak ada, atau 'v1' belum tersedia,
    // hentikan eksekusi di sini agar web tidak crash ("Cannot read properties of undefined")
    if (!data || data.v1 === undefined) {
      console.warn('Data API belum siap atau STM32 offline:', response);
      return; 
    }

    // Phase R
    document.getElementById('v1').textContent = data.v1.toFixed(1);
    document.getElementById('i1').textContent = data.i1.toFixed(2);
    document.getElementById('p1').textContent = data.p1.toFixed(1);
    document.getElementById('s1').textContent = data.s1.toFixed(1);
    document.getElementById('q1').textContent = data.q1.toFixed(1);
    document.getElementById('f1').textContent = data.f1.toFixed(1);
    document.getElementById('pf1').textContent = data.pf1.toFixed(2);

    // Phase S
    document.getElementById('v2').textContent = data.v2.toFixed(1);
    document.getElementById('i2').textContent = data.i2.toFixed(2);
    document.getElementById('p2').textContent = data.p2.toFixed(1);
    document.getElementById('s2').textContent = data.s2.toFixed(1);
    document.getElementById('q2').textContent = data.q2.toFixed(1);
    document.getElementById('f2').textContent = data.f2.toFixed(1);
    document.getElementById('pf2').textContent = data.pf2.toFixed(2);

    // Phase T
    document.getElementById('v3').textContent = data.v3.toFixed(1);
    document.getElementById('i3').textContent = data.i3.toFixed(2);
    document.getElementById('p3').textContent = data.p3.toFixed(1);
    document.getElementById('s3').textContent = data.s3.toFixed(1);
    document.getElementById('q3').textContent = data.q3.toFixed(1);
    document.getElementById('f3').textContent = data.f3.toFixed(1);
    document.getElementById('pf3').textContent = data.pf3.toFixed(2);
    
    // Lingkungan
    document.getElementById('temp').textContent = (data.temp || 0).toFixed(1);
    document.getElementById('hum').textContent = (data.hum || 0).toFixed(1);

    // Update Setpoint Display
    if (data.set_ovr !== undefined) document.getElementById('set-ovr-display').textContent = data.set_ovr;
    if (data.set_ocr !== undefined) document.getElementById('set-ocr-display').textContent = data.set_ocr;

    // Status Proteksi
    updateProtectionStatus('pfr', data.pfr);
    updateProtectionStatus('ovr', data.ovr);
    updateProtectionStatus('ocr', data.ocr);
    
    // Tampilkan tombol RESET OCR jika OCR Tripped
    const btnResetOcr = document.getElementById('btn-reset-ocr');
    if (data.ocr) btnResetOcr.style.display = 'block';
    else btnResetOcr.style.display = 'none';

    // Status Kipas
    const fanEl = document.getElementById('fan-status');
    fanEl.textContent = data.fan ? "ON" : "OFF";
    fanEl.className = data.fan ? "status-badge bg-green" : "status-badge bg-gray";

    // Trip Logging
    if (data.pfr && !lastPfr) addLogEvent('PFR Trip', 'Phase Failure/Loss Detected', 'danger');
    if (data.ovr && !lastOvr) addLogEvent('OVR Trip', `Over Voltage Detected (> ${data.set_ovr}V)`, 'danger');
    if (data.ocr && !lastOcr) addLogEvent('OCR Trip', `Over Current Detected (> ${data.set_ocr}A)`, 'danger');
    
    lastPfr = data.pfr;
    lastOvr = data.ovr;
    lastOcr = data.ocr;
    
    // Lempar data ke Grafik
    const now = new Date();
    const timeLabel = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0') + ':' + now.getSeconds().toString().padStart(2, '0');
    
    updateChart(timeLabel, data);
    
  } catch (error) {
    console.error('Error fetching data:', error);
  }
}

function updateProtectionStatus(id, isTripped) {
  const el = document.getElementById(id + '-status');
  if (isTripped) {
    el.textContent = 'TRIPPED';
    el.className = 'status-badge bg-red';
  } else {
    el.textContent = 'OK';
    el.className = 'status-badge bg-green';
  }
}

// ============ SETPOINT & COMMANDS ============
async function applyOVR() {
  const val = document.getElementById('slider-ovr').value;
  try {
    await fetchThinger('/resources/atur_ovr', { method: 'POST', body: JSON.stringify({ in: parseFloat(val) }) });
    alert(`OVR Setpoint updated to ${val} V`);
  } catch (e) {
    alert('Failed to update OVR');
  }
}

async function applyOCR() {
  const val = document.getElementById('slider-ocr').value;
  try {
    await fetchThinger('/resources/atur_ocr', { method: 'POST', body: JSON.stringify({ in: parseFloat(val) }) });
    alert(`OCR Setpoint updated to ${val} A`);
  } catch (e) {
    alert('Failed to update OCR');
  }
}

async function resetOCR() {
  try {
    await fetchThinger('/resources/reset_ocr', { method: 'POST', body: JSON.stringify({ in: true }) });
    alert('Perintah Reset OCR telah dikirim ke perangkat!');
  } catch (e) {
    alert('Gagal mengirim perintah Reset');
  }
}

// ============ LOGGING ============
function addLogEvent(type, description, severity) {
  const tbody = document.getElementById('log-tbody');
  const now = new Date();
  const timeStr = now.toLocaleDateString() + ' ' + now.toLocaleTimeString();
  
  const emptyRow = document.querySelector('.log-empty');
  if (emptyRow) emptyRow.parentElement.remove();

  const tr = document.createElement('tr');
  let statusColor = severity === 'danger' ? '#ef4444' : '#00d9ff';
  tr.innerHTML = `
    <td>${timeStr}</td>
    <td><strong>${type}</strong></td>
    <td>${description}</td>
    <td style="color:${statusColor}">${severity === 'danger' ? 'FAULT' : 'INFO'}</td>
  `;
  tbody.insertBefore(tr, tbody.firstChild);
  saveLog();
}

function saveLog() {
  const tbody = document.getElementById('log-tbody');
  localStorage.setItem('powerMonitorLogs', tbody.innerHTML);
}

function loadLog() {
  const saved = localStorage.getItem('powerMonitorLogs');
  if (saved) {
    document.getElementById('log-tbody').innerHTML = saved;
  }
}

function clearLog() {
  if (confirm('Are you sure you want to clear all logs?')) {
    const tbody = document.getElementById('log-tbody');
    tbody.innerHTML = '<tr><td colspan="4" class="log-empty">No trip events recorded yet</td></tr>';
    localStorage.removeItem('powerMonitorLogs');
  }
}

document.getElementById('slider-ovr').addEventListener('input', function() {
  document.getElementById('set-ovr-display').textContent = this.value;
});
document.getElementById('slider-ocr').addEventListener('input', function() {
  document.getElementById('set-ocr-display').textContent = this.value;
});

window.onload = () => {
  loadLog();
};
