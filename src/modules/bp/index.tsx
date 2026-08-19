import { useState } from 'react'

import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import type { BpEntry } from '../../db/types'
import { register } from '../registry'
import { TopBar, Sheet, NumberField, WhenField } from '../../components/ui'
import { BandChart } from '../../components/Chart'
import { localDateOf, prettyDate, addDays, clockOf, stampNow, whenToStamp, type When, type Stamp } from '../../lib/time'
import { completeLinked } from '../todo/data'
import { LEVELS, classify, levelOf, bands, rangeText, type BpLevel } from './levels'

/** Điều kiện đo — CỐ ĐỊNH, không cho chọn.
 *  Số đo chỉ so sánh được với nhau khi đo cùng cách. Cho chọn tay/tư thế nghĩa
 *  là đường xu hướng trộn hai loại số khác nhau và không còn nói lên gì.
 */
const CONDITIONS = [
  ['Tay', 'Tay trái'],
  ['Tư thế', 'Ngồi, tựa lưng'],
  ['Vòng bít', 'Bắp tay'],
]

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const r0 = (n: number) => Math.round(n)

/* ---------- truy vấn dùng chung ---------- */
function useBp() {
  return useLiveQuery(async () => {
    const rows = (await db.entries
      .where('module').equals('bp')
      .filter((e) => !e.deletedAt)
      .toArray()) as BpEntry[]
    // Trong một ngày có thể đo nhiều lần (sáng + tối) — sắp theo giờ đo
    rows.sort((a, b) =>
      a.localDate.localeCompare(b.localDate) || a.measuredAt.localeCompare(b.measuredAt))

    // Biểu đồ gộp theo localDate: một điểm mỗi ngày là trung bình các lần đo
    // trong ngày đó. Vẽ từng lần đo thì răng cưa sáng/tối lấn hết xu hướng.
    const byDay = new Map<string, BpEntry[]>()
    for (const r of rows) {
      const list = byDay.get(r.localDate)
      if (list) list.push(r)
      else byDay.set(r.localDate, [r])
    }
    const days = [...byDay].map(([date, rs]) => ({
      date,
      sys: mean(rs.map((x) => x.value.sys)),
      dia: mean(rs.map((x) => x.value.dia)),
      pulse: mean(rs.map((x) => x.value.pulse)),
    }))

    // Trung bình 7 ngày = chỉ số chuẩn của đo tại nhà. Một lần đo lẻ dao động
    // quá lớn để phân mức; thẻ màu bám vào trung bình này, không bám lần cuối.
    const since = addDays(localDateOf(), -6)
    const win = rows.filter((x) => x.localDate >= since)
    const avg7 = win.length
      ? {
          sys: mean(win.map((x) => x.value.sys)),
          dia: mean(win.map((x) => x.value.dia)),
          pulse: mean(win.map((x) => x.value.pulse)),
          count: win.length,
          days: new Set(win.map((x) => x.localDate)).size,
        }
      : null

    return { rows, days, avg7 }
  }, [])
}

async function addBp(v: BpEntry['value'], stamp: Stamp) {
  const iso = new Date().toISOString()
  // Khác cân nặng: KHÔNG ghi đè bản ghi cùng ngày. Đo sáng và đo tối là hai
  // số liệu riêng, trung bình 7 ngày cần cả hai. Ghi bù cũng chỉ thêm bản ghi.
  await db.entries.add({
    id: crypto.randomUUID(),
    module: 'bp',
    ...stamp,
    value: v,
    createdAt: iso,
    updatedAt: iso,
  } as BpEntry)
  // Ghi bù thì tick việc vào ĐÚNG ngày đo, không phải hôm nay
  await completeLinked('bp', stamp.localDate)
}

/* ---------- thẻ mức + bậc thang 7 mức ---------- */
function LevelCard({ level, sys, dia }: { level: BpLevel; sys: number; dia: number }) {
  return (
    <>
      <div className="bpcard"
           style={{ background: `var(--bp-${level.n}-bg)`, color: `var(--bp-${level.n}-fg)` }}>
        <div>
          <div className="nm">{level.name}</div>
          <div className="num" style={{ fontSize: 21, fontWeight: 300, marginTop: 3 }}>
            {r0(sys)}/{r0(dia)}
          </div>
        </div>
        <div className="rg">
          {rangeText(level.n, 'sys')}<br />{rangeText(level.n, 'dia')}
        </div>
      </div>
      <div className="ladder" role="img" aria-label={`Mức ${level.n} trên 7`}>
        {LEVELS.map((l) => (
          <i key={l.n} style={{
            background: l.n === level.n ? `var(--bp-${l.n}-fg)` : `var(--bp-${l.n}-bg)`,
          }} />
        ))}
      </div>
    </>
  )
}

