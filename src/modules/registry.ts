import type { ComponentType } from 'react'
import type { Task } from '../db/types'

/** tracker: bạn nhập, lưu vĩnh viễn, phải chạy offline
 *  feed:    dữ liệu ngoài, chỉ đọc, có cache
 *  hybrid:  dữ liệu ngoài + một chút state cá nhân
 */
export type ModuleKind = 'tracker' | 'feed' | 'hybrid'

/** Việc mà module tự đăng ký vào danh sách todo.
 *  Đây là thứ giữ cho app CHỈ CÓ MỘT hệ thống nhắc nhở.
 */
export type TaskSeed = Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'sortOrder'> & {
  seedId: string
}

export interface ModuleDef {
  id: string
  name: string
  kind: ModuleKind
  /** Màn hình đầy đủ */
  Screen: ComponentType
  /** Ô trên trang chính. Bỏ trống thì chỉ hiện tên. */
  Widget?: ComponentType
  /** Form ghi nhanh, mở từ trang chính hoặc từ todo. */
  QuickAdd?: ComponentType<{ onDone: () => void }>
  /** Chiếm cả chiều rộng lưới thay vì nửa. */
  wide?: boolean
  /** Việc định kỳ module này muốn đưa vào todo. */
  seedTasks?: TaskSeed[]
}

const registry = new Map<string, ModuleDef>()

export function register(def: ModuleDef) {
  registry.set(def.id, def)
}

export const getModule = (id: string) => registry.get(id)
export const allModules = () => [...registry.values()]
export const modulesWithQuickAdd = () => allModules().filter((m) => m.QuickAdd)
