import { useEffect, useState } from 'react'
import { Routes, Route, useParams, useSearchParams, Navigate } from 'react-router-dom'
import { Launcher } from './components/Launcher'
import { getModule } from './modules/registry'
import { seedModuleTasks } from './modules/todo/data'

/* Nạp module — thứ tự ở đây là thứ tự trên trang chính */
import './modules/todo'
import './modules/weight'
import './modules/bp'

function ModuleRoute() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const mod = id ? getModule(id) : undefined
  const [adding, setAdding] = useState(params.get('add') === '1')

  if (!mod) return <Navigate to="/" replace />
  const Quick = mod.QuickAdd

  return (
    <>
      <mod.Screen />
      {adding && Quick && <Quick onDone={() => setAdding(false)} />}
    </>
  )
}

export default function App() {
  const [ready, setReady] = useState(false)
  useEffect(() => { seedModuleTasks().finally(() => setReady(true)) }, [])
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
