import { supabase } from '../lib/supabase'

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export type PushState =
  | 'unsupported' // trình duyệt không có Push API
  | 'unconfigured' // thiếu VITE_VAPID_PUBLIC_KEY
  | 'needs-install' // iOS: phải cài vào màn hình chính trước đã
  | 'denied' // đã bị từ chối, chỉ đổi được trong cài đặt trình duyệt
  | 'off'
  | 'on'

const hasApi = () =>
  typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window

/** iOS chỉ cho nhận push khi app đã được cài vào màn hình chính. Trong Safari
 *  thường thì API có mặt nhưng xin quyền sẽ không bao giờ thành công, nên phải
 *  nói thẳng ra chứ không để người dùng bấm vào chỗ chết. */
function iosNotInstalled(): boolean {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (!ios) return false
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  return !standalone
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Lấy service worker đang hoạt động, CÓ CHẶN THỜI GIAN.
 *
 *  Không bao giờ `await navigator.serviceWorker.ready` trực tiếp: khi chưa có
 *  service worker nào đăng ký, promise đó KHÔNG resolve và cũng KHÔNG reject —
 *  nó treo vĩnh viễn, nên `.catch()` bọc ngoài cũng vô dụng.
 *
 *  Đã gặp thật: `pnpm dev` không đăng ký service worker, lượt đồng bộ treo ở
 *  trạng thái "đang đồng bộ" mãi mãi, và vì cờ `applying` không được hạ nên mọi
 *  lượt đồng bộ sau cũng bị chặn luôn.
 */
async function activeRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null

  // registerSW.js chạy ở event load nên có thể chưa kịp đăng ký — đợi tối đa 3s
  let reg = await navigator.serviceWorker.getRegistration()
  for (let i = 0; i < 12 && !reg; i++) {
    await sleep(250)
    reg = await navigator.serviceWorker.getRegistration()
  }
  if (!reg) return null

  // Có registration rồi nhưng có thể đang cài dở, chưa có worker active
  return await Promise.race([
    navigator.serviceWorker.ready,
    sleep(5000).then(() => null),
  ])
}

/** base64url của khoá VAPID → byte, dạng mà applicationServerKey đòi.
 *  Cấp phát qua ArrayBuffer tường minh chứ không `new Uint8Array(n)`: từ TS 5.7
 *  `BufferSource` đòi `ArrayBufferView<ArrayBuffer>`, còn `new Uint8Array(n)`
 *  suy ra `ArrayBufferLike` (gồm cả SharedArrayBuffer) nên không khớp. */
function vapidBytes(base64url: string) {
  const b64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export async function pushState(): Promise<PushState> {
  if (!hasApi()) return 'unsupported'
  if (!VAPID || !supabase) return 'unconfigured'
  if (iosNotInstalled()) return 'needs-install'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await activeRegistration()
  // Không có service worker thì push không thể hoạt động, dù mọi thứ khác đủ
  if (!reg) return 'unsupported'
  return (await reg.pushManager.getSubscription()) ? 'on' : 'off'
}

/** Lưu đăng ký hiện tại lên server. Gọi cả lúc bật lẫn mỗi lần đồng bộ: đăng ký
 *  push có thể bị trình duyệt đổi endpoint bất cứ lúc nào, và client là nơi duy
 *  nhất có phiên đăng nhập để cập nhật lại — service worker không có. */
export async function savePushSubscription(): Promise<boolean> {
  if (!supabase || !hasApi()) return false
  const reg = await activeRegistration()
  if (!reg) return false
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return false

  const json = sub.toJSON()
  const { p256dh, auth } = json.keys ?? {}
  if (!json.endpoint || !p256dh || !auth) return false

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return false

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: session.user.id,
      endpoint: json.endpoint,
      p256dh,
      auth,
      user_agent: navigator.userAgent.slice(0, 300),
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  )
  return !error
}

export async function enablePush(): Promise<PushState> {
  const state = await pushState()
  if (state !== 'off') return state

  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off'

  const reg = await activeRegistration()
  if (!reg) return 'unsupported'
  await reg.pushManager.subscribe({
    // Bắt buộc true: mỗi lần đẩy phải hiện một thông báo. Trình duyệt không cho
    // đăng ký push âm thầm.
    userVisibleOnly: true,
    applicationServerKey: vapidBytes(VAPID!),
  })
  await savePushSubscription()
  return 'on'
}

export async function disablePush(): Promise<PushState> {
  if (!hasApi()) return 'unsupported'
  const reg = await activeRegistration()
  if (!reg) return 'unsupported'
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    const endpoint = sub.endpoint
    await sub.unsubscribe()
    // Xoá cứng: đây là sổ thiết bị, không phải dữ liệu sức khoẻ cần lịch sử
    await supabase?.from('push_subscriptions').delete().eq('endpoint', endpoint)
  }
  return 'off'
}
