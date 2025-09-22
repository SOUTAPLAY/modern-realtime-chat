/* Socket.IO クライアント - リアルタイムチャット対応版 */
let socket;

// Socket.IOの初期化
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

/* DOM要素の参照 */
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

// メッセージ表示・入力
const messageDisplay1 = document.getElementById('messageDisplay1');
const messageDisplay2 = document.getElementById('messageDisplay2');
const inputText1 = document.getElementById('inputText1');
const inputText2 = document.getElementById('inputText2');

// オンライン情報
const onlineUsersBox = document.getElementById('onlineUsers');
const onlineRoomsBox = document.getElementById('onlineRooms');
const roomUsersBox = document.getElementById('roomUsers');

// UI制御
const themeToggle = document.getElementById('themeToggle');
const visibilityToggle = document.getElementById('visibilityToggle');

// 状態管理
let joinedRoom = null;
let myName = null;

/* Socket.IOイベントリスナー */
function setupSocketListeners() {
  if (!socket) return;
  
  socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
  });

  // リアルタイム入力受信
  socket.on('typing:update', (payload) => {
    const { from, text, channel, ts } = payload || {};
    console.log(`[RECEIVE] Channel ${channel} from ${from}:`, text);
    displayTypingMessage(from, text, channel, ts);
  });

  // システム通知
  socket.on('system', (ev) => {
    if (ev.type === 'join') {
      console.log(`${ev.name} joined the room`);
    } else if (ev.type === 'leave') {
      console.log(`${ev.name} left the room`);
    }
  });

  // オンラインリスト
  socket.on('lists', ({ users, rooms }) => {
    renderOnlineUsers(users || []);
    renderOnlineRooms(rooms || []);
  });

  // ルーム内メンバー
  socket.on('roomMembers', ({ users = [], count = 0 }) => {
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

/* UI: ルーム名表示切替 */
if (visibilityToggle && roomInput) {
  let roomHidden = false;
  visibilityToggle.addEventListener('click', () => {
    roomHidden = !roomHidden;
    roomInput.type = roomHidden ? 'password' : 'text';
  });
}

/* UI: プライベートルーム設定 */
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

    console.log(`[JOIN] Attempting to join: ${room} as ${name}`);
    
    socket.emit('joinRoom', { name, room, makePrivate, password }, (res) => {
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

      // 表示エリア初期化
      resetDisplay(messageDisplay1);
      resetDisplay(messageDisplay2);
      
      console.log(`[JOIN] Successfully joined room: ${joinedRoom}`);
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
      resetDisplay(messageDisplay1);
      resetDisplay(messageDisplay2);
      
      console.log('[LEAVE] Left room');
    });
  });
}

/* リアルタイム入力設定 */
function setupRealtimeTyping(inputElement, displayElement, channel) {
  if (!inputElement || !displayElement) {
    console.error(`[SETUP] Failed to setup channel ${channel}`);
    return;
  }
  
  console.log(`[SETUP] Setting up realtime typing for channel ${channel}`);
  
  let lastSentText = '';
  
  const sendTypingUpdate = throttle(() => {
    const currentText = inputElement.value || '';
    
    // 変化がない場合はスキップ
    if (currentText === lastSentText) return;
    lastSentText = currentText;
    
    // ルームに参加していない場合はスキップ
    if (!joinedRoom || !myName) return;
    
    console.log(`[SEND] Channel ${channel}: "${currentText}"`);
    
    // サーバーに送信
    socket.emit('typing:update', {
      text: currentText,
      channel: channel
    });
    
  }, 100); // 100ms間隔で送信
  
  // input イベント（文字入力の瞬間）
  inputElement.addEventListener('input', () => {
    sendTypingUpdate();
  });
  
  // Enter キー（送信として扱わない、単なる改行）
  inputElement.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // フォーム送信を防ぐ
      // Enterで改行ではなく、入力内容はそのまま継続
    }
  });
}

// 各入力欄にリアルタイム設定を適用
setupRealtimeTyping(inputText1, messageDisplay1, '1');
setupRealtimeTyping(inputText2, messageDisplay2, '2');

/* 表示処理（履歴なし・上書きのみ） */
function displayTypingMessage(from, text, channel, timestamp) {
  let targetDisplay;
  
  if (channel === '1') {
    targetDisplay = messageDisplay1;
  } else if (channel === '2') {
    targetDisplay = messageDisplay2;
  } else {
    console.warn(`[DISPLAY] Unknown channel: ${channel}`);
    return;
  }
  
  if (!targetDisplay) {
    console.error(`[DISPLAY] Target display not found for channel ${channel}`);
    return;
  }
  
  // 空文字の場合は初期状態に戻す
  if (!text || text.trim() === '') {
    resetDisplay(targetDisplay);
    return;
  }
  
  // 既存のメッセージ要素を取得または作成
  let messageElement = targetDisplay.querySelector('.message.system-message');
  
  if (!messageElement) {
    // 初期状態をクリアして新しいメッセージ要素を作成
    targetDisplay.innerHTML = '';
    
    messageElement = document.createElement('div');
    messageElement.className = 'message system-message';
    
    const authorDiv = document.createElement('div');
    authorDiv.className = 'message-author';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-timestamp';
    timeDiv.style.fontSize = '0.75em';
    timeDiv.style.color = '#888';
    timeDiv.style.marginTop = '4px';
    
    messageElement.appendChild(authorDiv);
    messageElement.appendChild(contentDiv);
    messageElement.appendChild(timeDiv);
    
    targetDisplay.appendChild(messageElement);
  }
  
  // 内容を更新（履歴なし・上書きのみ）
  const authorDiv = messageElement.querySelector('.message-author');
  const contentDiv = messageElement.querySelector('.message-content');
  const timeDiv = messageElement.querySelector('.message-timestamp');
  
  if (authorDiv) authorDiv.textContent = from || 'Unknown';
  if (contentDiv) contentDiv.textContent = text;
  if (timeDiv) timeDiv.textContent = new Date(timestamp || Date.now()).toLocaleTimeString();
  
  // スクロール調整
  targetDisplay.scrollTop = targetDisplay.scrollHeight;
}

