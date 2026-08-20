import { addDays, daysBetween } from '../../lib/time'

/** Mức ra máu. 0 = ra đốm (spotting) — CỐ Ý tách khỏi 1–3.
 *
 *  Ra đốm giữa chu kỳ không phải bắt đầu kỳ kinh mới. Nếu tính nó là ngày đầu
 *  thì một lần ra đốm sẽ sinh ra một "chu kỳ" 5 ngày và làm sai toàn bộ số liệu.
 *  Vẫn ghi lại vì FIGO coi ra máu giữa kỳ là thứ đáng theo dõi.
 */
export type Flow = 0 | 1 | 2 | 3

export const FLOW_LABEL: Record<Flow, string> = {
  0: 'Đốm',
  1: 'Nhẹ',
  2: 'Vừa',
  3: 'Nhiều',
}

export interface Day {
  date: string // 'YYYY-MM-DD'
  flow: Flow
}

/** Một đợt ra máu liền mạch */
export interface Run {
  start: string
  end: string
  /** Số ngày có ra máu thật (flow >= 1) trong đợt */
  days: number
}

/** Từ ngày đầu đợt này tới ngày đầu đợt sau */
export interface Cycle {
  start: string
  nextStart: string
  length: number
  periodDays: number
}

/* ─────────────────────── ngưỡng tham chiếu ─────────────────────── */

/** FIGO/ACOG: chu kỳ 24–38 ngày, ra máu 2–7 ngày (≥8 là kéo dài).
 *  Đây là số để TỰ NHẬN RA điều bất thường mà đi hỏi bác sĩ, không phải để
 *  tự chẩn đoán — giống thang huyết áp trong app này. */
export const NORMAL = {
  cycleMin: 24,
  cycleMax: 38,
  periodMax: 7,
  /** FIGO 2018: chu kỳ coi là ĐỀU khi chênh lệch giữa chu kỳ ngắn nhất và dài
   *  nhất ≤ 7 ngày; từ 8 ngày trở lên là không đều. Ngưỡng này theo nhóm tuổi
   *  26–41; tuổi 18–25 và 42–45 được phép dao động rộng hơn (≤9), nên đây là
   *  dấu hiệu để để ý chứ không phải một kết luận. */
  spreadMax: 7,
} as const

/* ─────────────────────── gom đợt ra máu ─────────────────────── */

/** Chỉ ngày flow >= 1 mới mở đợt. Hai đợt cách nhau ĐÚNG một ngày thì gộp:
 *  gần như chắc chắn là quên ghi một hôm chứ không phải hai kỳ kinh cách nhau
 *  một ngày — mà nếu tách thì sẽ sinh một "chu kỳ" 2 ngày.
 */
export function runsOf(days: Day[]): Run[] {
  const bleed = days
    .filter((d) => d.flow >= 1)
    .map((d) => d.date)
    .sort()
  if (!bleed.length) return []

  const out: Run[] = []
  let start = bleed[0]
  let end = bleed[0]
  let count = 1

  for (let i = 1; i < bleed.length; i++) {
    const gap = daysBetween(end, bleed[i])
    if (gap <= 2) {
      // gap 1 = ngày liền kề, gap 2 = hụt một hôm (coi như quên ghi)
      end = bleed[i]
      count++
    } else {
      out.push({ start, end, days: count })
      start = bleed[i]
      end = bleed[i]
      count = 1
    }
  }
  out.push({ start, end, days: count })
  return out
}

export function cyclesOf(runs: Run[]): Cycle[] {
  const out: Cycle[] = []
  for (let i = 0; i < runs.length - 1; i++) {
    out.push({
      start: runs[i].start,
      nextStart: runs[i + 1].start,
      length: daysBetween(runs[i].start, runs[i + 1].start),
      periodDays: runs[i].days,
    })
  }
  return out
}

/* ─────────────────────── thống kê ─────────────────────── */

/** Trung vị, KHÔNG phải trung bình cộng: một chu kỳ lệch bất thường (do bệnh,
 *  do stress, do quên ghi) kéo trung bình đi rất xa, còn trung vị thì không. */
export function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

export interface Stats {
  /** Số chu kỳ dùng để tính */
  n: number
  cycleMedian: number
  cycleMin: number
  cycleMax: number
  periodMedian: number
}

/** Chỉ lấy `recent` chu kỳ gần nhất: chu kỳ đổi theo tuổi và theo hoàn cảnh,
 *  lấy cả lịch sử ba năm để dự đoán tháng sau là vô nghĩa. 3–6 chu kỳ là mức
 *  các hướng dẫn khuyên dùng để tính trung bình. */
export function statsOf(cycles: Cycle[], recent = 6): Stats | null {
  if (!cycles.length) return null
  const use = cycles.slice(-recent)
  const lens = use.map((c) => c.length)
  return {
    n: use.length,
    cycleMedian: median(lens),
    cycleMin: Math.min(...lens),
    cycleMax: Math.max(...lens),
    periodMedian: median(use.map((c) => c.periodDays)),
  }
}

