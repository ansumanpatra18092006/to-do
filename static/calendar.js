/* calendar.js — monthly task calendar */

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
const WDAYS  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth();
let allTasks = [];
let selectedCell = null;

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}

function parseLocal(ds) {
  const [y,m,d] = ds.split('-').map(Number);
  return new Date(y, m-1, d);
}

function taskMap() {
  const map = {};
  allTasks.forEach(t => {
    if (!t.due_date) return;
    if (!map[t.due_date]) map[t.due_date] = [];
    map[t.due_date].push(t);
  });
  return map;
}

function render() {
  document.getElementById('cal-month-title').textContent =
    `${MONTHS[calMonth]} ${calYear}`;

  // Day headers
  const hdr = document.getElementById('cal-day-header');
  hdr.innerHTML = WDAYS.map(d => `<div class="cal-day-name">${d}</div>`).join('');

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  const map   = taskMap();
  const today = new Date().toISOString().split('T')[0];
  const first = new Date(calYear, calMonth, 1).getDay();
  const days  = new Date(calYear, calMonth + 1, 0).getDate();

  // Blank cells
  for (let i = 0; i < first; i++)
    grid.insertAdjacentHTML('beforeend', '<div class="cal-cell empty"></div>');

  for (let d = 1; d <= days; d++) {
    const iso   = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const tasks = map[iso] || [];
    const isToday    = iso === today;
    const hasOverdue = tasks.some(t => !t.completed && iso < today);
    const hasTasks   = tasks.length > 0;

    let cls = 'cal-cell';
    if (isToday) cls += ' today';
    if (hasTasks && !hasOverdue) cls += ' has-task';
    if (hasOverdue) cls += ' has-overdue';

    const dots = tasks.slice(0,3).map(t => {
      let dc = 'cal-dot';
      if (t.completed)       dc += ' done';
      else if (iso < today)  dc += ' overdue';
      return `<div class="${dc}">${escHtml(t.title)}</div>`;
    }).join('') + (tasks.length > 3 ? `<div class="cal-dot">+${tasks.length-3}</div>` : '');

    const numHtml = isToday
      ? `<div class="cal-num" style="background:var(--amber);color:var(--navy);border-radius:50%">${d}</div>`
      : `<div class="cal-num">${d}</div>`;

    grid.insertAdjacentHTML('beforeend',
      `<div class="${cls}" data-iso="${iso}">${numHtml}${dots}</div>`);
  }

  grid.querySelectorAll('.cal-cell:not(.empty)').forEach(cell => {
    cell.addEventListener('click', () => selectDay(cell));
  });
}

function selectDay(cell) {
  if (selectedCell) selectedCell.classList.remove('selected');
  cell.classList.add('selected');
  selectedCell = cell;

  const iso   = cell.dataset.iso;
  const map   = taskMap();
  const tasks = map[iso] || [];
  const today = new Date().toISOString().split('T')[0];

  const panel = document.getElementById('day-panel');
  const d     = parseLocal(iso);
  panel.querySelector('.day-panel-title').textContent =
    d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });

  const list = panel.querySelector('.day-task-list');
  if (!tasks.length) {
    list.innerHTML = `<p style="color:var(--slate);font-size:0.85rem">No tasks scheduled.</p>`;
  } else {
    list.innerHTML = tasks.map(t => {
      const done    = t.completed;
      const overdue = !done && iso < today;
      const timeStr = t.start_time
        ? `<span style="font-family:'IBM Plex Mono',monospace;font-size:0.7rem;color:var(--amber);margin-left:8px">${fmt12(t.start_time)}</span>`
        : '';
      return `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:0.9rem">${done ? '✅' : overdue ? '⚠️' : '🔲'}</span>
        <span style="font-size:0.88rem;font-weight:600;
          color:${done ? 'var(--slate)' : overdue ? 'var(--red)' : 'var(--white)'};
          text-decoration:${done ? 'line-through' : 'none'}">${escHtml(t.title)}</span>
        ${timeStr}
      </div>`;
    }).join('');
  }

  panel.classList.add('open');
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function fmt12(t) {
  if (!t) return '';
  const [h,m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${h%12||12}:${String(m).padStart(2,'0')} ${ap}`;
}

// Nav
document.getElementById('cal-prev').addEventListener('click', () => {
  calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; }
  render(); closePanel();
});
document.getElementById('cal-next').addEventListener('click', () => {
  calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; }
  render(); closePanel();
});

function closePanel() {
  document.getElementById('day-panel').classList.remove('open');
  selectedCell = null;
}

async function init() {
  try {
    const res = await fetch('/api/tasks');
    const data = await res.json();

    if (Array.isArray(data)) {
      allTasks = data;
    } else {
      allTasks = [];
    }
  } catch (err) {
    console.error("Calendar failed to load tasks:", err);
    allTasks = [];
  }

  render();
}

init();