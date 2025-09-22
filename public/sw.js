self.addEventListener('fetch', (event) => {
// Socket.IOはキャッシュせず常にネットワーク
if (event.request.url.includes('/socket.io/')) return;
// 既存のキャッシュ戦略があればここに
});
