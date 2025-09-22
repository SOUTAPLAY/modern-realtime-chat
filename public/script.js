// public/script.js
const socket = io();

// 入力UI
const nameEl = document.getElementById('name');
const roomEl = document.getElementById('room');
const privateEl = document.getElementById('private');
const passwordEl = document.getElementById('password');
const joinBtn = document.getElementById('join');
const leaveBtn = document.getElementById('leave');
const errorEl = document.getElementById('joinError');

// ステータス/送受信UI
const statusEl = document.getElementById('status');
const msgEl = document.getElementById('msg');
const sendBtn = document.getElementById('send');

// オンライン一覧
const onlineUsersEl = document.getElementById('onlineUsers');
const onlineRoomsEl = document.getElementById('onlineRooms');

// ここが重要: 表示先は .message-display
const messageDisplay = document.querySelector('.message-display');

let joinedRoom = null;

// プライベート部屋のパスワード入力の有効/無効
if (privateEl && passwordEl) {
  passwordEl.disabled = !privateEl.checked;
  privateEl.addEventListener('change', () => {
    passwordEl.disabled = !privateEl.checked;
    if (!privateEl.checked) passwordEl.value = '';
  });
}

// 参加処理
if (joinBtn) {
  joinBtn.addEventListener('click', () => {
    const name = (nameEl?.value || '').trim();
    const room = (roomEl?.value || '').trim();
    const makePrivate = !!privateEl?.checked;
    const password = passwordEl?.value || '';

    if (errorEl) errorEl.textContent = '';
    socket.emit('joinRoom', { name, room, makePrivate, password }, (res) => {
      if (!res?.ok) {
        if (errorEl) errorEl.textContent = res?.error || '入室に失敗しました';
        return;
      }
      joinedRoom = res.room;
      if (statusEl) statusEl.textContent = `入室中: ${res.room} ${res.private ? '(プライベート)' : ''}`;
      if (joinBtn) joinBtn.disabled = true;
      if (leaveBtn) leaveBtn.disabled = false;
      if (sendBtn) sendBtn.disabled = false;

      if (nameEl) nameEl.disabled = true;
      if (roomEl) roomEl.disabled = true;
      if (privateEl) privateEl.disabled = true;
      if (passwordEl) passwordEl.disabled = true;

      // 既存表示をクリア
      clearMessages();
    });
  });
}

// 退室処理
if (leaveBtn) {
  leaveBtn.addEventListener('click', () => {
    socket.emit('leaveRoom', () => {
      joinedRoom = null;
      if (statusEl) statusEl.textContent = '未入室';
      if (joinBtn) joinBtn.disabled = false;
      if (leaveBtn) leaveBtn.disabled = true;
      if (sendBtn) sendBtn.disabled = true;

      if (nameEl) nameEl.disabled = false;
      if (roomEl) roomEl.disabled = false;
      if (privateEl) privateEl.disabled = false;
      if (passwordEl) passwordEl.disabled = !privateEl?.checked;
    });
  });
}

// 送信処理
if (sendBtn) {
  sendBtn.addEventListener('click', send);
}

// Enterで送信（Shift+Enterは改行、IME入力中は無視）
if (msgEl) {
  msgEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  });
}

function send() {
  const text = (msgEl?.value || '').trim();
  if (!text) return;
  if (!joinedRoom) {
    // 未入室なら送信不可
    return;
  }
  socket.emit('message', text);
  if (msgEl) msgEl.value = '';
}

// 受信: チャットメッセージ
socket.on('message', (m) => {
  // m = { from, text, ts }
  renderChatMessage(m);
});

// 受信: システム通知（入退室）
socket.on('system', (ev) => {
  if (ev?.type === 'join') {
    renderSystemLine(`🔵 ${ev.name} が入室`);
  } else if (ev?.type === 'leave') {
    renderSystemLine(`⚫ ${ev.name} が退室`);
  }
});

// 受信: オンラインリスト
socket.on('lists', ({ users, rooms }) => {
  if (onlineUsersEl) {
    onlineUsersEl.innerHTML = '';
    users.forEach(u => {
      const li = document.createElement('li');
      li.textContent = u;
      onlineUsersEl.appendChild(li);
    });
  }
  if (onlineRoomsEl) {
    onlineRoomsEl.innerHTML = '';
    rooms.forEach(r => {
      const li = document.createElement('li');
      li.textContent = `${r.name} (${r.count})`;
      onlineRoomsEl.appendChild(li);
    });
  }
});

// 接続系ログ（必要なら有効化）
socket.on('connect', () => {
  // console.log('[socket] connected:', socket.id);
});
socket.on('disconnect', () => {
  // console.log('[socket] disconnected');
});

/* ===== 表示系（.message-display に .message.system-message を追加） ===== */

// 時刻フォーマット HH:MM:SS
function hhmmss(ts) {
  const d = new Date(ts || Date.now());
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function ensureDisplay() {
  if (!messageDisplay) {
    console.warn('.message-display が見つかりません。メッセージを表示できません。');
    return false;
  }
  return true;
}

function clearMessages() {
  if (!messageDisplay) return;
  messageDisplay.innerHTML = '';
}

function renderChatMessage(m) {
  if (!ensureDisplay()) return;

  const wrap = document.createElement('div');
  wrap.className = 'message system-message';

  const nameEl = document.createElement('div');
  nameEl.textContent = m?.from || 'Unknown';

  const textEl = document.createElement('div');
  textEl.textContent = m?.text || '';

  const timeEl = document.createElement('div');
  timeEl.textContent = hhmmss(m?.ts || Date.now());

  wrap.appendChild(nameEl);
  wrap.appendChild(textEl);
  wrap.appendChild(timeEl);

  messageDisplay.appendChild(wrap);
  messageDisplay.scrollTop = messageDisplay.scrollHeight;
}

function renderSystemLine(line) {
  if (!ensureDisplay()) return;

  const wrap = document.createElement('div');
  wrap.className = 'message system-message';

  const nameEl = document.createElement('div');
  nameEl.textContent = 'System';

  const textEl = document.createElement('div');
  textEl.textContent = line;

  const timeEl = document.createElement('div');
  timeEl.textContent = hhmmss(Date.now());

  wrap.appendChild(nameEl);
  wrap.appendChild(textEl);
  wrap.appendChild(timeEl);

  messageDisplay.appendChild(wrap);
  messageDisplay.scrollTop = messageDisplay.scrollHeight;
}

/* ===== デバッグ補助 ===== */
window.debugChat = {
  // ネットワーク経由で送信（相手にも見える）
  send(text = 'This is a test message') {
    socket.emit('message', text);
  },
  // ローカルのみ描画（相手には見えない）
  addLocal() {
    renderChatMessage({ from: 'Test User', text: 'This is a test message', ts: Date.now() });
  }
};
