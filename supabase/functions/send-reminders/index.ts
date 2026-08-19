import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

/** Gửi nhắc nhở qua Web Push.
 *
 *  Được pg_cron gọi định kỳ. Toàn bộ phần "ai cần nhắc lúc này" nằm trong
 *  `public.due_reminders()` phía database — hàm này chỉ gửi và ghi lại.
 *
 *  `verify_jwt = false` trong config.toml, thay vào đó tự kiểm header
 *  `x-cron-secret`: cron gọi bằng pg_net nên không có JWT của người dùng nào.
 */
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT')!,
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

interface DueRow {
  uid: string
  tid: string
  task_title: string
  for_date: string
  due_at: string
  link_module: string | null
  sub_endpoint: string
  sub_p256dh: string
  sub_auth: string
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return json({ error: 'không được phép' }, 401)
  }

  const url = new URL(req.url)
  // dry=1: xem sẽ gửi cho ai mà không gửi thật, cũng không ghi reminders_sent
  const dry = url.searchParams.get('dry') === '1'
  // at=<ISO>: giả lập thời điểm, để test cửa sổ giờ
  const at = url.searchParams.get('at')

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  // test=1: gửi thẳng một thông báo thử tới mọi thiết bị, KHÔNG qua
  // due_reminders và KHÔNG ghi reminders_sent. Để kiểm tra riêng đường gửi khi
  // cần chẩn đoán — hữu ích vì mọi thứ khác đều có thể đúng mà vẫn không nhận
  // được thông báo.
  if (url.searchParams.get('test') === '1') {
    const { data: subs, error: e2 } = await db
      .from('push_subscriptions')
      .select('endpoint,p256dh,auth')
    if (e2) return json({ error: e2.message }, 500)

    const okList: string[] = []
    const errList: { endpoint: string; status?: number; message: string }[] = []
    for (const sub of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({
            title: 'Thử thông báo',
            body: 'Nếu thấy dòng này thì Web Push đã chạy.',
            tag: 'test',
            url: '/',
          }),
          { TTL: 600 },
        )
        okList.push(sub.endpoint.slice(0, 40) + '…')
      } catch (e) {
        errList.push({
          endpoint: sub.endpoint.slice(0, 40) + '…',
          status: (e as { statusCode?: number }).statusCode,
          message: e instanceof Error ? e.message : String(e),
        })
      }
    }
    return json({ test: true, devices: subs?.length ?? 0, sent: okList, failed: errList })
  }

  const { data, error } = await db.rpc('due_reminders', at ? { at_time: at } : {})
  if (error) return json({ error: error.message }, 500)

  const rows = (data ?? []) as DueRow[]
  if (dry) {
    return json({
      dry: true,
      at: at ?? 'now',
      count: rows.length,
      rows: rows.map((r) => ({ tid: r.tid, due_at: r.due_at, endpoint: r.sub_endpoint.slice(0, 40) + '…' })),
    })
  }

  const sent: string[] = []
  const failed: { tid: string; status?: number; message: string }[] = []
  // Một thiết bị chết thì xoá khỏi sổ, không để nó làm mọi lượt cron sau đều lỗi
  const dead = new Set<string>()

  for (const r of rows) {
    const payload = JSON.stringify({
      title: r.task_title,
      body: `Đến giờ · ${r.due_at}`,
      // tag theo id việc: nhắc lần sau của CÙNG việc thay thế thông báo cũ,
      // nhưng hai việc khác nhau vẫn là hai thông báo riêng
      tag: r.tid,
      url: r.link_module ? `/m/${r.link_module}?add=1` : '/m/todo',
    })

    try {
      await webpush.sendNotification(
        { endpoint: r.sub_endpoint, keys: { p256dh: r.sub_p256dh, auth: r.sub_auth } },
        payload,
        { TTL: 3600 },
      )
      sent.push(r.tid)
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      // 404/410 = trình duyệt đã bỏ đăng ký này. Xoá luôn.
      if (status === 404 || status === 410) dead.add(r.sub_endpoint)
      failed.push({ tid: r.tid, status, message: e instanceof Error ? e.message : String(e) })
    }
  }

  if (dead.size) {
    await db.from('push_subscriptions').delete().in('endpoint', [...dead])
  }

  // Ghi "đã nhắc" MỘT dòng cho mỗi (việc, ngày), kể cả khi người dùng có nhiều
  // thiết bị. Chỉ ghi cho việc đã gửi được ít nhất một nơi — gửi trượt hết thì
  // để lượt cron sau thử lại.
  const ok = rows.filter((r) => sent.includes(r.tid))
  const marks = [...new Map(ok.map((r) => [`${r.uid}|${r.tid}|${r.for_date}`, {
    user_id: r.uid, task_id: r.tid, local_date: r.for_date,
  }])).values()]
  if (marks.length) {
    await db.from('reminders_sent').upsert(marks, {
      onConflict: 'user_id,task_id,local_date',
      ignoreDuplicates: true,
    })
  }

  return json({ candidates: rows.length, sent: sent.length, marked: marks.length, dead: dead.size, failed })
})
