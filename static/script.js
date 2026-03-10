/* ── Helpers ───────────────────────────────────────── */

const $ = id => document.getElementById(id)

function toast(msg, dur = 2800){

  const el = $('toast')
  if(!el) return

  el.textContent = msg
  el.classList.add('show')

  clearTimeout(toast._t)

  toast._t = setTimeout(() =>
    el.classList.remove('show')
  , dur)
}


function escHtml(s){

  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')

}


async function api(url, method='GET', body){

  const opts = {
    method,
    headers:{'Content-Type':'application/json'}
  }

  if(body !== undefined)
    opts.body = JSON.stringify(body)

  const r = await fetch(url, opts)

  if(method === 'DELETE' || r.status === 204)
    return null

  return r.json()

}


/* ── Time parsing (2 pm → 14:00) ───────────────────── */

function parseTimeInput(val){

  if(!val) return null

  val = val.trim().toLowerCase()

  const match = val.match(/^(\d{1,2})(:(\d{2}))?\s*(am|pm)$/)

  if(!match) return null

  let hour = parseInt(match[1])
  let min  = parseInt(match[3] || "0")
  const ap = match[4]

  if(ap === "pm" && hour !== 12) hour += 12
  if(ap === "am" && hour === 12) hour = 0

  return `${String(hour).padStart(2,'0')}:${String(min).padStart(2,'0')}`

}


/* ── Format 24h → 12h display ───────────────────── */

function fmt12(t){

  if(!t) return ''

  const [h,m] = t.split(':').map(Number)

  const ap = h >= 12 ? 'PM' : 'AM'

  return `${h%12||12}:${String(m).padStart(2,'0')} ${ap}`

}


function formatDate(d){

  if(!d) return ''

  const [y,m,day] = d.split('-')

  return new Date(y,m-1,day)
  .toLocaleDateString('en-US',{month:'short',day:'numeric'})

}


const todayISO = () => new Date().toISOString().split('T')[0]


/* ── TASK PAGE ───────────────────────────────────── */

if($('task-list')){

let currentFilter = 'all'


function dateChip(t){

  if(!t.due_date) return ''

  const today = todayISO()

  if(!t.completed && t.due_date < today)
  return `<span class="meta-chip chip-overdue">⚠ Overdue · ${formatDate(t.due_date)}</span>`

  if(t.due_date === today)
  return `<span class="meta-chip chip-today">Today</span>`

  return `<span class="meta-chip chip-date">📅 ${formatDate(t.due_date)}</span>`

}


function timeChip(t){

  if(!t.start_time) return ''

  const label = t.end_time
    ? `${fmt12(t.start_time)} – ${fmt12(t.end_time)}`
    : fmt12(t.start_time)

  return `<span class="meta-chip chip-time">⏱ ${label}</span>`

}


function renderTask(t){

  const today = todayISO()

  const isOverdue = !t.completed && t.due_date && t.due_date < today
  const isToday   = t.due_date === today

  let cls = 'task-card'

  if(t.completed) cls += ' done'
  if(isOverdue) cls += ' overdue'
  else if(isToday) cls += ' today-task'

  const card = document.createElement('div')
  card.className = cls
  card.dataset.id = t.id

  card.innerHTML = `
  <input type="checkbox" class="task-check" ${t.completed?'checked':''}>

  <div class="task-body">

    <div class="task-title">${escHtml(t.title)}</div>

    ${t.description ?
      `<div class="task-desc">${escHtml(t.description)}</div>` : ''}

    <div class="task-meta">
      ${dateChip(t)}${timeChip(t)}
    </div>

  </div>

  <div class="task-actions">
    <button class="btn btn-sm btn-ghost edit-btn">Edit</button>
    <button class="btn btn-sm btn-danger del-btn">✕</button>
  </div>
  `


  card.querySelector('.task-check')
  .addEventListener('change', async e => {

    await api(`/api/tasks/${t.id}`,'PUT',{
      completed:e.target.checked ? 1 : 0
    })

    loadTasks()

  })


  card.querySelector('.del-btn')
  .addEventListener('click', async ()=>{

    if(!confirm(`Delete "${t.title}"?`)) return

    await api(`/api/tasks/${t.id}`,'DELETE')

    card.remove()

    toast('Task deleted.')

  })


  return card

}


async function loadTasks(){

  const tasks = await api(`/api/tasks?filter=${currentFilter}`)

  const list = $('task-list')

  list.innerHTML = ''

  if(!tasks.length){

    list.innerHTML =
    `<div class="empty">
      <div class="empty-icon">📋</div>
      <p>No tasks here yet.</p>
    </div>`

    return

  }

  tasks.forEach(t =>
    list.appendChild(renderTask(t))
  )

}


/* ── Filters ───────────────── */

document.querySelectorAll('.filter-btn')
.forEach(btn => {

btn.addEventListener('click',()=>{

document.querySelectorAll('.filter-btn')
.forEach(b=>b.classList.remove('active'))

btn.classList.add('active')

currentFilter = btn.dataset.filter

loadTasks()

})

})


/* ── Add Task ───────────────── */

$('add-form').addEventListener('submit', async e => {

e.preventDefault()

const title = $('f-title').value.trim()

if(!title) return

const start_time = parseTimeInput($('f-start').value)
const end_time   = parseTimeInput($('f-end').value)

await api('/api/tasks','POST',{

title,
description:$('f-desc').value.trim(),
due_date:$('f-due').value || null,
start_time,
end_time

})

$('add-form').reset()

loadTasks()

toast('Task added ✓')

})


loadTasks()

}