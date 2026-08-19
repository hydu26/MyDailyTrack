-- =============================================================================
--  Cron gọi Edge Function send-reminders
--
--  Chạy 5 phút một lần. Cron KHÔNG biết giờ của người dùng — nó chỉ đánh thức
--  hàm; việc "ai tới giờ" do `due_tasks()` tính theo `profiles.timezone`. Nhờ
--  vậy chủ máy bay từ Pháp về Việt Nam là lịch nhắc tự đổi theo, không phải
--  sửa cron.
--
--  Secret nằm trong Vault, không viết thẳng vào job: `cron.job` là bảng đọc
--  được, nhét secret vào đó là để lộ.
-- =============================================================================
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Gọi lại được nhiều lần: bỏ job cũ trước khi đặt lại.
select cron.unschedule('send-reminders') 
where exists (select 1 from cron.job where jobname = 'send-reminders');

select cron.schedule(
  'send-reminders',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := 'https://fqgbjykggtaiiwkmslfd.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $job$
);
