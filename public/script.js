const socket = io();

const nameEl = document.getElementById('name');
const roomEl = document.getElementById('room');
const privateEl = document.getElementById('private');
const passwordEl = document.getElementById('password');
const joinBtn = document.getElementById('join');
const leaveBtn = document.getElementById('leave');
const errorEl = document.getElementById('joinError');

const statusEl = document.getElementById('status');
const messagesEl = document.getElementById('messages');
const msgEl = document.getElementById('msg');
const sendBtn = document.getElementById('send');

const onlineUsersEl = document.getElementById('onlineUsers');
const onlineRoomsEl = document.getElementById('onlineRooms');

let joinedRoom = null;

privateEl.addEventListener('change', () => {
passwordEl.disabled = !privateEl.checked;
if (!privateEl.checked) passwordEl.value = '';
});

joinBtn.addEventListener('click', () => {
const name = nameEl.value.trim();
const room = roomEl.value.trim();
const makePrivate = privateEl.checked;
const password = passwordEl.value;

errorEl.textContent = '';
socket.emit('joinRoom', { name, room, makePrivate, password }, (res) => {
if (!res?.ok) {
errorEl.textContent = res?.error || '入室に失敗しました';
return;
}
joinedRoom = res.room;
statusEl.textContent = 入室中: ${res.room} ${res.private ? '(プライベート)' : ''};
joinBtn.disabled = true;
leaveBtn.disabled = false;
sendBtn.disabled = false;
nameEl.disabled = roomEl.disabled = privateEl.disabled = passwordEl.disabled = true;
messagesEl.innerHTML = '';
});
});

leaveBtn.addEventListener('click', () => {
socket.emit('leaveRoom', (res) => {
joinedRoom = null;
statusEl.textContent = '未入室';
joinBtn.disabled = false;
leaveBtn.disabled = true;
sendBtn.disabled = true;
nameEl.disabled = roomEl.disabled = privateEl.disabled = false;
passwordEl.disabled = !privateEl.checked;
});
});

sendBtn.addEventListener('click', send);
msgEl.addEventListener('keydown', (e) => {
if (e.key === 'Enter') send();
});
function send() {
const text = msgEl.value.trim();
if (!text) return;
socket.emit('message', text);
msgEl.value = '';
}

socket.on('message', (m) => {
addMessage(${m.from}: ${m.text});
});
socket.on('system', (ev) => {
if (ev.type === 'join') addMessage(🔵 ${ev.name} が入室);
if (ev.type === 'leave') addMessage(⚫ ${ev.name} が退室);
});
socket.on('lists', ({ users, rooms }) => {
// ユーザー一覧
onlineUsersEl.innerHTML = '';
users.forEach(u => {
const li = document.createElement('li');
li.textContent = u;
onlineUsersEl.appendChild(li);
});
// ルーム一覧（公開のみ）
onlineRoomsEl.innerHTML = '';
rooms.forEach(r => {
const li = document.createElement('li');
li.textContent = ${r.name} (${r.count});
onlineRoomsEl.appendChild(li);
});
});

socket.on('connect', () => {
// 再接続時の自動再入室は仕様に含めない（手動で入室）
});
socket.on('disconnect', () => {
// ページを閉じたユーザーはサーバー側ですぐオフライン扱いになる
});

function addMessage(text) {
const li = document.createElement('li');
li.textContent = text;
messagesEl.appendChild(li);
messagesEl.scrollTop = messagesEl.scrollHeight;
}
