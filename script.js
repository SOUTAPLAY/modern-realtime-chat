// DOM要素の取得
const elements = {
    // 接続関連
    connectionPanel: document.getElementById('connectionPanel'),
    chatArea: document.getElementById('chatArea'),
    nameInput: document.getElementById('nameInput'),
    roomInput: document.getElementById('roomInput'),
    joinButton: document.getElementById('joinButton'),
    leaveButton: document.getElementById('leaveButton'),
    visibilityToggle: document.getElementById('visibilityToggle'),
    privateCheckbox: document.getElementById('privateCheckbox'),
    passwordInput: document.getElementById('passwordInput'),
    passwordGroup: document.getElementById('passwordGroup'),
    
    // チャット関連
    currentRoom: document.getElementById('currentRoom'),
    currentUser: document.getElementById('currentUser'),
    userCount: document.getElementById('userCount'),
    inputText1: document.getElementById('inputText1'),
    inputText2: document.getElementById('inputText2'),
    messageDisplay1: document.getElementById('messageDisplay1'),
    messageDisplay2: document.getElementById('messageDisplay2'),
    
    // オンライン情報
    onlineUsers: document.getElementById('onlineUsers'),
    onlineRooms: document.getElementById('onlineRooms'),
    roomUsers: document.getElementById('roomUsers'),
    
    // テーマ関連
    themeToggle: document.getElementById('themeToggle'),
    themeIcon: document.querySelector('.theme-icon')
};

// アプリケーションの状態
const state = {
    socket: null,
    currentRoom: '',
    username: '',
    isConnected: false,
    isDarkMode: localStorage.getItem('darkMode') === 'true'
};

// Socket.IOの初期化
function init() {
    // Socket.IOクライアントの初期化
    state.socket = io({
        transports: ['websocket', 'polling'],
        timeout: 20000,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
    });
    
    setupEventListeners();
    setupSocketListeners();
    applyTheme();
    loadSavedData();
}

// イベントリスナーの設定
function setupEventListeners() {
    // 接続ボタン
    elements.joinButton.addEventListener('click', handleJoinRoom);
    
    // 退出ボタン
    elements.leaveButton.addEventListener('click', handleLeaveRoom);
    
    // 入力フィールド（Enter キー対応）
    elements.nameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleJoinRoom();
    });
    
    elements.roomInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleJoinRoom();
    });
    
    elements.passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleJoinRoom();
    });
    
    // メッセージ入力（リアルタイム更新）
    elements.inputText1.addEventListener('input', () => handleMessageInput('sendMessage1', elements.inputText1.value));
    elements.inputText2.addEventListener('input', () => handleMessageInput('sendMessage2', elements.inputText2.value));
    
    // 表示/非表示切り替え
    elements.visibilityToggle.addEventListener('click', toggleRoomVisibility);
    
    // プライベートチェックボックス
    elements.privateCheckbox.addEventListener('change', togglePrivateMode);
    
    // テーマ切り替え
    elements.themeToggle.addEventListener('click', toggleTheme);
    
    // データ保存
    elements.nameInput.addEventListener('input', saveUserData);
    elements.roomInput.addEventListener('input', saveUserData);
    
    // ページを閉じる前の処理
    window.addEventListener('beforeunload', () => {
        if (state.socket) {
            state.socket.disconnect();
        }
    });
}

// Socket.IOイベントリスナーの設定
function setupSocketListeners() {
    state.socket.on('connect', () => {
        console.log('Connected to server');
        showNotification('サーバーに接続しました', 'success');
    });
    
    state.socket.on('disconnect', (reason) => {
        console.log('Disconnected:', reason);
        showNotification('サーバーから切断されました', 'warning');
        
        // 強制的にオフライン状態に
        if (state.isConnected) {
            handleForceLeave();
        }
    });
    
    state.socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        showNotification('接続エラーが発生しました', 'error');
    });
    
    // ルーム参加応答
    state.socket.on('joinRoomResponse', (data) => {
        if (data.success) {
            showChatArea();
            elements.currentRoom.textContent = data.room + (data.isPrivate ? ' (プライベート)' : '');
            elements.currentUser.textContent = state.username;
            elements.userCount.textContent = data.userCount || '1';
            showNotification(`ルーム「${data.room}」に参加しました`, 'success');
        } else {
            showNotification(data.error || '参加に失敗しました', 'error');
            elements.joinButton.disabled = false;
            elements.joinButton.classList.remove('loading');
        }
    });
    
    // メッセージ受信
    state.socket.on('receiveMessage1', (data) => {
        if (data.room === state.currentRoom) {
            displayCurrentMessage(elements.messageDisplay1, data.name, data.message);
        }
    });
    
    state.socket.on('receiveMessage2', (data) => {
        if (data.room === state.currentRoom) {
            displayCurrentMessage(elements.messageDisplay2, data.name, data.message);
        }
    });
    
    // システムメッセージ
    state.socket.on('systemMessage', (data) => {
        showNotification(data.message, 'info');
    });
    
    // オンラインリスト更新
    state.socket.on('onlineLists', (data) => {
        updateOnlineUsers(data.users || []);
        updateOnlineRooms(data.rooms || []);
    });
    
    // ルーム内ユーザー更新
    state.socket.on('roomUsers', (users) => {
        updateRoomUsers(users || []);
        elements.userCount.textContent = users.length;
    });
}

