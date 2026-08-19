import { useState } from 'react'

import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSetting, setSetting } from '../../db'
import type { WeightEntry } from '../../db/types'
import { register } from '../registry'
import { TopBar, Sheet, NumberField, WhenField } from '../../components/ui'
import { LineChart } from '../../components/Chart'
import { prettyDate, weekdayName, daysBetween, stampNow, whenToStamp, type When, type Stamp } from '../../lib/time'
import { ema, slopePerDay, weeksToGoal, progressPct, fmt1, signed1 } from '../../lib/stats'
import { completeLinked } from '../todo/data'

const GOAL_KEY = 'weight.goalKg'
const START_KEY = 'weight.startKg'

/* ---------- truy vấn dùng chung ---------- */
function useWeights() {
  return useLiveQuery(async () => {
    const rows = (await db.entries
      .where('module').equals('weight')
      .filter((e) => !e.deletedAt)
      .toArray()) as WeightEntry[]
    rows.sort((a, b) => a.localDate.localeCompare(b.localDate))

    const kg = rows.map((r) => r.value.kg)
    const trend = ema(kg)
    const goal = await getSetting<number | null>(GOAL_KEY, null)
    const start = await getSetting<number | null>(START_KEY, kg[0] ?? null)

    // kg/tuần từ hồi quy 28 ngày gần nhất trên đường xu hướng
    const tail = trend.slice(-28)
    const perDay = slopePerDay(tail.map((y, i) => ({ x: i, y })))
    return { rows, kg, trend, goal, start, perWeek: perDay * 7 }
  }, [])
}

async function addWeight(kg: number, stamp: Stamp) {
  const iso = new Date().toISOString()
  // Một ngày một lần cân: ghi lại cùng ngày thì ghi đè. Ghi bù cũng vậy — sửa
  // đúng ngày được chọn, không phải hôm nay.
  const existing = await db.entries
    .where('[module+localDate]').equals(['weight', stamp.localDate]).first()

  if (existing) {
    await db.entries.update(existing.id, {
      value: { kg }, measuredAt: stamp.measuredAt, localTz: stamp.localTz, updatedAt: iso,
    })
  } else {
    await db.entries.add({
      id: crypto.randomUUID(),
      module: 'weight',
      ...stamp,
      value: { kg },
      createdAt: iso,
      updatedAt: iso,
    } as WeightEntry)
  }

  // Cân nặng "bắt đầu" suy lại từ bản ghi sớm nhất mỗi lần ghi, không đông cứng
  // ở lần nhập đầu tiên: ghi bù một ngày trước ngày cũ nhất thì mốc bắt đầu —
  // và cả phần trăm tiến trình tới mục tiêu — phải đổi theo.
  const all = (await db.entries
    .where('module').equals('weight')
    .filter((e) => !e.deletedAt)
    .toArray()) as WeightEntry[]
  const earliest = all.reduce((a, b) => (a.localDate <= b.localDate ? a : b))
  await setSetting(START_KEY, earliest.value.kg)

  // Nhập xong thì việc trong todo tự tick — một hệ thống nhắc duy nhất.
  // Ghi bù thì tick vào ĐÚNG ngày đó, nên chuỗi ngày tính lại cho chính xác.
  await completeLinked('weight', stamp.localDate)
}

/* ---------- form ghi nhanh ---------- */
function QuickAdd({ onDone }: { onDone: () => void }) {
  const data = useWeights()
  const last = data?.kg.at(-1) ?? 70
  const [v, setV] = useState(() => Math.round(last * 10) / 10)
  // null = đóng dấu lúc lưu. Chỉ khác null khi người dùng tự chọn ngày/giờ.
  const [when, setWhen] = useState<When | null>(null)
  const stamp = when ? whenToStamp(when) : null
  const blocked = when !== null && !stamp

  const save = async (kg: number) => {
    if (blocked) return
    await addWeight(kg, stamp ?? stampNow())
    onDone()
  }

  return (
    <Sheet onClose={onDone}>
      <h2>Cân nặng</h2>
      <div className="hint">Đang hiện giá trị lần trước · gõ trực tiếp hoặc dùng −/+</div>
      <NumberField
        value={v} onChange={setV} onEnter={save}
        label="Cân nặng (kg)" unit="kg" step={0.1} min={20} max={300}
      />
      <div style={{ margin: '0 0 20px' }}>
        <WhenField value={when} onChange={setWhen} />
      </div>
      <div className="acts">
        <button className="cancel" onClick={onDone}>Huỷ</button>
        {/* Chặn lưu khi ô ngày/giờ bị xoá trắng — thà không lưu còn hơn lưu sai ngày */}
        <button className="save" disabled={blocked} onClick={() => save(v)}>Lưu</button>
      </div>
    </Sheet>
  )
}

