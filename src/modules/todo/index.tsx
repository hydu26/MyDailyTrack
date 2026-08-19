import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Task, TaskKind } from '../../db/types'
import { register } from '../registry'
import { Check, Chevron, TopBar, Sheet, NumberField } from '../../components/ui'
import { useTodayTasks, useStreak, toggleTask, addTask, archiveTask } from './data'
import { upcoming, ruleLabel } from './rules'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import { relativeDay, localDateOf, weekdayShort } from '../../lib/time'

/* ---------- một hàng việc ---------- */
/** Hàng việc có tới BA vùng bấm riêng, vì chúng làm ba việc khác nhau:
 *
 *  - **vòng tròn** → đánh dấu xong/chưa xong, LUÔN LUÔN. Đây là cách đánh dấu
 *    thủ công một việc của module: đã cân ở chỗ khác, đo huyết áp ở hiệu thuốc,
 *    không có số để nhập. Thiếu nó thì việc `linkedModule` không có đường nào
 *    tick được ngoài việc nhập số.
 *  - **chữ** → việc của module thì mở form nhập (quy tắc 2), việc thường thì
 *    cũng là tick.
 *  - **×** → bỏ việc, chỉ có với việc do người dùng thêm.
 *
 *  Nút-trong-nút là HTML không hợp lệ nên hàng phải là `div`.
 */
function TaskRow({
  task, done, showRule, onToggle, onOpen, onArchive,
}: {
  task: Task
  done: boolean
  showRule?: boolean
  /** Đánh dấu xong / bỏ đánh dấu */
  onToggle: () => void
  /** Bấm vào chữ. Mặc định giống onToggle. */
  onOpen?: () => void
  onArchive?: () => void
}) {
  return (
    <div className={`trow${done ? ' on' : ''}`}>
      <button className="cbtn" onClick={onToggle} aria-pressed={done}
              aria-label={done ? `Bỏ đánh dấu ${task.title}` : `Đánh dấu xong ${task.title}`}>
        <span className="cb"><Check /></span>
      </button>
      <button className="tmain" onClick={onOpen ?? onToggle} aria-label={task.title}>
        <span className="lb">{task.title}</span>
        {showRule && <span className="rp">{ruleLabel(task)}</span>}
        {task.timeOfDay && <span className="tm">{task.timeOfDay}</span>}
        {task.linkedModule && <Chevron className="lk" />}
      </button>
      {onArchive && (
        <button className="tdel" onClick={onArchive} aria-label={`Bỏ việc ${task.title}`}>×</button>
      )}
    </div>
  )
}

const KINDS: { k: TaskKind; label: string }[] = [
  { k: 'daily', label: 'Mỗi ngày' },
  { k: 'weekly', label: 'Hàng tuần' },
  { k: 'interval', label: 'Mỗi N ngày' },
  { k: 'once', label: 'Một lần' },
]

