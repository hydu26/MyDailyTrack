/** Cả app chỉ được lấy "hôm nay" qua đây.
 *  Không dùng toISOString().slice(0,10) — nó trả ngày UTC, sai ở mọi
 *  múi giờ lệch. Ở Paris lúc 01:00 ngày 18/8, UTC vẫn là 17/8.
 */
export function localDateOf(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function currentTz(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

/** 'YYYY-MM-DD' -> Date lúc 00:00 giờ địa phương (không lệch múi giờ) */
export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(s: string, n: number): string {
  const d = parseLocalDate(s)
  d.setDate(d.getDate() + n)
  return localDateOf(d)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseLocalDate(b).getTime() - parseLocalDate(a).getTime()) / 86400000)
}

const WD = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy']
export const weekdayName = (s: string) => WD[parseLocalDate(s).getDay()]
export const weekdayShort = (n: number) => ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][n]

export function prettyDate(s: string): string {
  const d = parseLocalDate(s)
  return `${d.getDate()} thg ${d.getMonth() + 1}`
}

/** Nhãn tương đối cho mục "Sắp tới" */
export function relativeDay(target: string, from = localDateOf()): string {
  const n = daysBetween(from, target)
  if (n === 0) return 'Hôm nay'
  if (n === 1) return 'Ngày mai'
  if (n === -1) return 'Hôm qua'
  if (n < 0) return `Quá hạn ${-n} ngày`
  return `${n} ngày nữa`
}

/** Giờ đo, format theo múi giờ LÚC GHI.
 *  Ngược với localDate: giờ là thời điểm tuyệt đối, nên phải format lúc hiển
 *  thị. Truyền `localTz` của bản ghi để lần đo 7h sáng ở Việt Nam vẫn hiện là
 *  07:00 sau khi chủ máy đã về Pháp — nếu format theo múi giờ hiện tại thì nó
 *  thành 02:00 và không còn phân biệt được sáng với tối.
 */
export function clockOf(iso: string, tz?: string): string {
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz,
    }).format(new Date(iso))
  } catch {
    // tz lạ (dữ liệu cũ, hoặc tên vùng trình duyệt không biết) — về giờ máy
    return new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(iso))
  }
}

/* ---------- mốc thời gian của một bản ghi ---------- */

/** Hai trường thời gian mà mọi bản ghi phải có. Sinh ở đây, không nơi nào khác
 *  được tự ghép — đó là cách giữ cho localDate không bao giờ bị tính lại từ UTC.
 */
export interface Stamp {
  localDate: string
  measuredAt: string
  localTz: string
}

/** Mặc định: đóng dấu ngay lúc lưu */
export function stampNow(d = new Date()): Stamp {
  return { localDate: localDateOf(d), measuredAt: d.toISOString(), localTz: currentTz() }
}

/** Ngày + giờ do người dùng chọn, để ghi bù buổi đo hôm trước chưa nhập */
export interface When {
  date: string // 'YYYY-MM-DD' — nguyên văn từ <input type="date">
  time: string // 'HH:MM'
}

const pad2 = (n: number) => String(n).padStart(2, '0')

export function nowWhen(d = new Date()): When {
  return { date: localDateOf(d), time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}` }
}

/** When → Stamp. Trả null nếu ô ngày/giờ bị xoá trắng (nút Lưu sẽ bị chặn).
 *
 *  `localDate` lấy NGUYÊN VĂN chuỗi trong ô chọn ngày, không đọc lại từ đối
 *  tượng Date — chọn 18/8 rồi ghi bù lúc 00:30 thì UTC đã sang 17/8, suy lại
 *  từ Date là nhảy sai một ngày, đúng cái bẫy ở quy tắc 1.
 *
 *  Giờ nhập được hiểu theo múi giờ MÁY ĐANG DÙNG, nên `localTz` là múi giờ hiện
 *  tại: ghi bù ở Pháp thì "07:00" nghĩa là 07:00 giờ Paris.
 */
export function whenToStamp(w: When): Stamp | null {
  const [y, m, d] = w.date.split('-').map(Number)
  const [hh, mm] = w.time.split(':').map(Number)
  if ([y, m, d, hh, mm].some((n) => !Number.isFinite(n))) return null
  const at = new Date(y, m - 1, d, hh, mm)
  if (Number.isNaN(at.getTime())) return null
  return { localDate: w.date, measuredAt: at.toISOString(), localTz: currentTz() }
}