// ルーム参加処理
function handleJoinRoom() {
    const name = elements.nameInput.value.trim();
    const room = elements.roomInput.value.trim();
    const makePrivate = elements.privateCheckbox.checked;
    const password = elements.passwordInput.value.trim();
    
    if (!name || !room) {
        showNotification('名前とルーム名を入力してください', 'error');
        return;
    }
    
    if (makePrivate && password.length < 4) {
        showNotification('プライベートルームには4文字以上のパスワードが必要です', 'error');
        return;
    }
    
    // ボタンをローディング状態に
    elements.joinButton.disabled = true;
    elements.joinButton.classList.add('loading');
    
    state.username = name;
    state.currentRoom = room;
    
    // サーバーにルーム参加リクエスト
    state.socket.emit('joinRoom', {
        name,
        room,
        makePrivate,
        password: makePrivate ? password : (password || '')
    }, (response) => {
        if (!response.success) {
            showNotification(response.error || 'ルーム参加に失敗しました', 'error');
            elements.joinButton.disabled = false;
            elements.joinButton.classList.remove('loading');
        } else {
            showChatArea();
            elements.currentRoom.textContent = response.room + (response.isPrivate ? ' (プライベート)' : '');
            elements.currentUser.textContent = state.username;
            elements.userCount.textContent = response.userCount || '1';
            showNotification(`ルーム「${response.room}」に参加しました`, 'success');
        }
    });
}

// ルーム退出処理
function handleLeaveRoom() {
    state.socket.emit('leaveRoom', (response) => {
        handleForceLeave();
    });
}

// 強制退出処理（切断時など）
function handleForceLeave() {
    state.isConnected = false;
    state.currentRoom = '';
    state.username = '';
    
    // チャットエリアをクリア
    resetMessageDisplay(elements.messageDisplay1);
    resetMessageDisplay(elements.messageDisplay2);
    elements.inputText1.value = '';
    elements.inputText2.value = '';
    
    // UI状態をリセット
    elements.joinButton.disabled = false;
    elements.joinButton.classList.remove('loading');
    elements.nameInput.disabled = false;
    elements.roomInput.disabled = false;
    elements.privateCheckbox.disabled = false;
    elements.passwordInput.disabled = !elements.privateCheckbox.checked;
    
    // 接続パネルに戻る
    elements.chatArea.style.display = 'none';
    elements.connectionPanel.style.display = 'flex';
    
    showNotification('チャットルームから退出しました', 'info');
}

// メッセージ入力処理（リアルタイム）
function handleMessageInput(event, message) {
    if (state.currentRoom && state.username) {
        // 空の場合は空状態に戻す
        if (!message.trim()) {
            const displayElement = event === 'sendMessage1' ? elements.messageDisplay1 : elements.messageDisplay2;
            resetMessageDisplay(displayElement);
            return;
        }
        
        state.socket.emit(event, {
            room: state.currentRoom,
            name: state.username,
            message: message.trim()
        });
    }
}

// 現在のメッセージを表示（履歴なし）
function displayCurrentMessage(container, author, content) {
    // 既存の内容をクリアして新しいメッセージのみ表示
    container.innerHTML = `
        <div class="message">
            <div class="message-author">${escapeHtml(author)}</div>
            <div class="message-content">${escapeHtml(content)}</div>
        </div>
    `;
}

