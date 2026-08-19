import { useState } from 'react'

import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import type { ExerciseEntry } from '../../db/types'
import { register } from '../registry'
import { TopBar, Sheet, NumberField, WhenField } from '../../components/ui'
import { BarChart } from '../../components/Chart'
import {
  localDateOf, prettyDate, addDays, clockOf,
  stampNow, whenToStamp, type When, type Stamp,
} from '../../lib/time'
import { completeLinked } from '../todo/data'

/** Loại hình cố định, không cho nhập tự do.
 *
 *  Đây KHÔNG phải hệ thống ghi tập tạ — không có set, không có rep, không có
 *  bài tập. Chỉ cần biết đã vận động loại gì, bao lâu, nặng nhẹ ra sao. Nhập tự
 *  do thì "chạy", "Chạy", "chạy bộ" thành ba loại khác nhau và không gộp được.
 */
const TYPES = ['Calisthenics', 'Pilates', 'Đi bộ', 'Chạy', 'Khác']

/** Số ngày vẽ trên biểu đồ cột */
const WINDOW = 21

/* ---------- truy vấn dùng chung ---------- */
function useExercise() {
  return useLiveQuery(async () => {
    const rows = (await db.entries
      .where('module').equals('exercise')
      .filter((e) => !e.deletedAt)
      .toArray()) as ExerciseEntry[]
    rows.sort((a, b) =>
      a.localDate.localeCompare(b.localDate) || a.measuredAt.localeCompare(b.measuredAt))

    const today = localDateOf()

    // Tổng phút theo ngày. Gộp theo localDate — một ngày có thể tập hai lần.
    const perDay = new Map<string, number>()
    for (const r of rows) {
      perDay.set(r.localDate, (perDay.get(r.localDate) ?? 0) + r.value.minutes)
    }

    // Dải ngày liên tục kể cả ngày nghỉ: ngày bằng 0 cũng là dữ liệu, thiếu nó
    // thì biểu đồ nén các ngày có tập lại cạnh nhau và trông như tập liên tục.
    const days: { date: string; minutes: number }[] = []
    for (let i = WINDOW - 1; i >= 0; i--) {
      const d = addDays(today, -i)
      days.push({ date: d, minutes: perDay.get(d) ?? 0 })
    }

    const since7 = addDays(today, -6)
    const week = rows.filter((r) => r.localDate >= since7)
    const minutes7 = week.reduce((a, r) => a + r.value.minutes, 0)

    return {
      rows,
      days,
      minutes7,
      sessions7: week.length,
      days7: new Set(week.map((r) => r.localDate)).size,
    }
  }, [])
}

async function addExercise(
  v: { type: string; minutes: number; intensity: number },
  stamp: Stamp,
) {
  const iso = new Date().toISOString()
  // Như huyết áp, KHÔNG ghi đè bản ghi cùng ngày: sáng đi bộ chiều đạp xe là
  // hai buổi riêng, tổng phút trong ngày cần cả hai.
  await db.entries.add({
    id: crypto.randomUUID(),
    module: 'exercise',
    ...stamp,
    value: v,
    createdAt: iso,
    updatedAt: iso,
  } as ExerciseEntry)
  // Không có seedTask nào trỏ về module này nên hiện là không làm gì; gọi sẵn
  // để hôm nào thêm việc "tập thể dục" vào todo thì tự tick, không phải sửa đây.
  await completeLinked('exercise', stamp.localDate)
}

/* ---------- form ghi nhanh ---------- */
function QuickAdd({ onDone }: { onDone: () => void }) {
  const data = useExercise()
  // useLiveQuery trả undefined ở lần render ĐẦU, mà useState chỉ chạy hàm khởi
  // tạo MỘT lần — đặt giá trị mặc định ngay trong component này là khoá luôn vào
  // số dự phòng, và dòng "đang hiện lần trước" thành nói dối. Tách làm hai: chỉ
  // mount form khi dữ liệu đã về.
  if (!data) return <Sheet onClose={onDone}><div className="empty">Đang tải…</div></Sheet>
  return <ExerciseForm last={data.rows.at(-1)?.value} onDone={onDone} />
}

