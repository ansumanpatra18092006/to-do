from flask import Flask, render_template, request, jsonify
import sqlite3
import os
from datetime import date
import subprocess

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(BASE_DIR, "database.db")


# ─────────────────────────────────────────
# Auto save database to GitHub
# ─────────────────────────────────────────

def save_db():
    try:
        subprocess.run(["git", "config", "--global", "user.email", "bot@example.com"])
        subprocess.run(["git", "config", "--global", "user.name", "RenderBot"])

        subprocess.run(["git", "add", "database.db"])
        subprocess.run(["git", "commit", "-m", "update database"], check=False)
        subprocess.run(["git", "push"])

    except Exception as e:
        print("DB save failed:", e)


# ─────────────────────────────────────────
# Database helpers
# ─────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():

    conn = get_db()

    conn.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            due_date TEXT,
            start_time TEXT,
            end_time TEXT,
            created_at TEXT DEFAULT (date('now')),
            completed INTEGER DEFAULT 0
        )
    """)

    conn.commit()
    conn.close()


# ─────────────────────────────────────────
# Pages
# ─────────────────────────────────────────

@app.route('/')
def index():
    return render_template("index.html")


@app.route('/timetable')
def timetable():
    return render_template("timetable.html")


@app.route('/calendar')
def calendar():
    return render_template("calendar.html")


@app.route('/stats')
def stats():
    return render_template("stats.html")


# ─────────────────────────────────────────
# Tasks API
# ─────────────────────────────────────────

@app.route('/api/tasks', methods=['GET'])
def get_tasks():

    f = request.args.get("filter", "all")
    dt = request.args.get("date")

    conn = get_db()

    query = "SELECT * FROM tasks WHERE 1=1"
    params = []

    if f == "completed":
        query += " AND completed=1"

    elif f == "pending":
        query += " AND completed=0"

    if dt:
        query += " AND due_date=?"
        params.append(dt)

    query += " ORDER BY due_date ASC, start_time ASC, created_at DESC"

    rows = conn.execute(query, params).fetchall()
    conn.close()

    return jsonify([dict(r) for r in rows])


@app.route('/api/tasks/today')
def today_tasks():

    today = date.today().isoformat()

    conn = get_db()

    rows = conn.execute(
        "SELECT * FROM tasks WHERE due_date=? ORDER BY start_time ASC",
        (today,)
    ).fetchall()

    conn.close()

    return jsonify([dict(r) for r in rows])


@app.route('/api/tasks', methods=['POST'])
def create_task():

    data = request.json

    conn = get_db()

    cur = conn.execute("""
        INSERT INTO tasks
        (title, description, due_date, start_time, end_time)
        VALUES (?, ?, ?, ?, ?)
    """, (
        data.get("title"),
        data.get("description", ""),
        data.get("due_date") or None,
        data.get("start_time") or None,
        data.get("end_time") or None
    ))

    conn.commit()

    task = conn.execute(
        "SELECT * FROM tasks WHERE id=?",
        (cur.lastrowid,)
    ).fetchone()

    conn.close()

    save_db()

    return jsonify(dict(task)), 201


@app.route('/api/tasks/<int:tid>', methods=['PUT'])
def update_task(tid):

    data = request.json

    conn = get_db()

    fields = []
    values = []

    for field in [
        "title",
        "description",
        "due_date",
        "start_time",
        "end_time",
        "completed"
    ]:
        if field in data:
            fields.append(f"{field}=?")
            values.append(data[field])

    if fields:
        values.append(tid)

        conn.execute(
            f"UPDATE tasks SET {','.join(fields)} WHERE id=?",
            values
        )

        conn.commit()

    task = conn.execute(
        "SELECT * FROM tasks WHERE id=?",
        (tid,)
    ).fetchone()

    conn.close()

    save_db()

    return jsonify(dict(task))


@app.route('/api/tasks/<int:tid>', methods=['DELETE'])
def delete_task(tid):

    conn = get_db()

    conn.execute(
        "DELETE FROM tasks WHERE id=?",
        (tid,)
    )

    conn.commit()
    conn.close()

    save_db()

    return jsonify({"ok": True})


# ─────────────────────────────────────────
# Stats API
# ─────────────────────────────────────────

@app.route('/api/stats')
def get_stats():

    conn = get_db()

    today = date.today().isoformat()
    week = date.today().strftime("%Y-%W")
    month = today[:7]

    total = conn.execute(
        "SELECT COUNT(*) FROM tasks"
    ).fetchone()[0]

    completed = conn.execute(
        "SELECT COUNT(*) FROM tasks WHERE completed=1"
    ).fetchone()[0]

    pending = total - completed

    overdue = conn.execute(
        "SELECT COUNT(*) FROM tasks WHERE completed=0 AND due_date<?",
        (today,)
    ).fetchone()[0]

    week_done = conn.execute(
        "SELECT COUNT(*) FROM tasks WHERE completed=1 AND strftime('%Y-%W', due_date)=?",
        (week,)
    ).fetchone()[0]

    month_done = conn.execute(
        "SELECT COUNT(*) FROM tasks WHERE completed=1 AND strftime('%Y-%m', due_date)=?",
        (month,)
    ).fetchone()[0]

    daily = conn.execute("""
        SELECT due_date as day, COUNT(*) as count
        FROM tasks
        WHERE completed=1 AND due_date >= date('now','-6 days')
        GROUP BY due_date
        ORDER BY due_date
    """).fetchall()

    conn.close()

    return jsonify({
        "total": total,
        "completed": completed,
        "pending": pending,
        "overdue": overdue,
        "week_done": week_done,
        "month_done": month_done,
        "rate": round(completed / total * 100) if total else 0,
        "daily": [dict(r) for r in daily]
    })


# ─────────────────────────────────────────
# Start Server
# ─────────────────────────────────────────

init_db()

if __name__ == "__main__":

    port = int(os.environ.get("PORT", 5000))

    app.run(
        host="0.0.0.0",
        port=port
    )