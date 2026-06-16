const path = location.pathname.split('/').filter(Boolean);
const isAdmin = path[0] === 'admin';
const roomId = path[1];
const adminKey = new URLSearchParams(location.search).get('key') || '';
const socket = io();
const timersEl = document.getElementById('timers');
const adminTimersEl = document.getElementById('adminTimers');
const template = document.getElementById('timerTemplate');
const modeLabel = document.getElementById('modeLabel');
const clockEl = document.getElementById('clock');

modeLabel.textContent = isAdmin ? 'ADMIN MODE' : 'VIEW MODE';
document.body.classList.toggle('isAdmin', isAdmin);

const viewUrl = `${location.origin}/r/${roomId}`;
const adminUrl = `${location.origin}/admin/${roomId}?key=${adminKey}`;
const viewInput = document.getElementById('viewUrl');
const adminInput = document.getElementById('adminUrl');
if (viewInput) viewInput.value = viewUrl;
if (adminInput) adminInput.value = adminUrl;

async function copyText(text, message) {
  await navigator.clipboard.writeText(text);
  alert(message);
}

document.getElementById('copyView').addEventListener('click', () => copyText(viewUrl, '閲覧URLをコピーしました'));
document.getElementById('copyView2')?.addEventListener('click', () => copyText(viewUrl, '閲覧URLをコピーしました'));
document.getElementById('copyAdmin')?.addEventListener('click', () => copyText(adminUrl, '管理者URLをコピーしました'));

function updateClock() {
  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  clockEl.textContent = `現在時刻：${y}/${mo}/${d} ${h}:${mi}:${s}`;
}
updateClock();
setInterval(updateClock, 1000);

socket.emit('room:join', roomId);
socket.on('room:update', render);
socket.on('room:error', () => {
  timersEl.innerHTML = '<p class="error">タイマーボードが見つかりません。</p>';
});

function fmt(ms) {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

async function api(timerId, action, body) {
  const options = {
    method: body ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
  };
  if (body) options.body = JSON.stringify(body);
  const url = body ? `/api/rooms/${roomId}/timers/${timerId}` : `/api/rooms/${roomId}/timers/${timerId}/${action}`;
  const res = await fetch(url, options);
  if (!res.ok) alert('操作権限がない、または通信に失敗しました。');
}

function makeCard(timer, controls = false) {
  const node = template.content.cloneNode(true);
  const card = node.querySelector('.card');
  const time = node.querySelector('.time');
  const progress = node.querySelector('.progress span');
  const ring = node.querySelector('.ring');
  const percent = node.querySelector('.percent');
  const pctRemaining = timer.durationMs > 0 ? Math.max(0, Math.min(100, timer.remainingMs / timer.durationMs * 100)) : 0;
  const pctElapsed = Math.round(100 - pctRemaining);

  node.querySelector('.title').textContent = timer.title;
  node.querySelector('.status').textContent = timer.running ? 'RUNNING' : timer.remainingMs <= 0 ? 'FINISHED' : 'STOPPED';
  node.querySelector('.statusText').textContent = timer.running ? '実行中' : timer.remainingMs <= 0 ? '終了' : '停止中';
  time.textContent = fmt(timer.remainingMs);
  progress.style.width = `${pctRemaining}%`;
  ring.style.setProperty('--pct', `${pctElapsed}%`);
  percent.textContent = `${pctElapsed}%`;
  card.classList.toggle('done', timer.remainingMs <= 0);
  card.classList.toggle('running', timer.running);

  const titleInput = node.querySelector('.titleInput');
  const minInput = node.querySelector('.minInput');
  const secInput = node.querySelector('.secInput');
  titleInput.value = timer.title;
  minInput.value = Math.floor(timer.durationMs / 60000);
  secInput.value = Math.floor((timer.durationMs % 60000) / 1000);

  if (!controls) {
    node.querySelector('.settings').remove();
    node.querySelector('.actions').remove();
  } else {
    node.querySelector('.start').onclick = () => api(timer.id, 'start');
    node.querySelector('.stop').onclick = () => api(timer.id, 'stop');
    node.querySelector('.reset').onclick = () => api(timer.id, 'reset');
    node.querySelector('.settings').onsubmit = (e) => {
      e.preventDefault();
      api(timer.id, null, { title: titleInput.value, minutes: minInput.value, seconds: secInput.value });
    };
  }
  return node;
}

function render(room) {
  timersEl.innerHTML = '';
  room.timers.forEach(timer => timersEl.appendChild(makeCard(timer, false)));

  if (isAdmin && adminTimersEl) {
    adminTimersEl.innerHTML = '';
    room.timers.forEach(timer => adminTimersEl.appendChild(makeCard(timer, true)));
  }
}