export interface Prediction {
  /** Ngày sớm nhất — nhỏ nhất trong các chu kỳ gần đây */
  from: string
  /** Ngày muộn nhất */
  to: string
  /** Ước lượng chính giữa, theo trung vị */
  mid: string
  /** Số chu kỳ đã dùng. 1 thì khoảng là một điểm, độ tin thấp. */
  basedOn: number
}

/** Dự đoán kỳ tới thành một KHOẢNG, không phải một ngày.
 *
 *  Khoảng lấy đúng từ min–max các chu kỳ gần đây của chính người dùng, nên nó
 *  phản ánh độ dao động thật thay vì một con số tự tin giả. Chu kỳ đều thì
 *  khoảng tự hẹp lại.
 *
 *  CỐ Ý KHÔNG tính ngày rụng trứng hay cửa sổ thụ thai: pha hoàng thể dao động
 *  11–17 ngày chứ không cố định 14, nên suy ngày rụng trứng từ độ dài chu kỳ là
 *  không đáng tin — phương pháp tính theo lịch thất bại khoảng 24%/năm khi dùng
 *  làm tránh thai. Hiện một "cửa sổ an toàn" ở đây là mời người dùng tin vào
 *  thứ không đáng tin.
 */
export function predict(lastStart: string, s: Stats | null): Prediction | null {
  if (!s) return null
  return {
    from: addDays(lastStart, s.cycleMin),
    to: addDays(lastStart, s.cycleMax),
    mid: addDays(lastStart, s.cycleMedian),
    basedOn: s.n,
  }
}

/** Ngày thứ mấy của chu kỳ hiện tại. Ngày đầu ra máu = ngày 1. */
export const cycleDay = (lastStart: string, today: string) =>
  daysBetween(lastStart, today) + 1

/** Điều đáng để ý, diễn đạt bằng mô tả chứ không phải chẩn đoán. */
export function notes(s: Stats | null): string[] {
  if (!s) return []
  const out: string[] = []
  if (s.cycleMin < NORMAL.cycleMin) out.push(`có chu kỳ ngắn hơn ${NORMAL.cycleMin} ngày`)
  if (s.cycleMax > NORMAL.cycleMax) out.push(`có chu kỳ dài hơn ${NORMAL.cycleMax} ngày`)
  if (s.periodMedian > NORMAL.periodMax) out.push(`số ngày ra máu thường trên ${NORMAL.periodMax}`)
  // Cần ít nhất hai chu kỳ mới có "ngắn nhất" và "dài nhất" để so
  if (s.n >= 2 && s.cycleMax - s.cycleMin > NORMAL.spreadMax) {
    out.push(`độ dài chu kỳ chênh nhau ${s.cycleMax - s.cycleMin} ngày`)
  }
  return out
}


/* ─────────────────── khả năng thụ thai theo ngày ─────────────────── */

/** Pha hoàng thể — từ rụng trứng tới kỳ sau. 11–17 ngày, KHÔNG cố định 14. */
export const LUTEAL = { min: 11, max: 17 } as const
/** Tinh trùng sống tới ~5 ngày, trứng ~1 ngày. Nên một ngày là "dễ thụ thai"
 *  khi rụng trứng xảy ra trong khoảng [ngày đó, ngày đó + 5]. */
export const SPERM_DAYS = 5

/** Trọng số LỚN NHẤT có thể đạt được, dùng làm mốc chuẩn hoá chiều cao cột.
 *
 *  Khoảng ngày rụng trứng khả dĩ rộng ít nhất (LUTEAL.max − LUTEAL.min + 1) = 7
 *  ngày, mà một ngày chỉ dễ thụ thai với 6 ngày rụng trứng, nên trọng số không
 *  bao giờ vượt 6/7. Chuẩn hoá theo mốc TUYỆT ĐỐI này, đừng chuẩn hoá theo đỉnh
 *  quan sát được: chuẩn theo đỉnh thì chu kỳ dao động vẽ ra vẫn cao y như chu kỳ
 *  đều, và hình vẽ mất khả năng nói nó chắc chắn tới đâu.
 */
export const WEIGHT_MAX = (SPERM_DAYS + 1) / (LUTEAL.max - LUTEAL.min + 1)

export interface FertileDay {
  date: string
  /** 0..1 — phần các ngày rụng trứng khả dĩ khiến ngày này dễ thụ thai */
  weight: number
}

