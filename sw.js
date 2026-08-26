/* 音宝轩宝 情侣小网站 · 离线缓存（PWA） */
const CACHE = 'love-site-v7';
const CORE = [
  './',
  './index.html',
  './css/style.css?v=7',
  './js/config.js?v=7',
  './js/store.js?v=7',
  './js/app.js?v=7'
];

// 安装：预缓存核心文件
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

// 激活：清掉旧版本缓存，让新版立刻生效
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 只处理本站资源；Bmob 云端、天气等外部接口直接放行（隐私、实时）
  if (url.origin !== self.location.origin) return;

  // 页面请求：先走网络，断网时回退到缓存的首页
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 其它资源：缓存优先，后台悄悄更新
  event.respondWith(
    caches.match(req).then((cached) => {
      const refresh = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || refresh;
    })
  );
});
