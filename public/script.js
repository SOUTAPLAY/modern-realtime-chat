/* Socket.IO クライアント */
let socket;

// Socket.IOの初期化を遅延実行
function initializeSocket() {
  if (typeof io === 'undefined') {
    console.error('Socket.IO not available');
    return false;
  }
  
  socket = io();
  setupSocketListeners();
  console.log('Socket.IO initialized');
  return true;
}

/* 要素参照（HTMLのIDと対応） */
const connectionPanel = document.getElementById('connectionPanel');
const chatArea = document.getElementById('chatArea');

const nameInput = document.getElementById('nameInput');
const roomInput = document.getElementById('roomInput');
const privateCheckbox = document.getElementById('privateCheckbox');
const passwordGroup = document.getElementById('passwordGroup');
const passwordInput = document.getElementById('passwordInput');

const joinButton = document.getElementById('joinButton');
const leaveButton = document.getElementById('leaveButton');

const currentRoomEl = document.getElementById('currentRoom');
const currentUserEl = document.getElementById('currentUser');
const userCountEl = document.getElementById('userCount');

// メッセージ表示・入力エリア
const messageDisplay1 = document.getElementById('messageDisplay1');
const messageDisplay2 = document.getElementById('messageDisplay2');
const inputText1 = document.getElementById('inputText1');
const inputText2 = document.getElementById('inputText2');

const onlineUsersBox = document.getElementById('onlineUsers');
const onlineRoomsBox = document.getElementById('onlineRooms');
const roomUsersBox = document.getElementById('roomUsers');

const themeToggle = document.getElementById('themeToggle');
const visibilityToggle = document.getElementById('visibilityToggle');

let joinedRoom = null;
let myName = null;

/* Socket.IOイベントリスナー設定 */
function setupSocketListeners() {
  if (!socket) return;
  
  socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
  });

  // リアルタイム入力受信（履歴なし・上書き表示）
  socket.on('typing:update', (payload) => {
    const { from, text, channel, ts } = payload || {};
    console.log(`Received typing update from ${from}, channel ${channel}:`, text);
    renderTypingMessage(from, text, channel, ts);
  });

  socket.on('system', (ev) => {
    console.log('System event received:', ev);
    if (ev.type === 'join') addSystemMessage(`🔵 ${ev.name} が入室しました`);
    if (ev.type === 'leave') addSystemMessage(`⚫ ${ev.name} が退出しました`);
  });

  socket.on('lists', ({ users, rooms }) => {
    console.log('Lists updated:', { users: users?.length, rooms: rooms?.length });
    renderOnlineUsers(users || []);
    renderOnlineRooms(rooms || []);
  });

  socket.on('roomMembers', ({ users = [], count = 0 }) => {
    console.log('Room members updated:', { users, count });
    if (userCountEl) userCountEl.textContent = String(count);
    renderRoomUsers(users);
  });
}

/* UI: テーマ切替 */
(function initTheme() {
  const key = 'theme';
  const saved = localStorage.getItem(key);
  if (saved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const curr = document.documentElement.getAttribute('data-theme');
      const next = curr === 'dark' ? null : 'dark';
      if (next) {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem(key, 'dark');
      } else {
        document.documentElement.removeAttribute('data-theme');
        localStorage.removeItem(key);
      }
    });
  }
})();

/* UI: ルーム名の可視/不可視切替 */
let roomHidden = false;
if (visibilityToggle && roomInput) {
  visibilityToggle.addEventListener('click', () => {
    roomHidden = !roomHidden;
    try {
      roomInput.type = roomHidden ? 'password' : 'text';
    } catch {
      // 一部ブラウザでtype変更不可のケースを握り潰し
    }
  });
}

/* プライベートチェックでパスワード欄の表示切替 */
if (privateCheckbox && passwordGroup && passwordInput) {
  privateCheckbox.addEventListener('change', () => {
    const show = privateCheckbox.checked;
    passwordGroup.style.display = show ? 'block' : 'none';
    if (!show) passwordInput.value = '';
  });
}

