-- =============================================================================
--  Nhắc nhở qua Web Push — bảng chống nhắc trùng + truy vấn "ai cần nhắc lúc này"
--
--  CẢNH BÁO: LỊCH LẶP BỊ VIẾT HAI LẦN. `due_tasks()` dưới đây là bản sao SQL của
--  `occursOn()` trong src/modules/todo/rules.ts. Không tránh được: client phải
--  chạy offline nên không gọi được server, còn cron thì chạy khi không có client
--  nào đang mở. SỬA MỘT BÊN LÀ PHẢI SỬA BÊN KIA.
-- =============================================================================

-- Một dòng cho mỗi (việc, ngày) đã nhắc. Không có nó thì cron chạy 5 phút một
-- lần sẽ nhắc lại 5 phút một lần cho tới khi người dùng tick xong.
create table public.reminders_sent (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  task_id    text        not null,
  local_date date        not null,
  sent_at    timestamptz not null default now(),
  primary key (user_id, task_id, local_date)
);

alter table public.reminders_sent enable row level security;

create policy "chi_dong_cua_minh" on public.reminders_sent
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.reminders_sent from anon;

-- --- việc nào đang cần nhắc -------------------------------------------------
--  Tên cột trả về cố tình KHÁC tên cột trong bảng: với `language sql` và
--  `returns table`, tên cột trả về thành biến, trùng tên là Postgres báo
--  ambiguous.
--
--  `at_time` là tham số để test được; gọi thật thì để mặc định now().
create or replace function public.due_tasks(at_time timestamptz default now())
returns table (
  uid        uuid,
  tid        text,
  task_title text,
  for_date   date,
  due_at     text
)
language sql
stable
as $fn$
  with u as (
    -- Giờ theo múi giờ NƠI NGƯỜI DÙNG ĐANG Ở. Đây là tính "hôm nay là ngày nào
    -- ở chỗ họ", không phải dựng lại localDate đã lưu — hai việc khác nhau.
    select p.user_id, (at_time at time zone p.timezone) as local_now
    from public.profiles p
  )
  select u.user_id, t.id, t.title, u.local_now::date, t.time_of_day
  from u
  join public.tasks t on t.user_id = u.user_id
  where t.remind
    and t.archived_at is null
    and t.time_of_day is not null
    -- bản sao SQL của occursOn() — xem cảnh báo ở đầu file
    and case t.kind
          when 'daily'  then true
          when 'weekly' then extract(dow from u.local_now::date)::int
                             = any (coalesce(t.days, '{}'::smallint[])::int[])
          when 'once'   then t.due_date = u.local_now::date
          when 'interval' then t.due_date is not null
                             and t.every_n_days is not null
                             and u.local_now::date >= t.due_date
                             and ((u.local_now::date - t.due_date) % t.every_n_days) = 0
          else false
        end
    -- Đã tới giờ, nhưng chưa trôi quá 3 tiếng. Trừ trên timestamp chứ không
    -- trên time: `time '23:00' + interval '180 min'` vòng về 02:00 và việc đặt
    -- giờ khuya sẽ không bao giờ được nhắc.
    and (u.local_now - (u.local_now::date + t.time_of_day::time))
        between interval '0' and interval '180 minutes'
    -- đã làm xong hôm nay thì thôi (nhớ lọc xoá mềm)
    and not exists (
      select 1 from public.completions c
      where c.user_id = t.user_id and c.task_id = t.id
        and c.local_date = u.local_now::date and c.deleted_at is null)
    -- đã nhắc hôm nay thì thôi
    and not exists (
      select 1 from public.reminders_sent r
      where r.user_id = t.user_id and r.task_id = t.id
        and r.local_date = u.local_now::date)
$fn$;

-- --- ghép thêm thiết bị để gửi ----------------------------------------------
create or replace function public.due_reminders(at_time timestamptz default now())
returns table (
  uid          uuid,
  tid          text,
  task_title   text,
  for_date     date,
  due_at       text,
  sub_endpoint text,
  sub_p256dh   text,
  sub_auth     text
)
language sql
stable
as $fn$
  select d.uid, d.tid, d.task_title, d.for_date, d.due_at, s.endpoint, s.p256dh, s.auth
  from public.due_tasks(at_time) d
  join public.push_subscriptions s on s.user_id = d.uid
$fn$;

-- Chỉ service_role (Edge Function) được gọi. Client không có việc gì ở đây.
revoke all on function public.due_tasks(timestamptz) from anon, authenticated;
revoke all on function public.due_reminders(timestamptz) from anon, authenticated;
