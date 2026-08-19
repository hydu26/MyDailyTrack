import Dexie, { type Table } from 'dexie'
import type { Entry, Task, Completion, Setting } from './types'

export class AppDB extends Dexie {
  entries!: Table<Entry, string>
  tasks!: Table<Task, string>
  completions!: Table<Completion, [string, string]>
  settings!: Table<Setting, string>

  constructor() {
    super('so-ca-nhan')
    this.version(1).stores({
      // [module+localDate] cho truy vấn "bản ghi của module X trong ngày Y"
      entries: 'id, module, localDate, [module+localDate], updatedAt, deletedAt',
      tasks: 'id, kind, sortOrder, archivedAt',
      completions: '[taskId+localDate], taskId, localDate',
      settings: 'key',
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
