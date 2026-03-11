/* =============================================================
   timetable.js  —  Daily hourly schedule
   All fetch() calls replaced with IndexedDB (db.js).
   ============================================================= */

"use strict";

/* ── Standalone helpers (safe if script.js not on same page) ── */

if (typeof escHtml === "undefined") {
  window.escHtml = (s) =>
    String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

if (typeof fmt12 === "undefined") {
  window.fmt12 = (t) => {
    if (!t) return "";
    const [h, m] = t.split(":").map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2,"0")} ${h >= 12 ? "PM" : "AM"}`;
  };
}

/* ── Helpers ─────────────────────────────────────────────────── */

function showToast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove("show"), 2800);
}

function toLocalISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseLocalDate(ds) {
  const [y, m, d] = ds.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function fmt12h(hour) {
  return `${hour % 12 || 12}:00 ${hour >= 12 ? "PM" : "AM"}`;
}

function toHour(timeStr) {
  if (!timeStr) return null;
  return parseInt(timeStr.split(":")[0], 10);
}

function fmtDateLabel(ds) {
  const d       = parseLocalDate(ds);
  const isToday = d.toDateString() === new Date().toDateString();
  return d.toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" })
    + (isToday ? " — Today" : "");
}

/* ── State ───────────────────────────────────────────────────── */

const HOURS = [];
for (let h = 6; h <= 23; h++) HOURS.push(h);

let ttDate    = toLocalISO(new Date());
let ttTasks   = [];
let modalHour = null;

/* ── Date input sync ─────────────────────────────────────────── */

function syncDateInput() {
  const inp = document.getElementById("tt-date-inp");
  if (!inp) return;
  inp.value = ttDate;
  inp.addEventListener("input", () => {
    if (inp.value) { ttDate = inp.value; loadTimetable(); }
  });
  inp.addEventListener("change", () => {
    if (inp.value && inp.value !== ttDate) { ttDate = inp.value; loadTimetable(); }
  });
}

/* ── Current-time line ───────────────────────────────────────── */

function positionNowLine() {
  const line = document.getElementById("now-line");
  if (!line) return;
  const now = new Date();
  if (toLocalISO(now) !== ttDate) { line.style.display = "none"; return; }
  const h = now.getHours(), m = now.getMinutes();
  if (h < 6 || h > 23)         { line.style.display = "none"; return; }
  const row  = document.querySelector(`[data-hour="${h}"]`);
  const grid = document.getElementById("tt-grid");
  if (!row || !grid) return;
  const top = row.getBoundingClientRect().top - grid.getBoundingClientRect().top + (m / 60) * row.getBoundingClientRect().height;
  line.style.display = "block";
  line.style.top     = top + "px";
}

/* ── Render ──────────────────────────────────────────────────── */

function renderTimetable() {
  const labelEl = document.getElementById("tt-date-label");
  if (labelEl) labelEl.textContent = fmtDateLabel(ttDate);

  const grid = document.getElementById("tt-grid");
  if (!grid) return;
  grid.innerHTML = "";

  const nowH    = new Date().getHours();
  const isToday = ttDate === toLocalISO(new Date());

  HOURS.forEach((h) => {
    const tasks = ttTasks.filter((t) => toHour(t.start_time) === h);

    const row = document.createElement("div");
    row.className    = "tt-row" + (isToday && h === nowH ? " current-hour" : "");
    row.dataset.hour = h;

    const hourEl = document.createElement("div");
    hourEl.className   = "tt-hour";
    hourEl.textContent = fmt12h(h);

    const slot = document.createElement("div");
    slot.className = "tt-slot" + (tasks.length ? " has-tasks" : "");

    tasks.forEach((t) => slot.appendChild(buildPill(t)));

    slot.addEventListener("click", (e) => {
      if (e.target.closest(".tt-task-pill")) return;
      openAddModal(h);
    });

    row.appendChild(hourEl);
    row.appendChild(slot);
    grid.appendChild(row);
  });

  setTimeout(positionNowLine, 50);
}

function buildPill(t) {
  const pill = document.createElement("div");
  pill.className = "tt-task-pill" + (t.completed ? " done" : "");

  let timeRange = "";
  if (t.start_time && t.end_time)
    timeRange = `<div class="tt-time-range">${fmt12(t.start_time)} → ${fmt12(t.end_time)}</div>`;

  pill.innerHTML = `
    <span class="tt-pill-dot"></span>
    <div class="tt-pill-content">
      <div class="tt-pill-title">${escHtml(t.title)}</div>
      ${timeRange}
    </div>
    <button class="del-pill" type="button" title="Delete">✕</button>`;

  /* Toggle completion */
  pill.addEventListener("click", async (e) => {
    if (e.target.classList.contains("del-pill")) return;
    t.completed = t.completed ? 0 : 1;
    try {
      await updateTask(t);
      loadTimetable();
    } catch (err) { console.error(err); }
  });

  /* Delete */
  pill.querySelector(".del-pill").addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!confirm(`Delete "${t.title}"?`)) return;
    try {
      await deleteTask(t.id);
      loadTimetable();
      showToast("Deleted.");
    } catch (err) { console.error(err); }
  });

  return pill;
}

/* ── Load ────────────────────────────────────────────────────── */

async function loadTimetable() {
  try {
    const all = await getTasks();
    // Filter to tasks for the selected date that have a start_time
    ttTasks = all.filter((t) => t.due_date === ttDate && t.start_time);
  } catch (err) {
    console.error("loadTimetable failed:", err);
    ttTasks = [];
  }
  renderTimetable();
}

/* ── Date navigation ─────────────────────────────────────────── */

document.getElementById("tt-prev").addEventListener("click",  () => changeDay(-1));
document.getElementById("tt-next").addEventListener("click",  () => changeDay(1));
document.getElementById("tt-today").addEventListener("click", () => {
  ttDate = toLocalISO(new Date());
  const inp = document.getElementById("tt-date-inp");
  if (inp) inp.value = ttDate;
  loadTimetable();
});

function changeDay(step) {
  const dt = parseLocalDate(ttDate);
  dt.setDate(dt.getDate() + step);
  ttDate = toLocalISO(dt);
  const inp = document.getElementById("tt-date-inp");
  if (inp) inp.value = ttDate;
  loadTimetable();
}

/* ── Modal ───────────────────────────────────────────────────── */

function openAddModal(hour) {
  modalHour = hour;
  const overlay = document.getElementById("modal-overlay");
  if (!overlay) return;
  const h = String(hour).padStart(2, "0");
  document.getElementById("m-start").value = `${h}:00`;
  document.getElementById("m-end").value   = `${h}:00`;
  document.getElementById("m-date").value  = ttDate;
  document.getElementById("m-title").value = "";
  document.getElementById("m-desc").value  = "";
  overlay.classList.add("open");
  setTimeout(() => document.getElementById("m-title").focus(), 100);
}

function closeModal() {
  const overlay = document.getElementById("modal-overlay");
  if (overlay) overlay.classList.remove("open");
}

const cancelBtn = document.getElementById("modal-cancel");
if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

const overlay = document.getElementById("modal-overlay");
if (overlay) overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });

document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

const modalForm = document.getElementById("modal-form");
if (modalForm) {
  modalForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("m-title").value.trim();
    if (!title) return;
    try {
      await addTask({
        title,
        description: document.getElementById("m-desc").value.trim(),
        due_date:    document.getElementById("m-date").value || ttDate,
        start_time:  document.getElementById("m-start").value || null,
        end_time:    document.getElementById("m-end").value   || null,
      });
      closeModal();
      loadTimetable();
      showToast("Task scheduled ✓");
    } catch (err) {
      console.error("addTask failed:", err);
      showToast("Failed to schedule.", 4000);
    }
  });
}

/* ── Init ────────────────────────────────────────────────────── */

syncDateInput();
loadTimetable();
setInterval(positionNowLine, 60_000);