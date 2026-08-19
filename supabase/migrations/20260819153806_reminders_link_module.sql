-- Thêm `linked_module` vào kết quả để thông báo mở thẳng form nhập của module
-- đó thay vì chỉ mở trang chính. Kiểu trả về đổi nên phải drop trước.
drop function if exists public.due_reminders(timestamptz);
drop function if exists public.due_tasks(timestamptz);

create or replace function public.due_tasks(at_time timestamptz default now())
returns table (
  uid         uuid,
  tid         text,
  task_title  text,
  for_date    date,
  due_at      text,
  link_module text
)
language sql
stable
as $fn$
  with u as (
    select p.user_id, (at_time at time zone p.timezone) as local_now
    from public.profiles p
  )
  select u.user_id, t.id, t.title, u.local_now::date, t.time_of_day, t.linked_module
  from u
  join public.tasks t on t.user_id = u.user_id
  where t.remind
    and t.archived_at is null
    and t.time_of_day is not null
    -- bản sao SQL của occursOn() trong src/modules/todo/rules.ts — sửa một bên
    -- là phải sửa bên kia
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
    and (u.local_now - (u.local_now::date + t.time_of_day::time))
        between interval '0' and interval '180 minutes'
    and not exists (
      select 1 from public.completions c
      where c.user_id = t.user_id and c.task_id = t.id
        and c.local_date = u.local_now::date and c.deleted_at is null)
    and not exists (
      select 1 from public.reminders_sent r
      where r.user_id = t.user_id and r.task_id = t.id
        and r.local_date = u.local_now::date)
$fn$;

create or replace function public.due_reminders(at_time timestamptz default now())
returns table (
  uid          uuid,
  tid          text,
  task_title   text,
  for_date     date,
  due_at       text,
  link_module  text,
  sub_endpoint text,
  sub_p256dh   text,
  sub_auth     text
)
language sql
stable
as $fn$
  select d.uid, d.tid, d.task_title, d.for_date, d.due_at, d.link_module,
         s.endpoint, s.p256dh, s.auth
  from public.due_tasks(at_time) d
  join public.push_subscriptions s on s.user_id = d.uid
$fn$;

revoke all on function public.due_tasks(timestamptz) from anon, authenticated;
revoke all on function public.due_reminders(timestamptz) from anon, authenticated;
