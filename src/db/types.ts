/** Hai loại thời gian, lưu khác nhau — xem README.
 *  measuredAt = thời điểm tuyệt đối (ISO UTC)
 *  localDate  = ngày theo lịch lúc ghi, KHÔNG BAO GIỜ tính lại
 */
export interface BaseEntry {
  id: string
  module: string
  measuredAt: string
  localDate: string // 'YYYY-MM-DD'
  localTz: string // 'Europe/Paris'
  note?: string
  createdAt: string
  updatedAt: string
  deletedAt?: string // xoá mềm, bắt buộc cho đồng bộ
}

/* Giá trị đa hình theo module — union giữ cho không đọc nhầm kiểu */
export interface WeightEntry extends BaseEntry {
  module: 'weight'
  value: { kg: number }
}
export interface BpEntry extends BaseEntry {
  module: 'bp'
  value: { sys: number; dia: number; pulse: number }
}
export interface ExerciseEntry extends BaseEntry {
  module: 'exercise'
  value: { type: string; minutes: number; intensity: number }
}
export type Entry = WeightEntry | BpEntry | ExerciseEntry

/* ---- việc cần làm: lưu QUY TẮC, không lưu từng lần xuất hiện ---- */
export type TaskKind = 'once' | 'daily' | 'weekly' | 'interval'

export interface Task {
  id: string
  title: string
  kind: TaskKind
  days?: number[] // weekly: 0=CN .. 6=T7
  everyNDays?: number // interval
  dueDate?: string // once | interval: 'YYYY-MM-DD'
  timeOfDay?: string // 'HH:MM'
  remind: boolean
  linkedModule?: string // tick vào sẽ mở form nhập của module này
  sortOrder: number
  createdAt: string
  updatedAt: string
  archivedAt?: string
}

/** Chỉ ghi khi ĐÃ hoàn thành. Chuỗi ngày liên tiếp suy ra từ đây. */
export interface Completion {
  taskId: string
  localDate: string
  completedAt: string
}

export interface Setting {
  key: string // 'weight.goalKg', 'profile.tz', ...
  value: unknown
  updatedAt: string
}
