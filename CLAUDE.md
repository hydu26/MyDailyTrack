# MyDailyTrack

App cá nhân dạng launcher, chạy trên điện thoại và máy tính (PWA). Theo dõi sức
khoẻ và việc cần làm hằng ngày. Một người dùng duy nhất — chủ dự án.

Trả lời bằng **tiếng Việt**.

## Lệnh

```bash
npm run dev      # phát triển
npm run build    # tsc --noEmit && vite build — PHẢI chạy sạch trước khi coi là xong
npm run preview  # kiểm tra bản production + PWA
```

## Quy tắc bất di bất dịch

Những điều dưới đây đã được cân nhắc kỹ. **Đừng đảo ngược mà không hỏi.**

### 1. Ngày theo lịch ≠ thời điểm tuyệt đối

Chủ dự án sống ở Pháp, dữ liệu bắt đầu từ Việt Nam. Có hai loại thời gian:

| Trường | Nghĩa | Dùng cho |
|---|---|---|
| `measuredAt` | ISO UTC, thời điểm tuyệt đối | "đo lúc mấy giờ" |
| `localDate` | `YYYY-MM-DD` lúc ghi, **không bao giờ tính lại** | biểu đồ, gộp theo ngày, chuỗi ngày, trung bình 7 ngày |

- Lấy hôm nay **chỉ** qua `localDateOf()` trong `src/lib/time.ts`.
- **CẤM** `new Date().toISOString().slice(0, 10)` — nó trả ngày UTC. Ở Paris
  lúc 01:00 ngày 18/8, UTC vẫn là 17/8, và bản ghi nhảy sai ngày.
- Giờ phát anime (module tương lai) thì ngược lại: dùng timestamp tuyệt đối,
  format lúc hiển thị. Pháp có giờ mùa hè, Nhật không — chênh lệch đổi giữa
  7 và 8 tiếng hai lần mỗi năm.

**Đóng dấu thời gian.** Mặc định là tự động lúc lưu (`stampNow()`), nhưng mọi
form nhập đều cho chọn ngày + giờ để **ghi bù** buổi đo hôm trước chưa nhập —
dùng `WhenField` và `whenToStamp()`, đừng tự ghép hai trường này ở module.

- `localDate` lấy **nguyên văn** chuỗi trong `<input type="date">`. **CẤM** đọc
  lại từ đối tượng `Date` vừa dựng: chọn 19/8 rồi ghi bù lúc 00:30 thì UTC đã
  là 18/8, suy lại là nhảy sai một ngày.
- Ghi bù thì `completeLinked()` phải tick vào **ngày đo**, không phải hôm nay —
  chuỗi ngày liên tiếp mới tính đúng.
- Không cho chọn ngày tương lai (`max` = hôm nay). Ô ngày/giờ trắng thì **chặn
  nút Lưu**, thà không lưu còn hơn lưu sai ngày.
- Giờ nhập được hiểu theo múi giờ máy đang dùng, nên `localTz` là múi giờ hiện
  tại — ghi bù ở Pháp thì "07:00" nghĩa là 07:00 giờ Paris.

### 2. Chỉ có MỘT hệ thống nhắc nhở

Module sức khoẻ **không** được có nhắc nhở riêng. Chúng khai báo `seedTasks`
trong `register()`, việc đó xuất hiện trong danh sách todo.

- Việc có `linkedModule` → tick vào mở form nhập, không gạch ngang chữ.
- Nhập xong gọi `completeLinked(moduleId)` để tự tick.
- Làm hai hệ thống song song sẽ gây báo trùng và người dùng tắt hết thông báo.

### 3. Việc lặp lại: lưu quy tắc, không lưu từng lần

- `tasks` giữ quy tắc: `daily` | `weekly` | `interval` | `once`.
- `completions` chỉ ghi khi **đã** hoàn thành.
- Các lần xuất hiện sinh tại chỗ trong `src/modules/todo/rules.ts`.
- **CẤM** tạo sẵn dòng cho tương lai. 8 quy tắc thay cho ~1.300 dòng/năm.
- Chuỗi ngày suy ra từ `completions`, không lưu riêng. Hôm nay chưa xong việc
  thì **không** phá chuỗi — chỉ ngày đã qua mới tính.

### 4. Màu chỉ xuất hiện nơi màu là dữ liệu

