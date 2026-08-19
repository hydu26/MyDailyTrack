-- ═════════════════════════════════════════════════════════════════════════════
--  Giai đoạn 3 — bảng đồng bộ + RLS
--
--  Các bảng ở đây phản chiếu Dexie trên máy (src/db/index.ts). Đồng bộ theo
--  last-write-wins trên `updated_at` của TỪNG DÒNG.
--
--  CỐ Ý KHÔNG có trigger tự đặt `updated_at`. Client là nguồn sự thật của mốc
--  đó; nếu trigger ghi đè thì server luôn thắng và LWW hết ý nghĩa — máy offline
--  ba ngày rồi đồng bộ sẽ bị coi là "mới hơn" bản đã sửa trên máy khác.
--
--  `local_date` là kiểu `date` — Postgres `date` KHÔNG có ngữ nghĩa múi giờ nên
--  không thể tự trôi. Nhưng đừng bao giờ `local_date::timestamptz`: cast là lúc
--  duy nhất nó lệch được, đúng cái bẫy ở quy tắc 1 trong CLAUDE.md.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── profiles ────────────────────────────────────────────────────────────────
-- Múi giờ nơi người dùng ĐANG Ở. Client upsert lại mỗi lần mở app, vì cron nhắc
-- phải theo giờ nơi người dùng đang ở, không phải nơi đã tạo tài khoản.
create table public.profiles (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  timezone   text        not null default 'UTC',
  updated_at timestamptz not null default now()
);

-- ─── entries ─────────────────────────────────────────────────────────────────
-- Một bảng dùng chung cho mọi module tracker, phân biệt bằng `module` + `value`
-- (discriminated union ở src/db/types.ts).
create table public.entries (
  id          uuid        not null,
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  module      text        not null,
  measured_at timestamptz not null,           -- thời điểm tuyệt đối
  local_date  date        not null,           -- ngày theo lịch lúc ghi, không bao giờ tính lại
  local_tz    text        not null,
  note        text,
  value       jsonb       not null,
  created_at  timestamptz not null,
  updated_at  timestamptz not null,
  deleted_at  timestamptz,                    -- xoá mềm, bắt buộc cho đồng bộ
  primary key (user_id, id)
);

-- ─── tasks ───────────────────────────────────────────────────────────────────
-- `id` là TEXT, không phải uuid: việc do module tự đăng ký mang id tiền định
-- kiểu 'seed:bp:daily' (xem seedModuleTasks). Khoá chính gộp cả user_id để id
-- tiền định của người này không chặn người khác.
create table public.tasks (
  id           text        not null,
  user_id      uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  title        text        not null,
  kind         text        not null check (kind in ('once', 'daily', 'weekly', 'interval')),
  days         smallint[],                    -- weekly: 0=CN .. 6=T7
  every_n_days integer,                       -- interval
  due_date     date,                          -- once | interval
  time_of_day  text,                          -- 'HH:MM'
  remind       boolean     not null default false,
  linked_module text,
  sort_order   integer     not null default 0,
  created_at   timestamptz not null,
  updated_at   timestamptz not null,
  archived_at  timestamptz,
  primary key (user_id, id)
);

-- ─── completions ─────────────────────────────────────────────────────────────
-- Chỉ ghi khi ĐÃ hoàn thành; chuỗi ngày liên tiếp suy ra từ bảng này.
--
-- `deleted_at` ở đây là thứ bảng local ĐANG THIẾU: bỏ tick hiện là xoá cứng
-- (db.completions.delete), mà xoá cứng thì không truyền được qua LWW — máy kia
-- sẽ đẩy lại dòng cũ và việc tự tick lại. Dexie phải lên version 2 có thêm
-- updated_at + deleted_at trước khi bật đồng bộ.
create table public.completions (
  user_id      uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  task_id      text        not null,
  local_date   date        not null,
  completed_at timestamptz not null,
  updated_at   timestamptz not null,
  deleted_at   timestamptz,
  primary key (user_id, task_id, local_date),
  -- Ràng buộc này buộc thứ tự đẩy: tasks trước, completions sau.
  foreign key (user_id, task_id) references public.tasks (user_id, id) on delete cascade
);

-- ─── settings ────────────────────────────────────────────────────────────────
create table public.settings (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  key        text        not null,            -- 'weight.goalKg', 'weight.startKg', ...
  value      jsonb,
  updated_at timestamptz not null,
  primary key (user_id, key)
);

-- ─── push_subscriptions ──────────────────────────────────────────────────────
-- Một dòng cho mỗi thiết bị đã cho phép nhận thông báo. `endpoint` là danh tính
-- do trình duyệt cấp, unique toàn cục.
create table public.push_subscriptions (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint     text        not null unique,
  p256dh       text        not null,
  auth         text        not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- ─── chỉ mục ─────────────────────────────────────────────────────────────────
-- (user_id, updated_at): truy vấn "có gì đổi từ lần đồng bộ trước" của mọi bảng.
create index entries_sync_idx     on public.entries     (user_id, updated_at);
create index tasks_sync_idx       on public.tasks       (user_id, updated_at);
create index completions_sync_idx on public.completions (user_id, updated_at);
create index settings_sync_idx    on public.settings    (user_id, updated_at);

-- Truy vấn "bản ghi của module X trong ngày Y", giống chỉ mục [module+localDate]
-- ở Dexie.
create index entries_module_date_idx on public.entries (user_id, module, local_date);

-- Cron nhắc: tìm người cần nhắc và thiết bị của họ.
create index push_user_idx on public.push_subscriptions (user_id);

-- ═════ RLS ═══════════════════════════════════════════════════════════════════
--  Khoá publishable nằm sẵn trong bundle JS, ai cũng đọc được. RLS là thứ DUY
--  NHẤT chặn người khác đọc dữ liệu này — không phải tuỳ chọn.
--
--  `(select auth.uid())` chứ không phải `auth.uid()`: dạng subselect được lượng
--  giá một lần cho cả truy vấn thay vì một lần mỗi dòng.
-- ═════════════════════════════════════════════════════════════════════════════
alter table public.profiles            enable row level security;
alter table public.entries             enable row level security;
alter table public.tasks               enable row level security;
alter table public.completions         enable row level security;
alter table public.settings            enable row level security;
alter table public.push_subscriptions  enable row level security;

create policy "chi_dong_cua_minh" on public.profiles
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "chi_dong_cua_minh" on public.entries
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "chi_dong_cua_minh" on public.tasks
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "chi_dong_cua_minh" on public.completions
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "chi_dong_cua_minh" on public.settings
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "chi_dong_cua_minh" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Phòng tuyến thứ hai: rút quyền của `anon`. App luôn đăng nhập trước khi đọc
-- ghi, nên anon không cần gì cả — có thế thì một lỗi ở RLS cũng không làm dữ
-- liệu lộ ra cho người chưa đăng nhập.
revoke all on public.profiles           from anon;
revoke all on public.entries            from anon;
revoke all on public.tasks              from anon;
revoke all on public.completions        from anon;
revoke all on public.settings           from anon;
revoke all on public.push_subscriptions from anon;
