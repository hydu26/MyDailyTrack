# Sổ cá nhân

App cá nhân dạng launcher, chạy trên điện thoại và máy tính. Giai đoạn 1: chạy
hoàn toàn trên máy, không cần tài khoản, không cần server.

## Chạy

```bash
npm install
npm run dev      # mở http://localhost:5173
```

Trên điện thoại: chạy `npm run dev`, mở địa chỉ mạng nội bộ mà Vite in ra,
rồi "Thêm vào màn hình chính".

```bash
npm run build && npm run preview   # kiểm tra bản production + PWA
```

## Kiến trúc

### Bản đăng ký module (`src/modules/registry.ts`)

Mỗi mục trên trang chính là một module tự khai báo. Thêm module mới =
tạo một thư mục, gọi `register()`, thêm một dòng import trong `App.tsx`.
Không đụng vào code cũ.

```ts
register({
  id: 'weight',
  name: 'Cân nặng',
  kind: 'tracker',        // tracker | feed | hybrid
  Screen,                  // màn hình đầy đủ
  Widget,                  // ô trên trang chính
  QuickAdd,                // form ghi nhanh
  seedTasks: [...],        // việc tự đăng ký vào todo
})
```

Thứ tự import trong `App.tsx` chính là thứ tự hiển thị trên trang chính.

### Một hệ thống nhắc nhở duy nhất

Module sức khoẻ **không** có nhắc nhở riêng. Chúng khai báo `seedTasks`, và
việc đó xuất hiện trong danh sách todo. Tick vào việc có `linkedModule` sẽ
mở thẳng form nhập; nhập xong thì `completeLinked()` tự tick.

Nếu làm hai hệ thống song song, bạn sẽ bị báo trùng và tắt hết thông báo.

### Hai loại thời gian

| | Dùng cho | Lưu thế nào |
|---|---|---|
| `measuredAt` | Thời điểm tuyệt đối (đo lúc mấy giờ) | ISO UTC |
| `localDate` | Ngày theo lịch (cân nặng ngày 18/8) | `YYYY-MM-DD`, **không bao giờ tính lại** |

Biểu đồ, "một bản ghi mỗi ngày", chuỗi ngày liên tiếp, trung bình 7 ngày —
tất cả dùng `localDate`.

Lý do: cân lúc 6h sáng 18/8 ở Việt Nam = 23:00 ngày 17/8 UTC. Mở app ở Pháp
mà format từ UTC thì bản ghi nhảy về hôm trước. Luôn lấy hôm nay qua
`localDateOf()` trong `src/lib/time.ts`, không dùng `toISOString().slice(0,10)`.

### Việc lặp lại: lưu quy tắc, không lưu từng lần

`tasks` giữ quy tắc (`daily` / `weekly` / `interval` / `once`).
`completions` chỉ ghi khi đã hoàn thành.
Các lần xuất hiện sinh tại chỗ trong `rules.ts`.

8 quy tắc thay cho ~1.300 dòng nếu tạo sẵn cho một năm. Đổi giờ nhắc =
sửa một dòng.

### State

`useLiveQuery` của Dexie là state manager. Dữ liệu trong IndexedDB đổi thì
UI tự vẽ lại, kể cả khi đổi từ tab khác. Không có Redux/Zustand.

## Cấu trúc

```
src/
├── db/            schema Dexie + kiểu dữ liệu
├── lib/           time.ts (ngày & múi giờ), stats.ts (EMA, hồi quy)
├── components/    Launcher, biểu đồ SVG, UI dùng chung
└── modules/
    ├── registry.ts
    ├── todo/      quy tắc lặp + màn hình
    ├── weight/
    ├── bp/        levels.ts = thang 7 mức, ngưỡng tại nhà
    ├── exercise/
    └── news/      đọc từ Edge Function, RSS không có CORS
```

## Các bước tiếp theo

- **Giai đoạn 3** — Supabase: đồng bộ nhiều thiết bị + Web Push.
  Lời nhắc **chưa chạy** ở giai đoạn 1: PWA không hẹn giờ thông báo được
  thuần client, cần đẩy từ server. Trên iOS chỉ nhận khi app đã cài vào
  màn hình chính.
Giai đoạn 4 xong: Thể dục, Tin tức (RSS qua Edge Function).

## Deploy (Vercel)

`vercel.json` đã cấu hình sẵn. Vercel tự nhận pnpm từ `pnpm-lock.yaml`.

**Ba biến phải đặt trong Vercel → Settings → Environment Variables** (cả
Production và Preview). Vite nhét chúng vào bundle **lúc build**, nên thiếu là app
build ra vẫn chạy nhưng không đồng bộ và không nhắc được, mà không báo lỗi gì:

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_VAPID_PUBLIC_KEY
```

Không đặt `VAPID_PRIVATE_KEY`, `CRON_SECRET` hay service_role key ở đây — chúng
thuộc về `supabase secrets set`, và đặt với tiền tố `VITE_` là đưa thẳng vào
bundle công khai.

**Sau lần deploy đầu, kiểm ba thứ:**

1. `curl -I https://<domain>/sw.js` → phải là `content-type: application/javascript`.
   Nếu ra `text/html` thì rewrite đã ăn mất service worker và PWA không chạy.
2. Mở `https://<domain>/m/bp` rồi **tải lại trang** → phải ra module huyết áp, không
   phải 404.
3. Đăng nhập ở chân trang → phải chuyển sang "Đã đồng bộ HH:MM".

**Rồi sửa `site_url`** trong Supabase → Authentication → URL Configuration từ
`http://localhost:3000` sang domain thật.

Không cần đặt `base` trong `vite.config.ts`: Vercel phục vụ ở gốc domain. (Chỉ
GitHub Pages mới cần, vì repo nằm ở đường con.)

## Ghi chú thiết kế

Dark mode duy nhất. Toàn bộ token trong `src/styles.css`.
Giao diện gần như đơn sắc — màu chỉ dùng ở thang huyết áp, vì ở đó màu là
dữ liệu. Không dùng bóng đổ, phân tách bằng viền 1px.
Mọi con số dùng `.num` (IBM Plex Mono, tabular figures) để chữ số không
nhảy ngang khi giá trị thay đổi.

Phông chữ: cài IBM Plex Sans + IBM Plex Mono, hoặc thêm link Google Fonts
vào `index.html`. Không có thì tự lùi về phông hệ thống.
