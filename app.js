// ============ LOGIN CONFIG ============
const PASSWORD = "admin123";  // GANTI password kamu di sini
// ======================================

function checkLogin(event) {
  event.preventDefault();
  const input = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  
  if (input === PASSWORD) {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    errorEl.textContent = '';
  } else {
    errorEl.textContent = 'Wrong password!';
    document.getElementById('login-password').value = '';
    document.getElementById('login-password').focus();
  }
}

// ============ THINGER.IO CONFIG ============
const THINGER_USER = "WERR";
const DEVICE_ID = "stm32_power_monitor";
const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJ3ZWJfZGFzaGJvYXJkIiwic3ZyIjoiYXAtc291dGhlYXN0LmF3cy50aGluZ2VyLmlvIiwidXNyIjoiV0VSUiJ9.xHEp44PF_sOqnQeaTJUHtQGH2GEU1RxoK-s3v0QPwZo";
// ===========================================

const API_BASE = `https://backend.thinger.io/v3/users/${THINGER_USER}/devices/${DEVICE_ID}/resources`;
const REFRESH_INTERVAL = 2000;
const CHART_MAX_POINTS = 30;

const tripLog = JSON.parse(localStorage.getItem('tripLog') || '[]');
const lastState = { pfr: false, ovr: false, ocr: false };

console.log("=== Power Monitor Started ===");

// ===== FETCH DATA =====
async function fetchData() {
  try {
    const url = `${API_BASE}/semua_data?authorization=${TOKEN}`;
    const res = await fetch(url);
    
    if (!res.ok) {
      throw new Error('HTTP ' + res.status);
    }
    
    const data = await res.json();
    updateUI(data);
    setConnectionStatus(true);
  } catch (err) {
    console.error('Fetch error:', err);
    setConnectionStatus(false);
  }
}

// ===== UPDATE UI =====
function updateUI(d) {
  document.getElementById('v1').textContent = d.v1.toFixed(1);
  document.getElementById('i1').textContent = d.i1.toFixed(2);
  document.getElementById('p1').textContent = d.p1.toFixed(1);

  document.getElementById('v2').textContent = d.v2.toFixed(1);
  document.getElementById('i2').textContent = d.i2.toFixed(2);
  document.getElementById('p2').textContent = d.p2.toFixed(1);

  document.getElementById('v3').textContent = d.v3.toFixed(1);
  document.getElementById('i3').textContent = d.i3.toFixed(2);
  document.getElementById('p3').textContent = d.p3.toFixed(1);

  document.getElementById('temp').textContent = d.temp.toFixed(1);
  document.getElementById('hum').textContent = d.hum.toFixed(1);
  document.getElementById('fan-status').textContent = d.fan ? 'ON' : 'OFF';
  document.getElementById('fan-status').style.color = d.fan ? '#10b981' : '#6b7280';

  updateProtection('pfr', d.pfr);
  updateProtection('ovr', d.ovr);
  updateProtection('ocr', d.ocr);

  detectTripEvent('PFR', 'Phase Failure', d.pfr, 'pfr');
  detectTripEvent('OVR', 'Over Voltage', d.ovr, 'ovr');
  detectTripEvent('OCR', 'Over Current', d.ocr, 'ocr');

  document.getElementById('set-ovr-display').textContent = Math.round(d.set_ovr);
  document.getElementById('set-ocr-display').textContent = Math.round(d.set_ocr);

  document.getElementById('last-update').textContent = new Date().toLocaleTimeString();

  pushChartData(d.v1, d.v2, d.v3);
}

function updateProtection(name, tripped) {
  const card = document.getElementById('card-' + name);
  const status = document.getElementById('status-' + name);
  if (tripped) {
    card.classList.add('tripped');
    status.textContent = 'TRIPPED';
  } else {
    card.classList.remove('tripped');
    status.textContent = 'NORMAL';
  }
}

