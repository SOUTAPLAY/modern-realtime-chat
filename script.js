/* Socket.IO クライアント */
const socket = io();

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
    const name = (nameInput.value || '').trim();
    const room = (roomInput.value || '').trim();
    const makePrivate = privateCheckbox ? privateCheckbox.checked : false;
    const password = passwordInput ? passwordInput.value : '';

    if (!name || !room) {
      shake(joinButton);
      return;
    }

    socket.emit('joinRoom', { name, room, makePrivate, password }, (res) => {
      if (!res?.ok) {
        alert(res?.error || '入室に失敗しました');
        return;
      }
      joinedRoom = res.room;
      myName = name;

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
    socket.emit('leaveRoom', () => {
      joinedRoom = null;
      // 画面戻す
      if (chatArea) chatArea.style.display = 'none';
      if (connectionPanel) connectionPanel.style.display = 'flex';
      // ルーヤ内ユーザー表示リセット
      renderRoomUsers([]);
    });
  });
}

/* メッセージ送信 */
function send(text) {
  const t = (text || '').trim();
  if (!t) return;
  socket.emit('message', t);
}

if (inputText1) {
  inputText1.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      send(inputText1.value);
      inputText1.value = '';
    }
  });
}

if (inputText2) {
  inputText2.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      send(inputText2.value);
      inputText2.value = '';
    }
  });
}

/* 受信イベント */
socket.on('message', (m) => {
  addMessage(m.from, m.text);
});

socket.on('system', (ev) => {
  if (ev.type === 'join') addSystem(`${ev.name} が入室しました`);
  if (ev.type === 'leave') addSystem(`${ev.name} が退出しました`);
});

socket.on('lists', ({ users, rooms }) => {
  renderOnlineUsers(users || []);
  renderOnlineRooms(rooms || []);
});

socket.on('roomMembers', ({ users = [], count = 0 }) => {
  if (userCountEl) userCountEl.textContent = String(count);
  renderRoomUsers(users);
});

/* 切断時（サーバー側で即オフライン反映される） */
socket.on('disconnect', () => {
  // 何もしない（サーバーで一覧は更新される）
});

socket.on('connect', () => {
  console.log('Socket connected:', socket.id);
});

socket.on('connect_error', (error) => {
  console.error('Socket connection error:', error);
});

/* UIユーティリティ */
function addMessage(author, content) {
  const el = document.createElement('div');
  el.className = 'message';
  const a = document.createElement('div');
  a.className = 'message-author';
  a.textContent = author;
  const c = document.createElement('div');
  c.className = 'message-content';
  c.textContent = content;
  el.appendChild(a);
  el.appendChild(c);
  appendToDisplays(el);
}

function addSystem(text) {
  const el = document.createElement('div');
  el.className = 'message';
  el.style.borderLeftColor = '#718096';
  const a = document.createElement('div');
  a.className = 'message-author';
  a.style.color = '#718096';
  a.textContent = 'System';
  const c = document.createElement('div');
  c.className = 'message-content';
  c.textContent = text;
  el.appendChild(a);
  el.appendChild(c);
  appendToDisplays(el);
}

function appendToDisplays(node) {
  const n1 = node.cloneNode(true);
  const n2 = node.cloneNode(true);
  
  if (messageDisplay1) {
    const empty1 = messageDisplay1.querySelector('.empty-state');
    if (empty1) empty1.remove();
    messageDisplay1.appendChild(n1);
    messageDisplay1.scrollTop = messageDisplay1.scrollHeight;
  }
  
  if (messageDisplay2) {
    const empty2 = messageDisplay2.querySelector('.empty-state');
    if (empty2) empty2.remove();
    messageDisplay2.appendChild(n2);
    messageDisplay2.scrollTop = messageDisplay2.scrollHeight;
  }
}

function clearMessages() {
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

// DOMがロードされたことを確認するためのデバッグ用ログ
console.log('Script loaded successfully');
console.log('Socket.io version:', typeof io !== 'undefined' ? 'loaded' : 'not loaded');
console.log('Key elements found:', {
  connectionPanel: !!connectionPanel,
  chatArea: !!chatArea,
  joinButton: !!joinButton,
  themeToggle: !!themeToggle,
  privateCheckbox: !!privateCheckbox
});