Giao diện gần như đơn sắc (than ấm + ngà). Bảy màu duy nhất trong app là
thang huyết áp (`src/modules/bp/levels.ts`), vì ở đó màu **mang thông tin**. Đừng thêm màu nhấn cho nút,
icon, thanh tiến trình hay biểu đồ — mọi thứ có màu thì không màu nào còn
nói lên điều gì.

- Không bóng đổ. Phân tách bằng viền 1px.
- Mọi con số dùng class `.num` (IBM Plex Mono, tabular figures) để chữ số
  không nhảy ngang khi giá trị đổi.
- Token trong `src/styles.css`. Chỉ có dark mode — **không** làm light mode.

### 5. Không thêm dependency nếu chưa hỏi

Đã cân nhắc và **cố ý loại bỏ**:

- **Tailwind** — hệ design chỉ ~20 token và đã đặt tên hết; thêm vào chỉ là
  thêm thứ phải bảo trì.
- **Recharts / chart lib** — cần dải màu tham chiếu và đường EMA riêng;
  SVG tự viết trong `src/components/Chart.tsx` ngắn hơn là chống lại thư viện.
- **Redux / Zustand** — `useLiveQuery` của Dexie đã là state manager.

### 6. Ô số phải nhập được bằng bàn phím

App dùng trên **cả điện thoại và laptop**. Mọi ô nhập số dùng `NumberField`
trong `src/components/ui.tsx` — có sẵn ô gõ tay **và** hai nút −/+.

- **CẤM** làm stepper chỉ có −/+. Trên laptop đổi 2 kg thành 20 lần nhấn
  chuột trong khi bàn phím đang ở ngay đó.
- **CẤM** dùng `type="number"` — mũi tên spinner của trình duyệt chồng lên
  nút −/+ của mình. Dùng `type="text"` + `inputMode="decimal"` để điện thoại
  vẫn hiện bàn phím số.
- Nhận cả `,` và `.` làm dấu thập phân — app hiển thị kiểu `70,5`.
- Mũi tên lên/xuống = −/+, Enter = lưu. Chuỗi đang gõ chỉ chuẩn hoá khi rời ô,
  nếu format từng ký tự thì không gõ nổi `70,5`.
- Nút −/+ để ngoài thứ tự Tab (`tabIndex={-1}`): Tab đi từ ô số sang Huỷ/Lưu,
  giống spinner gốc của trình duyệt.
- Ngày/giờ dùng `<input type="date|time">` gốc: laptop gõ được bằng bàn phím,
  điện thoại ra bánh xe chọn — không tự viết bộ chọn ngày. `color-scheme: dark`
  trong `:root` là thứ làm mấy ô đó vẽ theo nền tối.

## Kiến trúc

### Bản đăng ký module

Mọi mục trên trang chính là một module tự khai báo (`src/modules/registry.ts`).

```ts
register({
  id: 'weight',
  name: 'Cân nặng',
  kind: 'tracker',     // tracker | feed | hybrid
  Screen,               // màn hình đầy đủ
  Widget,               // ô trên trang chính
  QuickAdd,             // form ghi nhanh (tuỳ chọn)
  wide: false,          // chiếm cả hàng?
  seedTasks: [...],     // việc gieo vào todo
})
```

**Thêm module mới:** tạo thư mục trong `src/modules/`, gọi `register()`, thêm
một dòng import vào `App.tsx`. Không sửa file của module khác. Thứ tự import
trong `App.tsx` = thứ tự trên trang chính.

Dùng lại component chung trong `src/components/ui.tsx` (`Sheet`, `TopBar`,
`NumberField`, `WhenField`) thay vì viết lại trong module — đó là chỗ duy nhất bảo đảm
mọi form nhập hoạt động giống nhau trên điện thoại và laptop.

Ba kiểu module:
- `tracker` — người dùng nhập, lưu vĩnh viễn, **bắt buộc chạy offline**
- `feed` — dữ liệu ngoài, chỉ đọc, có cache (Tin tức)
- `hybrid` — dữ liệu ngoài + chút state cá nhân (Anime: đã xem tới tập mấy)

### Dữ liệu

Một bảng `entries` dùng chung, phân biệt bằng `value` (discriminated union
trong `src/db/types.ts`):

```
weight   → { kg }
bp       → { sys, dia, pulse }
exercise → { type, minutes, intensity }
```

