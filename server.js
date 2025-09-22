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

// 静的ファイル提供
app.use(express.static('.'));

// データ構造
const usersBySocket = new Map(); // socket.id -> { name, room, socketId }
const socketByName = new Map();  // name -> socket.id
const rooms = new Map();         // roomName -> { private: boolean, password?: "salt:hash", members: Set<socket.id> }

// パスワードハッシュ関連
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const [salt, hash] = stored.split(':');
    const testHash = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(testHash, 'hex'));
  } catch {
    return false;
  }
}

// オンラインリスト配信
function broadcastLists() {
  const users = Array.from(socketByName.keys());
  const publicRooms = [];
  
  for (const [roomName, roomData] of rooms) {
    if (!roomData.private && roomData.members.size > 0) {
      publicRooms.push({ 
        name: roomName, 
        count: roomData.members.size 
      });
    }
  }
  
  io.emit('onlineLists', { users, rooms: publicRooms });
}

// ルーム退出処理
function leaveCurrentRoom(socket) {
  const userInfo = usersBySocket.get(socket.id);
  if (!userInfo || !userInfo.room) return;
  
  const roomName = userInfo.room;
  const roomData = rooms.get(roomName);
  
  if (roomData) {
    roomData.members.delete(socket.id);
    socket.leave(roomName);
    
    // ルーム内のユーザー一覧更新
    const roomMembers = Array.from(roomData.members).map(socketId => {
      const user = usersBySocket.get(socketId);
      return user ? user.name : null;
    }).filter(Boolean);
    
    io.to(roomName).emit('roomUsers', roomMembers);
    
    // 最後の人が抜けたらルーム削除
    if (roomData.members.size === 0) {
      rooms.delete(roomName);
    }
  }
  
  userInfo.room = null;
}

// システムメッセージ送信
function sendSystemMessage(room, type, userName) {
  const messages = {
    join: `🟢 ${userName} がルームに参加しました`,
    leave: `⚫ ${userName} がルームを退出しました`
  };
  
  io.to(room).emit('systemMessage', {
    type,
    message: messages[type] || '',
    timestamp: Date.now()
  });
}

// Socket.IO接続処理
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  
  // ルーム参加/作成
  socket.on('joinRoom', (data, callback) => {
    try {
      const { name, room, makePrivate = false, password = '' } = data || {};
      
      // バリデーション
      if (!name || !room) {
        return callback?.({ success: false, error: '名前とルーム名を入力してください' });
      }
      
      if (name.length > 32 || room.length > 64) {
        return callback?.({ success: false, error: '入力が長すぎます' });
      }
      
      if (/^\s*$/.test(name) || /^\s*$/.test(room)) {
        return callback?.({ success: false, error: '空白のみの入力は無効です' });
      }
      
      // 同名ユーザーチェック
      const existingSocket = socketByName.get(name);
      if (existingSocket && existingSocket !== socket.id) {
        return callback?.({ success: false, error: 'このユーザー名は既に使用中です' });
      }
      
      // 現在のルームから退出
      leaveCurrentRoom(socket);
      
      // ユーザー情報設定
      usersBySocket.set(socket.id, { name, room: null, socketId: socket.id });
      socketByName.set(name, socket.id);
      
      // ルーム処理
      let roomData = rooms.get(room);
      
      if (!roomData) {
        // 新規ルーム作成
        if (makePrivate && (!password || password.length < 4)) {
          return callback?.({ success: false, error: 'プライベートルームには4文字以上のパスワードが必要です' });
        }
        
        roomData = {
          private: makePrivate,
          members: new Set()
        };
        
        if (makePrivate) {
          roomData.password = hashPassword(password);
        }
        
        rooms.set(room, roomData);
      } else {
        // 既存ルームに参加
        if (roomData.private) {
          if (!password) {
            return callback?.({ success: false, error: 'このルームはプライベートです。パスワードが必要です' });
          }
          
          if (!verifyPassword(password, roomData.password)) {
            return callback?.({ success: false, error: 'パスワードが間違っています' });
          }
        }
      }
      
      // ルーム参加
      socket.join(room);
      roomData.members.add(socket.id);
      usersBySocket.get(socket.id).room = room;
      
      // レスポンス
      callback?.({ 
        success: true, 
        room,
        isPrivate: roomData.private,
        userCount: roomData.members.size
      });
      
      // ルーム内ユーザー一覧更新
      const roomMembers = Array.from(roomData.members).map(socketId => {
        const user = usersBySocket.get(socketId);
        return user ? user.name : null;
      }).filter(Boolean);
      
      io.to(room).emit('roomUsers', roomMembers);
      
      // システムメッセージ送信
      sendSystemMessage(room, 'join', name);
      
      // オンラインリスト更新
      broadcastLists();
      
    } catch (error) {
      console.error('Error in joinRoom:', error);
      callback?.({ success: false, error: 'サーバーエラーが発生しました' });
    }
  });
  
  // ルーム退出
  socket.on('leaveRoom', (callback) => {
    const userInfo = usersBySocket.get(socket.id);
    if (!userInfo) {
      return callback?.({ success: true });
    }
    
    const { name, room } = userInfo;
    
    leaveCurrentRoom(socket);
    
    if (room) {
      sendSystemMessage(room, 'leave', name);
    }
    
    callback?.({ success: true });
    broadcastLists();
  });
  
  // メッセージ送信（メッセージ1）
  socket.on('sendMessage1', (data) => {
    const userInfo = usersBySocket.get(socket.id);
    if (!userInfo || !userInfo.room) return;
    
    const message = String(data.message || '').slice(0, 1000);
    if (!message.trim()) return;
    
    io.to(userInfo.room).emit('receiveMessage1', {
      name: userInfo.name,
      message: message,
      room: userInfo.room,
      timestamp: Date.now()
    });
  });
  
  // メッセージ送信（メッセージ2）
  socket.on('sendMessage2', (data) => {
    const userInfo = usersBySocket.get(socket.id);
    if (!userInfo || !userInfo.room) return;
    
    const message = String(data.message || '').slice(0, 1000);
    if (!message.trim()) return;
    
    io.to(userInfo.room).emit('receiveMessage2', {
      name: userInfo.name,
      message: message,
      room: userInfo.room,
      timestamp: Date.now()
    });
  });
  
  // 切断処理
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    
    const userInfo = usersBySocket.get(socket.id);
    if (userInfo) {
      const { name, room } = userInfo;
      
      leaveCurrentRoom(socket);
      usersBySocket.delete(socket.id);
      
      if (socketByName.get(name) === socket.id) {
        socketByName.delete(name);
      }
      
      if (room) {
        sendSystemMessage(room, 'leave', name);
      }
    }
    
    broadcastLists();
  });
});

// サーバー起動
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Modern Realtime Chat server is running on port ${PORT}`);
  console.log(`📱 Access: http://localhost:${PORT}`);
});