function setConnectionStatus(online) {
  const dot = document.getElementById('conn-dot');
  const text = document.getElementById('conn-text');
  if (online) {
    dot.className = 'dot online';
    text.textContent = 'Online';
  } else {
    dot.className = 'dot offline';
    text.textContent = 'Offline';
  }
}

// ===== TRIP DETECTION =====
function detectTripEvent(name, desc, current, key) {
  if (current && !lastState[key]) {
    addLogEntry(name, desc, 'TRIPPED');
  } else if (!current && lastState[key]) {
    addLogEntry(name, desc, 'RECOVERED');
  }
  lastState[key] = current;
}

function addLogEntry(type, desc, status) {
  const entry = {
    time: new Date().toLocaleString('en-GB'),
    type: type,
    desc: desc,
    status: status
  };
  tripLog.unshift(entry);
  if (tripLog.length > 50) tripLog.pop();
  localStorage.setItem('tripLog', JSON.stringify(tripLog));
  renderLog();
}

function renderLog() {
  const tbody = document.getElementById('log-tbody');
  if (tripLog.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="log-empty">No trip events recorded yet</td></tr>';
    return;
  }
  tbody.innerHTML = tripLog.map(e => `
    <tr>
      <td>${e.time}</td>
      <td><strong>${e.type}</strong></td>
      <td>${e.desc}</td>
      <td class="${e.status === 'TRIPPED' ? 'log-trip' : 'log-recover'}">${e.status}</td>
    </tr>
  `).join('');
}

function clearLog() {
  if (confirm('Clear all trip log entries?')) {
    tripLog.length = 0;
    localStorage.removeItem('tripLog');
    renderLog();
  }
}

// ===== SLIDER CONTROLS =====
const sliderOVR = document.getElementById('slider-ovr');
const sliderOCR = document.getElementById('slider-ocr');

sliderOVR.addEventListener('input', () => {
  document.getElementById('set-ovr-display').textContent = sliderOVR.value;
});

sliderOCR.addEventListener('input', () => {
  document.getElementById('set-ocr-display').textContent = sliderOCR.value;
});

async function applyOVR() {
  const val = parseFloat(sliderOVR.value);
  await sendSetpoint('atur_ovr', val, 'OVR');
}

async function applyOCR() {
  const val = parseFloat(sliderOCR.value);
  await sendSetpoint('atur_ocr', val, 'OCR');
}

async function sendSetpoint(resource, value, label) {
  try {
    const url = `${API_BASE}/${resource}?authorization=${TOKEN}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value)
    });
    if (res.ok) {
      alert(`${label} setpoint updated to ${value}`);
    } else {
      alert(`Failed to update ${label}: HTTP ${res.status}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// ===== CHART =====
const ctx = document.getElementById('voltageChart').getContext('2d');
const chart = new Chart(ctx, {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      { label: 'Phase R', data: [], borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', tension: 0.3, borderWidth: 2 },
      { label: 'Phase S', data: [], borderColor: '#fbbf24', backgroundColor: 'rgba(251,191,36,0.1)', tension: 0.3, borderWidth: 2 },
      { label: 'Phase T', data: [], borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', tension: 0.3, borderWidth: 2 }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: { min: 150, max: 280, grid: { color: '#1f2937' }, ticks: { color: '#9ca3af' } },
      x: { grid: { color: '#1f2937' }, ticks: { color: '#9ca3af', maxTicksLimit: 6 } }
    },
    plugins: { legend: { labels: { color: '#e4e6eb' } } }
  }
});

function pushChartData(v1, v2, v3) {
  const time = new Date().toLocaleTimeString().slice(0, 5);
  chart.data.labels.push(time);
  chart.data.datasets[0].data.push(v1);
  chart.data.datasets[1].data.push(v2);
  chart.data.datasets[2].data.push(v3);
  if (chart.data.labels.length > CHART_MAX_POINTS) {
    chart.data.labels.shift();
    chart.data.datasets.forEach(d => d.data.shift());
  }
  chart.update('none');
}

// ===== INIT =====
renderLog();
fetchData();
setInterval(fetchData, REFRESH_INTERVAL);