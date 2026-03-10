from flask import Flask, render_template, request, jsonify
import sqlite3, os
from datetime import date, datetime

app = Flask(__name__)
DB = os.path.join(os.path.dirname(__file__), 'database.db')

# ── DB helpers ─────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT    NOT NULL,
            description TEXT    DEFAULT '',
            due_date    DATE,
            start_time  TIME,
            end_time    TIME,
            created_at  DATE    DEFAULT (date('now')),
            completed   INTEGER DEFAULT 0
        )
    """)
    conn.commit()
    conn.close()

# ── Pages ──────────────────────────────────────────────
@app.route('/')
def index():        return render_template('index.html')

@app.route('/timetable')
def timetable():    return render_template('timetable.html')

@app.route('/calendar')
def calendar_pg():  return render_template('calendar.html')

@app.route('/stats')
def stats_pg():     return render_template('stats.html')

# ── Tasks API ──────────────────────────────────────────
@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    f   = request.args.get('filter', 'all')
    dt  = request.args.get('date')          # filter by due_date
    conn = get_db()

    base = "SELECT * FROM tasks WHERE 1=1"
    params = []

    if f == 'completed':
        base += " AND completed=1"
    elif f == 'pending':
        base += " AND completed=0"

    if dt:
        base += " AND (due_date=? OR (start_time IS NOT NULL AND due_date=?))"
        params += [dt, dt]

    base += " ORDER BY due_date ASC, start_time ASC, created_at DESC"
    rows = conn.execute(base, params).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/tasks/today', methods=['GET'])
def get_today():
    today = date.today().isoformat()
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM tasks WHERE due_date=? ORDER BY start_time ASC, created_at DESC",
        (today,)
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/tasks', methods=['POST'])
def create_task():
    d = request.json
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO tasks (title,description,due_date,start_time,end_time) VALUES (?,?,?,?,?)",
        (d['title'], d.get('description',''),
         d.get('due_date') or None,
         d.get('start_time') or None,
         d.get('end_time')   or None)
    )
    conn.commit()
    task = dict(conn.execute("SELECT * FROM tasks WHERE id=?", (cur.lastrowid,)).fetchone())
    conn.close()
    return jsonify(task), 201

@app.route('/api/tasks/<int:tid>', methods=['GET'])
def get_task(tid):
    conn = get_db()
    row = conn.execute("SELECT * FROM tasks WHERE id=?", (tid,)).fetchone()
    conn.close()
    if not row: return jsonify({'error':'not found'}), 404
    return jsonify(dict(row))

@app.route('/api/tasks/<int:tid>', methods=['PUT'])
def update_task(tid):
    d = request.json
    conn = get_db()
    fields, vals = [], []
    for f in ('title','description','due_date','start_time','end_time','completed'):
        if f in d:
            fields.append(f"{f}=?")
            vals.append(d[f])
    if fields:
        vals.append(tid)
        conn.execute(f"UPDATE tasks SET {','.join(fields)} WHERE id=?", vals)
        conn.commit()
    task = dict(conn.execute("SELECT * FROM tasks WHERE id=?", (tid,)).fetchone())
    conn.close()
    return jsonify(task)

@app.route('/api/tasks/<int:tid>', methods=['DELETE'])
def delete_task(tid):
    conn = get_db()
    conn.execute("DELETE FROM tasks WHERE id=?", (tid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

# ── Stats API ──────────────────────────────────────────
@app.route('/api/stats')
def get_stats():
    conn  = get_db()
    today = date.today().isoformat()
    week  = date.today().strftime('%Y-%W')
    month = today[:7]

    total      = conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
    completed  = conn.execute("SELECT COUNT(*) FROM tasks WHERE completed=1").fetchone()[0]
    pending    = total - completed
    overdue    = conn.execute(
        "SELECT COUNT(*) FROM tasks WHERE completed=0 AND due_date<?", (today,)
    ).fetchone()[0]
    week_done  = conn.execute(
        "SELECT COUNT(*) FROM tasks WHERE completed=1 AND strftime('%Y-%W',due_date)=?", (week,)
    ).fetchone()[0]
    month_done = conn.execute(
        "SELECT COUNT(*) FROM tasks WHERE completed=1 AND strftime('%Y-%m',due_date)=?", (month,)
    ).fetchone()[0]

    # Daily completions last 7 days
    daily = conn.execute("""
        SELECT due_date as day, COUNT(*) as count
        FROM tasks
        WHERE completed=1 AND due_date >= date('now','-6 days')
        GROUP BY due_date ORDER BY due_date
    """).fetchall()

    conn.close()
    return jsonify({
        'total': total, 'completed': completed, 'pending': pending,
        'overdue': overdue, 'week_done': week_done, 'month_done': month_done,
        'rate': round(completed / total * 100) if total else 0,
        'daily': [dict(r) for r in daily]
    })

if __name__ == '__main__':
    init_db()
    app.run(debug=True)