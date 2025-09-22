/* global io */
const socket = io();

// 参加UI
const nameEl = document.getElementById('name');
const roomEl = document.getElementById('room');
const privateEl = document.getElementById('private');
const passwordEl = document.getElementById('password');
const joinBtn = document.getElementById('join');
const leaveBtn = document.getElementById('leave');
const errorEl = document.getElementById('joinError');
const statusEl = document.getElementById('status');

// オンライン一覧
const onlineUsersEl = document.getElementById('onlineUsers');
const onlineRoomsEl = document.getElementById('onlineRooms');

// 表示エリア（複数）
const displays = Array.from(document.querySelectorAll('.message-display'));

// 入力欄（msg, msg1, msg2, .message-input などを対象）
const inputs = Array.from(document.querySelectorAll('textarea, input[type="text"]'))
  .filter((el) => {
    // 参加系の入力は除外
    if (['name', 'room', 'password'].includes(el.id)) return false;
    // メッセージ入力候補
    return (
      el.id === 'msg' ||
      /^msg\d+$/.test(el.id) ||
      el.classList.contains('message-input') ||
      (el.dataset && el.dataset.channel)
    );
  });

// ユーティリティ: チャンネル検出
function detectChannelFromEl(el) {
  if (!el) return null;
  if (el.dataset && el.dataset.channel) return String(el.dataset.channel);
  if (el.id) {
    const m = el.id.match(/(\d+)$/);
    if (m) return m[1]; // 末尾の数字のみ
    if (el.id === 'msg' || el.id === 'display') return 'default';
  }
  return null;
}

// チャンネル割り当て（明示がなければ並び順で1,2,3...）
const displaysByChannel = new Map();
const inputsByChannel = new Map();

// まず display にチャンネルを振る
displays.forEach((d, idx) => {
  let ch = detectChannelFromEl(d);
  if (!ch) ch = String(idx + 1);
  d.dataset.channel = ch;
  displaysByChannel.set(ch, d);
});

// 次に input にチャンネルを振る（display数と入力数が一致しない場合も考慮）
inputs.forEach((inp, idx) => {
  let ch = detectChannelFromEl(inp);
  if (!ch) ch = String(idx + 1);
  inp.dataset.channel = ch;
  inputsByChannel.set(ch, inp);
});

// 状態
let joinedRoom = null;
let myName = null;

// プライベート部屋のパスワード
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
    if (statusEl) statusEl.textContent = `入室中: ${res.room} ${res.private ? '(プライベート)' : ''}`;

    // 入力を有効化
    inputsByChannel.forEach((inp) => {
      inp.disabled = false;
    });

    // 表示を初期化（履歴なし）
    displaysByChannel.forEach((d) => clearDisplay(d));
  });
});

// 退室
leaveBtn?.addEventListener('click', () => {
  socket.emit('leaveRoom', () => {
    joinedRoom = null;
    myName = null;
    if (statusEl) statusEl.textContent = '未入室';
    inputsByChannel.forEach((inp) => (inp.disabled = true));
    displaysByChannel.forEach((d) => clearDisplay(d));
  });
});

// 入力イベントで即時送信＋ローカル反映（履歴なし）
inputsByChannel.forEach((inp, ch) => {
  // 参加前は無効化
  if (!joinedRoom) inp.disabled = true;

  const handler = throttle(() => {
    const value = inp.value ?? '';
    if (!joinedRoom) return;

    // サーバへ送信（送信者含む全員に配信）
    socket.emit('typing:update', { text: value, channel: ch });

    // ローカル即時描画（往復待たずに最新を表示）
    renderTyping({ from: myName || 'Me', text: value, channel: ch, ts: Date.now() });
  }, 60); // 60ms間隔

  inp.addEventListener('input', handler);
});

// サーバからの入力中更新を描画（対応するdisplayのみ）
socket.on('typing:update', (payload) => {
  const { from, text, channel, ts } = payload || {};
  renderTyping({ from, text, channel, ts });
});

// オンラインリスト
socket.on('lists', ({ users, rooms }) => {
  if (onlineUsersEl) {
    onlineUsersEl.innerHTML = '';
    users.forEach((u) => {
      const li = document.createElement('li');
      li.textContent = String(u);
      onlineUsersEl.appendChild(li);
    });
  }
  if (onlineRoomsEl) {
    onlineRoomsEl.innerHTML = '';
    rooms.forEach((r) => {
      const li = document.createElement('li');
      li.textContent = `${r.name} (${r.count})`;
      onlineRoomsEl.appendChild(li);
    });
  }
});

// 表示系（履歴なし・常に上書き）
function hhmmss(ts) {
  const d = new Date(ts || Date.now());
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function getOrCreateBlock(display) {
  let wrap = display.querySelector('.message.system-message');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'message system-message';
    // 子3要素（名前・本文・時刻）
    const nameDiv = document.createElement('div');
    const textDiv = document.createElement('div');
    const timeDiv = document.createElement('div');
    wrap.appendChild(nameDiv);
    wrap.appendChild(textDiv);
    wrap.appendChild(timeDiv);
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
  const display =
    displaysByChannel.get(ch) ||
    displaysByChannel.get('default') ||
    null;
  if (!display) return;

  // 空になったら消す（要件: 入力が消えたら表示も消える）
  if (!text) {
    clearDisplay(display);
    return;
  }

  const wrap = getOrCreateBlock(display);
  const [nameDiv, textDiv, timeDiv] = wrap.children;
  nameDiv.textContent = from || 'Unknown';
  textDiv.textContent = text || '';
  timeDiv.textContent = hhmmss(ts || Date.now());
}

// throttle: 高頻度inputの送信を多少抑制
function throttle(fn, interval = 60) {
  let last = 0,
    t = null;
  return (...args) => {
    const now = Date.now();
    const remain = interval - (now - last);
    if (remain <= 0) {
      last = now;
      fn(...args);
    } else {
      clearTimeout(t);
      t = setTimeout(() => {
        last = Date.now();
        fn(...args);
      }, remain);
    }
  };
}

/* デバッグ */
window.debugTyping = {
  local(channel = '1', text = 'test') {
    renderTyping({ from: 'Local', text, channel, ts: Date.now() });
  },
  send(channel = '1', text = 'network') {
    socket.emit('typing:update', { text, channel });
  },
};