function resetDisplay(displayElement) {
  if (!displayElement) return;
  
  displayElement.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">💭</div>
      <p>メッセージがここに表示されます</p>
    </div>
  `;
}

/* オンライン情報の表示 */
function renderOnlineUsers(users) {
  if (!onlineUsersBox) return;
  
  onlineUsersBox.innerHTML = '';
  if (users.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'empty-online';
    emptyDiv.textContent = 'オンラインユーザーがいません';
    onlineUsersBox.appendChild(emptyDiv);
  } else {
    users.forEach(user => {
      const userDiv = document.createElement('div');
      userDiv.className = 'online-item';
      userDiv.textContent = user;
      onlineUsersBox.appendChild(userDiv);
    });
  }
}

function renderOnlineRooms(rooms) {
  if (!onlineRoomsBox) return;
  
  onlineRoomsBox.innerHTML = '';
  if (rooms.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'empty-online';
    emptyDiv.textContent = 'アクティブなルームがありません';
    onlineRoomsBox.appendChild(emptyDiv);
  } else {
    rooms.forEach(room => {
      const roomDiv = document.createElement('div');
      roomDiv.className = 'online-item';
      roomDiv.textContent = `${room.name} (${room.count})`;
      onlineRoomsBox.appendChild(roomDiv);
    });
  }
}

function renderRoomUsers(users) {
  if (!roomUsersBox) return;
  
  roomUsersBox.innerHTML = '';
  if (users.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'empty-sidebar';
    emptyDiv.textContent = 'ユーザーがいません';
    roomUsersBox.appendChild(emptyDiv);
  } else {
    users.forEach(user => {
      const userDiv = document.createElement('div');
      userDiv.className = 'sidebar-user';
      userDiv.textContent = user + (user === myName ? '（あなた）' : '');
      roomUsersBox.appendChild(userDiv);
    });
  }
}

/* throttle: 高頻度イベントの制御 */
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

/* 初期化 */
function initialize() {
  console.log('[INIT] Initializing application...');
  
  if (!initializeSocket()) {
    console.error('[INIT] Failed to initialize Socket.IO');
    alert('アプリケーションの初期化に失敗しました。ページを再読み込みしてください。');
    return;
  }
  
  console.log('[INIT] Application initialized successfully');
  
  // 要素チェック
  const elements = {
    connectionPanel: !!connectionPanel,
    chatArea: !!chatArea,
    joinButton: !!joinButton,
    inputText1: !!inputText1,
    inputText2: !!inputText2,
    messageDisplay1: !!messageDisplay1,
    messageDisplay2: !!messageDisplay2
  };
  
  console.log('[INIT] Elements check:', elements);
  
  // 不足要素の警告
  Object.entries(elements).forEach(([key, exists]) => {
    if (!exists) {
      console.warn(`[INIT] Missing element: ${key}`);
    }
  });
}

/* デバッグ用関数 */
window.debugRealtimeChat = {
  // チャンネル1にテスト送信
  sendToChannel1: (text = 'Test message for channel 1') => {
    if (socket && joinedRoom) {
      socket.emit('typing:update', { text, channel: '1' });
      console.log('[DEBUG] Sent to channel 1:', text);
    } else {
      console.warn('[DEBUG] Not connected or not in room');
    }
  },
  
  // チャンネル2にテスト送信
  sendToChannel2: (text = 'Test message for channel 2') => {
    if (socket && joinedRoom) {
      socket.emit('typing:update', { text, channel: '2' });
      console.log('[DEBUG] Sent to channel 2:', text);
    } else {
      console.warn('[DEBUG] Not connected or not in room');
    }
  },
  
  // 状態確認
  status: () => {
    console.log('[DEBUG] Current status:', {
      socket: !!socket,
      connected: socket?.connected,
      joinedRoom,
      myName,
      elements: {
        inputText1: !!inputText1,
        inputText2: !!inputText2,
        messageDisplay1: !!messageDisplay1,
        messageDisplay2: !!messageDisplay2
      }
    });
  },
  
  // 表示クリア
  clear: () => {
    resetDisplay(messageDisplay1);
    resetDisplay(messageDisplay2);
    console.log('[DEBUG] Displays cleared');
  }
};

// DOM読み込み後に初期化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

console.log('[SCRIPT] Realtime chat script loaded successfully');