// メッセージ表示を空状態にリセット
function resetMessageDisplay(container) {
    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">💭</div>
            <p>メッセージがここに表示されます</p>
        </div>
    `;
}

// チャットエリアを表示
function showChatArea() {
    elements.connectionPanel.style.display = 'none';
    elements.chatArea.style.display = 'flex';
    state.isConnected = true;
    
    // 入力を無効化
    elements.nameInput.disabled = true;
    elements.roomInput.disabled = true;
    elements.privateCheckbox.disabled = true;
    elements.passwordInput.disabled = true;
    elements.joinButton.disabled = true;
    elements.leaveButton.disabled = false;
    
    // 入力フィールドにフォーカス
    setTimeout(() => {
        elements.inputText1.focus();
    }, 100);
}

// プライベートモード切り替え
function togglePrivateMode() {
    const isPrivate = elements.privateCheckbox.checked;
    if (isPrivate) {
        elements.passwordGroup.style.display = 'block';
        elements.passwordInput.disabled = false;
    } else {
        elements.passwordGroup.style.display = 'none';
        elements.passwordInput.disabled = true;
        elements.passwordInput.value = '';
    }
}

// ルーム名の表示/非表示切り替え
function toggleRoomVisibility() {
    const isPassword = elements.roomInput.type === 'password';
    elements.roomInput.type = isPassword ? 'text' : 'password';
    elements.visibilityToggle.querySelector('.visibility-icon').textContent = isPassword ? '👁️' : '🙈';
}

// オンラインユーザー更新
function updateOnlineUsers(users) {
    if (users.length === 0) {
        elements.onlineUsers.innerHTML = '<div class="empty-online">オンラインユーザーがいません</div>';
        return;
    }
    
    elements.onlineUsers.innerHTML = users.map(user => 
        `<div class="online-item">
            <span class="online-indicator">🟢</span>
            <span class="online-name">${escapeHtml(user)}</span>
        </div>`
    ).join('');
}

// オンラインルーム更新
function updateOnlineRooms(rooms) {
    if (rooms.length === 0) {
        elements.onlineRooms.innerHTML = '<div class="empty-online">アクティブなルームがありません</div>';
        return;
    }
    
    elements.onlineRooms.innerHTML = rooms.map(room => 
        `<div class="online-item room-item" onclick="joinPublicRoom('${escapeHtml(room.name)}')">
            <span class="online-indicator">🏠</span>
            <span class="online-name">${escapeHtml(room.name)}</span>
            <span class="room-count">(${room.count})</span>
        </div>`
    ).join('');
}

// ルーム内ユーザー更新
function updateRoomUsers(users) {
    if (users.length === 0) {
        elements.roomUsers.innerHTML = '<div class="empty-sidebar">ユーザーがいません</div>';
        return;
    }
    
    elements.roomUsers.innerHTML = users.map(user => 
        `<div class="user-item">
            <span class="user-indicator">🟢</span>
            <span class="user-name">${escapeHtml(user)}</span>
        </div>`
    ).join('');
}

// 公開ルームに参加
function joinPublicRoom(roomName) {
    if (!state.isConnected) {
        elements.roomInput.value = roomName;
        elements.privateCheckbox.checked = false;
        togglePrivateMode();
        showNotification(`「${roomName}」に参加するには名前を入力して参加ボタンを押してください`, 'info');
    }
}

// テーマ切り替え
function toggleTheme() {
    state.isDarkMode = !state.isDarkMode;
    localStorage.setItem('darkMode', state.isDarkMode.toString());
    applyTheme();
}

// テーマ適用
function applyTheme() {
    if (state.isDarkMode) {
        document.documentElement.setAttribute('data-theme', 'dark');
        elements.themeIcon.textContent = '☀️';
    } else {
        document.documentElement.removeAttribute('data-theme');
        elements.themeIcon.textContent = '🌙';
    }
}

// 通知表示
function showNotification(message, type = 'info') {
    // 既存の通知を削除
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--bg-card);
        color: var(--text-primary);
        padding: 1rem 1.5rem;
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-lg);
        border-left: 4px solid var(--${type === 'error' ? 'error' : type === 'success' ? 'success' : type === 'warning' ? 'warning' : 'primary'}-color);
        z-index: 1000;
        animation: slideInRight 0.3s ease-out;
        max-width: 350px;
        word-wrap: break-word;
        font-size: 0.9rem;
    `;
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // 4秒後に自動削除
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 4000);
}

// ユーザーデータの保存
function saveUserData() {
    localStorage.setItem('username', elements.nameInput.value);
    localStorage.setItem('roomname', elements.roomInput.value);
}

// 保存されたデータの読み込み
function loadSavedData() {
    const savedUsername = localStorage.getItem('username');
    const savedRoomname = localStorage.getItem('roomname');
    
    if (savedUsername) {
        elements.nameInput.value = savedUsername;
    }
    
    if (savedRoomname) {
        elements.roomInput.value = savedRoomname;
    }
}

// HTMLエスケープ
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// CSS アニメーションを追加
if (!document.querySelector('#custom-animations')) {
    const style = document.createElement('style');
    style.id = 'custom-animations';
    style.textContent = `
        @keyframes slideInRight {
            from {
                opacity: 0;
                transform: translateX(100%);
            }
            to {
                opacity: 1;
                transform: translateX(0);
            }
        }
        
        @keyframes slideOutRight {
            from {
                opacity: 1;
                transform: translateX(0);
            }
            to {
                opacity: 0;
                transform: translateX(100%);
            }
        }
    `;
    document.head.appendChild(style);
}

// アプリケーション初期化
document.addEventListener('DOMContentLoaded', init);

// PWA対応
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then((registration) => {
                console.log('ServiceWorker registration successful');
            })
            .catch((error) => {
                console.log('ServiceWorker registration failed:', error);
            });
    });
}