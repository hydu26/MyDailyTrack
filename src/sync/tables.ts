import { db } from '../db'
import type { Entry, Task, Completion, Setting } from '../db/types'

/** null của Postgres ↔ undefined của TypeScript */
const un = <T>(v: T | null | undefined): T | undefined => v ?? undefined

/** Mốc thời gian từ server về ở dạng '+00:00', local lưu dạng 'Z'. Chuẩn hoá về
 *  một dạng duy nhất: chuỗi ISO của toISOString() có độ rộng cố định nên so
 *  sánh chuỗi = so sánh thời gian, và chỉ mục `updatedAt` trong Dexie mới xếp
 *  đúng thứ tự. Trộn hai dạng là hỏng cả hai thứ đó.
 */
const iso = (v: string) => new Date(v).toISOString()
const isoOpt = (v: string | null | undefined) => (v ? iso(v) : undefined)

export interface TableSpec<L> {
  /** Tên dùng làm khoá trong bảng syncState */
  name: string
  remote: string
  /** Cột cho ON CONFLICT khi upsert */
  conflict: string
  table: () => import('dexie').Table<L, any>
  key: (row: L) => any
  toRow: (row: L, userId: string) => Record<string, unknown>
  fromRow: (r: Record<string, any>) => L
  changedSince: (since: string) => Promise<L[]>
}

const entries: TableSpec<Entry> = {
  name: 'entries',
  remote: 'entries',
  conflict: 'user_id,id',
  table: () => db.entries,
  key: (e) => e.id,
  toRow: (e, userId) => ({
    id: e.id,
    user_id: userId,
    module: e.module,
    measured_at: e.measuredAt,
    local_date: e.localDate,
    local_tz: e.localTz,
    note: e.note ?? null,
    value: e.value,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    deleted_at: e.deletedAt ?? null,
  }),
  fromRow: (r) =>
    ({
      id: r.id,
      module: r.module,
      measuredAt: iso(r.measured_at),
      localDate: r.local_date, // NGUYÊN VĂN — không bao giờ dựng lại từ Date
      localTz: r.local_tz,
      note: un(r.note),
      value: r.value,
      createdAt: iso(r.created_at),
      updatedAt: iso(r.updated_at),
      deletedAt: isoOpt(r.deleted_at),
    }) as Entry,
  changedSince: (since) => db.entries.where('updatedAt').above(since).toArray(),
}

const tasks: TableSpec<Task> = {
  name: 'tasks',
  remote: 'tasks',
  conflict: 'user_id,id',
  table: () => db.tasks,
  key: (t) => t.id,
  toRow: (t, userId) => ({
    id: t.id,
    user_id: userId,
    title: t.title,
    kind: t.kind,
    days: t.days ?? null,
    every_n_days: t.everyNDays ?? null,
    due_date: t.dueDate ?? null,
    time_of_day: t.timeOfDay ?? null,
    remind: t.remind,
    linked_module: t.linkedModule ?? null,
    sort_order: t.sortOrder,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
    archived_at: t.archivedAt ?? null,
  }),
  fromRow: (r) => ({
    id: r.id,
    title: r.title,
    kind: r.kind,
    days: un(r.days),
    everyNDays: un(r.every_n_days),
    dueDate: un(r.due_date),
    timeOfDay: un(r.time_of_day),
    remind: r.remind,
    linkedModule: un(r.linked_module),
    sortOrder: r.sort_order,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    archivedAt: isoOpt(r.archived_at),
  }),
  changedSince: (since) => db.tasks.where('updatedAt').above(since).toArray(),
}

const completions: TableSpec<Completion> = {
  name: 'completions',
  remote: 'completions',
  conflict: 'user_id,task_id,local_date',
  table: () => db.completions,
  key: (c) => [c.taskId, c.localDate],
  toRow: (c, userId) => ({
    user_id: userId,
    task_id: c.taskId,
    local_date: c.localDate,
    completed_at: c.completedAt,
    updated_at: c.updatedAt,
    deleted_at: c.deletedAt ?? null,
  }),
  fromRow: (r) => ({
    taskId: r.task_id,
    localDate: r.local_date,
    completedAt: iso(r.completed_at),
    updatedAt: iso(r.updated_at),
    deletedAt: isoOpt(r.deleted_at),
  }),
  changedSince: (since) => db.completions.where('updatedAt').above(since).toArray(),
}

const settings: TableSpec<Setting> = {
  name: 'settings',
  remote: 'settings',
  conflict: 'user_id,key',
  table: () => db.settings,
  key: (s) => s.key,
  toRow: (s, userId) => ({
    user_id: userId,
    key: s.key,
    value: s.value ?? null,
    updated_at: s.updatedAt,
  }),
  fromRow: (r) => ({ key: r.key, value: r.value, updatedAt: iso(r.updated_at) }),
  changedSince: (since) => db.settings.where('updatedAt').above(since).toArray(),
}

/** THỨ TỰ QUAN TRỌNG: completions có khoá ngoại tới tasks, đẩy ngược thứ tự thì
 *  Postgres từ chối vì việc chưa tồn tại. */
export const SPECS = [tasks, completions, entries, settings] as TableSpec<any>[]
