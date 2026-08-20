import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { supabase, syncConfigured } from '../lib/supabase'
import { getStatus, onStatus, sync, signOut } from '../sync'
import { clockOf } from '../lib/time'
import { Sheet } from './ui'
import { pushState, enablePush, disablePush, type PushState } from '../push'

export function useSyncStatus() {
  return useSyncExternalStore(onStatus, getStatus)
}

/** Dòng ở chân trang chính. Bấm vào mở sheet đăng nhập / đồng bộ.
 *  Đây là chỗ duy nhất nói về đồng bộ trên trang chính — không có màn hình cài
 *  đặt riêng cho một thứ đặt một lần.
 */
export function SyncFoot({ children }: { children?: ReactNode }) {
  const s = useSyncStatus()
  const [open, setOpen] = useState(false)

  const line = !syncConfigured
    ? 'Chưa cấu hình đồng bộ'
    : s.phase === 'off'
      ? 'Đăng nhập để đồng bộ'
      : s.phase === 'syncing'
        ? 'Đang đồng bộ…'
        : s.phase === 'error'
          ? 'Lỗi đồng bộ · bấm để xem'
          : s.at
            ? `Đã đồng bộ ${clockOf(s.at)}`
            : 'Đã đăng nhập'

  return (
    <>
      <div className="foot">
        <p>Dữ liệu lưu trên máy này</p>
        {syncConfigured ? (
          <button className="footlink" onClick={() => setOpen(true)}>{line}</button>
        ) : (
          <p>{line}</p>
        )}
        {children}
      </div>
      {open && <AccountSheet onClose={() => setOpen(false)} />}
    </>
  )
}

function AccountSheet({ onClose }: { onClose: () => void }) {
  const s = useSyncStatus()
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const signedIn = s.phase !== 'off'

  const login = async () => {
    if (!supabase || busy) return
    setBusy(true); setErr(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass })
    setBusy(false)
    if (error) setErr(error.message)
    else onClose()
  }

  if (signedIn) {
    return (
      <Sheet onClose={onClose}>
        <h2>Đồng bộ</h2>
        <div className="hint">
          {s.phase === 'syncing' ? 'Đang đồng bộ…' : s.at ? `Lần cuối ${clockOf(s.at)}` : 'Chưa đồng bộ lần nào'}
        </div>
        {s.error && <div className="errbox">{s.error}</div>}
        <PushRow />
        <div className="acts">
          <button className="cancel" onClick={async () => { await signOut(); onClose() }}>Đăng xuất</button>
          <button className="save" disabled={s.phase === 'syncing'} onClick={() => void sync()}>
            Đồng bộ ngay
          </button>
        </div>
        <p className="footnote">
          Đăng xuất không xoá dữ liệu trên máy này. App vẫn chạy offline.
        </p>
      </Sheet>
    )
  }

  return (
    <Sheet onClose={onClose}>
      <h2>Đăng nhập để đồng bộ</h2>
      <div className="hint">Giữa điện thoại và máy tính</div>
      <label className="tf">
        <span className="eyebrow">Email</span>
        <input className="tinput" type="email" inputMode="email" autoComplete="username"
               value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="tf">
        <span className="eyebrow">Mật khẩu</span>
        <input className="tinput" type="password" autoComplete="current-password"
               value={pass} onChange={(e) => setPass(e.target.value)}
               onKeyDown={(e) => { if (e.key === 'Enter') void login() }} />
      </label>
      {err && <div className="errbox">{err}</div>}
      <div className="acts">
        <button className="cancel" onClick={onClose}>Huỷ</button>
        <button className="save" disabled={busy || !email || !pass} onClick={() => void login()}>
          {busy ? 'Đang vào…' : 'Đăng nhập'}
        </button>
      </div>
      <p className="footnote">
        Tài khoản tạo một lần ở Supabase Dashboard → Authentication → Users.
      </p>
    </Sheet>
  )
}

/* ---------- bật/tắt nhắc trên thiết bị này ---------- */
/** Đăng ký push là theo TỪNG THIẾT BỊ, không phải theo tài khoản: bật trên điện
 *  thoại không làm máy tính nhận thông báo. Nên chữ phải nói rõ "thiết bị này".
 */
function PushRow() {
  const [st, setSt] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { void pushState().then(setSt) }, [])

  if (st === null || st === 'unsupported' || st === 'unconfigured') return null

  const toggle = async () => {
    setBusy(true)
    setSt(st === 'on' ? await disablePush() : await enablePush())
    setBusy(false)
  }

  const label: Record<PushState, string> = {
    on: 'Đang bật trên thiết bị này',
    off: 'Chưa bật trên thiết bị này',
    denied: 'Đã bị chặn trong cài đặt trình duyệt',
    'needs-install': 'Cài app vào màn hình chính trước',
    unsupported: '',
    unconfigured: '',
  }

  return (
    <div className="pushrow">
      <div className="lab">
        Nhắc<small>{label[st]}</small>
      </div>
      {st === 'on' || st === 'off' ? (
        <button className="qbtn" disabled={busy} onClick={() => void toggle()}>
          {busy ? '…' : st === 'on' ? 'Tắt' : 'Bật'}
        </button>
      ) : null}
    </div>
  )
}
