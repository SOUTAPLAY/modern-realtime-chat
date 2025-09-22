const socket = io();

/* 要素参照（HTMLのIDと完全対応） */
const connectionPanel = document.getElementById('connectionPanel');
const chatArea = document.getElementById('chatArea');

// 参加フォーム
const nameInput = document.getElementById('nameInput');
const roomInput = document.getElementById('roomInput');
const privateCheckbox = document.getElementById('privateCheckbox');
const passwordGroup = document.getElementById('passwordGroup');
const passwordInput = document.getElementById('passwordInput');
const joinButton = document.getElementById('joinButton');
const leaveButton = document.getElementById('leaveButton');

// ステータス表示
const currentRoomEl = document.getElementById('currentRoom');
const currentUserEl = document.getElementById('currentUser');
const userCountEl = document.getElementById('userCount');

// メッセージ表示・入力エリア
const messageDisplay1 = document.getElementById('messageDisplay1');
const messageDisplay2 = document.getElementById('messageDisplay2');
const inputText1 = document.getElementById('inputText1');
const inputText2 = document.getElementById('inputText2');

// オンラインリスト
const onlineUsers = document.getElementById('onlineUsers');
const onlineRooms = document.getElementById('onlineRooms');
const roomUsers = document.getElementById('roomUsers');

// その他UI
const themeToggle = document.getElementById('themeToggle');
const visibilityToggle = document.getElementById('visibilityToggle');

let joinedRoom = null;
let myName = null;

/* テーマ切替 */
if (themeToggle) {
  const key = 'theme';
  const saved = localStorage.getItem(key);
  if (saved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  
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

/* ルーム名表示切替 */
if (visibilityToggle && roomInput) {
  let roomHidden = false;
  visibilityToggle.addEventListener('click', () => {
    roomHidden = !roomHidden;
    roomInput.type = roomHidden ? 'password' : 'text';
  });
}

/* プライベートルーム設定 */
if (privateCheckbox && passwordGroup && passwordInput) {
  privateCheckbox.addEventListener('change', () => {
    const show = privateCheckbox.checked;
    passwordGroup.style.display = show ? 'block' : 'none';
    if (!show) passwordInput.value = '';
  });
}

/* 参加処理 */
if (joinButton) {
  joinButton.addEventListener('click', () => {
    const name = (nameInput?.value || '').trim();
    const room = (roomInput?.value || '').trim();
    const makePrivate = privateCheckbox?.checked || false;
    const password = passwordInput?.value || '';

    if (!name || !room) {
      alert('名前と部屋名を入力してください');
      return;
    }

    console.log('Joining room:', { name, room, makePrivate });
    
    socket.emit('joinRoom', { name, room, makePrivate, password }, (res) => {
      console.log('Join response:', res);
      if (!res?.ok) {
        alert(res?.error || '入室に失敗しました');
        return;
      }
      
      joinedRoom = res.room;
      myName = name;

      // 画面切替
      connectionPanel.style.display = 'none';
      chatArea.style.display = 'flex';

      // ステータス更新
      if (currentRoomEl) currentRoomEl.textContent = res.room + (res.private ? '（プライベート）' : '');
      if (currentUserEl) currentUserEl.textContent = `あなた: ${name}`;

      // メッセージエリアをクリア
      clearDisplay(messageDisplay1);
      clearDisplay(messageDisplay2);
      
      console.log('Successfully joined room:', joinedRoom);
    });
  });
}

/* 退室処理 */
if (leaveButton) {
  leaveButton.addEventListener('click', () => {
    socket.emit('leaveRoom', () => {
      joinedRoom = null;
      myName = null;
      
      // 画面切替
      chatArea.style.display = 'none';
      connectionPanel.style.display = 'flex';
      
      // 表示クリア
      clearDisplay(messageDisplay1);
      clearDisplay(messageDisplay2);
      
      console.log('Left room');
    });
  });
}

/* リアルタイム入力設定 */
function setupRealtimeInput(inputElement, displayElement, channel) {
  if (!inputElement || !displayElement) {
    console.error(`Setup failed for channel ${channel}:`, { inputElement: !!inputElement, displayElement: !!displayElement });
    return;
  }
  
  console.log(`Setting up realtime input for channel ${channel}`);
  
  let lastSentValue = '';
  
  const sendUpdate = throttle(() => {
    const currentValue = inputElement.value || '';
    
    // 値が変わっていない場合はスキップ
    if (currentValue === lastSentValue) return;
    lastSentValue = currentValue;
    
    // 未参加の場合はスキップ
    if (!joinedRoom || !myName) return;
    
    console.log(`Sending typing update - Channel: ${channel}, Text: "${currentValue}"`);
    
    // サーバーに送信
    socket.emit('typing:update', { 
      text: currentValue, 
      channel: channel 
    });
    
    // ローカル即時表示（自分の入力をすぐ反映）
    updateDisplay(displayElement, myName, currentValue);
    
  }, 50); // 50ms間隔
  
  // input イベントでリアルタイム送信
  inputElement.addEventListener('input', (e) => {
    console.log(`Input event on channel ${channel}:`, e.target.value);
    sendUpdate();
  });
  
  // Enter キーでも送信（念のため）
  inputElement.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      console.log(`Enter pressed on channel ${channel}`);
      sendUpdate();
    }
  });
}

// 入力設定を適用
setupRealtimeInput(inputText1, messageDisplay1, '1');
setupRealtimeInput(inputText2, messageDisplay2, '2');

/* Socket.IO イベントリスナー */
socket.on('connect', () => {
  console.log('Socket connected:', socket.id);
});

