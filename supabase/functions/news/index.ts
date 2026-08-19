import { XMLParser } from 'npm:fast-xml-parser@4.5.0'

/** Đọc RSS/Atom rồi trả JSON gọn cho client.
 *
 *  Phải qua Edge Function vì feed RSS không gửi header CORS — khác AniList.
 *
 *  Danh sách nguồn nằm Ở ĐÂY, không nhận từ client: nhận URL từ client là biến
 *  hàm này thành proxy mở cho bất kỳ ai tải bất kỳ trang nào. Đổi nguồn thì sửa
 *  FEEDS rồi deploy lại.
 */
/** MỘT feed = MỘT nguồn + MỘT chủ đề.
 *
 *  Phải dùng feed riêng theo chủ đề: RSS tổng hợp ("tin mới nhất") không mang
 *  thông tin chủ đề nào, nên không lọc theo chủ đề được. Đổi lại mỗi bài đều có
 *  chủ đề thật do nguồn tự phân, không phải do mình đoán.
 */
interface Feed {
  source: string
  topic: string
  url: string
  /** Lệch phút so với UTC, dùng KHI chuỗi ngày không mang múi giờ.
   *  Tuổi Trẻ trả "8/20/2026 12:20:00 AM" — không có múi giờ, mà giờ thật là
   *  giờ Việt Nam; parse thẳng trong môi trường UTC là lệch 7 tiếng. */
  tzOffset?: number
}

const FEEDS: Feed[] = [
  // ── Thế giới ──
  { source: 'VnExpress', topic: 'Thế giới', url: 'https://vnexpress.net/rss/the-gioi.rss', tzOffset: 420 },
  { source: 'Tuổi Trẻ', topic: 'Thế giới', url: 'https://tuoitre.vn/rss/the-gioi.rss', tzOffset: 420 },
  { source: 'Le Monde', topic: 'Thế giới', url: 'https://www.lemonde.fr/international/rss_full.xml' },
  // ── Kinh doanh ──
  { source: 'VnExpress', topic: 'Kinh doanh', url: 'https://vnexpress.net/rss/kinh-doanh.rss', tzOffset: 420 },
  { source: 'Tuổi Trẻ', topic: 'Kinh doanh', url: 'https://tuoitre.vn/rss/kinh-doanh.rss', tzOffset: 420 },
  { source: 'Le Monde', topic: 'Kinh doanh', url: 'https://www.lemonde.fr/economie/rss_full.xml' },
  // ── Công nghệ ──
  { source: 'VnExpress', topic: 'Công nghệ', url: 'https://vnexpress.net/rss/so-hoa.rss', tzOffset: 420 },
  { source: 'Ars Technica', topic: 'Công nghệ', url: 'https://feeds.arstechnica.com/arstechnica/index' },
  { source: 'The Verge', topic: 'Công nghệ', url: 'https://www.theverge.com/rss/index.xml' },
  { source: 'Le Monde', topic: 'Công nghệ', url: 'https://www.lemonde.fr/pixels/rss_full.xml' },
  // ── Sức khoẻ ──
  { source: 'VnExpress', topic: 'Sức khoẻ', url: 'https://vnexpress.net/rss/suc-khoe.rss', tzOffset: 420 },
  { source: 'Tuổi Trẻ', topic: 'Sức khoẻ', url: 'https://tuoitre.vn/rss/suc-khoe.rss', tzOffset: 420 },
  // ── Thể thao ──
  { source: 'VnExpress', topic: 'Thể thao', url: 'https://vnexpress.net/rss/the-thao.rss', tzOffset: 420 },
  { source: 'Tuổi Trẻ', topic: 'Thể thao', url: 'https://tuoitre.vn/rss/the-thao.rss', tzOffset: 420 },
  { source: 'Le Monde', topic: 'Thể thao', url: 'https://www.lemonde.fr/sport/rss_full.xml' },
  // ── Giải trí ──
  { source: 'VnExpress', topic: 'Giải trí', url: 'https://vnexpress.net/rss/giai-tri.rss', tzOffset: 420 },
  { source: 'Tuổi Trẻ', topic: 'Giải trí', url: 'https://tuoitre.vn/rss/giai-tri.rss', tzOffset: 420 },
  { source: 'Le Monde', topic: 'Giải trí', url: 'https://www.lemonde.fr/culture/rss_full.xml' },
  // ── Khoa học ──
  { source: 'VnExpress', topic: 'Khoa học', url: 'https://vnexpress.net/rss/khoa-hoc.rss', tzOffset: 420 },
  { source: 'Tuổi Trẻ', topic: 'Khoa học', url: 'https://tuoitre.vn/rss/khoa-hoc.rss', tzOffset: 420 },
  { source: 'Le Monde', topic: 'Khoa học', url: 'https://www.lemonde.fr/sciences/rss_full.xml' },
  // ── Giáo dục ──
  { source: 'VnExpress', topic: 'Giáo dục', url: 'https://vnexpress.net/rss/giao-duc.rss', tzOffset: 420 },
  { source: 'Tuổi Trẻ', topic: 'Giáo dục', url: 'https://tuoitre.vn/rss/giao-duc.rss', tzOffset: 420 },
  // ── Du lịch ──
  { source: 'VnExpress', topic: 'Du lịch', url: 'https://vnexpress.net/rss/du-lich.rss', tzOffset: 420 },
  { source: 'Tuổi Trẻ', topic: 'Du lịch', url: 'https://tuoitre.vn/rss/du-lich.rss', tzOffset: 420 },
  // ── Xe ──
  { source: 'VnExpress', topic: 'Xe', url: 'https://vnexpress.net/rss/oto-xe-may.rss', tzOffset: 420 },
  { source: 'Tuổi Trẻ', topic: 'Xe', url: 'https://tuoitre.vn/rss/xe.rss', tzOffset: 420 },
  // ── Pháp luật ──
  { source: 'VnExpress', topic: 'Pháp luật', url: 'https://vnexpress.net/rss/phap-luat.rss', tzOffset: 420 },
  { source: 'Tuổi Trẻ', topic: 'Pháp luật', url: 'https://tuoitre.vn/rss/phap-luat.rss', tzOffset: 420 },
]

