import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  pingInterval: 25000,
  pingTimeout: 20000,
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// 静的ファイル配信（リポジトリ直下のindex.html等をそのまま配信）
app.use(express.static(__dirname, { extensions: ['html'] }));

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 状態管理
const usersBySocket = new Map(); // socket.id -> { name, room }
const socketByName = new Map();  // name -> socket.id
// roomName -> { private: boolean, pass?: "salt:hash", members: Set<socket.id> }
const rooms = new Map();

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(pw, stored) {
  try {
    const [salt, hash] = stored.split(':');
    const test = crypto.scryptSync(pw, salt, 64).toString('hex');
    // 長さを固定しつつ比較
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
  } catch (error) {
    console.error('Password verification error:', error);
    return false;
  }
}

function buildLists() {
  const users = Array.from(socketByName.keys());
  const publicRooms = [];
  for (const [name, r] of rooms) {
    if (!r.private && r.members.size > 0) {
      publicRooms.push({ name, count: r.members.size });
    }
  }
  return { users, rooms: publicRooms };
}

function broadcastLists() {
  io.emit('lists', buildLists());
}

function sendListsTo(socket) {
  socket.emit('lists', buildLists());
}

function socketName(socketId) {
  const info = usersBySocket.get(socketId);
  return info?.name || null;
}

function broadcastRoomMembers(roomName) {
  const r = rooms.get(roomName);
  if (!r) return;
  const users = Array.from(r.members).map(id => socketName(id)).filter(Boolean);
  io.to(roomName).emit('roomMembers', { room: roomName, users, count: users.length });
}

function leaveCurrentRoom(socket) {
  const info = usersBySocket.get(socket.id);
  if (!info || !info.room) return;
  const roomName = info.room;
  const r = rooms.get(roomName);
  if (r) {
    r.members.delete(socket.id);
    socket.leave(roomName);
    if (r.members.size === 0) {
      rooms.delete(roomName); // 人がいなくなったら部屋は消滅
    } else {
      broadcastRoomMembers(roomName);
    }
  }
  info.room = null;
}

io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);
  
  // 初回接続時に現在のオンライン一覧を返す
  sendListsTo(socket);

  socket.on('joinRoom', (payload, cb) => {
    try {
      const { name, room, makePrivate = false, password = '' } = payload || {};
      if (!name || !room) return cb?.({ ok: false, error: '名前と部屋名は必須です' });
      if (name.length > 32 || room.length > 64) return cb?.({ ok: false, error: '入力が長すぎます' });
      if (/^\s*$/.test(name) || /^\s*$/.test(room)) return cb?.({ ok: false, error: '空白のみは不可' });

      // ユーザー名の重複を防ぐ
      const existing = socketByName.get(name);
      if (existing && existing !== socket.id) {
        return cb?.({ ok: false, error: 'このユーザー名は使用中です' });
      }

      // 既存の部屋から離脱
      leaveCurrentRoom(socket);

      // ユーザー登録/更新
      usersBySocket.set(socket.id, { name, room: null });
      socketByName.set(name, socket.id);

      // ルーム取得/作成
      let rec = rooms.get(room);
      if (!rec) {
        // 新規作成
        if (makePrivate && (!password || password.length < 4)) {
          return cb?.({ ok: false, error: 'プライベート部屋は4文字以上のパスワードが必要です' });
        }
        rec = { private: !!makePrivate, members: new Set() };
        if (rec.private) rec.pass = hashPassword(password);
        rooms.set(room, rec);
      } else {
        // 既存部屋へ参加
        if (rec.private) {
          if (!password) return cb?.({ ok: false, error: 'この部屋はプライベートです。パスワードが必要です' });
          if (!verifyPassword(password, rec.pass)) return cb?.({ ok: false, error: 'パスワードが違います' });
        }
      }

      // 参加処理
      socket.join(room);
      rec.members.add(socket.id);
      usersBySocket.get(socket.id).room = room;

      cb?.({ ok: true, room, private: rec.private });
      socket.to(room).emit('system', { type: 'join', name, room });

      broadcastLists();          // グローバル一覧更新
      broadcastRoomMembers(room); // 部屋内メンバー更新
    } catch (e) {
      console.error('joinRoom error:', e);
      cb?.({ ok: false, error: 'サーバーエラー' });
    }
  });

  socket.on('leaveRoom', (cb) => {
    try {
      const info = usersBySocket.get(socket.id);
      const prevRoom = info?.room || null;
      const name = info?.name || null;

      leaveCurrentRoom(socket);
      cb?.({ ok: true });

      if (prevRoom && name) {
        socket.to(prevRoom).emit('system', { type: 'leave', name, room: prevRoom });
      }
      broadcastLists();
    } catch (e) {
      console.error('leaveRoom error:', e);
      cb?.({ ok: false, error: 'サーバーエラー' });
    }
  });

  socket.on('message', (text) => {
    try {
      const info = usersBySocket.get(socket.id);
      if (!info || !info.room) return;
      const msg = String(text || '').slice(0, 1000);
      io.to(info.room).emit('message', { from: info.name, text: msg, ts: Date.now() });
    } catch (e) {
      console.error('message error:', e);
    }
  });

  socket.on('disconnect', () => {
    try {
      console.log(`Disconnection: ${socket.id}`);
      const info = usersBySocket.get(socket.id);
      if (info) {
        const { name, room } = info;
        leaveCurrentRoom(socket);
        usersBySocket.delete(socket.id);
        if (socketByName.get(name) === socket.id) socketByName.delete(name);
        if (room) socket.to(room).emit('system', { type: 'leave', name, room });
      }
      broadcastLists(); // 即オフライン反映
    } catch (e) {
      console.error('disconnect error:', e);
    }
  });

  socket.on('error', (error) => {
    console.error(`Socket error for ${socket.id}:`, error);
  });
});

// Render では動的にポートが割り当てられる
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`Server is running on http://${HOST}:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'production'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});