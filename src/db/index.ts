import Dexie, { type Table } from 'dexie'
import type { Entry, Task, Completion, Setting } from './types'

/** Dữ liệu ngoài đã tải về, để module `feed`/`hybrid` mở được khi offline.
 *  LOCAL-ONLY, cố ý không đồng bộ: đây là bản chép của dữ liệu công khai: đồng bộ
 *  nó chỉ tốn băng thông, và tệ hơn là bản cũ ở máy này có thể ghi đè bản mới ở
 *  máy khác qua LWW. Máy nào cần thì tự tải lại. */
export interface CacheRow {
  key: string
  data: unknown
  fetchedAt: string
}

/** Một dòng cho mỗi bảng được đồng bộ. Chỉ tồn tại trên máy này. */
export interface SyncState {
  table: string
  /** Đã kéo được thay đổi của server tới mốc này */
  lastPulledAt: string
  /** Đã đẩy xong thay đổi của máy này tới mốc này */
  lastPushedAt: string
}

export class AppDB extends Dexie {
  entries!: Table<Entry, string>
  tasks!: Table<Task, string>
  completions!: Table<Completion, [string, string]>
  settings!: Table<Setting, string>

  /** Mốc đồng bộ RIÊNG TỪNG MÁY — cố ý không nằm trong `settings` vì settings
   *  được đồng bộ, mà "máy này đã kéo tới đâu" thì không được đồng bộ. */
  syncState!: Table<SyncState, string>
  /** Cache dữ liệu ngoài — cũng chỉ tồn tại trên máy này */
  cache!: Table<CacheRow, string>

  constructor() {
    super('so-ca-nhan')
    this.version(1).stores({
      // [module+localDate] cho truy vấn "bản ghi của module X trong ngày Y"
      entries: 'id, module, localDate, [module+localDate], updatedAt, deletedAt',
      tasks: 'id, kind, sortOrder, archivedAt',
      completions: '[taskId+localDate], taskId, localDate',
      settings: 'key',
    })

    // v2 — giai đoạn 3: đồng bộ.
    // `updatedAt` được đánh chỉ mục ở mọi bảng vì đẩy/kéo đều truy vấn theo nó.
    // `completions` thêm updatedAt + deletedAt để bỏ tick truyền được sang máy khác.
    this.version(2)
      .stores({
        entries: 'id, module, localDate, [module+localDate], updatedAt, deletedAt',
        tasks: 'id, kind, sortOrder, archivedAt, updatedAt',
        completions: '[taskId+localDate], taskId, localDate, updatedAt, deletedAt',
        settings: 'key, updatedAt',
        syncState: 'table',
      })
      .upgrade(async (tx) => {
        // Dòng cũ chưa có updatedAt — lấy chính lúc hoàn thành làm mốc.
        await tx.table('completions').toCollection().modify((c: Completion) => {
          if (!c.updatedAt) c.updatedAt = c.completedAt
        })
      })

    // v3 — giai đoạn 4: module feed/hybrid cần chỗ giữ dữ liệu ngoài để chạy
    // offline. Bảng này KHÔNG nằm trong SPECS nên không đồng bộ, và cũng không
    // có hook nào của nó kích đồng bộ.
    this.version(3).stores({
      entries: 'id, module, localDate, [module+localDate], updatedAt, deletedAt',
      tasks: 'id, kind, sortOrder, archivedAt, updatedAt',
      completions: '[taskId+localDate], taskId, localDate, updatedAt, deletedAt',
      settings: 'key, updatedAt',
      syncState: 'table',
      cache: 'key',
    })
  }
}

export const db = new AppDB()

/* ---------- helper cài đặt ---------- */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key)
  return row ? (row.value as T) : fallback
}

export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value, updatedAt: new Date().toISOString() })
}

/* ---------- cache dữ liệu ngoài ---------- */

export async function readCache<T>(key: string): Promise<T | null> {
  const row = await db.cache.get(key)
  if (!row) return null
  // Quá hạn thì vẫn TRẢ VỀ, người gọi tự quyết định tải lại. Trả null sẽ làm màn
  // hình trắng khi offline, mà dữ liệu cũ vẫn tốt hơn không có gì.
  return row.data as T
}

export async function cacheAge(key: string): Promise<number> {
  const row = await db.cache.get(key)
  return row ? Date.now() - new Date(row.fetchedAt).getTime() : Infinity
}

export async function writeCache(key: string, data: unknown) {
  await db.cache.put({ key, data, fetchedAt: new Date().toISOString() })
}
