import { useNavigate } from 'react-router-dom'
import type { Task } from '../../db/types'
import { register } from '../registry'
import { Check, Chevron, TopBar } from '../../components/ui'
import { useTodayTasks, useStreak, toggleTask } from './data'
import { upcoming, ruleLabel } from './rules'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import { relativeDay } from '../../lib/time'

/* ---------- một hàng việc ---------- */
function TaskRow({
  task, done, showRule, onToggle,
}: { task: Task; done: boolean; showRule?: boolean; onToggle: () => void }) {
  return (
    <button className={`trow${done ? ' on' : ''}`} onClick={onToggle}
            aria-pressed={done} aria-label={task.title}>
      <span className="cb"><Check /></span>
      <span className="lb">{task.title}</span>
      {showRule && <span className="rp">{ruleLabel(task)}</span>}
      {task.timeOfDay && <span className="tm">{task.timeOfDay}</span>}
      {task.linkedModule && <Chevron className="lk" />}
    </button>
  )
}

/* ---------- ô trên trang chính ---------- */
function TodoWidget() {
  const nav = useNavigate()
  const data = useTodayTasks()
  if (!data) return <div className="todo-tile" />

  const { due, doneIds, today } = data
  const left = due.filter((t) => !doneIds.has(t.id))

  const handle = (t: Task) => {
    // Việc do module khác đăng ký: mở thẳng form nhập thay vì gạch ngang.
    if (t.linkedModule && !doneIds.has(t.id)) nav(`/m/${t.linkedModule}?add=1`)
    else toggleTask(t.id, !doneIds.has(t.id), today)
  }

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
          <TaskRow key={t.id} task={t} done={false} onToggle={() => handle(t)} />
        ))
      )}
      <button className="more" onClick={() => nav('/m/todo')}>Xem tất cả · lịch sắp tới</button>
    </div>
  )
}

/* ---------- màn hình đầy đủ ---------- */
function TodoScreen() {
  const nav = useNavigate()
  const data = useTodayTasks()
  const streak = useStreak()
  const allTasks = useLiveQuery(() => db.tasks.toArray(), []) ?? []

  if (!data) return <div className="empty">Đang tải…</div>
  const { due, doneIds, today } = data
  const doneCount = due.filter((t) => doneIds.has(t.id)).length
  const next = upcoming(allTasks)

  const handle = (t: Task) => {
    if (t.linkedModule && !doneIds.has(t.id)) nav(`/m/${t.linkedModule}?add=1`)
    else toggleTask(t.id, !doneIds.has(t.id), today)
  }

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
            <TaskRow key={t.id} task={t} done={doneIds.has(t.id)} showRule onToggle={() => handle(t)} />
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

        <div className="block" style={{ paddingTop: 22 }}>
          <p style={{ fontSize: 10.5, color: 'var(--ink-4)', lineHeight: 1.65, textAlign: 'center' }}>
            Việc có mũi tên là do module khác đăng ký —<br />tick vào sẽ mở thẳng form nhập
          </p>
        </div>
      </div>
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