function ExerciseForm({ last, onDone }: { last?: ExerciseEntry['value']; onDone: () => void }) {
  // Loại của lần trước có thể đã bị bỏ khỏi TYPES (bản ghi cũ vẫn giữ nguyên
  // trong lịch sử). Không kiểm thì không chip nào sáng lên mà vẫn lưu loại cũ.
  const [type, setType] = useState(() =>
    last && TYPES.includes(last.type) ? last.type : TYPES[0])
  const [minutes, setMinutes] = useState(last?.minutes ?? 30)
  const [intensity, setIntensity] = useState(last?.intensity ?? 3)
  const [when, setWhen] = useState<When | null>(null)
  const stamp = when ? whenToStamp(when) : null
  const blocked = when !== null && !stamp

  const save = async (mins = minutes) => {
    if (blocked) return
    await addExercise({ type, minutes: mins, intensity }, stamp ?? stampNow())
    onDone()
  }

  return (
    <Sheet onClose={onDone}>
      <h2>Thể dục</h2>
      <div className="hint">{last ? 'Đang hiện lựa chọn lần trước' : 'Buổi tập đầu tiên'}</div>

      <div className="chips">
        {TYPES.map((t) => (
          <button key={t} className={`chip${t === type ? ' on' : ''}`} onClick={() => setType(t)}>
            {t}
          </button>
        ))}
      </div>

      <div className="fieldrow">
        <div className="lab">Thời lượng<small>PHÚT</small></div>
        <NumberField compact value={minutes} onChange={setMinutes} onEnter={save}
                     label="Thời lượng (phút)" step={5} min={1} max={600} />
      </div>

      {/* Cường độ chỉ có 5 giá trị nên một lần bấm là xong — không cần ô gõ như
          quy tắc 6 đòi, vì ở đây không có chuyện phải nhấn nút hai mươi lần. */}
      <div className="fieldrow">
        <div className="lab">Cường độ<small>1 NHẸ · 5 KIỆT SỨC</small></div>
        <div className="scale" role="radiogroup" aria-label="Cường độ">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} className={`chip num${n === intensity ? ' on' : ''}`}
                    role="radio" aria-checked={n === intensity}
                    onClick={() => setIntensity(n)}>
              {n}
            </button>
          ))}
        </div>
      </div>

      <div style={{ margin: '16px 0 20px' }}>
        <WhenField value={when} onChange={setWhen} />
      </div>

      <div className="acts">
        <button className="cancel" onClick={onDone}>Huỷ</button>
        <button className="save" disabled={blocked} onClick={() => save()}>Lưu</button>
      </div>
    </Sheet>
  )
}

/* ---------- ô trang chính ---------- */
function Widget() {
  const d = useExercise()

  return (
    <>
      <div className="tile-top">
        <span className="tile-name">Thể dục</span>
        <svg className="tile-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 9v6M20 9v6M7 7v10M17 7v10M7 12h10" />
        </svg>
      </div>
      <div className="val">
        {/* Tổng phút 7 ngày, không phải buổi cuối: buổi cuối cách đây 9 ngày mà
            hiện "45 phút" thì đọc thành đang tập đều, sai hẳn ý nghĩa. */}
        <span className="v">{d ? d.minutes7 : '—'}</span>
        <span className="u">PHÚT · 7 NGÀY{d && d.days7 ? ` · ${d.days7}Đ` : ''}</span>
      </div>
    </>
  )
}

/* ---------- màn hình đầy đủ ---------- */
function Screen() {
  const d = useExercise()
  const [adding, setAdding] = useState(false)

  if (!d) return <div className="empty">Đang tải…</div>
  const { rows, days, minutes7, sessions7, days7 } = d

  if (!rows.length) {
    return (
      <>
        <TopBar />
        <div className="empty">Chưa có bản ghi nào.<br />Ghi buổi tập đầu tiên để bắt đầu.</div>
        <div className="block">
          <button className="qbtn solid" style={{ width: '100%' }} onClick={() => setAdding(true)}>
            + Ghi thể dục
          </button>
        </div>
        {adding && <QuickAdd onDone={() => setAdding(false)} />}
      </>
    )
  }

  return (
    <>
      <TopBar />
      <div className="scroll">
        <div className="hero">
          <div className="eyebrow" style={{ marginBottom: 11 }}>Thể dục</div>
          <div className="big num">{minutes7}</div>
          <div className="sub">
            phút trong 7 ngày · <span className="num">{sessions7}</span> buổi ·{' '}
            <span className="num">{days7}</span>/7 ngày
          </div>
        </div>

        <div className="rule" />
        <div className="block">
          <div className="block-h">
            <span className="eyebrow">{WINDOW} ngày</span>
            <span className="num" style={{ fontSize: 11, color: 'var(--ink-3)' }}>phút mỗi ngày</span>
          </div>
          <BarChart values={days.map((x) => x.minutes)} ariaLabel="Phút tập mỗi ngày" />
        </div>

        <div className="rule" />
        <div className="block">
          <div className="block-h"><span className="eyebrow">Gần đây</span></div>
          {rows.slice(-8).reverse().map((r) => (
            <div className="row" key={r.id}>
              <div className="k">
                {r.value.type}
                <small>{prettyDate(r.localDate)} · {clockOf(r.measuredAt, r.localTz)}</small>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline' }}>
                <span className="v">{r.value.minutes}<small style={{ fontSize: 10, color: 'var(--ink-3)' }}>ph</small></span>
                <span className="d">CĐ {r.value.intensity}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="block">
          <button className="qbtn solid" style={{ width: '100%' }} onClick={() => setAdding(true)}>
            + Ghi thể dục
          </button>
        </div>
      </div>
      {adding && <QuickAdd onDone={() => setAdding(false)} />}
    </>
  )
}

register({
  id: 'exercise',
  name: 'Thể dục',
  kind: 'tracker',
  Screen,
  Widget,
  QuickAdd,
  // Cố ý KHÔNG có seedTasks: nhắc tập thể dục hằng ngày là quyết định của chủ
  // dự án, không phải thứ tự thêm vào. Thêm một dòng vào đây là có ngay.
})
