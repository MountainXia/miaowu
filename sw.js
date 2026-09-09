/**
 * sw.js - 「喵的粮仓」个人资产管理 PWA Service Worker
 * 实现网络优先(页面) + 缓存优先(静态资源) 的智能离线策略
 */

const CACHE_NAME = 'personal-asset-pwa-v9';

const STATIC_ASSETS = [
  './',
  './index.html',
  './db.js',
  './manifest.json',
  './icons/app-logo.jpg',
  './icons/app-logo.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.svg',
  './assets/bg-orange.png',
  './assets/bg-cow.png',
  './vendor/vue.global.prod.js'
];

// 安装阶段：预缓存核心静态外壳资源并立即跳过等待
self.addEventListener('install', (event) => {
  console.log('[SW] Installing new Service Worker version:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching offline assets...');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Some assets failed to precache:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// 激活阶段：立即清除所有旧缓存，并接管当前客户端
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating new Service Worker version:', CACHE_NAME);
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Purging old cache version:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 请求拦截阶段
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // 仅处理 GET 请求
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isHtml = request.mode === 'navigate' ||
    (request.headers.get('accept') && request.headers.get('accept').includes('text/html')) ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('.html');

  // 策略 1: 页面 HTML 采用 Network-First (网络优先)
  // 在线时永远获取最新页面代码，保证修改即刻生效；离线时无缝降级读取本地缓存
  if (isHtml) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          console.warn('[SW] Network unreachable, serving cached HTML shell');
          return caches.match(request).then((cached) => cached || caches.match('./index.html'));
        })
    );
    return;
  }

  // 策略 2: 静态资源采用 Stale-While-Revalidate
  // 极速读取本地缓存，并在后台向网络拉取更新
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        }
        return networkResponse;
      }).catch(() => null);

      return cachedResponse || fetchPromise;
    })
  );
});
