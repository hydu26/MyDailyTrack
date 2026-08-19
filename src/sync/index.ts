import { db } from '../db'
import { supabase } from '../lib/supabase'
import { currentTz } from '../lib/time'
import { SPECS, type TableSpec } from './tables'
import { savePushSubscription } from '../push'

/** Mốc "chưa đồng bộ lần nào" */
const EPOCH = '1970-01-01T00:00:00.000Z'

export type SyncPhase = 'off' | 'idle' | 'syncing' | 'error'

export interface SyncStatus {
  phase: SyncPhase
  /** Lần đồng bộ xong gần nhất */
  at?: string
  error?: string
}

let status: SyncStatus = { phase: 'off' }
const listeners = new Set<(s: SyncStatus) => void>()

function setStatus(next: SyncStatus) {
  status = next
  listeners.forEach((f) => f(status))
}

export const getStatus = () => status
export function onStatus(f: (s: SyncStatus) => void) {
  listeners.add(f)
  f(status)
  return () => listeners.delete(f)
}

/* ─────────────────────────── một bảng ─────────────────────────── */

async function syncTable(spec: TableSpec<any>, userId: string) {
  const state = (await db.syncState.get(spec.name)) ?? {
    table: spec.name,
    lastPulledAt: EPOCH,
    lastPushedAt: EPOCH,
  }

  // Chốt mốc TRƯỚC khi đọc: thay đổi xảy ra trong lúc đang đồng bộ sẽ được bắt
  // ở vòng sau, thay vì bị nhảy qua vì mốc đã tiến quá xa.
  const startedAt = new Date().toISOString()

  /* ── ĐẨY ── */
  const mine = await spec.changedSince(state.lastPushedAt)
  if (mine.length) {
    const { error } = await supabase!
      .from(spec.remote)
      .upsert(mine.map((r) => spec.toRow(r, userId)), { onConflict: spec.conflict })
    if (error) throw new Error(`đẩy ${spec.name}: ${error.message}`)
  }

  /* ── KÉO ── */
  // gte chứ không phải gt: dòng ở đúng mốc sẽ về lại mỗi lần, nhưng trộn là
  // luỹ đẳng nên vô hại — còn gt thì bỏ sót dòng ghi cùng mili-giây với mốc.
  const { data, error } = await supabase!
    .from(spec.remote)
    .select('*')
    .gte('updated_at', state.lastPulledAt)
    .order('updated_at', { ascending: true })
  if (error) throw new Error(`kéo ${spec.name}: ${error.message}`)

  let maxSeen = state.lastPulledAt
  const table = spec.table()

  await db.transaction('rw', table, async () => {
    for (const row of data ?? []) {
      const incoming = spec.fromRow(row)
      if (incoming.updatedAt > maxSeen) maxSeen = incoming.updatedAt

      const existing = await table.get(spec.key(incoming))
      // LWW: chỉ nhận khi bản của server MỚI HƠN thật. Bằng nhau thì giữ nguyên
      // để hai máy không đá qua đá lại mãi.
      if (!existing || Date.parse(incoming.updatedAt) > Date.parse(existing.updatedAt)) {
        await table.put(incoming)
      }
    }
  })

  await db.syncState.put({ table: spec.name, lastPulledAt: maxSeen, lastPushedAt: startedAt })
  return { pushed: mine.length, pulled: data?.length ?? 0 }
}

/* ─────────────────────────── toàn bộ ─────────────────────────── */

/** Chặn cứng cả lượt đồng bộ. Không có nó thì MỘT promise không bao giờ settle
 *  là đủ để trạng thái kẹt ở "đang đồng bộ" vĩnh viễn, và vì cờ `applying`
 *  không được hạ nên mọi lượt sau cũng bị chặn. Đã gặp thật với
 *  `navigator.serviceWorker.ready`. */
const TIMEOUT_MS = 30_000

function withTimeout<T>(work: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} quá ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS),
    ),
  ])
}

let running: Promise<void> | null = null
/** Bật lên trong lúc ghi dữ liệu kéo về, để hook đổi-dữ-liệu không tự gọi
 *  đồng bộ vòng nữa — nếu không thì trộn xong lại kích trộn, thành vòng lặp. */
let applying = false

export async function sync(): Promise<void> {
  if (!supabase) return
  // Đang chạy thì trả về chính lượt đang chạy, không chạy hai lượt song song
  if (running) return running

  running = (async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setStatus({ phase: 'off' })
      return
    }

    setStatus({ phase: 'syncing', at: status.at })
    applying = true
    try {
      // Múi giờ nơi người dùng ĐANG Ở — cron nhắc dựa vào đây, nên cập nhật
      // mỗi lần đồng bộ chứ không phải chỉ lúc tạo tài khoản.
      await withTimeout(
        Promise.resolve(
          supabase.from('profiles').upsert(
            { user_id: session.user.id, timezone: currentTz(), updated_at: new Date().toISOString() },
            { onConflict: 'user_id' },
          ),
        ),
        'profiles',
      )

      for (const spec of SPECS) await withTimeout(syncTable(spec, session.user.id), `bảng ${spec.name}`)

      // Endpoint push có thể bị trình duyệt đổi bất cứ lúc nào. Client là nơi
      // duy nhất có phiên đăng nhập để ghi lại, nên tranh thủ lượt đồng bộ.
      // Lỗi ở đây KHÔNG được làm đồng bộ thất bại — nhắc nhở là phần phụ.
      await withTimeout(savePushSubscription(), 'đăng ký push').catch(() => {})

      setStatus({ phase: 'idle', at: new Date().toISOString() })
    } catch (e) {
      setStatus({ phase: 'error', at: status.at, error: e instanceof Error ? e.message : String(e) })
    } finally {
      applying = false
      running = null
    }
  })()

  return running
}

/* ───────────────────── khi nào chạy ───────────────────── */

let timer: ReturnType<typeof setTimeout> | null = null

/** Gộp nhiều thay đổi liên tiếp thành một lượt đồng bộ */
export function syncSoon(delay = 2000) {
  if (applying) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { timer = null; void sync() }, delay)
}

let started = false

export function startSync() {
  if (!supabase || started) return
  started = true

  void sync()

  // Hook của Dexie: mọi thay đổi dữ liệu tự hẹn một lượt đẩy, module không cần
  // biết gì về đồng bộ. Nhờ vậy thêm module mới cũng không phải nối dây gì.
  for (const t of [db.entries, db.tasks, db.completions, db.settings]) {
    t.hook('creating', () => { syncSoon() })
    t.hook('updating', () => { syncSoon() })
    t.hook('deleting', () => { syncSoon() })
  }

  // Mở lại app trên máy khác thì kéo ngay. Rời app thì đẩy ngay — đây là lúc
  // duy nhất bắt được "vừa ghi xong rồi tắt máy" trên điện thoại.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void sync()
    else syncSoon(0)
  })
  window.addEventListener('online', () => void sync())

  // Đăng nhập / đăng xuất
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') void sync()
    if (event === 'SIGNED_OUT') setStatus({ phase: 'off' })
  })
}

/** Đăng xuất: xoá mốc đồng bộ để lần đăng nhập sau đẩy/kéo lại từ đầu.
 *  KHÔNG xoá dữ liệu local — app vẫn phải chạy offline sau khi đăng xuất. */
export async function signOut() {
  await supabase?.auth.signOut()
  await db.syncState.clear()
}
