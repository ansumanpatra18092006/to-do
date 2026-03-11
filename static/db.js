/* =============================================================
   db.js  —  IndexedDB wrapper for plannerDB
   Exposes: initDB, addTask, getTasks, getTask, updateTask, deleteTask
   All public functions return Promises.
   ============================================================= */

"use strict";

const DB_NAME    = "plannerDB";
const DB_VERSION = 1;
const STORE      = "tasks";

/* ── Open / initialise the database ─────────────────────────── */

let _db = null;   // cached connection

function initDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db    = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, {
          keyPath:       "id",
          autoIncrement: true,
        });
        // Indexes for fast lookups
        store.createIndex("due_date",  "due_date",  { unique: false });
        store.createIndex("completed", "completed", { unique: false });
      }
    };

    req.onsuccess = (e) => {
      _db = e.target.result;

      // If the connection is closed externally (e.g. browser upgrade), reset cache
      _db.onclose      = () => { _db = null; };
      _db.onversionchange = () => { _db.close(); _db = null; };

      resolve(_db);
    };

    req.onerror = (e) => reject(e.target.error);
  });
}

/* ── Internal transaction helper ────────────────────────────── */

async function _tx(mode, fn) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let result;

    try {
      result = fn(store);
    } catch (err) {
      tx.abort();
      return reject(err);
    }

    if (result && typeof result.onsuccess !== "undefined") {
      // fn returned an IDBRequest
      result.onsuccess = () => resolve(result.result);
      result.onerror   = (e) => reject(e.target.error);
    } else {
      // fn used tx.oncomplete pattern
      tx.oncomplete = () => resolve(result);
    }

    tx.onerror   = (e) => reject(e.target.error);
    tx.onabort   = (e) => reject(e.target.error);
  });
}

/* ── Public API ──────────────────────────────────────────────── */

/**
 * addTask(task)
 * Inserts a new task. The `id` field is auto-assigned.
 * Returns the full saved task object (with id).
 */
function addTask(task) {
  // Normalise and stamp created_at
  const record = Object.assign(
    {
      description: "",
      due_date:    null,
      start_time:  null,
      end_time:    null,
      created_at:  new Date().toISOString().split("T")[0],
      completed:   0,
    },
    task
  );
  // Remove any caller-supplied id so autoIncrement takes over
  delete record.id;

  return new Promise(async (resolve, reject) => {
    try {
      const db  = await initDB();
      const tx  = db.transaction(STORE, "readwrite");
      const req = tx.objectStore(STORE).add(record);

      req.onsuccess = () => {
        const newId = req.result;
        // Read the saved record back so we return it with its real id
        const getReq = tx.objectStore(STORE).get(newId);
        getReq.onsuccess = () => resolve(getReq.result);
        getReq.onerror   = (e) => reject(e.target.error);
      };

      req.onerror  = (e) => reject(e.target.error);
      tx.onerror   = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * getTasks()
 * Returns all tasks sorted by due_date ASC, start_time ASC, created_at DESC.
 */
function getTasks() {
  return new Promise(async (resolve, reject) => {
    try {
      const db  = await initDB();
      const tx  = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();

      req.onsuccess = () => {
        const tasks = req.result || [];
        tasks.sort((a, b) => {
          // due_date ASC (nulls last)
          const da = a.due_date || "9999-99-99";
          const db_ = b.due_date || "9999-99-99";
          if (da !== db_) return da < db_ ? -1 : 1;
          // start_time ASC (nulls last)
          const sa = a.start_time || "99:99";
          const sb = b.start_time || "99:99";
          if (sa !== sb) return sa < sb ? -1 : 1;
          // created_at DESC
          return (b.created_at || "") < (a.created_at || "") ? -1 : 1;
        });
        resolve(tasks);
      };

      req.onerror = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * getTask(id)
 * Returns a single task by id, or null if not found.
 */
function getTask(id) {
  return new Promise(async (resolve, reject) => {
    try {
      const db  = await initDB();
      const tx  = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror   = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * updateTask(task)
 * Full-replace update. Task must include its `id`.
 * Returns the updated task object.
 */
function updateTask(task) {
  if (!task || task.id == null) {
    return Promise.reject(new Error("updateTask: task.id is required"));
  }
  return new Promise(async (resolve, reject) => {
    try {
      const db  = await initDB();
      const tx  = db.transaction(STORE, "readwrite");
      const req = tx.objectStore(STORE).put(task);

      req.onsuccess = () => resolve(task);
      req.onerror   = (e) => reject(e.target.error);
      tx.onerror    = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * deleteTask(id)
 * Deletes a task by id. Resolves with { ok: true }.
 */
function deleteTask(id) {
  return new Promise(async (resolve, reject) => {
    try {
      const db  = await initDB();
      const tx  = db.transaction(STORE, "readwrite");
      const req = tx.objectStore(STORE).delete(id);

      req.onsuccess = () => resolve({ ok: true });
      req.onerror   = (e) => reject(e.target.error);
      tx.onerror    = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}