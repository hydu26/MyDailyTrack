import type { Task } from '../../db/types'
import { parseLocalDate, daysBetween, localDateOf } from '../../lib/time'

/** Việc này có rơi vào ngày đó không?
 *  Không có dòng nào cho tương lai tồn tại trong database — tất cả
 *  sinh ra tại chỗ từ quy tắc. 8 quy tắc thay cho ~1300 dòng/năm.
 */
export function occursOn(task: Task, date: string): boolean {
  if (task.archivedAt) return false

  switch (task.kind) {
    case 'daily':
      return true

    case 'weekly':
      return !!task.days?.includes(parseLocalDate(date).getDay())

    case 'once':
      return task.dueDate === date

    case 'interval': {
      if (!task.dueDate || !task.everyNDays) return false
      const diff = daysBetween(task.dueDate, date)
      // đúng mốc, hoặc bội số của chu kỳ sau mốc, hoặc đã quá hạn
      if (diff < 0) return false
      return diff === 0 || diff % task.everyNDays === 0
    }
  }
}

export function tasksForDate(tasks: Task[], date: string): Task[] {
  return tasks
    .filter((t) => occursOn(t, date))
    .sort((a, b) => {
      const at = a.timeOfDay ?? '99:99'
      const bt = b.timeOfDay ?? '99:99'
      return at === bt ? a.sortOrder - b.sortOrder : at.localeCompare(bt)
    })
}

/** Việc một-lần và định-kỳ còn ở phía trước, cho mục "Sắp tới". */
export function upcoming(tasks: Task[], withinDays = 60): Task[] {
  const today = localDateOf()
  return tasks
    .filter((t) => !t.archivedAt && (t.kind === 'once' || t.kind === 'interval') && t.dueDate)
    .map((t) => ({ t, n: daysBetween(today, t.dueDate!) }))
    .filter(({ n }) => n > 0 && n <= withinDays)
    .sort((a, b) => a.n - b.n)
    .map(({ t }) => t)
}

export function ruleLabel(t: Task): string {
  switch (t.kind) {
    case 'daily':
      return 'MỖI NGÀY'
    case 'weekly':
      return (t.days ?? []).map((d) => ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d]).join('·')
    case 'interval':
      return `MỖI ${t.everyNDays} NGÀY`
    case 'once':
      return 'MỘT LẦN'
  }
}

/** Chuỗi ngày liên tiếp: đếm ngược từ hôm nay, ngày nào cũng xong hết việc.
 *  Suy ra từ bảng completions, không lưu riêng — không bao giờ lệch.
 */
export function computeStreak(
  tasks: Task[],
  completedByDate: Map<string, Set<string>>,
  from = localDateOf(),
): number {
  let streak = 0
  let cursor = from
  for (let i = 0; i < 400; i++) {
    const due = tasksForDate(tasks, cursor)
    if (due.length === 0) {
      cursor = shift(cursor, -1)
      continue
    }
    const done = completedByDate.get(cursor) ?? new Set()
    const all = due.every((t) => done.has(t.id))
    // hôm nay chưa xong hết thì chưa tính, nhưng cũng không phá chuỗi
    if (!all) {
      if (i === 0) {
        cursor = shift(cursor, -1)
        continue
      }
      break
    }
    streak++
    cursor = shift(cursor, -1)
  }
  return streak
}

function shift(date: string, n: number): string {
  const d = parseLocalDate(date)
  d.setDate(d.getDate() + n)
  return localDateOf(d)
}
