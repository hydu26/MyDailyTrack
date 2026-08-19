/// <reference lib="webworker" />
/** Service worker tự viết — KHÔNG dùng workbox.
 *
 *  Phải tự viết vì Web Push cần handler `push` và `notificationclick` riêng, mà
 *  chế độ `generateSW` của vite-plugin-pwa sinh service worker hoàn toàn tự động
 *  nên không chèn code của mình vào được. Đã đổi sang `injectManifest`.
 *
 *  Không kéo workbox-precaching vào: phần cần dùng chỉ là "cache theo manifest,
 *  xoá cache cũ, điều hướng trả về index.html" — chưa tới 40 dòng.
 *
 *  File này KHÔNG nằm trong tsconfig chính (lib DOM và lib WebWorker xung đột
 *  nhau); nó được kiểm kiểu riêng bằng tsconfig.sw.json.
 */
export type {}

interface PrecacheEntry {
  url: string
  revision: string | null
}

const sw = self as unknown as ServiceWorkerGlobalScope

/** PHẢI viết `self.__WB_MANIFEST` trực tiếp ở đây. workbox tìm đúng biểu thức
 *  thành viên đó trong bản đã biên dịch để chèn danh sách file; đọc qua biến
 *  trung gian thì sau khi biên dịch nó thành `sw.__WB_MANIFEST` và build đổ với
 *  "Unable to find a place to inject the manifest". */
const manifest: PrecacheEntry[] =
  (self as unknown as { __WB_MANIFEST?: PrecacheEntry[] }).__WB_MANIFEST ?? []

/** Dấu vân tay của cả manifest. Một file đổi là tên cache đổi, cache cũ bị xoá
 *  ở activate. Đây là TOÀN BỘ cơ chế chống cache cũ — dùng tên cache cố định
 *  thì bản mới sẽ không bao giờ tới được máy người dùng. */
function fingerprint(entries: PrecacheEntry[]): string {
  let h = 0
  for (const e of entries) {
    const s = e.url + (e.revision ?? '')
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(36)
}

const PREFIX = 'mydailytrack-'
const CACHE = PREFIX + fingerprint(manifest)

/** PHẢI lọc trùng: `includeAssets` và `globPatterns` cùng khai báo hai file icon
 *  nên manifest có chúng hai lần, mà `cache.addAll()` từ chối CẢ LÔ nếu danh
 *  sách có URL lặp (InvalidStateError). Hậu quả đã gặp thật: cache rỗng, service
 *  worker không activate, app không chạy offline — và không có lỗi nào hiện ra. */
const urls = [...new Set(manifest.map((e) => e.url))]

sw.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      await cache.addAll(urls)
      await sw.skipWaiting()
    })(),
  )
})

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key)
      }
      await sw.clients.claim()
    })(),
  )
})

sw.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  // Supabase và mọi thứ khác origin: để mạng lo, không cache dữ liệu tài khoản
  if (new URL(req.url).origin !== location.origin) return

  // App là SPA nên mọi điều hướng đều trả về index.html rồi để React Router lo.
  // Không có nhánh này thì mở /m/bp lúc offline sẽ ra trang trắng.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE)
        return (await cache.match('index.html')) ?? (await fetch(req))
      })(),
    )
    return
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      return (await cache.match(req)) ?? (await fetch(req))
    })(),
  )
})

/* ───────────────────────── Web Push ───────────────────────── */

interface PushPayload {
  title?: string
  body?: string
  tag?: string
  url?: string
}

sw.addEventListener('push', (event) => {
  let p: PushPayload = {}
  try {
    p = event.data?.json() ?? {}
  } catch {
    p = { body: event.data?.text() }
  }
  event.waitUntil(
    sw.registration.showNotification(p.title ?? 'Nhắc', {
      body: p.body ?? '',
      // Cùng tag thì thông báo mới THAY THẾ cái cũ. Không có nó thì nhắc ba ngày
      // không mở app sẽ thành ba thông báo xếp đống rồi người dùng tắt hết.
      tag: p.tag ?? 'nhac',
      data: { url: p.url ?? '/' },
      icon: '/icon-192.png',
      badge: '/icon-192.png',
    }),
  )
})

sw.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/'
  event.waitUntil(
    (async () => {
      const clients = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // App đang mở thì đưa lên trước rồi điều hướng, đừng mở thêm cửa sổ thứ hai
      for (const c of clients) {
        await c.focus()
        await c.navigate(url)
        return
      }
      await sw.clients.openWindow(url)
    })(),
  )
})
