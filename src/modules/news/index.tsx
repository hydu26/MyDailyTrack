import { useEffect, useState } from 'react'

import { readCache, writeCache, cacheAge } from '../../db'
import { register } from '../registry'
import { TopBar } from '../../components/ui'
import { timeAgo, localDateOf, prettyDate } from '../../lib/time'

/** Đọc từ Edge Function, không đọc RSS trực tiếp: feed RSS không gửi header CORS
 *  nên trình duyệt chặn. Danh sách nguồn nằm trong hàm đó, sửa nguồn thì deploy
 *  lại hàm — cố ý, vì nhận URL từ client là biến hàm thành proxy mở. */
const FN = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/news`
  : null

const CACHE_KEY = 'news.items'
const STALE_MS = 15 * 60 * 1000

interface Item {
  title: string
  url: string
  image: string | null
  source: string
  topic: string
  publishedAt: string
}

interface Payload {
  items: Item[]
  /** Do hàm trả về theo thứ tự khai báo FEEDS, không suy từ dữ liệu — chip không
   *  nhảy chỗ giữa hai lần tải. */
  topics: string[]
  sources: string[]
  failed: string[]
  fetchedAt: string
}

/* ---------- tải + cache ---------- */

let inflight: Promise<Payload> | null = null

function fetchShared(): Promise<Payload> {
  if (inflight) return inflight
  inflight = (async () => {
    let res: Response
    try {
      res = await fetch(FN!, { headers: { accept: 'application/json' } })
    } catch {
      throw new Error('không có mạng')
    }
    if (!res.ok) throw new Error(`không tải được tin (HTTP ${res.status})`)
    return (await res.json()) as Payload
  })().finally(() => { inflight = null })
  return inflight
}

function useNews() {
  const [data, setData] = useState<Payload | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = async (force: boolean) => {
    if (!FN) { setErr('chưa cấu hình đồng bộ'); return }
    // Hiện dữ liệu cũ trước rồi mới tải: đọc tin không nên bắt đầu bằng màn trắng
    const cached = await readCache<Payload>(CACHE_KEY)
    if (cached) { setData(cached); setErr(null) }
    if (!force && (await cacheAge(CACHE_KEY)) < STALE_MS) return

    setLoading(true)
    try {
      const fresh = await fetchShared()
      await writeCache(CACHE_KEY, fresh)
      setData(fresh)
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load(false) }, [])
  return { data, err, loading, refresh: () => load(true) }
}

/* ---------- ảnh ---------- */

/** Ảnh bài báo là NỘI DUNG, không phải trang trí — đó là lý do module này được
 *  phá lệ "gần như đơn sắc" của quy tắc 4.
 *
 *  Ảnh nằm ở CDN của từng báo nên offline sẽ không tải được, và service worker
 *  cố ý không cache chúng (khác origin, lại nặng). Vỡ thì thay bằng khung trống
 *  chứ đừng để icon ảnh lỗi của trình duyệt hiện ra.
 */
function Thumb({ src, big }: { src: string | null; big?: boolean }) {
  const [bad, setBad] = useState(false)
  const cls = big ? 'lead-img' : 'thumb'
  if (!src || bad) return <div className={`${cls} ph`} aria-hidden />
  return (
    <img className={cls} src={src} alt="" loading="lazy" decoding="async"
         onError={() => setBad(true)} />
  )
}

const Meta = ({ it }: { it: Item }) => (
  <div className="nmeta">
    <span className="src">{it.source}</span>
    <span className="dot">·</span>
    <span>{it.topic}</span>
    <span className="dot">·</span>
    <span>{timeAgo(it.publishedAt)}</span>
  </div>
)

/** Một hàng chip lọc. "Tất cả" luôn là lựa chọn đầu — không có nó thì không có
 *  cách nào bỏ lọc.
 *
 *  `max`: rút gọn còn bấy nhiêu chip, phần còn lại ẩn sau nút mở rộng. Mười một
 *  chủ đề trải hết là ba dòng chip đè lên cả tin đầu tiên.
 */
function FilterRow({
  label, options, value, onPick, max,
}: {
  label: string
  options: string[]
  value: string | null
  onPick: (v: string | null) => void
  max?: number
}) {
  const [open, setOpen] = useState(false)
  const collapsible = max !== undefined && options.length > max

  // Mục ĐANG CHỌN phải luôn hiện, dù nằm ngoài phần rút gọn — nếu không thì
  // người dùng thấy danh sách bị lọc mà không thấy đang lọc theo gì.
  // Lọc theo chỉ số để giữ nguyên thứ tự khai báo, không đẩy mục chọn xuống cuối.
  const shown = !collapsible || open
    ? options
    : options.filter((o, i) => i < max! || o === value)

  return (
    <div className="filter">
      <div className="eyebrow">{label}</div>
      <div className="chips">
        <button className={`chip sm${value === null ? ' on' : ''}`} onClick={() => onPick(null)}>
          Tất cả
        </button>
        {shown.map((o) => (
          <button key={o} className={`chip sm${value === o ? ' on' : ''}`}
                  onClick={() => onPick(value === o ? null : o)}>
            {o}
          </button>
        ))}
        {collapsible && (
          <button className="chip sm ghost" onClick={() => setOpen(!open)}>
            {open ? 'Thu gọn' : `+ ${options.length - shown.length} nữa`}
          </button>
        )}
      </div>
    </div>
  )
}

/* ---------- ô trang chính ---------- */

/** Ô trang chính KHÔNG gọi mạng.
 *
 *  Trước đây ô này gọi useNews() nên mỗi lần mở app là tải 11 feed và ~27KB
 *  JSON, chỉ để xem trước hai bài. Tin tức là thứ chỉ cần khi người dùng chủ
 *  động mở — để nó tải lúc mở module.
 *
 *  Không hook, không đọc cache, không state: ô này là biển chỉ đường. Cả ô đã
 *  là một nút điều hướng do Launcher bọc sẵn (`wide` phải là false).
 */
function Widget() {
  const today = localDateOf()
  return (
    <>
      <div className="tile-top">
        <span className="tile-name">Tin tức</span>
        <svg className="tile-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 5h16v14H4z" /><path d="M7 9h6M7 12h6M7 15h4M16 9v6" />
        </svg>
      </div>
      <div className="val">
        <span className="v">{prettyDate(today).replace(' thg ', '/')}</span>
        <span className="u">TIN HÔM NAY</span>
      </div>
    </>
  )
}

/* ---------- màn hình đầy đủ ---------- */

function Screen() {
  const { data, err, loading, refresh } = useNews()
  // Hai chiều lọc độc lập, giao nhau. Giữ trong state của component: đây là
  // lựa chọn lúc đọc, không phải cài đặt cần nhớ qua các lần mở app.
  const [topic, setTopic] = useState<string | null>(null)
  const [source, setSource] = useState<string | null>(null)

  const all = data?.items ?? []
  const items = all.filter(
    (i) => (!topic || i.topic === topic) && (!source || i.source === source),
  )
  const [lead, ...rest] = items
  const filtering = topic !== null || source !== null

  return (
    <>
      <TopBar>
        <button className="back" style={{ marginLeft: 'auto' }} disabled={loading}
                onClick={() => void refresh()}>
          {loading ? 'Đang tải…' : 'Tải lại'}
        </button>
      </TopBar>
      <div className="scroll">
        {data && (
          <div className="pad" style={{ paddingTop: 4 }}>
            <FilterRow label="Chủ đề" options={data.topics} value={topic} onPick={setTopic} max={4} />
            <FilterRow label="Nguồn" options={data.sources} value={source} onPick={setSource} />
          </div>
        )}

        {err && (
          <div className="block" style={{ paddingBottom: 0 }}>
            <div className="errbox">
              {err}{items.length ? ' · đang hiện tin đã lưu' : ''}
            </div>
          </div>
        )}

        {!all.length && !err && <div className="empty">Đang tải tin…</div>}

        {!!all.length && !items.length && (
          <div className="empty">
            Không có bài nào khớp
            <div style={{ marginTop: 12 }}>
              <button className="chip sm" onClick={() => { setTopic(null); setSource(null) }}>
                Bỏ lọc
              </button>
            </div>
          </div>
        )}

        {lead && (
          <a className="lead" href={lead.url} target="_blank" rel="noreferrer">
            <Thumb src={lead.image} big />
            <div className="lead-txt">
              <div className="ttl">{lead.title}</div>
              <Meta it={lead} />
            </div>
          </a>
        )}

        <div className="pad">
          {rest.map((it) => (
            <a className="nrow" href={it.url} target="_blank" rel="noreferrer" key={it.url}>
              <div className="txt">
                <div className="ttl">{it.title}</div>
                <Meta it={it} />
              </div>
              <Thumb src={it.image} />
            </a>
          ))}
        </div>

        {data && (
          <div className="block">
            <p className="footnote">
              {data.failed.length > 0 && <>Không đọc được: {data.failed.join(' · ')}<br /></>}
              {filtering ? `${items.length}/${all.length} bài` : `${all.length} bài`}
              {' · cập nhật '}{timeAgo(data.fetchedAt)} · bấm tiêu đề để mở ở trình duyệt
            </p>
          </div>
        )}
      </div>
    </>
  )
}

register({
  id: 'news',
  name: 'Tin tức',
  // feed: dữ liệu ngoài, chỉ đọc, có cache. Không có state cá nhân nào.
  kind: 'feed',
  // wide: false — ô nửa hàng như mọi module khác, và Launcher tự bọc nút điều hướng
  Screen,
  Widget,
})
