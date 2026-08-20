import { useNavigate } from 'react-router-dom'
import type { ModuleDef } from '../modules/registry'
import { SyncFoot } from './Account'
import { ProfileLink, useVisibleModules } from './Profile'
import { useState } from 'react'

export function Launcher() {
  const nav = useNavigate()
  const [quick, setQuick] = useState<string | null>(null)
  const mods: ModuleDef[] = useVisibleModules()
  const now = new Date()
  const WD = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy']
  const hour = now.getHours()
  const greet = hour < 11 ? 'Chào buổi sáng' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối'

  const QuickForm = quick ? mods.find((m) => m.id === quick)?.QuickAdd : undefined
  // Ghi nhanh chỉ liệt kê module ĐANG HIỆN, không thì bấm được vào module đã tắt
  const quick2 = mods.filter((m) => m.QuickAdd)

  return (
    <div className="scroll">
      <div className="home-head">
        <div className="date">{WD[now.getDay()]}, {now.getDate()} tháng {now.getMonth() + 1}</div>
        <div className="greet">{greet}</div>
      </div>

      <div className="grid">
        {mods.map((m) => {
          // Module có Widget riêng chiếm cả hàng thì tự vẽ lấy khung
          if (m.wide && m.Widget) return <m.Widget key={m.id} />
          return (
            <button key={m.id} className={`tile${m.wide ? ' wide' : ''}`} onClick={() => nav(`/m/${m.id}`)}>
              {m.Widget ? <m.Widget /> : <span className="tile-name">{m.name}</span>}
            </button>
          )
        })}
      </div>

      {quick2.length > 0 && (
        <div className="quick">
          <div className="eyebrow" style={{ padding: '0 4px' }}>Ghi nhanh</div>
          <div className="quick-row">
            {quick2.map((m) => (
              <button key={m.id} className="qbtn" onClick={() => setQuick(m.id)}>+ {m.name}</button>
            ))}
          </div>
        </div>
      )}

      <SyncFoot>
        <ProfileLink />
      </SyncFoot>

      {QuickForm && <QuickForm onDone={() => setQuick(null)} />}
    </div>
  )
}
