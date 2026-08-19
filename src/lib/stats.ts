/** Trung bình động luỹ thừa. Alpha 0.12 ~ cửa sổ 15 ngày.
 *  Cân nặng dao động ±1,5 kg/ngày do nước và thức ăn — vẽ điểm thô
 *  không đọc được, đường này mới là thứ phản ánh tiến trình thật.
 */
export function ema(values: number[], alpha = 0.12): number[] {
  if (!values.length) return []
  const out = [values[0]]
  for (let i = 1; i < values.length; i++) {
    out.push(out[i - 1] * (1 - alpha) + values[i] * alpha)
  }
  return out
}

/** Hệ số góc theo hồi quy bình phương tối thiểu, đơn vị / ngày */
export function slopePerDay(points: { x: number; y: number }[]): number {
  const n = points.length
  if (n < 2) return 0
  let sx = 0, sy = 0, sxy = 0, sxx = 0
  for (const p of points) {
    sx += p.x; sy += p.y; sxy += p.x * p.y; sxx += p.x * p.x
  }
  const denom = n * sxx - sx * sx
  return denom === 0 ? 0 : (n * sxy - sx * sy) / denom
}

/** Số tuần dự kiến để đi từ current tới goal.
 *  Trả null khi xu hướng đi sai hướng hoặc quá phẳng — thà không hiện
 *  còn hơn hiện "đạt mục tiêu năm 2049".
 */
export function weeksToGoal(current: number, goal: number, kgPerWeek: number): number | null {
  const need = goal - current
  if (Math.abs(kgPerWeek) < 0.05) return null
  if (Math.sign(need) !== Math.sign(kgPerWeek)) return null
  return Math.ceil(need / kgPerWeek)
}

export function progressPct(start: number, current: number, goal: number): number {
  if (start === goal) return 100
  return Math.max(0, Math.min(100, ((start - current) / (start - goal)) * 100))
}

export const fmt1 = (n: number) => n.toFixed(1).replace('.', ',')
export const signed1 = (n: number) => (n <= 0 ? '−' : '+') + Math.abs(n).toFixed(1).replace('.', ',')
