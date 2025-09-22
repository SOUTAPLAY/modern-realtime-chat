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
themeToggle?.addEventListener('click', () => {
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
})();

/* UI: ルーム名の可視/不可視切替 */
let roomHidden = false;
visibilityToggle?.addEventListener('click', () => {
roomHidden = !roomHidden;
try {
roomInput.type = roomHidden ? 'password' : 'text';
} catch {
// 一部ブラウザでtype変更不可のケースを握り潰し
}
});

/* プライベートチェックでパスワード欄の表示切替 */
privateCheckbox.addEventListener('change', () => {
const show = privateCheckbox.checked;
passwordGroup.style.display = show ? 'block' : 'none';
if (!show) passwordInput.value = '';
});

/* 入室/作成 */
joinButton.addEventListener('click', () => {
const name = (nameInput.value || '').trim();
const room = (roomInput.value || '').trim();
const makePrivate = privateCheckbox.checked;
const password = passwordInput.value;

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
connectionPanel.style.display = 'none';
chatArea.style.display = 'flex';

currentRoomEl.textContent = res.room + (res.private ? '（プライベート）' : '');
currentUserEl.textContent = `あなた: ${name}`;
userCountEl.textContent = '1';

clearMessages();
inputText1.focus();
});
});

/* 退室 */
leaveButton.addEventListener('click', () => {
socket.emit('leaveRoom', () => {
joinedRoom = null;
// 画面戻す
chatArea.style.display = 'none';
connectionPanel.style.display = 'flex';
// ルーム内ユーザー表示リセット
renderRoomUsers([]);
});
});

/* メッセージ送信 */
function send(text) {
const t = (text || '').trim();
if (!t) return;
socket.emit('message', t);
}
inputText1.addEventListener('keydown', (e) => {
if (e.key === 'Enter') {
send(inputText1.value);
inputText1.value = '';
}
});
inputText2.addEventListener('keydown', (e) => {
if (e.key === 'Enter') {
send(inputText2.value);
inputText2.value = '';
}
});

/* 受信イベント */
socket.on('message', (m) => {
addMessage(m.from, m.text);
});
socket.on('system', (ev) => {
if (ev.type === 'join') addSystem(${ev.name} が入室しました);
if (ev.type === 'leave') addSystem(${ev.name} が退出しました);
});
socket.on('lists', ({ users, rooms }) => {
renderOnlineUsers(users || []);
renderOnlineRooms(rooms || []);
});
socket.on('roomMembers', ({ users = [], count = 0 }) => {
userCountEl.textContent = String(count);
renderRoomUsers(users);
});

/* 切断時（サーバー側で即オフライン反映される） */
socket.on('disconnect', () => {
// 何もしない（サーバーで一覧は更新される）
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
messageDisplay1.querySelector('.empty-state')?.remove();
messageDisplay2.querySelector('.empty-state')?.remove();
messageDisplay1.appendChild(n1);
messageDisplay2.appendChild(n2);
messageDisplay1.scrollTop = messageDisplay1.scrollHeight;
messageDisplay2.scrollTop = messageDisplay2.scrollHeight;
}
function clearMessages() {
messageDisplay1.innerHTML = <div class="empty-state"> <div class="empty-icon">💭</div> <p>メッセージがここに表示されます</p> </div>;
messageDisplay2.innerHTML = <div class="empty-state"> <div class="empty-icon">💭</div> <p>メッセージがここに表示されます</p> </div>;
}

function renderOnlineUsers(list) {
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
item.textContent = ${r.name} (${r.count});
onlineRoomsBox.appendChild(item);
});
}
function renderRoomUsers(list) {
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
btn.classList.add('loading');
setTimeout(() => btn.classList.remove('loading'), 600);
}