/* 入室/作成 */
if (joinButton && nameInput && roomInput) {
  joinButton.addEventListener('click', () => {
    if (!socket || !socket.connected) {
      alert('サーバーとの接続がありません。ページを再読み込みしてください。');
      return;
    }
    
    const name = (nameInput.value || '').trim();
    const room = (roomInput.value || '').trim();
    const makePrivate = privateCheckbox ? privateCheckbox.checked : false;
    const password = passwordInput ? passwordInput.value : '';

    if (!name || !room) {
      alert('名前と部屋名を入力してください。');
      return;
    }

    console.log('Attempting to join room:', { name, room, makePrivate });
    
    socket.emit('joinRoom', { name, room, makePrivate, password }, (res) => {
      console.log('Join room response:', res);
      if (!res?.ok) {
        alert(res?.error || '入室に失敗しました');
        return;
      }
      joinedRoom = res.room;
      myName = name;

      console.log('Successfully joined room:', joinedRoom, 'as:', myName);

      // 画面切替
      if (connectionPanel) connectionPanel.style.display = 'none';
      if (chatArea) chatArea.style.display = 'flex';

      if (currentRoomEl) currentRoomEl.textContent = res.room + (res.private ? '（プライベート）' : '');
      if (currentUserEl) currentUserEl.textContent = `あなた: ${name}`;
      if (userCountEl) userCountEl.textContent = '1';

      clearAllMessages();
      if (inputText1) inputText1.focus();
    });
  });
}

/* 退室 */
if (leaveButton) {
  leaveButton.addEventListener('click', () => {
    if (!socket) return;
    
    console.log('Leaving room:', joinedRoom);
    
    socket.emit('leaveRoom', () => {
      console.log('Left room successfully');
      joinedRoom = null;
      myName = null;
      
      // 画面戻す
      if (chatArea) chatArea.style.display = 'none';
      if (connectionPanel) connectionPanel.style.display = 'flex';
      renderRoomUsers([]);
      clearAllMessages();
    });
  });
}

/* リアルタイム入力処理 */
function setupRealtimeInput(inputElement, channel) {
  if (!inputElement) return;
  
  let lastValue = '';
  
  const sendUpdate = throttle(() => {
    const currentValue = inputElement.value || '';
    if (currentValue === lastValue) return;
    lastValue = currentValue;
    
    if (!socket || !socket.connected || !joinedRoom) return;
    
    console.log(`Sending typing update for channel ${channel}:`, currentValue);
    socket.emit('typing:update', { text: currentValue, channel });
  }, 100); // 100ms間隔で送信

  inputElement.addEventListener('input', sendUpdate);
  
  // フォーカス時の状態確認
  inputElement.addEventListener('focus', () => {
    if (!socket || !socket.connected) {
      console.warn('Input focused but socket not connected');
    }
    if (!joinedRoom) {
      console.warn('Input focused but not in room');
    }
  });
}

// 入力欄をセットアップ
setupRealtimeInput(inputText1, '1');
setupRealtimeInput(inputText2, '2');

/* 表示処理（履歴なし・上書き表示） */
function renderTypingMessage(from, text, channel, ts) {
  console.log(`Rendering message from ${from} in channel ${channel}:`, text);
  
  let display;
  if (channel === '1') {
    display = messageDisplay1;
  } else if (channel === '2') {
    display = messageDisplay2;
  } else {
    display = messageDisplay1; // デフォルト
  }
  
  if (!display) {
    console.error('Display element not found for channel:', channel);
    return;
  }

  // 空文字なら表示をクリア
  if (!text || text.trim() === '') {
    clearDisplay(display);
    return;
  }

  // 既存の.message.system-messageを取得or作成
  let messageEl = display.querySelector('.message.system-message');
  if (!messageEl) {
    // 新規作成
    display.innerHTML = '';
    messageEl = document.createElement('div');
    messageEl.className = 'message system-message';
    
    const authorEl = document.createElement('div');
    authorEl.className = 'message-author';
    
    const contentEl = document.createElement('div');
    contentEl.className = 'message-content';
    
    const timeEl = document.createElement('div');
    timeEl.className = 'message-timestamp';
    timeEl.style.fontSize = '0.75em';
    timeEl.style.color = '#888';
    timeEl.style.marginTop = '4px';
    
    messageEl.appendChild(authorEl);
    messageEl.appendChild(contentEl);
    messageEl.appendChild(timeEl);
    display.appendChild(messageEl);
  }
  
  // 内容を更新（履歴なし・上書き）
  const authorEl = messageEl.querySelector('.message-author');
  const contentEl = messageEl.querySelector('.message-content');
  const timeEl = messageEl.querySelector('.message-timestamp');
  
  if (authorEl) authorEl.textContent = from || 'Unknown';
  if (contentEl) contentEl.textContent = text;
  if (timeEl) timeEl.textContent = new Date(ts || Date.now()).toLocaleTimeString();
  
  display.scrollTop = display.scrollHeight;
}

