/* timetable.js — daily hourly schedule */

const HOURS = [];
for (let h = 6; h <= 23; h++) HOURS.push(h);

let ttDate = formatLocalDate(new Date());
let ttTasks   = [];
let modalHour = null;  // hour being added

// ── Helpers ────────────────────────────────────────────
function fmt12h(hour) {
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:00 ${ampm}`;
}

function toHour(timeStr) {
  if (!timeStr) return null;
  return parseInt(timeStr.split(':')[0], 10);
}

function parseLocalDate(ds) {
  const [y, m, d] = ds.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fmtDateLabel(ds) {
  const d = parseLocalDate(ds);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  return d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })
    + (isToday ? ' — Today' : '');
}

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function apiCall(url, method = 'GET', body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  if (method === 'DELETE' || r.status === 204) return null;
  return r.json();
}

function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove('show'), 2800);
}

// ── Current time marker ────────────────────────────────
function positionNowLine() {
  const now = new Date();
  const nowDate = now.toISOString().split('T')[0];
  const line = document.getElementById('now-line');
  if (!line) return;

  if (nowDate !== ttDate) {
    line.style.display = 'none';
    return;
  }

  const h = now.getHours();
  const m = now.getMinutes();
  if (h < 6 || h > 23) { line.style.display = 'none'; return; }

  const row = document.querySelector(`[data-hour="${h}"]`);
  if (!row) { line.style.display = 'none'; return; }

  const rect = row.getBoundingClientRect();
  const gridRect = document.getElementById('tt-grid').getBoundingClientRect();
  const top = rect.top - gridRect.top + (m / 60) * rect.height;

  line.style.display = 'block';
  line.style.top = top + 'px';
}

// ── Render timetable ───────────────────────────────────
function renderTimetable() {
  document.getElementById('tt-date-label').textContent = fmtDateLabel(ttDate);

  const grid = document.getElementById('tt-grid');
  const now = new Date();
  const currentH = now.getHours();

  grid.innerHTML = '';

  HOURS.forEach(h => {
    const tasks = ttTasks.filter(t => toHour(t.start_time) === h);
    const isCurrent = ttDate === new Date().toISOString().split('T')[0] && h === currentH;

    const row = document.createElement('div');
    row.className = 'tt-row' + (isCurrent ? ' current-hour' : '');
    row.dataset.hour = h;

    const hourEl = document.createElement('div');
    hourEl.className = 'tt-hour';
    hourEl.textContent = fmt12h(h);

    const slot = document.createElement('div');
    slot.className = 'tt-slot' + (tasks.length ? ' has-tasks' : '');

    // Render task pills
    tasks.forEach(t => {
      const pill = document.createElement('div');
      pill.className = 'tt-task-pill' + (t.completed ? ' done' : '');

let timeLabel = '';

if (t.start_time && t.end_time) {
  timeLabel = `
  <div class="tt-time-range">
    ${fmt12(t.start_time)} → ${fmt12(t.end_time)}
  </div>`;
}
else if (t.start_time) {
  timeLabel = `
  <div class="tt-time-range">
    ${fmt12(t.start_time)}
  </div>`;
}
pill.innerHTML = `
  <span class="tt-pill-dot${t.completed ? ' done' : ''}"></span>

  <div class="tt-pill-content">
    <div class="tt-pill-title">${escHtml(t.title)}</div>
    ${timeLabel}
  </div>

  <button class="del-pill" data-id="${t.id}" title="Delete">✕</button>`;

      // Toggle complete on pill click (not del button)
      pill.addEventListener('click', async e => {
        if (e.target.classList.contains('del-pill')) return;
        await apiCall(`/api/tasks/${t.id}`, 'PUT', { completed: t.completed ? 0 : 1 });
        loadTimetable();
      });

      pill.querySelector('.del-pill').addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm(`Delete "${t.title}"?`)) return;
        await apiCall(`/api/tasks/${t.id}`, 'DELETE');
        loadTimetable();
        showToast('Deleted.');
      });

      slot.appendChild(pill);
    });

    // Click empty area → open modal
    slot.addEventListener('click', e => {
      if (e.target.classList.contains('del-pill') ||
          e.target.classList.contains('tt-task-pill') ||
          e.target.closest('.tt-task-pill')) return;
      openAddModal(h);
    });

    row.appendChild(hourEl);
    row.appendChild(slot);
    grid.appendChild(row);
  });

  // Now line
  setTimeout(positionNowLine, 50);
}

function fmt12(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${ampm}`;
}

// ── Load ───────────────────────────────────────────────
async function loadTimetable() {
  const tasks = await apiCall(`/api/tasks?date=${ttDate}`);
  ttTasks = tasks.filter(t => t.start_time);   // only scheduled tasks
  renderTimetable();
}

// ── Date nav ───────────────────────────────────────────
document.getElementById('tt-prev').addEventListener('click', () => changeDay(-1));
document.getElementById('tt-next').addEventListener('click', () => changeDay(1));
document.getElementById('tt-today').addEventListener('click', () => {
  ttDate = formatLocalDate(new Date());
  loadTimetable();
});

function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2,'0');
  const d = String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}

function changeDay(step) {
  const dt = parseLocalDate(ttDate);
  dt.setDate(dt.getDate() + step);
  ttDate = formatLocalDate(dt);
  loadTimetable();
}

// Set the date input value
function syncDateInput() {
  const inp = document.getElementById('tt-date-inp');
  if (inp) {
    inp.value = ttDate;
    inp.addEventListener('change', () => {
      ttDate = inp.value;
      loadTimetable();
    });
  }
}

// ── Modal ──────────────────────────────────────────────
function openAddModal(hour) {
  modalHour = hour;
  const overlay = document.getElementById('modal-overlay');
  const padH  = String(hour).padStart(2,'0');
  document.getElementById('m-start').value = `${padH}:00`;
  document.getElementById('m-end').value   = `${padH}:00`;
  document.getElementById('m-date').value  = ttDate;
  document.getElementById('m-title').value = '';
  document.getElementById('m-desc').value  = '';
  overlay.classList.add('open');
  setTimeout(() => document.getElementById('m-title').focus(), 150);
}

document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget)
    e.currentTarget.classList.remove('open');
});

document.getElementById('modal-cancel').addEventListener('click', () => {
  document.getElementById('modal-overlay').classList.remove('open');
});

document.getElementById('modal-form').addEventListener('submit', async e => {
  e.preventDefault();
  const title = document.getElementById('m-title').value.trim();
  if (!title) return;
  await apiCall('/api/tasks', 'POST', {
    title,
    description: document.getElementById('m-desc').value.trim(),
    due_date:   document.getElementById('m-date').value || ttDate,
    start_time: document.getElementById('m-start').value || null,
    end_time:   document.getElementById('m-end').value   || null,
  });
  document.getElementById('modal-overlay').classList.remove('open');
  loadTimetable();
  showToast('Task scheduled ✓');
});

// ── Update now-line every minute ──────────────────────
setInterval(positionNowLine, 60000);

// ── Init ──────────────────────────────────────────────
syncDateInput();
loadTimetable();