socket.on('disconnect', () => {
  console.log('Socket disconnected');
});

socket.on('connect_error', (error) => {
  console.error('Socket connection error:', error);
});

// リアルタイム入力受信
socket.on('typing:update', (data) => {
  console.log('Received typing update:', data);
  const { from, text, channel } = data;
  
  let displayElement;
  if (channel === '1') {
    displayElement = messageDisplay1;
  } else if (channel === '2') {
    displayElement = messageDisplay2;
  } else {
    console.warn('Unknown channel:', channel);
    return;
  }
  
  updateDisplay(displayElement, from, text);
});

// システムメッセージ
socket.on('system', (ev) => {
  if (ev.type === 'join') {
    console.log(`${ev.name} joined the room`);
  } else if (ev.type === 'leave') {
    console.log(`${ev.name} left the room`);
  }
});

// オンラインリスト更新
socket.on('lists', ({ users, rooms }) => {
  updateOnlineUsers(users || []);
  updateOnlineRooms(rooms || []);
});

// ルーム内ユーザー更新
socket.on('roomMembers', ({ users, count }) => {
  if (userCountEl) userCountEl.textContent = String(count || 0);
  updateRoomUsers(users || []);
});

/* 表示更新関数 */
function updateDisplay(displayElement, from, text) {
  if (!displayElement) return;
  
  // 空文字の場合は empty-state を表示
  if (!text || text.trim() === '') {
    clearDisplay(displayElement);
    return;
  }
  
  // 既存のメッセージ要素を取得または作成
  let messageEl = displayElement.querySelector('.message.system-message');
  if (!messageEl) {
    // empty-state を削除
    displayElement.innerHTML = '';
    
    // 新しいメッセージ要素を作成
    messageEl = document.createElement('div');
    messageEl.className = 'message system-message';
    
    const authorDiv = document.createElement('div');
    authorDiv.className = 'message-author';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-timestamp';
    timeDiv.style.fontSize = '0.75em';
    timeDiv.style.color = '#888';
    timeDiv.style.marginTop = '4px';
    
    messageEl.appendChild(authorDiv);
    messageEl.appendChild(contentDiv);
    messageEl.appendChild(timeDiv);
    displayElement.appendChild(messageEl);
  }
  
  // 内容を更新
  const authorDiv = messageEl.querySelector('.message-author');
  const contentDiv = messageEl.querySelector('.message-content');
  const timeDiv = messageEl.querySelector('.message-timestamp');
  
  if (authorDiv) authorDiv.textContent = from || 'Unknown';
  if (contentDiv) contentDiv.textContent = text;
  if (timeDiv) timeDiv.textContent = new Date().toLocaleTimeString();
  
  console.log(`Display updated - From: ${from}, Text: "${text}"`);
}

function clearDisplay(displayElement) {
  if (!displayElement) return;
  
  displayElement.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">💭</div>
      <p>メッセージがここに表示されます</p>
    </div>
  `;
}

function updateOnlineUsers(users) {
  if (!onlineUsers) return;
  
  onlineUsers.innerHTML = '';
  if (users.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'empty-online';
    emptyDiv.textContent = 'オンラインユーザーがいません';
    onlineUsers.appendChild(emptyDiv);
  } else {
    users.forEach(user => {
      const userDiv = document.createElement('div');
      userDiv.className = 'online-item';
      userDiv.textContent = user;
      onlineUsers.appendChild(userDiv);
    });
  }
}

function updateOnlineRooms(rooms) {
  if (!onlineRooms) return;
  
  onlineRooms.innerHTML = '';
  if (rooms.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'empty-online';
    emptyDiv.textContent = 'アクティブなルームがありません';
    onlineRooms.appendChild(emptyDiv);
  } else {
    rooms.forEach(room => {
      const roomDiv = document.createElement('div');
      roomDiv.className = 'online-item';
      roomDiv.textContent = `${room.name} (${room.count})`;
      onlineRooms.appendChild(roomDiv);
    });
  }
}

function updateRoomUsers(users) {
  if (!roomUsers) return;
  
  roomUsers.innerHTML = '';
  if (users.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'empty-sidebar';
    emptyDiv.textContent = 'ユーザーがいません';
    roomUsers.appendChild(emptyDiv);
  } else {
    users.forEach(user => {
      const userDiv = document.createElement('div');
      userDiv.className = 'sidebar-user';
      userDiv.textContent = user + (user === myName ? '（あなた）' : '');
      roomUsers.appendChild(userDiv);
    });
  }
}

// throttle 関数
function throttle(func, limit) {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  }
}

/* デバッグ用 */
window.debugChat = {
  test1: (text = 'Test message 1') => {
    console.log('Debug: sending to channel 1');
    socket.emit('typing:update', { text, channel: '1' });
  },
  test2: (text = 'Test message 2') => {
    console.log('Debug: sending to channel 2');
    socket.emit('typing:update', { text, channel: '2' });
  },
  status: () => {
    console.log('Debug status:', {
      socket: !!socket,
      connected: socket?.connected,
      joinedRoom,
      myName,
      inputText1: !!inputText1,
      inputText2: !!inputText2,
      messageDisplay1: !!messageDisplay1,
      messageDisplay2: !!messageDisplay2
    });
  },
  clear: () => {
    clearDisplay(messageDisplay1);
    clearDisplay(messageDisplay2);
  }
};

console.log('Script loaded successfully');
console.log('Elements check:', {
  inputText1: !!inputText1,
  inputText2: !!inputText2,
  messageDisplay1: !!messageDisplay1,
  messageDisplay2: !!messageDisplay2
});
