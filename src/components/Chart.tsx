/** Biểu đồ SVG tự viết — không dùng thư viện.
 *  Cần dải màu tham chiếu và đường EMA riêng, chống lại Recharts
 *  để có mấy thứ đó tốn công hơn 40 dòng này.
 */
interface Props {
  points: number[]
  trend?: number[]
  goal?: number
  height?: number
}

export function LineChart({ points, trend, goal, height = 104 }: Props) {
  if (points.length < 2) return <div className="empty">Cần ít nhất 2 bản ghi để vẽ</div>

  const w = 330, pad = 4
  const all = [...points, ...(trend ?? []), ...(goal !== undefined ? [goal] : [])]
  let lo = Math.min(...all), hi = Math.max(...all)
  const m = (hi - lo) * 0.18 || 1
  lo -= m; hi += m

  const X = (i: number) => pad + (i * (w - 2 * pad)) / (points.length - 1)
  const Y = (v: number) => height - pad - ((v - lo) / (hi - lo)) * (height - 2 * pad)
  const path = (arr: number[]) => arr.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${w} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}
         role="img" aria-label="Biểu đồ xu hướng">
      {goal !== undefined && goal > lo && goal < hi && (
        <line x1="0" y1={Y(goal)} x2={w} y2={Y(goal)} stroke="var(--ink-4)" strokeWidth="1" strokeDasharray="3 4" />
      )}
      {points.map((v, i) =>
        i % 2 === 0 ? <circle key={i} cx={X(i)} cy={Y(v)} r="1.5" fill="#4e504a" /> : null,
      )}
      {trend && <path d={path(trend)} fill="none" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  )
}

/* ---------- biểu đồ có dải tham chiếu ---------- */
interface Band {
  from: number
  to: number
  /** CSS color — dải chỉ có màu khi màu là dữ liệu (xem thang huyết áp) */
  fill: string
}

/** Một đường trên nền các dải tham chiếu.
 *
 *  Trục y tự co theo dữ liệu rồi mới cắt dải cho vừa khung, không ghim cứng
 *  60–180: nếu ghim thì chuỗi 118–124 dẹt thành đường thẳng, mất hết dao động
 *  vốn là thứ đáng xem. Đổi lại, dải nào không nằm trong khoảng dữ liệu thì
 *  không hiện — cũng đúng, vì nó không liên quan tới người đang xem.
 */
export function BandChart({
  values, bands = [], height = 78, ariaLabel,
}: { values: number[]; bands?: Band[]; height?: number; ariaLabel?: string }) {
  if (values.length < 2) return <div className="empty">Cần ít nhất 2 ngày để vẽ</div>

  const w = 330, pad = 4
  let lo = Math.min(...values), hi = Math.max(...values)
  const m = (hi - lo) * 0.22 || 4
  lo -= m; hi += m

  const X = (i: number) => pad + (i * (w - 2 * pad)) / (values.length - 1)
  const Y = (v: number) => height - ((v - lo) / (hi - lo)) * height

  return (
    <svg viewBox={`0 0 ${w} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}
         role="img" aria-label={ariaLabel}>
      {bands.map((b, i) => {
        const top = Y(Math.min(b.to, hi))
        const bottom = Y(Math.max(b.from, lo))
        if (bottom - top < 0.5) return null
        return <rect key={i} x="0" y={top} width={w} height={bottom - top} fill={b.fill} />
      })}
      <path d={values.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ')}
            fill="none" stroke="var(--ink)" strokeWidth="1.4"
            strokeLinecap="round" strokeLinejoin="round" />
      {values.map((v, i) => <circle key={i} cx={X(i)} cy={Y(v)} r="1.4" fill="var(--ink)" />)}
    </svg>
  )
}