/* ---------- ô trang chính ---------- */
function Widget() {
  const d = useWeights()
  const kg = d?.kg ?? []
  const last = kg.at(-1)
  const prev = kg.at(-2)

  return (
    <>
      <div className="tile-top">
        <span className="tile-name">Cân nặng</span>
        <svg className="tile-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 6h16v14H4z" /><path d="M8 6a4 4 0 0 1 8 0" /><path d="M12 10v3" />
        </svg>
      </div>
      <div className="val">
        <span className="v">{last !== undefined ? fmt1(last) : '—'}</span>
        <span className="u">KG{prev !== undefined && last !== undefined ? ` · ${signed1(last - prev)}` : ''}</span>
      </div>
    </>
  )
}

/* ---------- màn hình đầy đủ ---------- */
function Screen() {
  const d = useWeights()
  const [adding, setAdding] = useState(false)

  if (!d) return <div className="empty">Đang tải…</div>
  const { rows, kg, trend, goal, start, perWeek } = d

  if (!rows.length) {
    return (
      <>
        <TopBar />
        <div className="empty">Chưa có bản ghi nào.<br />Ghi lần cân đầu tiên để bắt đầu.</div>
        <div className="block">
          <button className="qbtn solid" style={{ width: '100%' }} onClick={() => setAdding(true)}>
            + Ghi cân nặng
          </button>
        </div>
        {adding && <QuickAdd onDone={() => setAdding(false)} />}
      </>
    )
  }

  const last = kg.at(-1)!
  const tr = trend.at(-1)!
  const weeks = goal !== null ? weeksToGoal(tr, goal, perWeek) : null
  const pct = goal !== null && start !== null ? progressPct(start, tr, goal) : null

  return (
    <>
      <TopBar />
      <div className="scroll">
        <div className="hero">
          <div className="eyebrow" style={{ marginBottom: 11 }}>Cân nặng</div>
          <div className="big num">{fmt1(last)}</div>
          <div className="sub">
            kg · xu hướng <span className="num">{fmt1(tr)}</span>
            {Math.abs(perWeek) >= 0.05 && (
              <> · <span className="num" style={{ color: perWeek < 0 ? 'var(--good)' : undefined }}>
                {signed1(perWeek)}</span> kg/tuần</>
            )}
          </div>
        </div>

        {goal !== null && start !== null && (
          <>
            <div className="rule" />
            <div className="block">
              <div className="block-h">
                <span className="eyebrow">Mục tiêu</span>
                <span className="num" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                  {weeks !== null ? `còn ~${weeks} tuần` : 'chưa đủ dữ liệu'}
                </span>
              </div>
              <div className="bar"><i style={{ width: `${pct}%` }} /></div>
              <div className="bar-meta">
                <span>{fmt1(start)} bắt đầu</span>
                <span>còn {fmt1(Math.abs(tr - goal))} kg</span>
                <span>{fmt1(goal)} đích</span>
              </div>
            </div>
          </>
        )}

        <div className="rule" />
        <div className="block">
          <div className="block-h">
            <span className="eyebrow">{daysBetween(rows[0].localDate, rows.at(-1)!.localDate) + 1} ngày</span>
            <span className="num" style={{ fontSize: 11, color: 'var(--ink-3)' }}>điểm đo + xu hướng</span>
          </div>
          <LineChart points={kg} trend={trend} goal={goal ?? undefined} />
        </div>

        <div className="rule" />
        <div className="block">
          <div className="block-h"><span className="eyebrow">Gần đây</span></div>
          {rows.slice(-8).reverse().map((r, i, arr) => {
            const prev = arr[i + 1]
            return (
              <div className="row" key={r.id}>
                <div className="k">{prettyDate(r.localDate)}<small>{weekdayName(r.localDate)}</small></div>
                <div style={{ display: 'flex', alignItems: 'baseline' }}>
                  <span className="v">{fmt1(r.value.kg)}</span>
                  <span className="d">{prev ? signed1(r.value.kg - prev.value.kg) : '—'}</span>
                </div>
              </div>
            )
          })}
        </div>

        <div className="block">
          <button className="qbtn solid" style={{ width: '100%' }} onClick={() => setAdding(true)}>
            + Ghi cân nặng
          </button>
        </div>
      </div>
      {adding && <QuickAdd onDone={() => setAdding(false)} />}
    </>
  )
}

register({
  id: 'weight',
  name: 'Cân nặng',
  kind: 'tracker',
  Screen,
  Widget,
  QuickAdd,
  // Module tự đăng ký việc của nó vào todo thay vì có hệ thống nhắc riêng
  seedTasks: [
    { seedId: 'daily', title: 'Cân nặng buổi sáng', kind: 'daily', timeOfDay: '07:00', remind: true, linkedModule: 'weight' },
  ],
})

