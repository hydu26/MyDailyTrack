import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

/** `null` khi chưa cấu hình env.
 *
 *  App PHẢI chạy được mà không có Supabase: module tracker bắt buộc hoạt động
 *  offline, nên đăng nhập là thứ bật thêm, không phải cửa chắn. Mọi chỗ dùng
 *  biến này phải xử lý được trường hợp null.
 */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      })
    : null

export const syncConfigured = supabase !== null
