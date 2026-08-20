import { useState } from 'react'

import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import type { PeriodEntry } from '../../db/types'
import { register } from '../registry'
import { TopBar, Sheet, WhenField } from '../../components/ui'
import {
  localDateOf, prettyDate, addDays, daysBetween, weekdayShort,
  stampNow, whenToStamp, nowWhen, type When, type Stamp,
} from '../../lib/time'
import {
  runsOf, cyclesOf, statsOf, predict, cycleDay, notes, NORMAL,
  LUTEAL, WEIGHT_MAX,
  phaseDays, phaseSpans, PHASE_LABEL,
  FLOW_LABEL, type Flow, type Day, type Prediction, type Phase, type PhaseDay,
} from './cycles'

/* ---------- truy vấn dùng chung ---------- */
function usePeriod() {
  return useLiveQuery(async () => {
    const rows = (await db.entries
      .where('module').equals('period')
      .filter((e) => !e.deletedAt)
      .toArray()) as PeriodEntry[]

    const days: Day[] = rows
      .map((r) => ({ date: r.localDate, flow: r.value.flow }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const byDate = new Map(days.map((d) => [d.date, d.flow]))
    const runs = runsOf(days)
    const cycles = cyclesOf(runs)
    const stats = statsOf(cycles)
    const last = runs.at(-1)
    const today = localDateOf()

    return {
      byDate,
      runs,
      cycles,
      stats,
      today,
      lastRun: last,
      prediction: last ? predict(last.start, stats) : null,
      // "Đang có kinh" = hôm nay nằm trong đợt gần nhất, hoặc liền ngay sau nó
      bleeding: !!last && daysBetween(last.end, today) <= 0,
      day: last ? cycleDay(last.start, today) : null,
    }
  }, [])
}

async function logDay(date: string, flow: Flow, stamp: Stamp) {
  const iso = new Date().toISOString()
  // Một ngày một dòng: ghi lại cùng ngày thì ghi đè (như cân nặng)
  const existing = await db.entries
    .where('[module+localDate]').equals(['period', date]).first()
  if (existing) {
    await db.entries.update(existing.id, {
      value: { flow }, measuredAt: stamp.measuredAt, localTz: stamp.localTz, updatedAt: iso,
    })
    return
  }
  await db.entries.add({
    id: crypto.randomUUID(), module: 'period', ...stamp,
    value: { flow }, createdAt: iso, updatedAt: iso,
  } as PeriodEntry)
}

/** Xoá MỀM — dữ liệu này được đồng bộ, xoá cứng không truyền được sang máy khác */
async function unlogDay(date: string) {
  const iso = new Date().toISOString()
  const existing = await db.entries
    .where('[module+localDate]').equals(['period', date]).first()
  if (existing) await db.entries.update(existing.id, { deletedAt: iso, updatedAt: iso })
}

/* ---------- vòng chu kỳ ---------- */

const PHASE_COLOR: Record<Phase, string> = {
  menses: 'var(--cy-menses)',
  follicular: 'var(--cy-follicular)',
  fertile: 'var(--cy-fertile)',
  luteal: 'var(--cy-luteal)',
}

const RING = { size: 240, r: 92, sw: 20, hit: 34 }

/** Cung tròn bắt đầu từ 12 giờ, đi theo chiều kim đồng hồ */
function arcPath(a0: number, a1: number, r: number) {
  const c = RING.size / 2
  const pt = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180
    return [c + r * Math.cos(rad), c + r * Math.sin(rad)]
  }
  const [x0, y0] = pt(a0)
  const [x1, y1] = pt(a1)
  // Cung tròn không vẽ được đúng khi bằng đủ 360 độ — chừa một chút
  const large = a1 - a0 > 180 ? 1 : 0
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

/** Vòng chu kỳ chia theo pha, bấm hoặc trỏ vào một cung thì giữa vòng hiện chi
 *  tiết pha đó.
 *
 *  Cung "dễ thụ thai" vẽ theo TỪNG NGÀY với độ đậm theo xác suất, không phải một
 *  khối đặc: khối đặc có biên nói rằng ngoài biên là an toàn, mà điều đó không
 *  đúng. Vòng vẫn đọc được như bốn pha, nhưng pha đó tự nhoè ra ở hai đầu.
 */
function CycleRing({
  days, prediction, todayDay,
}: { days: PhaseDay[]; prediction: Prediction | null; todayDay: number | null }) {
  const [active, setActive] = useState<Phase | null>(null)
  const spans = phaseSpans(days)
  const n = days.length
  const per = 360 / n
  const c = RING.size / 2

  const cur = days.find((d) => d.day === todayDay)
  // Không phải chu kỳ nào cũng có đủ bốn pha: chu kỳ ngắn hoặc kỳ kinh dài có thể
  // không còn ngày nang trứng nào. Nút chú giải của pha không tồn tại phải bị
  // chặn, chứ không để bấm vào rồi ra ô trống.
  const has = new Set(spans.map((s) => s.phase))
  const shown = (active && has.has(active) ? active : null) ?? (cur ? cur.phase : null)
  const span = shown ? spans.find((s) => s.phase === shown) : undefined

  const detail = (): string => {
    if (!shown) return ''
    if (shown === 'menses') return 'những ngày đã ghi có ra máu'
    if (shown === 'follicular') return 'sau kỳ kinh, trước cửa sổ dễ thụ thai'
    if (shown === 'fertile') {
      const peak = days.filter((d) => d.phase === 'fertile')
        .reduce((a, b) => (b.weight > a.weight ? b : a), days.find((d) => d.phase === 'fertile')!)
      return `khả năng cao nhất quanh ngày ${peak.day}`
    }
    return prediction
      ? `kỳ tới dự kiến ${prediction.from === prediction.to
          ? prettyDate(prediction.from)
          : `${prettyDate(prediction.from)}–${prettyDate(prediction.to)}`}`
      : 'sau rụng trứng, trước kỳ tới'
  }

  // Trỏ chuột thì đổi theo con trỏ; chạm thì giữ lại (điện thoại không có hover)
  const bind = (phase: Phase) => ({
    onPointerEnter: (e: React.PointerEvent) => { if (e.pointerType === 'mouse') setActive(phase) },
    onPointerLeave: (e: React.PointerEvent) => { if (e.pointerType === 'mouse') setActive(null) },
    onClick: () => setActive((x) => (x === phase ? null : phase)),
  })

  return (
    <div className="ring-wrap">
      <svg className="ring" viewBox={`0 0 ${RING.size} ${RING.size}`} role="img"
           aria-label="Vòng chu kỳ chia theo bốn pha">
        {/* nền vòng */}
        <circle cx={c} cy={c} r={RING.r} fill="none" stroke="var(--line-2)" strokeWidth={RING.sw} />

        {/* các pha, trừ dễ thụ thai */}
        {spans.filter((s) => s.phase !== 'fertile').map((s) => (
          <path key={`${s.phase}-${s.from}`}
                d={arcPath((s.from - 1) * per, s.to * per - 0.6, RING.r)}
                stroke={PHASE_COLOR[s.phase]} strokeWidth={RING.sw} fill="none"
                opacity={shown === null || shown === s.phase ? 0.9 : 0.28} />
        ))}

        {/* dễ thụ thai: từng ngày, đậm theo xác suất */}
        {days.filter((d) => d.phase === 'fertile').map((d) => (
          <path key={d.date} d={arcPath((d.day - 1) * per, d.day * per - 0.4, RING.r)}
                stroke={PHASE_COLOR.fertile} strokeWidth={RING.sw} fill="none"
                opacity={(shown === null || shown === 'fertile' ? 0.9 : 0.28) *
                         Math.max(0.18, Math.min(1, d.weight / WEIGHT_MAX))} />
        ))}

        {/* vùng chạm rộng hơn cung nhìn thấy */}
        {spans.map((s) => (
          <path key={`hit-${s.phase}-${s.from}`} className="hit"
                d={arcPath((s.from - 1) * per, s.to * per, RING.r)}
                strokeWidth={RING.hit} fill="none" {...bind(s.phase)} />
        ))}

        {/* hôm nay */}
        {todayDay !== null && todayDay <= n && (
          <path d={arcPath((todayDay - 1) * per, todayDay * per, RING.r + RING.sw / 2 + 4)}
                stroke="var(--ink)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        )}
      </svg>

      <div className="ring-mid">
        {shown && span ? (
          <>
            <div className="ph">{PHASE_LABEL[shown]}</div>
            <div className="rg">ngày {span.from === span.to ? span.from : `${span.from}–${span.to}`} · {span.days} ngày</div>
            <div className="ds">{detail()}</div>
          </>
        ) : (
          <div className="ds">Bấm một cung để xem chi tiết</div>
        )}
      </div>

      <div className="ring-key">
        {(['menses', 'follicular', 'fertile', 'luteal'] as Phase[]).map((ph) => (
          <button key={ph} className={shown === ph ? 'on' : ''} disabled={!has.has(ph)}
                  title={has.has(ph) ? undefined : 'không có trong chu kỳ này'}
                  onClick={() => setActive((x) => (x === ph ? null : ph))}>
            <i style={{ background: PHASE_COLOR[ph] }} />{PHASE_LABEL[ph]}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ---------- lịch tháng ---------- */
/** Mức ra máu thể hiện bằng ĐỘ ĐẬM của mực, không phải màu: quy tắc 4 chỉ cho
 *  màu ở nơi màu là dữ liệu, và chỗ đó đã là thang huyết áp. */
const FILL: Record<Flow, string> = {
  0: 'var(--ink-4)',
  1: 'var(--ink-3)',
  2: 'var(--ink-2)',
  3: 'var(--ink)',
}

function Calendar({
  month, byDate, predicted, today, onPick, onMonth,
}: {
  month: string // 'YYYY-MM'
  byDate: Map<string, Flow>
  predicted: Set<string>
  today: string
  onPick: (date: string) => void
  onMonth: (delta: number) => void
}) {
  const [y, m] = month.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  const daysInMonth = new Date(y, m, 0).getDate()
  // Tuần bắt đầu THỨ HAI: getDay() trả 0 cho Chủ nhật nên phải dịch
  const lead = (first.getDay() + 6) % 7

  const cells: (string | null)[] = Array(lead).fill(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }

  return (
    <>
      <div className="cal-head">
        <button className="cal-nav" onClick={() => onMonth(-1)} aria-label="Tháng trước">‹</button>
        <span className="num">tháng {m} · {y}</span>
        <button className="cal-nav" onClick={() => onMonth(1)} aria-label="Tháng sau"
                disabled={month >= today.slice(0, 7)}>›</button>
      </div>
      <div className="cal">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <div className="cal-wd" key={d}>{weekdayShort(d)}</div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={`e${i}`} />
          const flow = byDate.get(date)
          const future = date > today
          const cls = [
            'cal-d',
            flow !== undefined ? 'on' : '',
            predicted.has(date) ? 'pred' : '',
            date === today ? 'today' : '',
          ].join(' ')
          return (
            <button key={date} className={cls} disabled={future}
                    onClick={() => onPick(date)}
                    aria-label={`${prettyDate(date)}${flow !== undefined ? ' · ' + FLOW_LABEL[flow] : ''}`}>
              <span className="n">{Number(date.slice(-2))}</span>
              {flow !== undefined && <i style={{ background: FILL[flow] }} />}
            </button>
          )
        })}
      </div>
    </>
  )
}

/* ---------- form ghi ---------- */
function LogSheet({ date, existing, onDone }: {
  date?: string
  existing?: Flow
  onDone: () => void
}) {
  const [flow, setFlow] = useState<Flow>(existing ?? 2)
  const [when, setWhen] = useState<When | null>(date ? { ...nowWhen(), date } : null)
  const stamp = when ? whenToStamp(when) : null
  const blocked = when !== null && !stamp

  const save = async () => {
    if (blocked) return
    const s = stamp ?? stampNow()
    await logDay(s.localDate, flow, s)
    onDone()
  }

  return (
    <Sheet onClose={onDone}>
      <h2>{date ? prettyDate(date) : 'Hôm nay'}</h2>
      <div className="hint">Ra đốm không tính là ngày đầu kỳ kinh</div>

      <div className="chips" style={{ justifyContent: 'center' }}>
        {([0, 1, 2, 3] as Flow[]).map((f) => (
          <button key={f} className={`chip${f === flow ? ' on' : ''}`} onClick={() => setFlow(f)}>
            {FLOW_LABEL[f]}
          </button>
        ))}
      </div>

      <WhenField value={when} onChange={setWhen} />

      <div className="acts" style={{ marginTop: 18 }}>
        <button className="cancel" onClick={onDone}>Huỷ</button>
        <button className="save" disabled={blocked} onClick={() => void save()}>Lưu</button>
      </div>
      {existing !== undefined && date && (
        <button className="footlink" style={{ width: '100%', marginTop: 12 }}
                onClick={async () => { await unlogDay(date); onDone() }}>
          Bỏ ghi ngày này
        </button>
      )}
    </Sheet>
  )
}

/** Bản cho registry: ghi cho hôm nay */
const QuickAdd = ({ onDone }: { onDone: () => void }) => <LogSheet onDone={onDone} />

/* ---------- ô trang chính ---------- */
function Widget() {
  const d = usePeriod()

  return (
    <>
      <div className="tile-top">
        <span className="tile-name">Kinh nguyệt</span>
        <svg className="tile-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 3c3.5 4 6 6.8 6 10a6 6 0 0 1-12 0c0-3.2 2.5-6 6-10z" />
        </svg>
      </div>
      <div className="val">
        <span className="v">{d?.day ?? '—'}</span>
        <span className="u">
          {!d || !d.day ? 'CHƯA CÓ DỮ LIỆU'
            : d.bleeding ? 'NGÀY · ĐANG CÓ KINH'
            : d.prediction ? `NGÀY · KỲ TỚI ${prettyDate(d.prediction.mid).replace(' thg ', '/')}`
            : 'NGÀY CỦA CHU KỲ'}
        </span>
      </div>
    </>
  )
}

/* ---------- màn hình đầy đủ ---------- */
function Screen() {
  const d = usePeriod()
  const [month, setMonth] = useState(() => localDateOf().slice(0, 7))
  const [sheet, setSheet] = useState<{ date?: string; existing?: Flow } | null>(null)

  if (!d) return <div className="empty">Đang tải…</div>
  const { byDate, stats, today, prediction, bleeding, day, lastRun } = d

  // Ngày dự kiến: cả khoảng từ sớm nhất tới muộn nhất
  const predicted = new Set<string>()
  if (prediction) {
    for (let x = prediction.from; x <= prediction.to; x = addDays(x, 1)) predicted.add(x)
  }
  const flags = notes(stats)

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number)
    const t = new Date(y, m - 1 + delta, 1)
    setMonth(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`)
  }

  return (
    <>
      <TopBar />
      <div className="scroll">
        <div className="hero">
          <div className="eyebrow" style={{ marginBottom: 11 }}>Kinh nguyệt</div>
          {day ? (
            <>
              <div className="big num">{day}</div>
              <div className="sub">
                ngày của chu kỳ
                {bleeding && <> · <span className="num">đang có kinh</span></>}
                {lastRun && <> · bắt đầu {prettyDate(lastRun.start)}</>}
              </div>
            </>
          ) : (
            <div className="sub" style={{ marginTop: 0 }}>Chưa ghi ngày nào</div>
          )}
        </div>

        {stats && (
          <>
            <div className="rule" />
            <div className="block">
              {/* KPI: ba số quan trọng nhất, mỗi số một ô — thay cho ba hàng
                  danh sách cũ. Cùng thông tin, một phần ba chiều cao. */}
              <div className="kpi">
                <div>
                  <div className="v num">{stats.cycleMedian}</div>
                  <div className="l">chu kỳ<br />ngày · trung vị</div>
                </div>
                <div>
                  <div className="v num">{stats.cycleMin}–{stats.cycleMax}</div>
                  <div className="l">dao động<br />ngắn – dài</div>
                </div>
                <div>
                  <div className="v num">{stats.periodMedian}</div>
                  <div className="l">ra máu<br />ngày · trung vị</div>
                </div>
              </div>
              {flags.length > 0 && (
                <div className="errbox" style={{ marginTop: 14, marginBottom: 0 }}>
                  Đáng để ý: {flags.join(' · ')}. Tham chiếu FIGO: chu kỳ{' '}
                  {NORMAL.cycleMin}–{NORMAL.cycleMax} ngày, ra máu tới {NORMAL.periodMax} ngày,
                  chênh lệch ngắn–dài tới {NORMAL.spreadMax} ngày.
                </div>
              )}
            </div>
          </>
        )}

        {prediction && (
          <>
            <div className="rule" />
            <div className="block">
              <div className="block-h">
                <span className="eyebrow">Kỳ tới, dự kiến</span>
                <span className="num" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                  theo {prediction.basedOn} chu kỳ
                </span>
              </div>
              <div className="num" style={{ fontSize: 21, fontWeight: 300 }}>
                {/* Chu kỳ đều tuyệt đối thì min == max — in "16/9 – 16/9" đọc như lỗi */}
                {prediction.from === prediction.to
                  ? prettyDate(prediction.from)
                  : `${prettyDate(prediction.from)} – ${prettyDate(prediction.to)}`}
              </div>
              <p className="footnote" style={{ textAlign: 'left', marginTop: 8 }}>
                Khoảng lấy từ chu kỳ ngắn nhất và dài nhất của chính bạn — càng đều
                thì càng hẹp.
              </p>
            </div>
          </>
        )}

        {prediction && lastRun && stats && (
          <>
            <div className="rule" />
            <div className="block">
              <div className="block-h">
                <span className="eyebrow">Vòng chu kỳ</span>
                <span className="num" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                  {stats.cycleMedian} ngày
                </span>
              </div>
              <CycleRing
                days={phaseDays(lastRun.start, stats.cycleMedian, (d) => byDate.get(d) !== undefined && byDate.get(d)! >= 1, prediction)}
                prediction={prediction}
                todayDay={day && day <= stats.cycleMedian ? day : null} />
            </div>
          </>
        )}

        <div className="rule" />
        <div className="block">
          <Calendar month={month} byDate={byDate} predicted={predicted} today={today}
                    onMonth={shiftMonth}
                    onPick={(date) => setSheet({ date, existing: byDate.get(date) })} />
          <p className="footnote" style={{ marginTop: 12 }}>
            Bấm một ngày để ghi hoặc sửa · ô viền nét đứt là ngày dự kiến
          </p>
        </div>

        <div className="block" style={{ paddingTop: 0 }}>
          <button className="qbtn solid" style={{ width: '100%' }}
                  onClick={() => setSheet({ date: today, existing: byDate.get(today) })}>
            + Ghi hôm nay
          </button>
          <p className="footnote" style={{ marginTop: 14 }}>
            Ngày dễ thụ thai suy từ độ dài chu kỳ và pha hoàng thể {LUTEAL.min}–{LUTEAL.max}
            ngày, nên chỉ chính xác tới mức đó — cách tính theo lịch sai khoảng 24% số
            lần. Muốn chắc hơn thì cần que thử LH hoặc theo dõi nhiệt độ cơ thể.
          </p>
        </div>
      </div>
      {sheet && (
        <LogSheet date={sheet.date} existing={sheet.existing} onDone={() => setSheet(null)} />
      )}
    </>
  )
}

register({
  id: 'period',
  name: 'Kinh nguyệt',
  kind: 'tracker',
  Screen,
  Widget,
  QuickAdd,
  // Ẩn tới khi bật ở Cá nhân. Mặc định ẩn vì app không suy đoán gì về người dùng.
  enabledBy: 'profile.female',
  // Không có seedTasks: nhắc "kỳ tới sắp đến" là nhắc theo DỰ ĐOÁN, mà hệ thống
  // việc hiện tại chỉ diễn đạt được quy tắc cố định (daily/weekly/interval/once)
  // nên việc nhắc sẽ lệch dần mỗi tháng.
})
