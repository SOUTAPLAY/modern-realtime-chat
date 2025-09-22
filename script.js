/* Socket.IO クライアント */
let socket;

// Socket.IOの初期化を遅延実行
function initializeSocket() {
  if (typeof io === 'undefined') {
    console.error('Socket.IO not available');
    return false;
  }
  
  socket = io();
  
  // Socket.IOイベントリスナーを設定
  setupSocketListeners();
  
  console.log('Socket.IO initialized');
  return true;
}

/* 要素参照（index.htmlのidと対応） */
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

  /* メッセージ受信 */
  socket.on('message', (m) => {
    console.log('Message received:', m);
    if (m && m.from && m.text !== undefined) {
      addMessage(m.from, m.text);
    } else {
      console.error('Invalid message format:', m);
    }
  });

  socket.on('system', (ev) => {
    console.log('System event received:', ev);
    if (ev.type === 'join') addSystem(`${ev.name} が入室しました`);
    if (ev.type === 'leave') addSystem(`${ev.name} が退出しました`);
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

/* UI: テーマ切替（保存付き） */
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
      shake(joinButton);
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

      clearMessages();
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
      // ルーム内ユーザー表示リセット
      renderRoomUsers([]);
    });
  });
}

/* メッセージ送信 */
function send(text) {
  const t = (text || '').trim();
  if (!t) {
    console.log('Empty message, not sending');
    return;
  }
  
  if (!socket || !socket.connected) {
    console.error('Socket not connected, cannot send message');
    alert('接続が切れています。ページを再読み込みしてください。');
    return;
  }
  
  if (!joinedRoom) {
    console.error('Not in a room, cannot send message');
    alert('ルームに参加していません。');
    return;
  }
  
  console.log('Sending message:', t, 'to room:', joinedRoom);
  socket.emit('message', t);
}

// Enter キーでメッセージ送信
function setupMessageInput(inputElement) {
  if (!inputElement) return;
  
  inputElement.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // フォーム送信を防ぐ
      const message = inputElement.value.trim();
      if (message) {
        console.log('Enter pressed, sending message:', message);
        send(message);
        inputElement.value = '';
      }
    }
  });
  
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

// 両方のメッセージ入力欄を設定
setupMessageInput(inputText1);
setupMessageInput(inputText2);

/* UIユーティリティ */
function addMessage(author, content) {
  console.log('Adding message to UI:', { author, content });
  
  const el = document.createElement('div');
  el.className = 'message';
  
  const a = document.createElement('div');
  a.className = 'message-author';
  a.textContent = author || 'Unknown';
  
  const c = document.createElement('div');
  c.className = 'message-content';
  c.textContent = content || '';
  
  const timestamp = document.createElement('div');
  timestamp.className = 'message-timestamp';
  timestamp.textContent = new Date().toLocaleTimeString();
  timestamp.style.fontSize = '0.75em';
  timestamp.style.color = '#888';
  timestamp.style.marginTop = '4px';
  
  el.appendChild(a);
  el.appendChild(c);
  el.appendChild(timestamp);
  
  appendToDisplays(el);
}

function addSystem(text) {
  console.log('Adding system message to UI:', text);
  
  const el = document.createElement('div');
  el.className = 'message system-message';
  el.style.borderLeftColor = '#718096';
  
  const a = document.createElement('div');
  a.className = 'message-author';
  a.style.color = '#718096';
  a.textContent = 'System';
  
  const c = document.createElement('div');
  c.className = 'message-content';
  c.style.fontStyle = 'italic';
  c.textContent = text;
  
  const timestamp = document.createElement('div');
  timestamp.className = 'message-timestamp';
  timestamp.textContent = new Date().toLocaleTimeString();
  timestamp.style.fontSize = '0.75em';
  timestamp.style.color = '#888';
  timestamp.style.marginTop = '4px';
  
  el.appendChild(a);
  el.appendChild(c);
  el.appendChild(timestamp);
  
  appendToDisplays(el);
}

function appendToDisplays(node) {
  console.log('Appending message to displays');
  
  const n1 = node.cloneNode(true);
  const n2 = node.cloneNode(true);
  
  if (messageDisplay1) {
    const empty1 = messageDisplay1.querySelector('.empty-state');
    if (empty1) {
      console.log('Removing empty state from display 1');
      empty1.remove();
    }
    messageDisplay1.appendChild(n1);
    messageDisplay1.scrollTop = messageDisplay1.scrollHeight;
    console.log('Message added to display 1');
  }
  
  if (messageDisplay2) {
    const empty2 = messageDisplay2.querySelector('.empty-state');
    if (empty2) {
      console.log('Removing empty state from display 2');
      empty2.remove();
    }
    messageDisplay2.appendChild(n2);
    messageDisplay2.scrollTop = messageDisplay2.scrollHeight;
    console.log('Message added to display 2');
  }
}

function clearMessages() {
  console.log('Clearing messages');
  
  const emptyStateHtml = `
    <div class="empty-state">
      <div class="empty-icon">💭</div>
      <p>メッセージがここに表示されます</p>
    </div>
  `;
  
  if (messageDisplay1) messageDisplay1.innerHTML = emptyStateHtml;
  if (messageDisplay2) messageDisplay2.innerHTML = emptyStateHtml;
}

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

function shake(btn) {
  if (btn) {
    btn.classList.add('loading');
    setTimeout(() => btn.classList.remove('loading'), 600);
  }
}

// DOMとSocket.IOの初期化
function initialize() {
  console.log('Initializing application...');
  
  // Socket.IOの初期化
  if (!initializeSocket()) {
    console.error('Failed to initialize Socket.IO');
    alert('アプリケーションの初期化に失敗しました。ページを再読み込みしてください。');
    return;
  }
  
  console.log('Application initialized successfully');
  console.log('Key elements found:', {
    connectionPanel: !!connectionPanel,
    chatArea: !!chatArea,
    joinButton: !!joinButton,
    themeToggle: !!themeToggle,
    privateCheckbox: !!privateCheckbox,
    inputText1: !!inputText1,
    inputText2: !!inputText2,
    messageDisplay1: !!messageDisplay1,
    messageDisplay2: !!messageDisplay2
  });
  
  // テスト用のグローバル変数設定（デバッグ用）
  window.debugChat = {
    socket,
    send,
    joinedRoom: () => joinedRoom,
    myName: () => myName,
    addTestMessage: () => addMessage('Test User', 'This is a test message'),
    clearMessages
  };
  
  console.log('Debug functions available via window.debugChat');
}

// DOMロード後に初期化実行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}