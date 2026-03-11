/* =============================================================
   script.js  —  Tasks page
   All backend fetch() calls replaced with IndexedDB (db.js).
   ============================================================= */

"use strict";

/* ── Shared helpers ─────────────────────────────────────────── */

function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function formatDate(d) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return new Date(y, m - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function fmt12(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ap}`;
}

/**
 * Parse a human-entered time string such as "2 PM", "2:30 PM", "14:00".
 * Returns "HH:MM" (24-hour) or null if unparseable.
 */
function parseTimeInput(val) {
  if (!val) return null;
  val = val.trim().toLowerCase();
  if (/^\d{1,2}:\d{2}$/.test(val)) return val;
  const m = val.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (!m) return null;
  let hour  = parseInt(m[1], 10);
  const min = parseInt(m[2] || "0", 10);
  const ap  = m[3];
  if (ap === "pm" && hour !== 12) hour += 12;
  if (ap === "am" && hour === 12) hour = 0;
  if (hour < 0 || hour > 23 || min < 0 || min > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function toast(msg, dur) {
  dur = dur || 2800;
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => el.classList.remove("show"), dur);
}

/* ── Tasks page (only runs when #task-list exists) ──────────── */

(function initTaskPage() {
  const taskList = document.getElementById("task-list");
  if (!taskList) return;

  let currentFilter = "all";

  /* ── Chip builders ─────────────────────────────── */

  function dateChip(t) {
    if (!t.due_date) return "";
    const today = todayISO();
    if (!t.completed && t.due_date < today)
      return `<span class="meta-chip chip-overdue">⚠ Overdue · ${formatDate(t.due_date)}</span>`;
    if (t.due_date === today)
      return `<span class="meta-chip chip-today">Today</span>`;
    return `<span class="meta-chip chip-date">📅 ${formatDate(t.due_date)}</span>`;
  }

  function timeChip(t) {
    if (!t.start_time) return "";
    const label = t.end_time
      ? `${fmt12(t.start_time)} – ${fmt12(t.end_time)}`
      : fmt12(t.start_time);
    return `<span class="meta-chip chip-time">⏱ ${label}</span>`;
  }

  /* ── Build a single task card DOM node ─────────── */

  function buildCard(t) {
    const today     = todayISO();
    const isOverdue = !t.completed && t.due_date && t.due_date < today;
    const isToday   = t.due_date === today;

    let cls = "task-card";
    if (t.completed)  cls += " done";
    if (isOverdue)    cls += " overdue";
    else if (isToday) cls += " today-task";

    const card = document.createElement("div");
    card.className  = cls;
    card.dataset.id = t.id;

    card.innerHTML = `
      <input type="checkbox" class="task-check" ${t.completed ? "checked" : ""}>
      <div class="task-body">
        <div class="task-title">${escHtml(t.title)}</div>
        ${t.description ? `<div class="task-desc">${escHtml(t.description)}</div>` : ""}
        <div class="task-meta">${dateChip(t)}${timeChip(t)}</div>
      </div>
      <div class="task-actions">
        <button class="btn btn-sm btn-ghost edit-btn">Edit</button>
        <button class="btn btn-sm btn-danger del-btn">✕</button>
      </div>`;

    /* Toggle completion */
    card.querySelector(".task-check").addEventListener("change", async (e) => {
      t.completed = e.target.checked ? 1 : 0;
      try {
        await updateTask(t);
        loadTasks();
      } catch (err) {
        console.error("updateTask failed:", err);
        toast("Failed to update task.", 4000);
      }
    });

    /* Inline title edit */
    card.querySelector(".edit-btn").addEventListener("click", () => {
      const titleEl  = card.querySelector(".task-title");
      const original = t.title;
      titleEl.innerHTML = `<input class="edit-input" value="${escHtml(original)}" maxlength="120">`;
      const inp = titleEl.querySelector("input");
      inp.focus();
      inp.select();

      async function commit() {
        const newVal = inp.value.trim();
        if (newVal && newVal !== original) {
          t.title = newVal;
          try {
            await updateTask(t);
            toast("Task updated ✓");
          } catch (err) {
            console.error("updateTask failed:", err);
            t.title = original;
          }
        }
        titleEl.textContent = t.title;
      }

      inp.addEventListener("blur", commit);
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter")  inp.blur();
        if (e.key === "Escape") { inp.value = original; inp.blur(); }
      });
    });

    /* Delete */
    card.querySelector(".del-btn").addEventListener("click", async () => {
      if (!confirm(`Delete "${t.title}"?`)) return;
      try {
        await deleteTask(t.id);
        card.style.transition = "opacity 0.2s";
        card.style.opacity    = "0";
        setTimeout(() => card.remove(), 200);
        toast("Task deleted.");
      } catch (err) {
        console.error("deleteTask failed:", err);
        toast("Failed to delete task.", 4000);
      }
    });

    return card;
  }

  /* ── Load & render task list ────────────────────── */

  async function loadTasks() {
    let tasks;
    try {
      tasks = await getTasks();
    } catch (err) {
      console.error("getTasks failed:", err);
      taskList.innerHTML = `<div class="empty"><div class="empty-icon">⚠️</div><p>Could not load tasks.</p></div>`;
      return;
    }

    /* Apply filter in JS */
    if (currentFilter === "completed") {
      tasks = tasks.filter((t) => t.completed);
    } else if (currentFilter === "pending") {
      tasks = tasks.filter((t) => !t.completed);
    }

    taskList.innerHTML = "";

    if (!tasks.length) {
      taskList.innerHTML = `
        <div class="empty">
          <div class="empty-icon">📋</div>
          <p>No tasks here yet.</p>
        </div>`;
      return;
    }

    tasks.forEach((t) => taskList.appendChild(buildCard(t)));
  }

  /* ── Filter buttons ─────────────────────────────── */

  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentFilter = btn.dataset.filter;
      loadTasks();
    });
  });

  /* ── Add-task form ──────────────────────────────── */

  const addForm = document.getElementById("add-form");
  if (addForm) {
    addForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const title = document.getElementById("f-title").value.trim();
      if (!title) return;

      const start_time = parseTimeInput(document.getElementById("f-start").value);
      const end_time   = parseTimeInput(document.getElementById("f-end").value);

      try {
        await addTask({
          title,
          description: document.getElementById("f-desc").value.trim(),
          due_date:    document.getElementById("f-due").value  || null,
          start_time,
          end_time,
        });
        addForm.reset();
        loadTasks();
        toast("Task added ✓");
      } catch (err) {
        console.error("addTask failed:", err);
        toast("Failed to add task.", 4000);
      }
    });
  }

  /* ── Initial load ───────────────────────────────── */
  loadTasks();
})();