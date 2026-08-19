import { useEffect, useState } from 'react'
import { Routes, Route, useParams, useSearchParams, Navigate } from 'react-router-dom'
import { Launcher } from './components/Launcher'
import { getModule } from './modules/registry'
import { seedModuleTasks } from './modules/todo/data'
import { startSync } from './sync'

/* Nạp module — thứ tự ở đây là thứ tự trên trang chính */
import './modules/todo'
import './modules/weight'
import './modules/bp'
import './modules/exercise'
import './modules/news'

function ModuleRoute() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const mod = id ? getModule(id) : undefined

  if (!mod) return <Navigate to="/" replace />
  const Quick = mod.QuickAdd

  /** URL là nguồn sự thật, KHÔNG phải useState khởi tạo từ URL.
   *
   *  `/m/todo` và `/m/weight` khớp cùng route `/m/:id` nên React Router dùng lại
   *  đúng component này — không remount, hàm khởi tạo của useState không chạy
   *  lại. Với `useState(params.get('add') === '1')` thì bấm việc "Cân nặng buổi
   *  sáng" TỪ TRONG màn hình todo sẽ điều hướng đúng nhưng form nhập không bao
   *  giờ mở. Đi từ trang chính thì lại chạy, vì đó là đổi route nên có remount —
   *  nên lỗi này trốn được rất lâu.
   */
  const adding = params.get('add') === '1'
  // Đóng form = bỏ tham số khỏi URL. replace để nút Back không mở lại form.
  const close = () => setParams(new URLSearchParams(), { replace: true })

  return (
    <>
      <mod.Screen />
      {adding && Quick && <Quick onDone={close} />}
    </>
  )
}

export default function App() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    // Gieo việc trước rồi mới đồng bộ: việc gieo mang id tiền định nên hai máy
    // sinh ra cùng một dòng, upsert trộn lại thành một chứ không nhân đôi.
    seedModuleTasks().finally(() => { setReady(true); startSync() })
  }, [])
  if (!ready) return <div className="app" />

  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Launcher />} />
        <Route path="/m/:id" element={<ModuleRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}