`deletedAt` là **xoá mềm** — bắt buộc cho đồng bộ nhiều thiết bị ở giai đoạn 3.
Đừng xoá cứng bản ghi.

Cân nặng **ghi đè** bản ghi cùng ngày (một ngày một lần cân). Huyết áp thì
**không** — đo sáng và đo tối là hai số liệu riêng, trung bình 7 ngày cần cả
hai. Biểu đồ gộp theo `localDate` lấy trung bình trong ngày.

`weight.startKg` suy lại từ bản ghi **sớm nhất** ở mỗi lần ghi, không đông cứng
ở lần nhập đầu: ghi bù một ngày trước ngày cũ nhất thì mốc bắt đầu và phần trăm
tiến trình tới mục tiêu phải đổi theo.

### Thang huyết áp

Bảy mức trong `src/modules/bp/levels.ts` là **ngưỡng đo tại nhà**: phân mức
ESC/ESH hạ 5 mmHg mỗi biên, vì mốc chẩn đoán tại nhà 135/85 ứng với 140/90 tại
phòng khám. Toàn bộ số nằm trong một bảng `LEVELS` — đổi ngưỡng là sửa một chỗ.

Khác bảng ESC/ESH gốc, cố ý: mức 1 là **Thấp** (< 90/60) chứ không phải "tăng
HA tâm thu đơn độc", vì bảy ô màu là một dải tăng dần theo độ nặng mà tâm thu
đơn độc không nằm ở đâu trên dải đó.

`classify()` lấy **mức cao hơn** giữa hai chỉ số (150/70 vẫn là độ 1). Riêng
mức Thấp phải xét ngoài `max()` — mức 1 ở đầu dải nên `max()` không bao giờ
chọn được nó — và chỉ thắng khi chưa tới ngưỡng tăng huyết áp: 180/55 thì con
số đáng lo là 180.

Phân mức bám vào **trung bình 7 ngày**, không bám lần đo cuối: một lần đo lẻ
dao động quá lớn để kết luận.

## Trạng thái hiện tại

**Xong:** vỏ launcher, module Việc cần làm, module Cân nặng, module Huyết áp.
Chạy hoàn toàn trên máy, không cần tài khoản, không cần server.

**Giới hạn đã biết:** `completeLinked()` tick *tất cả* việc trỏ về một module,
nên mỗi module chỉ đăng ký được **một** việc. Muốn có cả "đo buổi sáng" và "đo
buổi tối" thì phải cho việc trỏ tới từng lần đo, không chỉ tới module.

**Chưa chạy:** lời nhắc. PWA không hẹn giờ thông báo được thuần client —
`remind: true` hiện mới chỉ là dữ liệu. Sẽ hoạt động ở giai đoạn 3 qua
Web Push từ server. Trên iOS chỉ nhận khi app đã cài vào màn hình chính.

## Lộ trình

| GĐ | Nội dung |
|---|---|
| 1 ✓ | Launcher + Việc cần làm + Cân nặng |
| 2 ✓ | **Huyết áp** — 3 chỉ số (tâm thu/tâm trương/nhịp), thẻ màu 7 mức ESC/ESH ngưỡng tại nhà, trung bình 7 ngày, biểu đồ có dải tham chiếu. Ba ô nhập dùng `NumberField` (`step=1`), gõ tay được. Điều kiện đo cố định: tay trái, ngồi, vòng bít bắp tay — không cho chọn. **Không** làm xuất PDF. |
| 3 | Supabase: đồng bộ + Web Push. Lưu `timezone` trong profile, cron phải nhắc theo giờ nơi người dùng đang ở. |
| 4 | Thể dục (loại + phút + cường độ 1–5, **không** phải hệ thống ghi tập tạ), Tin tức (RSS qua Edge Function, chỉ tiêu đề + link, mở ra trình duyệt), Anime (lịch chiếu từ AniList GraphQL, mở link ngoài) |

## Nguyên tắc phạm vi

Đây là app cá nhân. Khi phân vân giữa cấu hình được và đơn giản, **chọn đơn
giản**. Ví dụ đã quyết: cân nặng chỉ nhập kg, huyết áp chỉ 3 số, điều kiện đo
cố định, không light mode, không xuất PDF.

Đừng thêm tính năng không được yêu cầu. Đừng làm màn hình cài đặt cho những
thứ chỉ đặt một lần.