/* ---------- form ghi nhanh ---------- */
type Reading = { sys: number; dia: number; pulse: number }

/** Trung bình hai lần đo. Làm tròn vì huyết áp luôn báo bằng số nguyên; số thô
 *  vẫn được giữ trong `readings` nên không mất gì. */
const meanOf = (a: Reading, b: Reading): Reading => ({
  sys: Math.round((a.sys + b.sys) / 2),
  dia: Math.round((a.dia + b.dia) / 2),
  pulse: Math.round((a.pulse + b.pulse) / 2),
})

/** Ba ô số của một lần đo.
 *
 *  `onChange` nhận HÀM CẬP NHẬT, không nhận giá trị mới. Nếu spread từ prop `v`
 *  (`onChange({ ...v, sys })`) thì ba ô ghi đè lẫn nhau khi các lần cập nhật bị
 *  React gộp chung một batch: mỗi ô đọc cùng một `v` cũ, ô sau xoá thay đổi của
 *  ô trước. Dùng hàm cập nhật thì mỗi lần đọc state mới nhất.
 */
function ReadingRows({
  v, onChange, onEnter,
}: {
  v: Reading
  onChange: (f: (prev: Reading) => Reading) => void
  onEnter: (v: Reading) => void
}) {
  return (
    <>
      <div className="fieldrow">
        <div className="lab">Tâm thu<small>MMHG</small></div>
        <NumberField compact value={v.sys} label="Tâm thu (mmHg)" min={60} max={260}
                     onChange={(sys) => onChange((p) => ({ ...p, sys }))}
                     onEnter={(sys) => onEnter({ ...v, sys })} />
      </div>
      <div className="fieldrow">
        <div className="lab">Tâm trương<small>MMHG</small></div>
        <NumberField compact value={v.dia} label="Tâm trương (mmHg)" min={40} max={160}
                     onChange={(dia) => onChange((p) => ({ ...p, dia }))}
                     onEnter={(dia) => onEnter({ ...v, dia })} />
      </div>
      <div className="fieldrow">
        <div className="lab">Nhịp<small>LẦN/PHÚT</small></div>
        <NumberField compact value={v.pulse} label="Nhịp tim (lần/phút)" min={30} max={200}
                     onChange={(pulse) => onChange((p) => ({ ...p, pulse }))}
                     onEnter={(pulse) => onEnter({ ...v, pulse })} />
      </div>
    </>
  )
}

function QuickAdd({ onDone }: { onDone: () => void }) {
  const data = useBp()
  // useLiveQuery trả undefined ở lần render ĐẦU, mà useState chỉ chạy hàm khởi
  // tạo MỘT lần — đặt giá trị mặc định ngay trong component này là khoá luôn vào
  // số dự phòng, và dòng "đang hiện lần trước" thành nói dối. Tách làm hai: chỉ
  // mount form khi dữ liệu đã về.
  if (!data) return <Sheet onClose={onDone}><div className="empty">Đang tải…</div></Sheet>
  return <BpForm last={data.rows.at(-1)?.value} onDone={onDone} />
}

