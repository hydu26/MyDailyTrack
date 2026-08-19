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
    // Bỏ tick là xoá mềm — dòng còn đó, phải lọc ra
    const doneIds = new Set(comps.filter((c) => !c.deletedAt).map((c) => c.taskId))
    return { tasks, due, doneIds, today }
  }, [today])
}

export function useStreak() {
  return useLiveQuery(async () => {
    const tasks = await db.tasks.filter((t) => !t.archivedAt).toArray()
    const comps = await db.completions.filter((c) => !c.deletedAt).toArray()
    const byDate = new Map<string, Set<string>>()
    for (const c of comps) {
      if (!byDate.has(c.localDate)) byDate.set(c.localDate, new Set())
      byDate.get(c.localDate)!.add(c.taskId)
    }
    return computeStreak(tasks, byDate)
  }, [])
}

export async function toggleTask(taskId: string, done: boolean, date = localDateOf()) {
  const now = new Date().toISOString()
  if (done) {
    // put ghi đè cả dòng, nên deletedAt của lần bỏ tick trước biến mất theo
    await db.completions.put({ taskId, localDate: date, completedAt: now, updatedAt: now })
  } else {
    // XOÁ MỀM, không delete: xoá cứng không truyền được sang máy khác qua LWW,
    // máy kia sẽ đẩy lại dòng cũ và việc tự tick lại.
    const existing = await db.completions.get([taskId, date])
    if (existing) await db.completions.put({ ...existing, deletedAt: now, updatedAt: now })
  }
}

/** Đánh dấu xong mà không đảo trạng thái — dùng khi module tự báo về
 *  (nhập cân xong thì việc "Cân nặng buổi sáng" tự tick).
 */
export async function completeTask(taskId: string, date = localDateOf()) {
  const now = new Date().toISOString()
  await db.completions.put({ taskId, localDate: date, completedAt: now, updatedAt: now })
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

  // MỘT giao dịch cho cả vòng lặp: `get` rồi `add` mà không nguyên tử thì hai
  // lượt gọi song song đều thấy "chưa có" và đều add → ConstraintError. Xảy ra
  // thật vì StrictMode chạy effect hai lần trong dev.
  await db.transaction('rw', db.tasks, async () => {
    let order = 0
    for (const mod of allModules()) {
      for (const seed of mod.seedTasks ?? []) {
        const id = `seed:${mod.id}:${seed.seedId}`
        // Tăng cho MỌI seed, kể cả seed đã tồn tại: nếu chỉ tăng khi tạo mới
        // thì module thêm sau cũng nhận sortOrder 0 và trùng với module cũ.
        const sortOrder = order++
        if (await db.tasks.get(id)) continue
        const { seedId, ...rest } = seed
        void seedId
        const task: Task = { ...rest, id, sortOrder, createdAt: now, updatedAt: now }
        await db.tasks.add(task)
      }
    }
  })
}

export async function addTask(input: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'sortOrder'>) {
  const now = new Date().toISOString()
  const count = await db.tasks.count()
  await db.tasks.add({ ...input, id: crypto.randomUUID(), sortOrder: count, createdAt: now, updatedAt: now })
}

/** Bỏ một việc = LƯU TRỮ, không xoá cứng. Hai lý do: xoá cứng không truyền được
 *  sang máy khác qua LWW (cùng bẫy đã gặp với completions), và `completions` có
 *  khoá ngoại tới `tasks` nên xoá việc là xoá luôn lịch sử đã làm của nó. */
export async function archiveTask(taskId: string) {
  const now = new Date().toISOString()
  await db.tasks.update(taskId, { archivedAt: now, updatedAt: now })
}
