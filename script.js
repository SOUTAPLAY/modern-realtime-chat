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
    
    // チャット関連
    currentRoom: document.getElementById('currentRoom'),
    currentUser: document.getElementById('currentUser'),
    inputText1: document.getElementById('inputText1'),
    inputText2: document.getElementById('inputText2'),
    messageDisplay1: document.getElementById('messageDisplay1'),
    messageDisplay2: document.getElementById('messageDisplay2'),
    
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

// Socket.IOの初期化（本来はサーバーが必要ですが、デモ用にモック実装）
class MockSocket {
    constructor() {
        this.events = {};
        this.connected = false;
    }
    
    on(event, callback) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(callback);
    }
    
    emit(event, data) {
        console.log(`Emitting ${event}:`, data);
        
        // モックレスポンスのシミュレーション
        setTimeout(() => {
            if (event === 'joinRoom') {
                this.trigger('roomJoined', data);
            } else if (event === 'sendMessage1' || event === 'sendMessage2') {
                const messageEvent = event === 'sendMessage1' ? 'receiveMessage1' : 'receiveMessage2';
                this.trigger(messageEvent, data);
            }
        }, 100);
    }
    
    trigger(event, data) {
        if (this.events[event]) {
            this.events[event].forEach(callback => callback(data));
        }
    }
}

// 初期化
function init() {
    state.socket = new MockSocket(); // 本来は io() でSocket.IOクライアントを初期化
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
    
    // メッセージ入力
    elements.inputText1.addEventListener('input', () => handleMessageInput('sendMessage1', elements.inputText1.value));
    elements.inputText2.addEventListener('input', () => handleMessageInput('sendMessage2', elements.inputText2.value));
    
    // 表示/非表示切り替え
    elements.visibilityToggle.addEventListener('click', toggleRoomVisibility);
    
    // テーマ切り替え
    elements.themeToggle.addEventListener('click', toggleTheme);
    
    // データ保存
    elements.nameInput.addEventListener('input', saveUserData);
    elements.roomInput.addEventListener('input', saveUserData);
}

// Socket.IOイベントリスナーの設定
function setupSocketListeners() {
    state.socket.on('roomJoined', (data) => {
        showChatArea();
        elements.currentRoom.textContent = data.room;
        elements.currentUser.textContent = data.name;
        showNotification(`ルーム「${data.room}」に参加しました`, 'success');
    });
    
    state.socket.on('receiveMessage1', (data) => {
        if (data.room === state.currentRoom) {
            displayMessage(elements.messageDisplay1, data.name, data.message);
        }
    });
    
    state.socket.on('receiveMessage2', (data) => {
        if (data.room === state.currentRoom) {
            displayMessage(elements.messageDisplay2, data.name, data.message);
        }
    });
}

// ルーム参加処理
function handleJoinRoom() {
    const name = elements.nameInput.value.trim();
    const room = elements.roomInput.value.trim();
    
    if (!name || !room) {
        showNotification('名前とルーム名を入力してください', 'error');
        return;
    }
    
    // ボタンをローディング状態に
    elements.joinButton.classList.add('loading');
    
    state.username = name;
    state.currentRoom = room;
    
    state.socket.emit('joinRoom', { name, room });
    
    // ローディング状態を解除
    setTimeout(() => {
        elements.joinButton.classList.remove('loading');
    }, 500);
}

// ルーム退出処理
function handleLeaveRoom() {
    state.isConnected = false;
    state.currentRoom = '';
    state.username = '';
    
    // チャットエリアをクリア
    clearMessageDisplay(elements.messageDisplay1);
    clearMessageDisplay(elements.messageDisplay2);
    elements.inputText1.value = '';
    elements.inputText2.value = '';
    
    // 接続パネルに戻る
    elements.chatArea.style.display = 'none';
    elements.connectionPanel.style.display = 'flex';
    
    showNotification('チャットルームから退出しました', 'info');
}

// メッセージ入力処理
function handleMessageInput(event, message) {
    if (state.currentRoom && state.username && message.trim()) {
        state.socket.emit(event, {
            room: state.currentRoom,
            name: state.username,
            message: message.trim()
        });
    }
}

// メッセージ表示
function displayMessage(container, author, content) {
    // 空の状態表示を削除
    const emptyState = container.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }
    
    const messageElement = document.createElement('div');
    messageElement.className = 'message';
    messageElement.innerHTML = `
        <div class="message-author">${escapeHtml(author)}</div>
        <div class="message-content">${escapeHtml(content)}</div>
    `;
    
    container.appendChild(messageElement);
    container.scrollTop = container.scrollHeight;
}

// メッセージ表示をクリア
function clearMessageDisplay(container) {
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
    
    // 入力フィールドにフォーカス
    setTimeout(() => {
        elements.inputText1.focus();
    }, 100);
}

// ルーム名の表示/非表示切り替え
function toggleRoomVisibility() {
    const isPassword = elements.roomInput.type === 'password';
    elements.roomInput.type = isPassword ? 'text' : 'password';
    elements.visibilityToggle.querySelector('.visibility-icon').textContent = isPassword ? '👁️' : '🙈';
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
        border-left: 4px solid var(--${type === 'error' ? 'error' : type === 'success' ? 'success' : 'primary'}-color);
        z-index: 1000;
        animation: slideInRight 0.3s ease-out;
        max-width: 300px;
        word-wrap: break-word;
    `;
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // 3秒後に自動削除
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 3000);
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
const style = document.createElement('style');
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
                console.log('ServiceWorker registration failed');
            });
    });
}