function BpForm({ last, onDone }: { last?: BpEntry['value']; onDone: () => void }) {
  const [r1, setR1] = useState<Reading>(() => ({
    sys: last?.sys ?? 120,
    dia: last?.dia ?? 80,
    pulse: last?.pulse ?? 70,
  }))
  /** null = chỉ đo một lần, đó là mặc định. Bấm "thêm lần đo 2" mới hiện ô thứ
   *  hai, và khi đó kết quả lưu là TRUNG BÌNH hai lần — đúng quy trình đo tại
   *  nhà của ESC/ESH. */
  const [r2, setR2] = useState<Reading | null>(null)
  const [when, setWhen] = useState<When | null>(null)
  const stamp = when ? whenToStamp(when) : null
  const blocked = when !== null && !stamp

  const result = r2 ? meanOf(r1, r2) : r1
  const level = classify(result.sys, result.dia)

  // Enter trong một ô: ô đó đã commit nhưng state chưa kịp cập nhật, nên nhận
  // giá trị vừa gõ qua tham số thay vì đọc state.
  const save = async (over?: { r1?: Reading; r2?: Reading }) => {
    if (blocked) return
    const a = over?.r1 ?? r1
    const b = over?.r2 ?? r2
    const res = b ? meanOf(a, b) : a
    await addBp(b ? { ...res, readings: [a, b] } : res, stamp ?? stampNow())
    onDone()
  }

  return (
    <Sheet onClose={onDone}>
      <h2>Huyết áp</h2>
      <div className="hint">Tay trái · ngồi tựa lưng · vòng bít bắp tay</div>

      {r2 && <div className="subhead"><span className="eyebrow">Lần đo 1</span></div>}
      <ReadingRows v={r1} onChange={setR1} onEnter={(u) => void save({ r1: u })} />

      {r2 === null ? (
        <button className="qbtn" style={{ width: '100%', marginTop: 14 }}
                onClick={() => setR2({ ...r1 })}>
          + Thêm lần đo 2
        </button>
      ) : (
        <>
          <div className="subhead">
            <span className="eyebrow">Lần đo 2</span>
            <button onClick={() => setR2(null)}>Bỏ</button>
          </div>
          {/* setR2 nhận Reading | null nên phải bọc lại cho khớp kiểu */}
          <ReadingRows v={r2} onEnter={(u) => void save({ r2: u })}
                       onChange={(f) => setR2((p) => (p ? f(p) : p))} />
          <div className="resultline">
            <span className="eyebrow">Kết quả · trung bình</span>
            <span className="num">{result.sys}/{result.dia} · nhịp {result.pulse}</span>
          </div>
        </>
      )}

      <div style={{ margin: '16px 0' }}>
        {/* Thẻ mức đọc KẾT QUẢ, không đọc lần đo 1 */}
        <div className="bpcard"
             style={{ background: `var(--bp-${level.n}-bg)`, color: `var(--bp-${level.n}-fg)` }}>
          <span className="nm">{level.name}</span>
          <span className="rg">{rangeText(level.n, 'sys')} / {rangeText(level.n, 'dia')}</span>
        </div>
      </div>

      <WhenField value={when} onChange={setWhen} />

      <div className="acts" style={{ marginTop: 20 }}>
        <button className="cancel" onClick={onDone}>Huỷ</button>
        {/* Chặn lưu khi ô ngày/giờ bị xoá trắng — thà không lưu còn hơn lưu sai ngày */}
        <button className="save" disabled={blocked} onClick={() => void save()}>Lưu</button>
      </div>
    </Sheet>
  )
}

/* ---------- ô trang chính ---------- */
function Widget() {
  const d = useBp()
  const last = d?.rows.at(-1)?.value
  const level = last ? classify(last.sys, last.dia) : null

  return (
    <>
      <div className="tile-top">
        <span className="tile-name">Huyết áp</span>
        <svg className="tile-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 12h4l2-4 3 8 2-4h7" />
        </svg>
      </div>
      <div className="val">
        <span className="v">{last ? `${last.sys}/${last.dia}` : '—'}</span>
        <span className="u">
          MMHG
          {level && <> · <span style={{ color: `var(--bp-${level.n}-fg)` }}>{level.short}</span></>}
        </span>
      </div>
    </>
  )
}

