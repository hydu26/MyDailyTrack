import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { localDateOf, nowWhen, relativeDay, type When } from '../lib/time'

export const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
    <path d="M4 12l6 6L20 6" />
  </svg>
)

export const Chevron = ({ className = '' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 6l6 6-6 6" />
  </svg>
)

export function TopBar({ children }: { children?: ReactNode }) {
  const nav = useNavigate()
  return (
    <div className="topbar">
      <button className="back" onClick={() => nav(-1)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 5l-7 7 7 7" />
        </svg>
        Trang chính
      </button>
      {children}
    </div>
  )
}

export function Sheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="sheet">
      <div className="veil" onClick={onClose} />
      <div className="panel" role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  )
}

/* ---------- ô nhập số dùng chung ---------- */
/** Trường số: gõ bàn phím ĐƯỢC, kèm hai nút −/+.
 *
 *  App chạy trên cả điện thoại và laptop. Chỉ có −/+ thì trên laptop phải
 *  nhấn 20 lần để đổi 2 kg, mà bàn phím thì đang nằm ngay đó. Ngược lại trên
 *  điện thoại nút −/+ vẫn tiện hơn gõ. Nên có cả hai — mọi module nhập số
 *  dùng component này, đừng viết stepper riêng.
 *
 *  - `type="text"` + `inputMode="decimal"`: điện thoại hiện bàn phím số,
 *    và không có mũi tên spinner của `type="number"` chồng lên nút −/+.
 *  - Nhận cả dấu phẩy và dấu chấm thập phân (app hiển thị kiểu "70,5").
 *  - Mũi tên lên/xuống = −/+, Enter = lưu.
 *  - Đang gõ thì giữ nguyên chuỗi thô (`draft`), chỉ chuẩn hoá khi rời ô —
 *    nếu format ngay từng ký tự thì không gõ nổi "70,5".
 */
export function NumberField({
  value, onChange, label, unit, step = 1, min = -Infinity, max = Infinity, onEnter, compact,
}: {
  value: number
  onChange: (v: number) => void
  label: string
  unit?: string
  step?: number
  min?: number
  max?: number
  onEnter?: (v: number) => void
  /** Cỡ nhỏ, cho form có nhiều ô số xếp dọc (huyết áp: 3 chỉ số) */
  compact?: boolean
}) {
  const dec = (String(step).split('.')[1] ?? '').length
  const show = (n: number) => n.toFixed(dec).replace('.', ',')
  const [draft, setDraft] = useState<string | null>(null) // khác null = đang gõ

  const norm = (n: number) => Number(Math.min(max, Math.max(min, n)).toFixed(dec))

  /** Chuỗi thô → số. Gõ rác hoặc để trống thì giữ giá trị cũ. */
  const parse = (raw: string) => {
    const n = Number(raw.replace(',', '.').trim())
    return raw.trim() !== '' && Number.isFinite(n) ? norm(n) : value
  }

  const commit = (raw: string) => {
    setDraft(null)
    const n = parse(raw)
    latest.current = n
    if (n !== value) onChange(n)
    return n
  }

  /** Giá trị mới nhất, cập nhật NGAY trong bump.
   *
   *  Cần vì `value` là prop: bấm −/+ nhiều lần thật nhanh thì React gộp các lần
   *  cập nhật, mọi handler đọc cùng một `value` cũ và bốn lần bấm chỉ ra một
   *  bước. Nhấn nhanh liên tiếp là chuyện bình thường trên điện thoại nên không
   *  bỏ qua được. */
  const latest = useRef(value)
  useEffect(() => { latest.current = value }, [value])

  // Bấm −/+ giữa lúc đang gõ thì cộng từ chuỗi đang gõ, không phải giá trị cũ.
  const bump = (d: number) => {
    const base = draft !== null ? parse(draft) : latest.current
    const next = norm(base + d)
    latest.current = next
    setDraft(null)
    onChange(next)
  }

  return (
    <div className={`stepper${compact ? ' sm' : ''}`}>
      <button className="step" onClick={() => bump(-step)}
              aria-label={`Giảm ${show(step)}`} tabIndex={-1}>−</button>
      <label className="field">
        <input
          className="num"
          type="text"
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          aria-label={label}
          value={draft ?? show(value)}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => commit(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') { e.preventDefault(); bump(step) }
            else if (e.key === 'ArrowDown') { e.preventDefault(); bump(-step) }
            else if (e.key === 'Enter') { e.preventDefault(); onEnter?.(commit(e.currentTarget.value)) }
          }}
        />
        {unit && <small>{unit}</small>}
      </label>
      <button className="step" onClick={() => bump(step)}
              aria-label={`Tăng ${show(step)}`} tabIndex={-1}>+</button>
    </div>
  )
}

/* ---------- chọn thời điểm đo ---------- */
/** Mặc định `null` = đóng dấu lúc lưu, không phải bấm thêm gì. Bấm vào mới mở
 *  ô ngày/giờ, để ghi bù buổi đo hôm trước chưa nhập.
 *
 *  Trạng thái `null` KHÔNG hiện giờ hiện tại: mở form lúc 07:20 rồi lưu lúc
 *  07:25 thì bản ghi mang 07:25, in "07:20" ra là nói sai. Muốn thấy giờ chính
 *  xác thì bấm vào — lúc đó giờ hiện lên và sửa được.
 *
 *  Dùng `<input type="date|time">` gốc của trình duyệt: trên laptop gõ được
 *  bằng bàn phím, trên điện thoại ra bánh xe chọn ngày — đúng quy tắc 6 mà
 *  không phải tự viết bộ chọn ngày nào.
 */
export function WhenField({
  value, onChange,
}: { value: When | null; onChange: (w: When | null) => void }) {
  if (value === null) {
    return (
      <button className="whenbtn" onClick={() => onChange(nowWhen())}>
        <span>Hôm nay</span>
        <small>TỰ ĐỘNG · ĐỔI</small>
      </button>
    )
  }
  return (
    <div className="whenbox">
      <div className="when">
        <label className="wf">
          <span className="eyebrow">Ngày</span>
          {/* Không cho chọn ngày tương lai — không ai đo được buổi chưa tới */}
          <input type="date" className="num" value={value.date} max={localDateOf()}
                 aria-label="Ngày đo"
                 onChange={(e) => onChange({ ...value, date: e.target.value })} />
        </label>
        <label className="wf">
          <span className="eyebrow">Giờ</span>
          <input type="time" className="num" value={value.time} aria-label="Giờ đo"
                 onChange={(e) => onChange({ ...value, time: e.target.value })} />
        </label>
      </div>
      <div className="whenfoot">
        <small>{value.date ? relativeDay(value.date) : 'Chưa chọn ngày'}</small>
        <button onClick={() => onChange(null)}>Về tự động</button>
      </div>
    </div>
  )
}
