# Modern Chat - リアルタイムチャット

美しいデザインとモダンなUIを備えたリアルタイムチャットアプリケーションです。

## ✨ 特徴

- **モダンなデザイン**: グラデーションとシャドウを使った洗練されたUI
- **ダークモード対応**: ライト/ダークモード切り替え機能
- **レスポンシブデザイン**: PC、タブレット、スマートフォンに対応
- **PWA対応**: アプリのようにインストール可能
- **リアルタイム通信**: Socket.IOによる即座なメッセージ同期
- **データ永続化**: ユーザー設定とチャット履歴の保存
- **アクセシビリティ**: キーボードナビゲーションとスクリーンリーダー対応

## 🚀 デモ

[GitHub Pages でライブデモを見る](https://soutaplay.github.io/modern-realtime-chat/)

## 🛠️ 技術スタック

- **フロントエンド**: HTML5, CSS3, Vanilla JavaScript
- **リアルタイム通信**: Socket.IO
- **デザイン**: CSS Grid, Flexbox, CSS Custom Properties
- **フォント**: Inter (Google Fonts)
- **PWA**: Service Worker, Web App Manifest

## 📱 機能

### 基本機能
- ユーザー名とルーム名でチャット参加
- 2つの独立したメッセージチャンネル
- リアルタイムメッセージ同期
- 参加者の入退室通知

### UI/UX機能
- ダークモード切り替え
- レスポンシブデザイン
- スムーズなアニメーション
- 直感的な操作性
- 通知システム

### PWA機能
- オフライン対応
- アプリとしてインストール可能
- 高速な読み込み
- ネイティブアプリのような体験

## 🎨 デザインシステム

### カラーパレット
- **プライマリ**: グラデーション (#667eea → #764ba2)
- **セカンダリ**: #f093fb
- **成功**: #48bb78
- **警告**: #ed8936
- **エラー**: #f56565

### タイポグラフィ
- **フォント**: Inter
- **見出し**: 600-700 weight
- **本文**: 400-500 weight

### スペーシング
- **基本単位**: 0.25rem (4px)
- **コンポーネント間**: 1.5rem (24px)
- **セクション間**: 2rem (32px)

## 🔧 開発

### 前提条件
- モダンなWebブラウザ
- Socket.IOサーバー（リアルタイム機能用）

### ローカルでの実行

1. リポジトリをクローン
```bash
git clone https://github.com/SOUTAPLAY/modern-realtime-chat.git
cd modern-realtime-chat
```

2. ローカルサーバーで起動
```bash
# Python 3の場合
python -m http.server 8000

# Node.jsの場合
npx serve .

# Live Serverの場合
live-server
```

3. ブラウザで `http://localhost:8000` にアクセス

### Socket.IOサーバーの設定

リアルタイム機能を有効にするには、Socket.IOサーバーが必要です：

```javascript
// server.js (Node.js + Socket.IO)
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('User connected');
    
    socket.on('joinRoom', (data) => {
        socket.join(data.room);
        socket.to(data.room).emit('userJoined', data);
    });
    
    socket.on('sendMessage1', (data) => {
        io.to(data.room).emit('receiveMessage1', data);
    });
    
    socket.on('sendMessage2', (data) => {
        io.to(data.room).emit('receiveMessage2', data);
    });
    
    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

server.listen(3000, () => {
    console.log('Server running on port 3000');
});
```

## 📂 プロジェクト構造

```
modern-realtime-chat/
├── index.html          # メインHTMLファイル
├── style.css           # スタイルシート
├── script.js           # JavaScriptロジック
├── manifest.json       # PWAマニフェスト
├── sw.js              # Service Worker
└── README.md          # このファイル
```

## 🤝 コントリビューション

1. このリポジトリをフォーク
2. 機能ブランチを作成 (`git checkout -b feature/AmazingFeature`)
3. 変更をコミット (`git commit -m 'Add some AmazingFeature'`)
4. ブランチにプッシュ (`git push origin feature/AmazingFeature`)
5. プルリクエストを作成

## 📝 ライセンス

このプロジェクトはMITライセンスの下で公開されています。詳細は[LICENSE](LICENSE)ファイルを参照してください。

## 📞 お問い合わせ

- GitHub: [@SOUTAPLAY](https://github.com/SOUTAPLAY)
- プロジェクトリンク: [https://github.com/SOUTAPLAY/modern-realtime-chat](https://github.com/SOUTAPLAY/modern-realtime-chat)

## 🙏 謝辞

- [Socket.IO](https://socket.io/) - リアルタイム通信
- [Inter Font](https://fonts.google.com/specimen/Inter) - 美しいタイポグラフィ
- [CSS Tricks](https://css-tricks.com/) - デザインインスピレーション