/** Đường khả năng thụ thai, KHÔNG phải một cửa sổ có biên cứng.
 *
 *  Đây là điểm cốt lõi: không ai biết ngày rụng trứng từ độ dài chu kỳ. Cái biết
 *  được là nó nằm đâu đó trong một khoảng, vì kỳ sau đã là một khoảng và pha
 *  hoàng thể lại dao động 11–17 ngày. Nên:
 *
 *    rụng trứng sớm nhất = kỳ sau sớm nhất − 17
 *    rụng trứng muộn nhất = kỳ sau muộn nhất − 11
 *
 *  Với mỗi ngày d, trọng số = tỷ lệ các ngày rụng trứng khả dĩ nằm trong
 *  [d, d+5] — tức xác suất d dễ thụ thai NẾU ngày rụng trứng rải đều trong
 *  khoảng đó. Vẽ ra thành đường cao ở giữa, thấp dần ra hai bên.
 *
 *  Vẽ đường thay vì vẽ khung là cách duy nhất trung thực: một khung có biên
 *  cứng nói rằng ngoài khung là an toàn, mà điều đó không đúng — tính theo lịch
 *  thất bại khoảng 24% mỗi năm khi dùng làm tránh thai.
 */
export function fertileCurve(p: Prediction, from: string, to: string): FertileDay[] {
  const ovFirst = addDays(p.from, -LUTEAL.max)
  const ovLast = addDays(p.to, -LUTEAL.min)
  const ovTotal = daysBetween(ovFirst, ovLast) + 1
  if (ovTotal <= 0) return []

  const out: FertileDay[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) {
    // các ngày rụng trứng khiến d dễ thụ thai: [d, d + SPERM_DAYS]
    const lo = d > ovFirst ? d : ovFirst
    const hiCand = addDays(d, SPERM_DAYS)
    const hi = hiCand < ovLast ? hiCand : ovLast
    const overlap = daysBetween(lo, hi) + 1
    out.push({ date: d, weight: overlap > 0 ? Math.min(1, overlap / ovTotal) : 0 })
  }
  return out
}



/* ─────────────────── bốn pha của chu kỳ ─────────────────── */

export type Phase = 'menses' | 'follicular' | 'fertile' | 'luteal'

export const PHASE_LABEL: Record<Phase, string> = {
  menses: 'Kinh nguyệt',
  follicular: 'Nang trứng',
  fertile: 'Dễ thụ thai',
  luteal: 'Hoàng thể',
}

export interface PhaseDay {
  date: string
  /** Ngày thứ mấy của chu kỳ, bắt đầu từ 1 */
  day: number
  phase: Phase
  /** 0..1 — chỉ có nghĩa với pha `fertile`: độ đậm theo xác suất */
  weight: number
  /** Đã ghi ra máu thật (khác với ngày dự kiến) */
  logged: boolean
}

/** Gán pha cho từng ngày của chu kỳ.
 *
 *  Pha `fertile` KHÔNG có biên cứng — nó là những ngày `fertileCurve` cho trọng
 *  số > 0, và mỗi ngày mang theo trọng số riêng để vẽ đậm nhạt. Vẽ nó thành một
 *  cung đặc là nói rằng ngoài cung đó an toàn, mà điều đó không đúng.
 *
 *  Ranh giới nang trứng/hoàng thể lấy theo ngày dễ thụ thai đầu và cuối, chứ
 *  không theo "ngày 14": ngày rụng trứng suy từ độ dài chu kỳ chứ không cố định.
 */
export function phaseDays(
  start: string,
  length: number,
  bleeding: (date: string) => boolean,
  p: Prediction | null,
): PhaseDay[] {
  const last = addDays(start, length - 1)
  const curve = p ? fertileCurve(p, start, last) : []
  const wByDate = new Map(curve.map((c) => [c.date, c.weight]))
  const fertile = curve.filter((c) => c.weight > 0).map((c) => c.date)
  const fFirst = fertile[0]
  const fLast = fertile.at(-1)

  const out: PhaseDay[] = []
  for (let i = 0; i < length; i++) {
    const date = addDays(start, i)
    const logged = bleeding(date)
    const w = wByDate.get(date) ?? 0
    let phase: Phase
    if (logged) phase = 'menses'
    else if (w > 0) phase = 'fertile'
    else if (fFirst && date < fFirst) phase = 'follicular'
    else if (fLast && date > fLast) phase = 'luteal'
    else phase = 'follicular'
    out.push({ date, day: i + 1, phase, weight: w, logged })
  }
  return out
}

export interface PhaseSpan {
  phase: Phase
  from: number
  to: number
  days: number
}

/** Gộp các ngày liền nhau cùng pha thành cung, để hover được theo pha. */
export function phaseSpans(days: PhaseDay[]): PhaseSpan[] {
  const out: PhaseSpan[] = []
  for (const d of days) {
    const last = out.at(-1)
    if (last && last.phase === d.phase && last.to === d.day - 1) {
      last.to = d.day
      last.days++
    } else {
      out.push({ phase: d.phase, from: d.day, to: d.day, days: 1 })
    }
  }
  return out
}