function clearDisplay(display) {
  if (display) {
    display.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">💭</div>
        <p>メッセージがここに表示されます</p>
      </div>
    `;
  }
}

function clearAllMessages() {
  clearDisplay(messageDisplay1);
  clearDisplay(messageDisplay2);
}

function addSystemMessage(text) {
  // システムメッセージはメッセージ1に表示
  renderTypingMessage('System', text, '1', Date.now());
}

/* その他のUI機能 */
function renderOnlineUsers(list) {
  if (!onlineUsersBox) return;
  
  onlineUsersBox.innerHTML = '';
  if (!list.length) {
    const d = document.createElement('div');
    d.className = 'empty-online';
    d.textContent = 'オンラインユーザーがいません';
    onlineUsersBox.appendChild(d);
    return;
  }
  
  list.forEach(name => {
    const item = document.createElement('div');
    item.className = 'online-item';
    item.textContent = name;
    onlineUsersBox.appendChild(item);
  });
}

function renderOnlineRooms(list) {
  if (!onlineRoomsBox) return;
  
  onlineRoomsBox.innerHTML = '';
  if (!list.length) {
    const d = document.createElement('div');
    d.className = 'empty-online';
    d.textContent = 'アクティブなルームがありません';
    onlineRoomsBox.appendChild(d);
    return;
  }
  
  list.forEach(r => {
    const item = document.createElement('div');
    item.className = 'online-item';
    item.textContent = `${r.name} (${r.count})`;
    onlineRoomsBox.appendChild(item);
  });
}

function renderRoomUsers(list) {
  if (!roomUsersBox) return;
  
  roomUsersBox.innerHTML = '';
  if (!list.length) {
    const d = document.createElement('div');
    d.className = 'empty-sidebar';
    d.textContent = 'ユーザーがいません';
    roomUsersBox.appendChild(d);
    return;
  }
  
  list.forEach(name => {
    const item = document.createElement('div');
    item.className = 'sidebar-user';
    item.textContent = name + (name === myName ? '（あなた）' : '');
    roomUsersBox.appendChild(item);
  });
}

// throttle関数: 高頻度イベントの制御
function throttle(fn, interval = 100) {
  let last = 0;
  let timer = null;
  
  return function (...args) {
    const now = Date.now();
    const remaining = interval - (now - last);
    
    if (remaining <= 0) {
      last = now;
      fn.apply(this, args);
    } else {
      clearTimeout(timer);
      timer = setTimeout(() => {
        last = Date.now();
        fn.apply(this, args);
      }, remaining);
    }
  };
}

/* 初期化 */
function initialize() {
  console.log('Initializing application...');
  
  if (!initializeSocket()) {
    console.error('Failed to initialize Socket.IO');
    alert('アプリケーションの初期化に失敗しました。ページを再読み込みしてください。');
    return;
  }
  
  console.log('Application initialized successfully');
}

// DOM読み込み後に初期化実行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

/* デバッグ用 */
window.debugChat = {
  sendToChannel1: (text = 'Test message 1') => {
    if (socket && joinedRoom) {
      socket.emit('typing:update', { text, channel: '1' });
    }
  },
  sendToChannel2: (text = 'Test message 2') => {
    if (socket && joinedRoom) {
      socket.emit('typing:update', { text, channel: '2' });
    }
  },
  clearAll: () => {
    clearAllMessages();
  }
};
