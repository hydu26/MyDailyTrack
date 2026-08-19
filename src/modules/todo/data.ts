import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import type { Task } from '../../db/types'
import { localDateOf } from '../../lib/time'
import { tasksForDate, computeStreak } from './rules'
import { allModules } from '../registry'

/** useLiveQuery = state manager của app. Dữ liệu đổi thì UI tự vẽ lại,
 *  kể cả khi đổi từ tab khác. Không cần Redux/Zustand.
 */
export function useTodayTasks() {
  const today = localDateOf()

  return useLiveQuery(async () => {
    const tasks = await db.tasks.filter((t) => !t.archivedAt).toArray()
    const due = tasksForDate(tasks, today)
    const comps = await db.completions.where('localDate').equals(today).toArray()
    const doneIds = new Set(comps.map((c) => c.taskId))
    return { tasks, due, doneIds, today }
  }, [today])
}

export function useStreak() {
  return useLiveQuery(async () => {
    const tasks = await db.tasks.filter((t) => !t.archivedAt).toArray()
    const comps = await db.completions.toArray()
    const byDate = new Map<string, Set<string>>()
    for (const c of comps) {
      if (!byDate.has(c.localDate)) byDate.set(c.localDate, new Set())
      byDate.get(c.localDate)!.add(c.taskId)
    }
    return computeStreak(tasks, byDate)
  }, [])
}

export async function toggleTask(taskId: string, done: boolean, date = localDateOf()) {
  if (done) {
    await db.completions.put({ taskId, localDate: date, completedAt: new Date().toISOString() })
  } else {
    await db.completions.delete([taskId, date])
  }
}

/** Đánh dấu xong mà không đảo trạng thái — dùng khi module tự báo về
 *  (nhập cân xong thì việc "Cân nặng buổi sáng" tự tick).
 */
export async function completeTask(taskId: string, date = localDateOf()) {
  await db.completions.put({ taskId, localDate: date, completedAt: new Date().toISOString() })
}

export async function completeLinked(moduleId: string, date = localDateOf()) {
  const linked = await db.tasks.filter((t) => t.linkedModule === moduleId && !t.archivedAt).toArray()
  await Promise.all(linked.map((t) => completeTask(t.id, date)))
}

/** Mỗi module khai báo việc định kỳ của nó; ở đây gieo vào bảng tasks
 *  một lần duy nhất. Đây là lý do app chỉ có MỘT hệ thống nhắc nhở.
 */
export async function seedModuleTasks() {
  const now = new Date().toISOString()
  let order = 0

  for (const mod of allModules()) {
    for (const seed of mod.seedTasks ?? []) {
      const id = `seed:${mod.id}:${seed.seedId}`
      const existing = await db.tasks.get(id)
      if (existing) continue
      const { seedId, ...rest } = seed
      void seedId
      const task: Task = { ...rest, id, sortOrder: order++, createdAt: now, updatedAt: now }
      await db.tasks.add(task)
    }
  }
}

export async function addTask(input: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'sortOrder'>) {
  const now = new Date().toISOString()
  const count = await db.tasks.count()
  await db.tasks.add({ ...input, id: crypto.randomUUID(), sortOrder: count, createdAt: now, updatedAt: now })
}