/* ---------- thêm việc ---------- */
function AddSheet({ onDone }: { onDone: () => void }) {
  const today = localDateOf()
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<TaskKind>('daily')
  const [days, setDays] = useState<number[]>([])
  const [everyN, setEveryN] = useState(3)
  const [date, setDate] = useState(today)
  const [time, setTime] = useState('')
  const [remind, setRemind] = useState(false)

  // weekly mà chưa chọn ngày nào thì việc không bao giờ xuất hiện — chặn luôn
  const blocked = !title.trim() || (kind === 'weekly' && days.length === 0) || !date

  const save = async () => {
    if (blocked) return
    await addTask({
      title: title.trim(),
      kind,
      days: kind === 'weekly' ? [...days].sort() : undefined,
      everyNDays: kind === 'interval' ? everyN : undefined,
      // `once` và `interval` đều lấy dueDate làm mốc; `daily`/`weekly` không cần
      dueDate: kind === 'once' || kind === 'interval' ? date : undefined,
      timeOfDay: time || undefined,
      remind,
    })
    onDone()
  }

  return (
    <Sheet onClose={onDone}>
      <h2>Thêm việc</h2>
      <div className="hint">Việc lặp lại lưu thành quy tắc, không sinh sẵn từng ngày</div>

      <label className="tf">
        <span className="eyebrow">Tên việc</span>
        <input className="tinput" autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
               onKeyDown={(e) => { if (e.key === 'Enter') void save() }} />
      </label>

      <div className="filter">
        <div className="eyebrow">Lặp lại</div>
        <div className="chips">
          {KINDS.map(({ k, label }) => (
            <button key={k} className={`chip sm${k === kind ? ' on' : ''}`} onClick={() => setKind(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {kind === 'weekly' && (
        <div className="filter">
          <div className="eyebrow">Những ngày nào</div>
          <div className="chips">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <button key={d} className={`chip sm num${days.includes(d) ? ' on' : ''}`}
                      onClick={() => setDays((x) => x.includes(d) ? x.filter((y) => y !== d) : [...x, d])}>
                {weekdayShort(d)}
              </button>
            ))}
          </div>
        </div>
      )}

      {kind === 'interval' && (
        <div className="fieldrow">
          <div className="lab">Mỗi<small>NGÀY</small></div>
          <NumberField compact value={everyN} onChange={setEveryN}
                       label="Số ngày giữa hai lần" min={2} max={365} />
        </div>
      )}

      {(kind === 'once' || kind === 'interval') && (
        <label className="wf" style={{ marginBottom: 12 }}>
          <span className="eyebrow">{kind === 'once' ? 'Ngày' : 'Bắt đầu từ'}</span>
          <input type="date" className="num" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      )}

      <div className="fieldrow">
        <div className="lab">Giờ<small>ĐỂ TRỐNG = KHÔNG GIỜ CỤ THỂ</small></div>
        <label className="wf" style={{ flex: 'none', width: 118 }}>
          <input type="time" className="num" value={time} aria-label="Giờ"
                 onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>

      <div className="fieldrow">
        <div className="lab">Nhắc<small>CẦN CÓ GIỜ</small></div>
        <button className={`chip sm${remind ? ' on' : ''}`}
                onClick={() => {
                  const next = !remind
                  setRemind(next)
                  // Cron không nhắc được việc không có giờ, nên bật nhắc thì đặt
                  // sẵn một giờ mặc định thay vì im lặng không hoạt động.
                  if (next && !time) setTime('08:00')
                }}>
          {remind ? 'Có nhắc' : 'Không nhắc'}
        </button>
      </div>

      <div className="acts" style={{ marginTop: 18 }}>
        <button className="cancel" onClick={onDone}>Huỷ</button>
        <button className="save" disabled={blocked} onClick={() => void save()}>Thêm</button>
      </div>
    </Sheet>
  )
}

/* ---------- ô trên trang chính ---------- */
function TodoWidget() {
  const nav = useNavigate()
  const data = useTodayTasks()
  if (!data) return <div className="todo-tile" />

  const { due, doneIds, today } = data
  const left = due.filter((t) => !doneIds.has(t.id))

  const toggle = (t: Task) => toggleTask(t.id, !doneIds.has(t.id), today)
  // Bấm vào CHỮ: việc của module thì mở form nhập, còn lại thì cũng là tick
  const open = (t: Task) =>
    t.linkedModule && !doneIds.has(t.id) ? nav(`/m/${t.linkedModule}?add=1`) : toggle(t)

  return (
    <div className="todo-tile">
      <div className="todo-hd">
        <span className="tile-name">Hôm nay</span>
        <span className="cnt">{due.length - left.length}/{due.length} XONG</span>
      </div>
      {left.length === 0 ? (
        <div className="more" style={{ padding: '4px 0 10px' }}>Xong hết việc hôm nay</div>
      ) : (
        left.slice(0, 3).map((t) => (
          <TaskRow key={t.id} task={t} done={false}
                   onToggle={() => void toggle(t)} onOpen={() => open(t)} />
        ))
      )}
      <button className="more" onClick={() => nav('/m/todo')}>Xem tất cả · lịch sắp tới</button>
    </div>
  )
}

/* ---------- màn hình đầy đủ ---------- */
/** Việc do module đăng ký mang id tiền định `seed:<module>:<tên>` */
const isSeeded = (t: Task) => t.id.startsWith('seed:')

function TodoScreen() {
  const nav = useNavigate()
  const data = useTodayTasks()
  const streak = useStreak()
  const allTasks = useLiveQuery(() => db.tasks.toArray(), []) ?? []
  const [adding, setAdding] = useState(false)

  if (!data) return <div className="empty">Đang tải…</div>
  const { due, doneIds, today } = data
  const doneCount = due.filter((t) => doneIds.has(t.id)).length
  const next = upcoming(allTasks)

  const toggle = (t: Task) => toggleTask(t.id, !doneIds.has(t.id), today)
  const open = (t: Task) =>
    t.linkedModule && !doneIds.has(t.id) ? nav(`/m/${t.linkedModule}?add=1`) : toggle(t)

  return (
    <>
      <TopBar />
      <div className="scroll">
        <div className="hero" style={{ paddingBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 11 }}>Hôm nay</div>
          <div className="big num">
            {doneCount}
            <span style={{ fontSize: 26, color: 'var(--ink-3)' }}>/{due.length}</span>
          </div>
          <div className="sub">
            việc đã xong{streak ? <> · chuỗi <span className="num" style={{ color: 'var(--good)' }}>{streak}</span> ngày liên tiếp</> : null}
          </div>
        </div>

        <div className="rule" />
        <div className="sec"><span className="eyebrow">Hôm nay</span></div>
        <div className="pad todo-list">
          {due.length === 0 && <div className="empty">Hôm nay không có việc nào</div>}
          {due.map((t) => (
            <TaskRow key={t.id} task={t} done={doneIds.has(t.id)} showRule
                     onToggle={() => void toggle(t)} onOpen={() => open(t)}
                     onArchive={isSeeded(t) ? undefined : () => void archiveTask(t.id)} />
          ))}
        </div>

        {next.length > 0 && (
          <>
            <div className="rule" style={{ marginTop: 18 }} />
            <div className="sec"><span className="eyebrow">Sắp tới</span></div>
            <div className="pad todo-list">
              {next.map((t) => (
                <div key={t.id} className="trow">
                  <span className="cb" />
                  <span className="lb">{t.title}</span>
                  <span className="rp">{ruleLabel(t)}</span>
                  <span className="tm">{relativeDay(t.dueDate!).toUpperCase()}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="block" style={{ paddingTop: 20 }}>
          <button className="qbtn solid" style={{ width: '100%' }} onClick={() => setAdding(true)}>
            + Thêm việc
          </button>
          <p style={{ fontSize: 10.5, color: 'var(--ink-4)', lineHeight: 1.65, textAlign: 'center', marginTop: 14 }}>
            Việc có mũi tên là do module khác đăng ký: bấm <b>chữ</b> để mở form nhập,
            bấm <b>vòng tròn</b> để đánh dấu xong mà không cần nhập số
          </p>
        </div>
      </div>
      {adding && <AddSheet onDone={() => setAdding(false)} />}
    </>
  )
}

register({
  id: 'todo',
  name: 'Việc cần làm',
  kind: 'tracker',
  wide: true,
  Screen: TodoScreen,
  Widget: TodoWidget,
})
