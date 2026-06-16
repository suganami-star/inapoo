const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const { Server } = require('socket.io');
const { nanoid } = require('nanoid');

const PORT = process.env.PORT || 3000;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'rooms.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ rooms: {} }, null, 2));

const readDb = () => JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const writeDb = (db) => fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));

function defaultTimers() {
  const names = ['グループA', 'グループB', 'グループC', 'グループD', 'グループE'];
  return names.map((title, i) => ({
    id: i + 1,
    title,
    durationMs: 5 * 60 * 1000,
    remainingMs: 5 * 60 * 1000,
    running: false,
    endsAt: null,
  }));
}

function materializeTimer(timer) {
  if (!timer.running || !timer.endsAt) return timer;
  const remainingMs = Math.max(0, timer.endsAt - Date.now());
  return {
    ...timer,
    remainingMs,
    running: remainingMs > 0,
    endsAt: remainingMs > 0 ? timer.endsAt : null,
  };
}

function materializeRoom(room) {
  return { ...room, timers: room.timers.map(materializeTimer) };
}

function saveRoom(room) {
  const db = readDb();
  db.rooms[room.id] = materializeRoom(room);
  writeDb(db);
}

function getRoom(roomId) {
  const db = readDb();
  const room = db.rooms[roomId];
  if (!room) return null;
  const updated = materializeRoom(room);
  if (JSON.stringify(updated) !== JSON.stringify(room)) saveRoom(updated);
  return updated;
}

function publicRoom(room) {
  return {
    id: room.id,
    createdAt: room.createdAt,
    timers: room.timers.map(({ id, title, durationMs, remainingMs, running, endsAt }) => ({
      id, title, durationMs, remainingMs, running, endsAt
    }))
  };
}

function createRoom() {
  const room = {
    id: nanoid(10),
    adminKey: nanoid(32),
    createdAt: new Date().toISOString(),
    timers: defaultTimers(),
  };
  saveRoom(room);
  return room;
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.post('/api/rooms', (req, res) => {
  const room = createRoom();
  res.status(201).json({
    roomId: room.id,
    viewUrl: `${PUBLIC_BASE_URL}/r/${room.id}`,
    adminUrl: `${PUBLIC_BASE_URL}/admin/${room.id}?key=${room.adminKey}`,
  });
});

app.get('/api/rooms/:roomId', (req, res) => {
  const room = getRoom(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'ROOM_NOT_FOUND' });
  res.json(publicRoom(room));
});

function requireAdmin(req, res, next) {
  const room = getRoom(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'ROOM_NOT_FOUND' });
  if (req.header('x-admin-key') !== room.adminKey) return res.status(403).json({ error: 'ADMIN_ONLY' });
  req.room = room;
  next();
}

app.post('/api/rooms/:roomId/timers/:timerId/start', requireAdmin, (req, res) => {
  const timerId = Number(req.params.timerId);
  const room = req.room;
  const idx = room.timers.findIndex(t => t.id === timerId);
  if (idx < 0) return res.status(404).json({ error: 'TIMER_NOT_FOUND' });
  const timer = materializeTimer(room.timers[idx]);
  if (timer.remainingMs <= 0) timer.remainingMs = timer.durationMs;
  room.timers[idx] = { ...timer, running: true, endsAt: Date.now() + timer.remainingMs };
  saveRoom(room);
  io.to(room.id).emit('room:update', publicRoom(getRoom(room.id)));
  res.json(publicRoom(getRoom(room.id)));
});

app.post('/api/rooms/:roomId/timers/:timerId/stop', requireAdmin, (req, res) => {
  const timerId = Number(req.params.timerId);
  const room = req.room;
  const idx = room.timers.findIndex(t => t.id === timerId);
  if (idx < 0) return res.status(404).json({ error: 'TIMER_NOT_FOUND' });
  const timer = materializeTimer(room.timers[idx]);
  room.timers[idx] = { ...timer, running: false, endsAt: null };
  saveRoom(room);
  io.to(room.id).emit('room:update', publicRoom(getRoom(room.id)));
  res.json(publicRoom(getRoom(room.id)));
});

app.post('/api/rooms/:roomId/timers/:timerId/reset', requireAdmin, (req, res) => {
  const timerId = Number(req.params.timerId);
  const room = req.room;
  const idx = room.timers.findIndex(t => t.id === timerId);
  if (idx < 0) return res.status(404).json({ error: 'TIMER_NOT_FOUND' });
  room.timers[idx] = { ...room.timers[idx], remainingMs: room.timers[idx].durationMs, running: false, endsAt: null };
  saveRoom(room);
  io.to(room.id).emit('room:update', publicRoom(getRoom(room.id)));
  res.json(publicRoom(getRoom(room.id)));
});

app.patch('/api/rooms/:roomId/timers/:timerId', requireAdmin, (req, res) => {
  const timerId = Number(req.params.timerId);
  const room = req.room;
  const idx = room.timers.findIndex(t => t.id === timerId);
  if (idx < 0) return res.status(404).json({ error: 'TIMER_NOT_FOUND' });
  const title = String(req.body.title ?? room.timers[idx].title).slice(0, 40);
  const minutes = Number(req.body.minutes);
  const seconds = Number(req.body.seconds ?? 0);
  const totalMs = Number.isFinite(minutes) ? Math.max(1, Math.min(24 * 60 * 60, minutes * 60 + seconds)) * 1000 : room.timers[idx].durationMs;
  room.timers[idx] = { ...room.timers[idx], title, durationMs: totalMs, remainingMs: totalMs, running: false, endsAt: null };
  saveRoom(room);
  io.to(room.id).emit('room:update', publicRoom(getRoom(room.id)));
  res.json(publicRoom(getRoom(room.id)));
});

app.get(['/r/:roomId', '/admin/:roomId'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));

io.on('connection', (socket) => {
  socket.on('room:join', (roomId) => {
    const room = getRoom(roomId);
    if (!room) return socket.emit('room:error', 'ROOM_NOT_FOUND');
    socket.join(roomId);
    socket.emit('room:update', publicRoom(room));
  });
});

setInterval(() => {
  const db = readDb();
  Object.values(db.rooms).forEach((room) => {
    const updated = materializeRoom(room);
    if (updated.timers.some(t => t.running)) io.to(updated.id).emit('room:update', publicRoom(updated));
    if (JSON.stringify(updated) !== JSON.stringify(room)) saveRoom(updated);
  });
}, 1000);

server.listen(PORT, () => console.log(`Timer app running on ${PUBLIC_BASE_URL}`));