/* ---------- màn hình đầy đủ ---------- */
function Screen() {
  const d = useBp()
  const [adding, setAdding] = useState(false)

  if (!d) return <div className="empty">Đang tải…</div>
  const { rows, days, avg7 } = d

  if (!rows.length) {
    return (
      <>
        <TopBar />
        <div className="empty">Chưa có bản ghi nào.<br />Ghi lần đo đầu tiên để bắt đầu.</div>
        <div className="block">
          <button className="qbtn solid" style={{ width: '100%' }} onClick={() => setAdding(true)}>
            + Ghi huyết áp
          </button>
        </div>
        {adding && <QuickAdd onDone={() => setAdding(false)} />}
      </>
    )
  }

  const last = rows.at(-1)!

  return (
    <>
      <TopBar />
      <div className="scroll">
        <div className="hero">
          <div className="eyebrow" style={{ marginBottom: 11 }}>Huyết áp</div>
          <div className="big num">{last.value.sys}/{last.value.dia}</div>
          <div className="sub">
            mmHg · nhịp <span className="num">{last.value.pulse}</span> ·{' '}
            {prettyDate(last.localDate)} {clockOf(last.measuredAt, last.localTz)}
            {last.value.readings ? ' · trung bình 2 lần' : ''}
          </div>
        </div>

        {avg7 && (
          <>
            <div className="rule" />
            <div className="block">
              <div className="block-h">
                <span className="eyebrow">Trung bình 7 ngày</span>
              </div>
              <LevelCard level={classify(avg7.sys, avg7.dia)} sys={avg7.sys} dia={avg7.dia} />
              {/* Thẻ đã in sys/dia rồi — dòng này chỉ mang thứ thẻ không có */}
              <div className="bar-meta" style={{ marginTop: 11 }}>
                <span>nhịp trung bình <span className="num">{r0(avg7.pulse)}</span></span>
                <span>{avg7.count} lần đo · {avg7.days} ngày</span>
              </div>
            </div>
          </>
        )}

        {days.length >= 2 && (
          <>
            <div className="rule" />
            <div className="block">
              <div className="block-h">
                <span className="eyebrow">{days.length} ngày</span>
                <span className="num" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                  trung bình mỗi ngày
                </span>
              </div>
              {(['sys', 'dia'] as const).map((axis) => {
                const values = days.map((x) => x[axis])
                const now = values.at(-1)!
                const n = levelOf(now, axis)
                return (
                  <div key={axis}>
                    <div className="chart-lab">
                      <span className="eyebrow">{axis === 'sys' ? 'Tâm thu' : 'Tâm trương'}</span>
                      <span className="now" style={{ color: `var(--bp-${n}-fg)` }}>
                        {r0(now)} · {rangeText(n, axis)}
                      </span>
                    </div>
                    <BandChart values={values} bands={bands(axis)}
                               ariaLabel={axis === 'sys' ? 'Biểu đồ tâm thu' : 'Biểu đồ tâm trương'} />
                  </div>
                )
              })}
            </div>
          </>
        )}

        <div className="rule" />
        <div className="block">
          <div className="block-h"><span className="eyebrow">Gần đây</span></div>
          {rows.slice(-8).reverse().map((r) => {
            const lv = classify(r.value.sys, r.value.dia)
            return (
              <div className="row" key={r.id}>
                <div className="k">
                  {prettyDate(r.localDate)}
                  <small>
                    {clockOf(r.measuredAt, r.localTz)}
                    {r.value.readings ? ' · TB 2 lần' : ''}
                  </small>
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span className="v">{r.value.sys}/{r.value.dia}</span>
                  <span className="p">{r.value.pulse}</span>
                  <i className="lvl" style={{ background: `var(--bp-${lv.n}-fg)` }}
                     title={lv.name} aria-label={lv.name} />
                </div>
              </div>
            )
          })}
        </div>

        <div className="rule" />
        <div className="block">
          <div className="block-h"><span className="eyebrow">Điều kiện đo</span></div>
          <div className="note">
            <dl>
              {CONDITIONS.map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          </div>
          <p style={{ fontSize: 10.5, color: 'var(--ink-4)', lineHeight: 1.65, marginTop: 11 }}>
            Cố định để các lần đo so sánh được với nhau.
            Thang 7 mức theo ESC/ESH, ngưỡng đo tại nhà.
          </p>
        </div>

        <div className="block" style={{ paddingTop: 0 }}>
          <button className="qbtn solid" style={{ width: '100%' }} onClick={() => setAdding(true)}>
            + Ghi huyết áp
          </button>
        </div>
      </div>
      {adding && <QuickAdd onDone={() => setAdding(false)} />}
    </>
  )
}

register({
  id: 'bp',
  name: 'Huyết áp',
  kind: 'tracker',
  Screen,
  Widget,
  QuickAdd,
  // Một việc duy nhất: completeLinked() tick TẤT CẢ việc trỏ về module này, nên
  // hai việc sáng/tối sẽ tick lẫn nhau. Muốn tách thì phải sửa completeLinked.
  seedTasks: [
    { seedId: 'daily', title: 'Đo huyết áp buổi sáng', kind: 'daily', timeOfDay: '07:15', remind: true, linkedModule: 'bp' },
  ],
})
