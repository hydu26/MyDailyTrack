/** Thang 7 mức huyết áp — NGƯỠNG ĐO TẠI NHÀ.
 *
 *  Đây là chỗ duy nhất trong app có màu, vì ở đây màu mang thông tin.
 *  Toàn bộ số nằm trong bảng LEVELS dưới đây — đổi ngưỡng là sửa một chỗ.
 *
 *  Nguồn: phân mức ESC/ESH (tối ưu → tăng HA độ 3), dịch sang ngưỡng tại nhà
 *  bằng cách hạ 5 mmHg mỗi biên. Mốc chẩn đoán tại nhà 135/85 của ESC/ESH ứng
 *  với 140/90 tại phòng khám, nên độ 1 bắt đầu ở 135/85 thay vì 140/90.
 *
 *  Hai điểm KHÁC bảng ESC/ESH gốc, cố ý:
 *  - Mức 1 là "Thấp" (< 90/60), không phải "tăng HA tâm thu đơn độc". Bảy ô màu
 *    trong `styles.css` là một dải tăng dần theo độ nặng (xanh lạnh → đỏ), mà
 *    tâm thu đơn độc không nằm ở đâu trên dải đó; huyết áp thấp thì có.
 *  - Không có mức "tâm thu đơn độc" riêng: nó là chi tiết chẩn đoán, còn ở đây
 *    chỉ cần biết hôm nay ở vùng nào. Tâm thu 140 với tâm trương 70 vẫn ra độ 1
 *    theo luật "lấy mức cao hơn" bên dưới.
 *
 *  App này để theo dõi, không phải để chẩn đoán.
 */
export type Axis = 'sys' | 'dia'

export interface BpLevel {
  n: number
  /** Tên đầy đủ, dùng trên thẻ mức */
  name: string
  /** Tên ngắn cho ô trang chính — `.u` chỉ vừa khoảng 12 ký tự */
  short: string
  /** Biên dưới của mức, tính riêng cho từng chỉ số */
  sysFrom: number
  diaFrom: number
}

export const LEVELS: BpLevel[] = [
  { n: 1, name: 'Thấp',           short: 'THẤP',     sysFrom: -Infinity, diaFrom: -Infinity },
  { n: 2, name: 'Tối ưu',         short: 'TỐI ƯU',   sysFrom: 90,        diaFrom: 60 },
  { n: 3, name: 'Bình thường',    short: 'B.THƯỜNG', sysFrom: 115,       diaFrom: 75 },
  { n: 4, name: 'Bình thường cao', short: 'B.T CAO', sysFrom: 125,       diaFrom: 80 },
  { n: 5, name: 'Tăng HA độ 1',   short: 'ĐỘ 1',     sysFrom: 135,       diaFrom: 85 },
  { n: 6, name: 'Tăng HA độ 2',   short: 'ĐỘ 2',     sysFrom: 155,       diaFrom: 95 },
  { n: 7, name: 'Tăng HA độ 3',   short: 'ĐỘ 3',     sysFrom: 175,       diaFrom: 105 },
]

const boundOf = (l: BpLevel, axis: Axis) => (axis === 'sys' ? l.sysFrom : l.diaFrom)

/** Mức của một chỉ số đứng riêng — dùng để vẽ dải tham chiếu trên biểu đồ */
export function levelOf(value: number, axis: Axis): number {
  let n = 1
  for (const l of LEVELS) if (value >= boundOf(l, axis)) n = l.n
  return n
}

/** Ngưỡng tăng huyết áp tại nhà = mức 5 (135/85). Mốc này quyết định khi nào
 *  một chỉ số cao được ưu tiên hơn một chỉ số thấp. */
const HYPERTENSIVE = 5

/** Luật ESC/ESH: tâm thu và tâm trương rơi vào hai mức khác nhau thì lấy mức
 *  CAO hơn — 150/70 vẫn là độ 1, không lấy trung bình, không lấy mức thấp.
 *
 *  Nhưng "lấy mức cao hơn" một mình thì SAI với huyết áp thấp: mức 1 nằm ở đầu
 *  dải nên `max()` không bao giờ chọn được nó — 88/70 sẽ ra "Tối ưu" dù tâm thu
 *  88 là thấp thật. Nên mức 1 phải xét riêng, và chỉ thắng khi chưa tới ngưỡng
 *  tăng huyết áp: 180/55 thì con số đáng lo là 180, không phải 55.
 */
export function classify(sys: number, dia: number): BpLevel {
  const high = Math.max(levelOf(sys, 'sys'), levelOf(dia, 'dia'))
  const low = sys < LEVELS[1].sysFrom || dia < LEVELS[1].diaFrom
  if (low && high < HYPERTENSIVE) return LEVELS[0]
  return LEVELS[high - 1]
}

/** [biên dưới, biên trên) của một mức trên một trục. Trên = Infinity ở mức 7. */
export function levelBounds(n: number, axis: Axis): [number, number] {
  const i = n - 1
  return [boundOf(LEVELS[i], axis), i + 1 < LEVELS.length ? boundOf(LEVELS[i + 1], axis) : Infinity]
}

/** Dải tham chiếu cho biểu đồ: mỗi mức một vùng trên trục đó */
export function bands(axis: Axis) {
  return LEVELS.map((l) => {
    const [from, to] = levelBounds(l.n, axis)
    return { from, to, fill: `var(--bp-${l.n}-bg)` }
  })
}

/** '< 90' | '115–124' | '≥ 175' */
export function rangeText(n: number, axis: Axis): string {
  const [from, to] = levelBounds(n, axis)
  if (from === -Infinity) return `< ${to}`
  if (to === Infinity) return `≥ ${from}`
  return `${from}–${to - 1}`
}
