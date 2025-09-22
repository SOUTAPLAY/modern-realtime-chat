import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import crypto from 'crypto';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
pingInterval: 25000,
pingTimeout: 20000
});

app.use(express.static('public'));

const usersBySocket = new Map(); // socket.id -> { name, room }
const socketByName = new Map(); // name -> socket.id
const rooms = new Map(); // roomName -> { private: boolean, pass?: "salt:hash", members: Set<socket.id> }

function hashPassword(pw) {
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
return ${salt}:${hash};
}
function verifyPassword(pw, stored) {
const [salt, hash] = stored.split(':');
const test = crypto.scryptSync(pw, salt, 64).toString('hex');
return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
}
function broadcastLists() {
const users = Array.from(socketByName.keys());
const publicRooms = [];
for (const [name, r] of rooms) {
if (!r.private && r.members.size > 0) publicRooms.push({ name, count: r.members.size });
}
io.emit('lists', { users, rooms: publicRooms });
}
function leaveCurrentRoom(socket) {
const info = usersBySocket.get(socket.id);
if (!info || !info.room) return;
const roomName = info.room;
const r = rooms.get(roomName);
if (r) {
r.members.delete(socket.id);
socket.leave(roomName);
if (r.members.size === 0) rooms.delete(roomName);
}
info.room = null;
}

io.on('connection', (socket) => {
socket.on('joinRoom', (payload, cb) => {
try {
const { name, room, makePrivate = false, password = '' } = payload || {};
if (!name || !room) return cb?.({ ok: false, error: '名前と部屋名は必須です' });
if (name.length > 32 || room.length > 64) return cb?.({ ok: false, error: '入力が長すぎます' });
if (/^\s*$/.test(name) || /^\s*$/.test(room)) return cb?.({ ok: false, error: '空白のみは不可' });

  const existing = socketByName.get(name);
  if (existing && existing !== socket.id) {
    return cb?.({ ok: false, error: 'このユーザー名は使用中です' });
  }

  leaveCurrentRoom(socket);
  usersBySocket.set(socket.id, { name, room: null });
  socketByName.set(name, socket.id);

  let rec = rooms.get(room);
  if (!rec) {
    if (makePrivate && (!password || password.length < 4)) {
      return cb?.({ ok: false, error: 'プライベート部屋は4文字以上のパスワードが必要です' });
    }
    rec = { private: !!makePrivate, members: new Set() };
    if (rec.private) rec.pass = hashPassword(password);
    rooms.set(room, rec);
  } else {
    if (rec.private) {
      if (!password) return cb?.({ ok: false, error: 'この部屋はプライベートです。パスワードが必要です' });
      if (!verifyPassword(password, rec.pass)) return cb?.({ ok: false, error: 'パスワードが違います' });
    }
  }

  socket.join(room);
  rec.members.add(socket.id);
  usersBySocket.get(socket.id).room = room;

  cb?.({ ok: true, room, private: rec.private });
  socket.to(room).emit('system', { type: 'join', name, room });
  broadcastLists();
} catch {
  cb?.({ ok: false, error: 'サーバーエラー' });
}
});

socket.on('leaveRoom', (cb) => {
const info = usersBySocket.get(socket.id);
if (!info) return cb?.({ ok: true });
const { name, room } = info;
leaveCurrentRoom(socket);
cb?.({ ok: true });
if (room) socket.to(room).emit('system', { type: 'leave', name, room });
broadcastLists();
});

socket.on('message', (text) => {
const info = usersBySocket.get(socket.id);
if (!info || !info.room) return;
const msg = String(text || '').slice(0, 1000);
io.to(info.room).emit('message', { from: info.name, text: msg, ts: Date.now() });
});

socket.on('disconnect', () => {
const info = usersBySocket.get(socket.id);
if (info) {
const { name, room } = info;
leaveCurrentRoom(socket);
usersBySocket.delete(socket.id);
if (socketByName.get(name) === socket.id) socketByName.delete(name);
if (room) socket.to(room).emit('system', { type: 'leave', name, room });
}
broadcastLists();
});
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(listening on :${PORT}));