/** Lấy bao nhiêu bài mỗi feed. Trộn hết mọi bài thì một nguồn đăng dày (VnExpress
 *  ra 60 bài mỗi lần) sẽ chiếm cả trang. */
const PER_FEED = 4
/** Phải >= số feed × PER_FEED, nếu không thì sắp theo ngày rồi cắt sẽ loại sạch
 *  các nguồn đăng thưa (Le Monde) và chủ đề của họ thành trống khi lọc. */
const TOTAL = 120

interface Item {
  title: string
  url: string
  image: string | null
  source: string
  topic: string
  publishedAt: string
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  textNodeName: '#text',
})

const arr = <T>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v])
const text = (v: unknown): string => {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'object' && '#text' in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>)['#text'] ?? '')
  }
  return String(v)
}

const clean = (s: string) =>
  s.replace(/<[^>]*>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) =>
      ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ' })[m] ?? m)
    .replace(/\s+/g, ' ')
    .trim()

/** Ảnh có thể nằm ở bốn chỗ khác nhau tuỳ nguồn — thử lần lượt */
function imageOf(item: Record<string, any>): string | null {
  for (const e of arr(item.enclosure)) {
    const type = String(e?.['@type'] ?? '')
    const url = e?.['@url']
    if (url && (!type || type.startsWith('image/'))) return String(url)
  }
  for (const key of ['media:content', 'media:thumbnail']) {
    for (const m of arr(item[key])) {
      if (m?.['@url']) return String(m['@url'])
    }
  }
  // Cuối cùng: <img> đầu tiên trong phần nội dung
  const body = [item.description, item.content, item['content:encoded'], item.summary]
    .map(text).join(' ')
  const m = body.match(/<img[^>]+src=["']([^"']+)["']/i)
  return m ? m[1] : null
}

function dateOf(item: Record<string, any>, feed: Feed): string {
  const raw = text(item.pubDate ?? item.published ?? item.updated ?? item['dc:date']).trim()
  if (!raw) return new Date().toISOString()

  const t = Date.parse(raw)
  if (Number.isNaN(t)) return new Date().toISOString()

  // Không có dấu hiệu múi giờ nào thì Date.parse coi là giờ máy chủ (UTC).
  // Bù lại theo lệch mà nguồn khai báo.
  const hasTz = /(Z|[+-]\d{2}:?\d{2}|GMT|UTC)\s*$/i.test(raw)
  if (!hasTz && feed.tzOffset) return new Date(t - feed.tzOffset * 60000).toISOString()
  return new Date(t).toISOString()
}

function linkOf(item: Record<string, any>): string {
  const l = item.link
  if (typeof l === 'string') return l
  // Atom: <link rel="alternate" href="…">
  for (const one of arr(l)) {
    if (typeof one === 'string') return one
    const rel = one?.['@rel']
    if (one?.['@href'] && (!rel || rel === 'alternate')) return String(one['@href'])
  }
  return text(item.id)
}

async function readFeed(feed: Feed): Promise<Item[]> {
  const res = await fetch(feed.url, {
    headers: { 'user-agent': 'MyDailyTrack/1.0 (personal reader)', accept: 'application/rss+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) throw new Error(`${feed.source} ${feed.topic}: HTTP ${res.status}`)
  const xml = await res.text()
  const doc = parser.parse(xml)

  const raw = [...arr(doc?.rss?.channel?.item), ...arr(doc?.feed?.entry), ...arr(doc?.['rdf:RDF']?.item)]

  return raw
    .map((it: Record<string, any>) => ({
      title: clean(text(it.title)),
      url: linkOf(it),
      image: imageOf(it),
      source: feed.source,
      topic: feed.topic,
      publishedAt: dateOf(it, feed),
    }))
    .filter((x) => x.title && x.url)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, PER_FEED)
}

Deno.serve(async () => {
  // allSettled: một nguồn chết không được làm mất cả trang
  const results = await Promise.allSettled(FEEDS.map(readFeed))

  const items: Item[] = []
  const failed: string[] = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') items.push(...r.value)
    else failed.push(`${FEEDS[i].source} ${FEEDS[i].topic}: ${r.reason?.message ?? 'lỗi'}`)
  })

  // Bỏ trùng theo URL rồi sắp mới nhất trước
  const seen = new Set<string>()
  const merged = items
    .filter((x) => !seen.has(x.url) && seen.add(x.url))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, TOTAL)

  // Danh sách chip lấy theo THỨ TỰ KHAI BÁO của FEEDS, không theo dữ liệu về:
  // thứ tự cố định thì chip không nhảy chỗ giữa hai lần tải.
  const topics = [...new Set(FEEDS.map((f) => f.topic))]
  const sources = [...new Set(FEEDS.map((f) => f.source))]

  return new Response(
    JSON.stringify({ items: merged, topics, sources, failed, fetchedAt: new Date().toISOString() }),
    {
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        // Cho phép cache ngắn ở biên: nhiều thiết bị mở cùng lúc không bắt các
        // báo phải chịu năm lượt tải giống nhau
        'cache-control': 'public, max-age=300',
      },
    },
  )
})
