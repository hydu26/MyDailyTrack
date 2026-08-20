import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, setSetting } from '../db'
import { allModules } from '../modules/registry'
import { Sheet } from './ui'

/** Khoá `profile.*` là các lựa chọn cá nhân, ĐƯỢC đồng bộ nên theo sang máy khác. */
const FEMALE = 'profile.female'

export function useProfileGates() {
  return useLiveQuery(async () => {
    const rows = await db.settings.where('key').startsWith('profile.').toArray()
    return new Map(rows.filter((r) => r.value !== null).map((r) => [r.key, r.value]))
  }, [])
}

/** Module có `enabledBy` thì ẩn cho tới khi khoá đó bằng true.
 *
 *  Trong lúc đang đọc settings (`gates` chưa có) cũng coi là ẩn: thà hiện muộn
 *  một nhịp còn hơn loé lên rồi biến mất. */
export function useVisibleModules() {
  const gates = useProfileGates()
  return allModules().filter((m) => !m.enabledBy || gates?.get(m.enabledBy) === true)
}

/** Dòng ở chân trang chính. Luôn tới được, KHÔNG phụ thuộc đã cấu hình Supabase
 *  hay đã đăng nhập — nếu nhét cùng sheet đồng bộ thì khi tắt đồng bộ sẽ không
 *  còn chỗ nào đổi được lựa chọn này. */
export function ProfileLink() {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button className="footlink" onClick={() => setOpen(true)}>Cá nhân</button>
      {open && <ProfileSheet onClose={() => setOpen(false)} />}
    </div>
  )
}

function ProfileSheet({ onClose }: { onClose: () => void }) {
  const gates = useProfileGates()
  const female = gates?.get(FEMALE)

  return (
    <Sheet onClose={onClose}>
      <h2>Cá nhân</h2>
      <div className="hint">Quyết định module nào hiện trên trang chính</div>

      <div className="fieldrow">
        <div className="lab">Giới tính<small>BẬT MODULE KINH NGUYỆT</small></div>
        <div className="scale">
          <button className={`chip sm${female === false ? ' on' : ''}`}
                  aria-pressed={female === false}
                  onClick={() => void setSetting(FEMALE, false)}>Nam</button>
          <button className={`chip sm${female === true ? ' on' : ''}`}
                  aria-pressed={female === true}
                  onClick={() => void setSetting(FEMALE, true)}>Nữ</button>
        </div>
      </div>

      <div className="acts" style={{ marginTop: 18 }}>
        <button className="cancel" onClick={onClose}>Xong</button>
      </div>
      <p className="footnote">
        {female === undefined
          ? 'Chưa chọn — module Kinh nguyệt đang ẩn.'
          : female
            ? 'Module Kinh nguyệt đang hiện trên trang chính.'
            : 'Module Kinh nguyệt đang ẩn.'}
        {' '}Lựa chọn này được đồng bộ nên theo sang máy khác. Tắt không xoá dữ liệu đã ghi.
      </p>
    </Sheet>
  )
}
