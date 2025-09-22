const socket = io();

// 参加フォーム
const nameEl = document.getElementById('name');
const roomEl = document.getElementById('room');
const privateEl = document.getElementById('private');
const passwordEl = document.getElementById('password');
const joinBtn = document.getElementById('join');
const leaveBtn = document.getElementById('leave');
const errorEl = document.getElementById('joinError');

// ステータス
const statusEl = document.getElementById('status');

// オンライン一覧
const onlineUsersEl = document.getElementById('onlineUsers');
const onlineRoomsEl = document.getElementById('onlineRooms');

// 表示エリア（複数対応）
const displayEls = Array.from(document.querySelectorAll('.message-display'));

// 入力欄（複数対応）
const inputCandidates = Array.from(document.querySelectorAll('textarea, input[type="text"]'))
// 参加系の入力は除外
.filter(el => !['name', 'room', 'password'].includes(el.id))
// 明示指定 or 慣例のidのみ採用（msg / msg1 / msg2 ...）
.filter(el => el.dataset.channel || el.classList.contains('message-input') || el.id === 'msg' || /^msg\d+$/.test(el.id));

// マッピング: channel -> display/input
const displaysByChannel = new Map();
const inputsByChannel = new Map();

function detectChannel(el) {
if (!el) return 'default';
if (el.dataset?.channel) return String(el.dataset.channel);
const id = el.id || '';
const m = id.match(/\d+/);
return m ? m : (id === 'msg' || id === 'display' ? 'default' : 'default');
}

// 各displayを登録
displayEls.forEach(d => {
const ch = detectChannel(d);
if (!displaysByChannel.has(ch)) displaysByChannel.set(ch, d);
});

// 入力欄を登録
inputCandidates.forEach(inp => {
const ch = detectChannel(inp);
inputsByChannel.set(ch, inp);
});

// ステータス保持
let joinedRoom = null;
let myName = null;

// プライベート部屋のパスワード制御
if (privateEl && passwordEl) {
passwordEl.disabled = !privateEl.checked;
privateEl.addEventListener('change', () => {
passwordEl.disabled = !privateEl.checked;
if (!privateEl.checked) passwordEl.value = '';
});
}

// 参加
joinBtn?.addEventListener('click', () => {
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
myName = name;
if (statusEl) statusEl.textContent = 入室中: ${res.room} ${res.private ? '(プライベート)' : ''};
joinBtn.disabled = true;
leaveBtn.disabled = false;

// 入力可能化（念のため）
inputsByChannel.forEach(inp => inp.disabled = false);

// 表示を初期化（履歴は持たない仕様）
displaysByChannel.forEach(d => clearDisplay(d));
});
});

// 退室
leaveBtn?.addEventListener('click', () => {
socket.emit('leaveRoom', () => {
joinedRoom = null;
myName = null;
if (statusEl) statusEl.textContent = '未入室';
joinBtn.disabled = false;
leaveBtn.disabled = true;
inputsByChannel.forEach(inp => inp.disabled = true);
});
});

// タイプ中に即時送信（全入力欄に対して）
inputsByChannel.forEach((inp, ch) => {
// 未入室時は無効化
inp.disabled = !joinedRoom;

const handler = throttle(() => {
const text = inp.value ?? '';
// 入室していない場合は送らない
if (!joinedRoom) return;
socket.emit('typing:update', { text, channel: ch });
// ローカル即時反映（サーバ往復を待たずに表示）
renderTyping({ from: myName || 'Me', text, channel: ch, ts: Date.now() });
}, 60); // 約16fps相当。必要なら10〜33msに変更可能

inp.addEventListener('input', handler);
});

// サーバからのタイプ更新を描画
socket.on('typing:update', (payload) => {
const { from, text, channel, ts } = payload || {};
renderTyping({ from, text, channel, ts });
});

// 既存の離散メッセージ（Enter送信）は受け取っても履歴を積まないため、描画しない
// 使う場合は typing:update と同じ描画で上書きにしてもOK
// socket.on('message', (m) => {
// renderTyping({ from: m.from, text: m.text, channel: 'default', ts: m.ts });
// });

// システム通知（入退室）は必要ならどこか1つのdisplayに上書き表示したいが、
// 仕様上「履歴を残さず常に更新」なので、ここではdefaultチャネルに上書き
socket.on('system', (ev) => {
const line =
ev?.type === 'join' ? 🔵 ${ev.name} が入室 :
ev?.type === 'leave' ? ⚫ ${ev.name} が退室 : '';
if (!line) return;
renderTyping({ from: 'System', text: line, channel: 'default', ts: Date.now() });
});

// オンラインリスト
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
li.textContent = ${r.name} (${r.count});
onlineRoomsEl.appendChild(li);
});
}
});

// ユーティリティ: 表示処理（履歴を持たず、常に上書き）
function hhmmss(ts) {
const d = new Date(ts || Date.now());
const pad = (n) => String(n).padStart(2, '0');
return ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())};
}

function getOrCreateMessageBlock(display) {
// display配下に .message.system-message を1つだけ持つ
let wrap = display.querySelector('.message.system-message');
if (!wrap) {
wrap = document.createElement('div');
wrap.className = 'message system-message';
const nameEl = document.createElement('div');
const textEl = document.createElement('div');
const timeEl = document.createElement('div');
wrap.appendChild(nameEl);
wrap.appendChild(textEl);
wrap.appendChild(timeEl);
display.innerHTML = '';
display.appendChild(wrap);
}
return wrap;
}

function clearDisplay(display) {
display.innerHTML = '';
}

function renderTyping({ from, text, channel, ts }) {
const ch = String(channel ?? 'default');
const display = displaysByChannel.get(ch) || displaysByChannel.get('default');
if (!display) return;

// 空文字ならクリア（仕様的に入力が消えたら表示も消す）
if (!text) {
clearDisplay(display);
return;
}

const wrap = getOrCreateMessageBlock(display);
const [nameEl, textEl, timeEl] = wrap.children;
nameEl.textContent = from || 'Unknown';
textEl.textContent = text || '';
timeEl.textContent = hhmmss(ts || Date.now());
}

// throttle: 過負荷防止（高頻度イベントをまとめる）
function throttle(fn, interval = 60) {
let last = 0, timer = null;
return function (...args) {
const now = Date.now();
const remain = interval - (now - last);
if (remain <= 0) {
last = now;
fn.apply(this, args);
} else {
clearTimeout(timer);
timer = setTimeout(() => {
last = Date.now();
fn.apply(this, args);
}, remain);
}
};
}

/* デバッグ補助 */
window.debugChat = {
// 任意チャンネルにローカル描画
local(channel = 'default', text = 'local test') {
renderTyping({ from: 'Local', text, channel, ts: Date.now() });
},
// 任意チャンネルにネットワーク送信
send(channel = 'default', text = 'typing test') {
socket.emit('typing:update', { text, channel });
}
};
