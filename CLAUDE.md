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
- Mốc do NGUỒN NGOÀI cấp (giờ phát sóng, giờ đăng bài) thì ngược lại: lưu
  timestamp tuyệt đối, format lúc hiển thị. Pháp có giờ mùa hè, Nhật không —
  lưu sẵn chuỗi giờ là sai một nửa năm.

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

- Việc có `linkedModule`: hàng có **ba vùng bấm riêng**, vì chúng làm ba việc
  khác nhau.
  - **vòng tròn** → đánh dấu xong/chưa, LUÔN LUÔN. Đây là cách đánh dấu thủ công
    một việc của module: đã cân ở chỗ khác, đo huyết áp ở hiệu thuốc, không có số
    để nhập. Thiếu nó thì việc `linkedModule` **không có đường nào tick được**
    ngoài việc nhập số — đó là lỗ đã tồn tại từ giai đoạn 1.
  - **chữ** → mở form nhập của module đó.
  - **×** → bỏ việc, chỉ có với việc do người dùng thêm.
- Nhập xong gọi `completeLinked(moduleId)` để tự tick.
- **`ModuleRoute` phải đọc `?add=1` TRỰC TIẾP từ URL**, đừng `useState(params.get(...))`.
  `/m/todo` và `/m/weight` khớp cùng route `/m/:id` nên React Router dùng lại đúng
  component đó — không remount, hàm khởi tạo của useState không chạy lại, và bấm
  việc "Cân nặng buổi sáng" TỪ TRONG màn hình todo sẽ điều hướng đúng nhưng form
  nhập không bao giờ mở. Đi từ trang chính lại chạy (đổi route nên có remount),
  nên lỗi này trốn được rất lâu. Đóng form = bỏ tham số khỏi URL bằng `replace`.
- Làm hai hệ thống song song sẽ gây báo trùng và người dùng tắt hết thông báo.

### 3. Việc lặp lại: lưu quy tắc, không lưu từng lần

- `tasks` giữ quy tắc: `daily` | `weekly` | `interval` | `once`.
- `completions` chỉ ghi khi **đã** hoàn thành.
- Các lần xuất hiện sinh tại chỗ trong `src/modules/todo/rules.ts`.
- **CẤM** tạo sẵn dòng cho tương lai. 8 quy tắc thay cho ~1.300 dòng/năm.
- Chuỗi ngày suy ra từ `completions`, không lưu riêng. Hôm nay chưa xong việc
  thì **không** phá chuỗi — chỉ ngày đã qua mới tính.
- Người dùng tự thêm việc qua `AddSheet` (bốn kiểu lặp). `weekly` mà chưa chọn
  ngày nào thì việc không bao giờ xuất hiện, nên **chặn lưu**. Bật "nhắc" thì tự
  đặt giờ 08:00 nếu đang trống: cron không nhắc được việc không có `time_of_day`,
  thà đặt sẵn còn hơn im lặng không hoạt động.
- Bỏ việc = **`archivedAt`**, không xoá cứng. Xoá cứng không truyền được sang máy
  khác qua LWW, và `completions` có khoá ngoại tới `tasks` nên xoá việc là xoá cả
  lịch sử đã làm của nó.
- Nút bỏ chỉ hiện cho việc **do người dùng thêm**, không cho việc `seed:*` của
  module: bỏ rồi thì `seedModuleTasks` không gieo lại (nó kiểm theo id) nên mất
  luôn mà không có chỗ nào bật lại.
- `.trow` là `div`, phần tick là `.tmain` bên trong. Nút-trong-nút là HTML không
  hợp lệ nên phải tách khi thêm nút bỏ việc.

### 4. Màu chỉ xuất hiện nơi màu là dữ liệu

Giao diện gần như đơn sắc (than ấm + ngà). Bảy màu duy nhất trong app là
thang huyết áp (`src/modules/bp/levels.ts`), vì ở đó màu **mang thông tin**. Đừng thêm màu nhấn cho nút,
icon, thanh tiến trình hay biểu đồ — mọi thứ có màu thì không màu nào còn
nói lên điều gì.

- **Thang màu THỨ HAI và cuối cùng: bốn pha chu kỳ** (`--cy-*`), do chủ dự án
  yêu cầu. Cùng ngôn ngữ với thang huyết áp: bão hoà thấp, và cố ý chọn tông ít
  trùng thang huyết áp nhất (hồng bụi, xanh bụi, vàng xỉn, tím bụi) để hai thang
  không bị đọc lẫn. Token nằm một chỗ trong `styles.css`, đổi là đổi cả app.
  **Đừng thêm thang màu thứ ba.**
- **Ngoại lệ duy nhất về ảnh: module Tin tức.** Ảnh bài báo là *nội dung*, không
  phải trang trí — cùng logic với thang màu huyết áp. Chủ dự án yêu cầu có ảnh
  preview để tin tức hấp dẫn hơn; đừng gỡ đi. Nhưng mọi thứ QUANH ảnh vẫn đơn
  sắc: không bo tròn to, không bóng đổ, viền 1px, nhãn nguồn và giờ dùng mono.
  Đừng lấy đây làm cớ để thêm ảnh ở module khác.
- **`.app` là flex column, `.scroll` là `flex: 1; min-height: 0`.** Đừng đổi
  `.scroll` về `height: 100%`: khi đó nó cao đúng bằng `.app` nhưng lại bắt đầu
  DƯỚI TopBar, nên 47px cuối của MỌI màn hình module bị `overflow: hidden` của
  `.app` cắt mất và không cách nào cuộn tới. Lỗi này nằm im suốt bốn giai đoạn.
  `min-height: 0` là thứ cho phép flex item co nhỏ hơn nội dung — thiếu nó thì
  tràn y như cũ.
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
- `NumberField` giữ giá trị mới nhất trong một `useRef`, cập nhật ngay trong
  `bump`. Không có nó thì bấm −/+ nhiều lần thật nhanh bị React gộp batch, mọi
  handler đọc cùng một prop `value` cũ và tám lần bấm chỉ ra một bước. Nhấn nhanh
  liên tiếp là chuyện bình thường trên điện thoại.
- **Form có nhiều ô số cùng sửa MỘT object thì `onChange` phải nhận hàm cập
  nhật**, đừng spread từ prop (`onChange({ ...v, sys })`). Spread từ prop thì các
  ô ghi đè lẫn nhau khi các lần cập nhật bị gộp batch: mỗi ô đọc cùng một `v` cũ,
  ô sau xoá thay đổi của ô trước. Xem `ReadingRows` trong module huyết áp.
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

**Module chỉ áp dụng với một số người** thì khai `enabledBy: 'profile.<khoá>'`.
Module đó **ẩn cho tới khi** khoá settings ấy bằng `true` — mặc định ẩn, vì app
không suy đoán gì về người dùng. Khoá `profile.*` nằm trong `settings` nên lựa
chọn theo được sang máy khác. Lọc ở `useVisibleModules()`, và hàng Ghi nhanh phải
lọc theo cùng danh sách, không thì bấm được vào module đang ẩn.

Route `/m/<id>` vẫn mở được kể cả khi module đang ẩn — cố ý, để link sâu từ thông
báo không chết. Chỉ ô trên trang chính và hàng Ghi nhanh là bị ẩn.

**Bẫy khi viết form ghi nhanh:** `useLiveQuery` trả `undefined` ở lần render
ĐẦU, mà `useState` chỉ chạy hàm khởi tạo MỘT lần. Đặt giá trị mặc định trực tiếp
kiểu `useState(data?.x ?? 70)` là khoá luôn vào số dự phòng — form không bao giờ
hiện giá trị lần trước, dù dòng chữ trên form nói là có. Tách làm hai component:
`QuickAdd` chờ dữ liệu rồi mới mount `<XForm last={...}>`. Cả ba module tracker
đều từng mắc lỗi này.

Nếu module có danh sách lựa chọn cố định, phải kiểm giá trị lần trước còn nằm
trong danh sách hay không: bỏ một loại khỏi danh sách thì bản ghi cũ vẫn giữ
nguyên trong lịch sử, và không kiểm thì không mục nào sáng lên mà vẫn lưu loại cũ.

Dùng lại component chung trong `src/components/ui.tsx` (`Sheet`, `TopBar`,
`NumberField`, `WhenField`) thay vì viết lại trong module — đó là chỗ duy nhất bảo đảm
mọi form nhập hoạt động giống nhau trên điện thoại và laptop.

Ba kiểu module:
- `tracker` — người dùng nhập, lưu vĩnh viễn, **bắt buộc chạy offline**
- `feed` — dữ liệu ngoài, chỉ đọc, có cache (Tin tức)
- `hybrid` — dữ liệu ngoài + chút state cá nhân

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

Bảng `cache` (Dexie v3) giữ dữ liệu ngoài cho module `feed`/`hybrid` chạy được
khi offline — module Tin tức dùng nó. **Local-only, cố ý không đồng bộ**: nó là bản chép của dữ liệu công
khai, đồng bộ chỉ tốn băng thông và bản cũ ở máy này có thể ghi đè bản mới ở máy
khác qua LWW. Máy nào cần thì tự tải lại.

Cân nặng **ghi đè** bản ghi cùng ngày (một ngày một lần cân). Huyết áp thì
**không** — đo sáng và đo tối là hai số liệu riêng, trung bình 7 ngày cần cả
hai. Biểu đồ gộp theo `localDate` lấy trung bình trong ngày.

`weight.startKg` suy lại từ bản ghi **sớm nhất** ở mỗi lần ghi, không đông cứng
ở lần nhập đầu: ghi bù một ngày trước ngày cũ nhất thì mốc bắt đầu và phần trăm
tiến trình tới mục tiêu phải đổi theo.

### Module Thể dục

`src/modules/exercise/` — **không phải hệ thống ghi tập tạ**: không set, không
rep, không bài tập. Chỉ loại + phút + cường độ 1–5.

- Loại hình là **danh sách cố định** (`TYPES`), không cho nhập tự do: nhập tự do
  thì "chạy", "Chạy", "chạy bộ" thành ba loại và không gộp được.
- Cường độ dùng 5 chip chứ không phải `NumberField`. Không trái quy tắc 6: chỉ
  có 5 giá trị nên một lần bấm là xong, không có chuyện phải nhấn hai mươi lần.
- Không ghi đè bản ghi cùng ngày (như huyết áp): sáng đi bộ chiều đạp xe là hai
  buổi riêng, tổng phút trong ngày cần cả hai.
- Ô trang chính hiện **tổng phút 7 ngày**, không phải buổi cuối: buổi cuối cách
  đây 9 ngày mà hiện "45 phút" thì đọc thành đang tập đều, sai hẳn ý nghĩa.
- Biểu đồ dựng dải ngày **liên tục** kể cả ngày nghỉ, và `BarChart` vẽ ngày bằng
  0 thành một gạch mờ ở đáy. Thiếu hai thứ đó thì các ngày có tập bị nén cạnh
  nhau và trông như tập liên tục.
- Cố ý **không có `seedTasks`**: nhắc tập thể dục hằng ngày là quyết định của chủ
  dự án, không phải thứ tự thêm vào. Thêm một dòng vào `register()` là có ngay.

### Module Tin tức (kiểu `feed`)

`supabase/functions/news/` đọc RSS, `src/modules/news/` hiển thị.

- **Phải qua Edge Function**: feed RSS không gửi header CORS nên trình duyệt
  chặn. (Khác AniList lúc trước, gọi trực tiếp được.)
- **Danh sách nguồn nằm TRONG hàm**, không nhận từ client. Nhận URL từ client là
  biến hàm thành proxy mở cho bất kỳ ai tải bất kỳ trang nào. Đổi nguồn = sửa
  `FEEDS` rồi `pnpm supabase functions deploy news`.
- **MỘT feed = MỘT nguồn + MỘT chủ đề.** Phải dùng feed riêng theo chủ đề vì RSS
  tổng hợp ("tin mới nhất") không mang thông tin chủ đề nào. Đổi lại mỗi bài có
  chủ đề thật do nguồn tự phân, không phải do mình đoán.
- Hàm trả về `topics` và `sources` theo **thứ tự khai báo của `FEEDS`**, không suy
  từ dữ liệu về — thứ tự cố định thì chip lọc không nhảy chỗ giữa hai lần tải.
- `TOTAL` phải **>= số feed × `PER_FEED`**. Nếu nhỏ hơn thì sắp theo ngày rồi cắt
  sẽ loại sạch nguồn đăng thưa (Le Monde ra 20 bài/ngày, VnExpress ra 60 bài mỗi
  chủ đề) và chủ đề của họ thành trống khi lọc. Giao của hai bộ lọc CÓ THỂ rỗng
  nên bắt buộc có trạng thái rỗng kèm nút bỏ lọc.
- Hàng chip chủ đề **rút gọn còn 4** (`FilterRow max={4}`), phần còn lại ẩn sau
  nút mở rộng nét đứt. Mười một chủ đề trải hết là ba dòng chip đè lên cả tin đầu.
  Mục **đang chọn phải luôn hiện** dù nằm ngoài phần rút gọn — nếu không thì người
  dùng thấy danh sách bị lọc mà không thấy đang lọc theo gì. Lọc theo chỉ số để
  giữ thứ tự khai báo, đừng đẩy mục chọn xuống cuối.
- Bộ lọc là state của component, KHÔNG lưu vào `settings`: đó là lựa chọn lúc
  đọc, không phải cài đặt cần nhớ qua các lần mở app.
- Ảnh nằm ở **bốn chỗ khác nhau** tuỳ nguồn: `enclosure`, `media:content`,
  `media:thumbnail`, hoặc `<img>` đầu tiên trong nội dung. Phải thử lần lượt cả
  bốn — mỗi báo làm một kiểu.
- **Ngày không có múi giờ thì phải bù tay.** Tuổi Trẻ trả
  `8/20/2026 12:20:00 AM`; `Date.parse` coi đó là giờ máy chủ (UTC) nên lệch 7
  tiếng. Mỗi nguồn khai `tzOffset` để bù, và chỉ bù khi chuỗi KHÔNG có dấu hiệu
  múi giờ nào.
- `Promise.allSettled`, không phải `all`: một nguồn chết không được làm mất cả
  trang. Nguồn lỗi được liệt kê ở chân màn hình.
- Lấy `PER_FEED` bài mỗi nguồn rồi mới trộn: trộn hết mọi bài thì một nguồn đăng
  dày sẽ chiếm cả trang.
- Client hiện dữ liệu cache TRƯỚC rồi mới tải mới — đọc tin không nên bắt đầu
  bằng màn hình trắng. Cache 15 phút trong bảng `cache`.
- Ảnh ở CDN của từng báo nên offline sẽ vỡ; service worker cố ý không cache
  chúng (khác origin, lại nặng). `Thumb` bắt `onError` và thay bằng khung trống
  chứ không để icon ảnh lỗi hiện ra.
- Mở bài bằng `target="_blank"` — ra trình duyệt, app không nhúng nội dung báo.
- **Ô trang chính là ô nửa hàng TĨNH, không gọi mạng.** Chỉ hiện ngày hôm nay;
  `wide` phải là `false` để Launcher tự bọc nút điều hướng. Không hook, không đọc
  cache, không state.
  - Lý do: ô này từng gọi `useNews()` nên mỗi lần mở app là tải 11 feed và ~27KB
    JSON kèm hàng chục ảnh, chỉ để xem trước hai bài. Tin tức chỉ cần khi người
    dùng chủ động mở.
  - Đã thử hai bản khác và **cả hai đều sai**: dải cuộn ngang (kéo-để-cuộn đánh
    nhau với chạm-để-mở), và thẻ link thẳng ra báo (không còn chỗ nào bấm để mở
    module). Đừng làm lại.

### Module Kinh nguyệt

`src/modules/period/` — `cycles.ts` là logic thuần (đã test 20 ca), `index.tsx` là UI.

- **Một dòng cho MỖI NGÀY ra máu**, không phải một dòng cho cả kỳ. Ghi theo ngày
  thì mức ra máu từng ngày khác nhau được, và ranh giới kỳ suy ra từ các ngày
  liền nhau — không phải nhớ bấm "kết thúc".
- **Ra đốm (`flow: 0`) KHÔNG mở chu kỳ mới.** Ra máu giữa chu kỳ tính là ngày
  đầu thì một lần ra đốm sẽ sinh ra một "chu kỳ" 5 ngày và làm sai toàn bộ số
  liệu. Vẫn ghi lại vì FIGO coi ra máu giữa kỳ là thứ đáng theo dõi.
- **Hai đợt cách nhau đúng một ngày thì GỘP**: gần như chắc chắn là quên ghi một
  hôm, mà nếu tách thì sinh ra một "chu kỳ" 2 ngày.
- **Trung vị, không phải trung bình cộng.** Một chu kỳ lệch bất thường (bệnh,
  stress, quên ghi) kéo trung bình đi rất xa: 26/28/29/30/90 cho trung vị 29 còn
  trung bình 41. Chỉ lấy 6 chu kỳ gần nhất — chu kỳ đổi theo tuổi và hoàn cảnh.
- **Dự đoán là một KHOẢNG, không phải một ngày**, và khoảng lấy đúng từ chu kỳ
  ngắn nhất–dài nhất của chính người dùng. Chu kỳ càng đều thì khoảng càng hẹp,
  nên con số tự phản ánh độ tin cậy thật.
- **Khả năng thụ thai vẽ thành ĐƯỜNG, không phải khung có biên.** Chủ dự án yêu
  cầu có biểu đồ dự đoán sau khi đã nghe cảnh báo; đây là quyết định của chủ dự
  án, đừng gỡ. Nhưng cách thể hiện thì không thoả hiệp:
  - Không có "cửa sổ an toàn" với biên cứng. Khung có biên nói rằng ngoài khung
    là an toàn, mà điều đó không đúng — tính theo lịch thất bại ~24%/năm.
  - `fertileCurve()` tính xác suất thật: ngày rụng trứng nằm đâu đó trong
    [kỳ sau sớm nhất − 17, kỳ sau muộn nhất − 11], và trọng số của ngày `d` là tỷ
    lệ các ngày rụng trứng khả dĩ nằm trong `[d, d+5]` (tinh trùng sống ~5 ngày).
  - Nhờ vậy **hình vẽ tự nói nó chắc chắn tới đâu**: chu kỳ đều thì đỉnh cao và
    hẹp, chu kỳ dao động thì đỉnh thấp và trải rộng. Test xác nhận 0,86 so với
    0,43. Trọng số KHÔNG BAO GIỜ đạt 1 vì khoảng rụng trứng khả dĩ rộng ít nhất
    7 ngày (hoàng thể 11–17) mà một ngày chỉ dễ thụ thai với 6 ngày rụng trứng.
  - Bất biến để kiểm: tổng trọng số cả chu kỳ ≈ 6 ngày, đúng bằng độ dài cửa sổ
    dễ thụ thai sinh học.
  - Nói về độ chính xác **MỘT lần**, ở chân màn hình. Đây là app cá nhân, không
    phải thiết bị y tế; lặp cảnh báo ở mọi khối chỉ làm người dùng bỏ qua nó. Sự
    trung thực dồn vào CÁCH VẼ, không vào chữ.

**Vòng chu kỳ** (`CycleRing`) chia bốn pha, trỏ hoặc bấm vào một cung thì giữa
vòng hiện chi tiết pha đó.

- Cung "dễ thụ thai" vẽ theo **TỪNG NGÀY**, độ đậm theo xác suất — không phải một
  khối đặc. Khối đặc có biên nói rằng ngoài biên là an toàn, mà điều đó không
  đúng. Vòng vẫn đọc được như bốn pha nhưng pha đó tự nhoè ở hai đầu.
- Ranh giới nang trứng/hoàng thể lấy theo ngày dễ thụ thai đầu và cuối, **không**
  theo "ngày 14": ngày rụng trứng suy từ độ dài chu kỳ chứ không cố định.
- **Không phải chu kỳ nào cũng có đủ bốn pha** — chu kỳ ngắn hoặc kỳ kinh dài có
  thể không còn ngày nang trứng nào. Nút chú giải của pha không tồn tại phải bị
  chặn, đã gặp lỗi bấm vào rồi ra ô trống.
- Chuột thì hover, cảm ứng thì bấm giữ lại: phân biệt bằng `e.pointerType`, vì
  điện thoại không có hover.
- Vùng chạm của cung rộng 34px trong khi cung nhìn thấy chỉ 20px — 20px là quá
  mảnh cho ngón tay.
- Chữ giữa vòng phải nằm gọn trong lòng vòng: cung dày 20px trên bán kính 92 nên
  lòng vòng chỉ rộng ~60% đường kính, padding 30% mỗi bên.
- Ngưỡng tham chiếu FIGO/ACOG trong `NORMAL`: chu kỳ 24–38 ngày, ra máu tới 7
  ngày, chênh lệch ngắn–dài tới 7 ngày (FIGO 2018, nhóm tuổi 26–41; tuổi 18–25 và
  42–45 được phép rộng hơn). Diễn đạt bằng mô tả "đáng để ý", KHÔNG phải chẩn
  đoán — giống cách thang huyết áp làm.
- Mức ra máu thể hiện bằng **độ đậm của mực**, không bằng màu: quy tắc 4 chỉ cho
  màu ở nơi màu là dữ liệu, và chỗ đó đã là thang huyết áp.
- Không có `seedTasks`: nhắc "kỳ tới sắp đến" là nhắc theo DỰ ĐOÁN, mà hệ thống
  việc chỉ diễn đạt được quy tắc cố định nên sẽ lệch dần mỗi tháng.
- **Thứ tự màn hình**: hero → KPI (ba số) → kỳ tới dự kiến → vòng chu kỳ → lịch →
  nút thêm. Số liệu là **KPI ba ô**, không phải danh sách nhiều hàng; lịch sử chu
  kỳ gộp thành **một dòng số** (`28 · 28 · 29 · 28`) thay cho danh sách tám hàng —
  đọc một dòng đó là thấy ngay đều hay không. Cuối màn hình chỉ còn lịch và nút
  thêm, không chèn gì vào giữa hai thứ đó.

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

**Một buổi đo, hai lần đo.** Form mặc định chỉ có MỘT lần đo. Bấm "+ Thêm lần đo
2" thì hiện thêm ba ô, và kết quả lưu là **trung bình hai lần** — đúng quy trình
đo tại nhà của ESC/ESH. `value.sys/dia/pulse` là kết quả đó; mọi tính toán (thẻ
mức, trung bình 7 ngày, biểu đồ) chỉ đọc ba trường này.

`value.readings` giữ số THÔ của từng lần, chỉ có khi đo hơn một lần. Trung bình
được làm tròn vì huyết áp luôn báo bằng số nguyên, nên phải giữ số gốc để không
mất dữ liệu. Thẻ mức trong form đọc KẾT QUẢ, không đọc lần đo 1.

Thêm trường vào `value` **không cần migration**: cột đó là jsonb ở server, không
có chỉ mục nào trên nó, và mapper đồng bộ truyền cả object nên tự theo.

### Đồng bộ (giai đoạn 3)

`src/sync/` — `tables.ts` là bản đồ cột local ↔ Postgres, `index.ts` là động cơ.

- **Đăng nhập KHÔNG phải cửa chắn.** Module tracker bắt buộc chạy offline, nên
  `supabase` có thể là `null` và app vẫn phải hoạt động. Trạng thái đồng bộ nằm
  ở chân trang chính (`SyncFoot`), không có màn hình cài đặt riêng.
- **Last-write-wins theo `updatedAt` từng dòng.** Server **không** có trigger tự
  đặt `updated_at` — nếu có thì server luôn thắng và máy offline ba ngày sẽ ghi
  đè bản mới hơn ở máy khác. Hệ quả phải chấp nhận: hai máy lệch giờ hệ thống
  thì bản "mới hơn" có thể sai. Một người hai máy nên chấp nhận được.
- **Chuẩn hoá mốc thời gian về dạng `toISOString()`** khi kéo về. Server trả
  `+00:00`, local lưu `Z`; trộn hai dạng thì so sánh chuỗi sai và chỉ mục
  `updatedAt` của Dexie xếp sai thứ tự.
- **`syncState` là bảng local-only**, cố ý không nằm trong `settings` vì
  settings được đồng bộ mà "máy này đã kéo tới đâu" thì không được đồng bộ.
- **Thứ tự đẩy: tasks → completions → entries → settings.** `completions` có
  khoá ngoại tới `tasks`, đẩy ngược thứ tự là bị Postgres từ chối.
- **Module không biết gì về đồng bộ.** Hook `creating`/`updating`/`deleting` của
  Dexie tự hẹn một lượt đẩy. Thêm module mới không phải nối dây gì.
- Tài khoản tạo **một lần** ở Dashboard → Authentication → Users. App chỉ có
  đăng nhập, không có đăng ký — đúng nguyên tắc không làm màn hình cho thứ đặt
  một lần. Đăng xuất không xoá dữ liệu local.

### Service worker & thông báo

`src/sw.ts` — tự viết, **không dùng workbox**. Kiểm kiểu riêng bằng
`tsconfig.sw.json` vì lib DOM và lib WebWorker xung đột nhau; `pnpm build` chạy
cả hai lượt `tsc`.

- Chế độ là `injectManifest`, **không phải `generateSW`**: Web Push cần handler
  `push` và `notificationclick` riêng mà `generateSW` không cho chèn code vào.
- **`self.__WB_MANIFEST` phải viết trực tiếp**, đừng đọc qua biến trung gian:
  workbox tìm đúng biểu thức đó trong bản đã biên dịch, qua biến là build đổ.
- **Lọc trùng URL trước `cache.addAll()`.** `includeAssets` và `globPatterns`
  cùng khai báo hai file icon nên manifest có chúng hai lần, và `addAll` từ chối
  CẢ LÔ nếu danh sách lặp. Đã gặp thật: cache rỗng, service worker không
  activate, app không chạy offline, mà không có lỗi nào hiện ra.
- Tên cache mang dấu vân tay của cả manifest; cache cũ bị xoá ở `activate`. Tên
  cố định là bản mới không bao giờ tới được máy người dùng.
- Điều hướng luôn trả `index.html` rồi để React Router lo — không có nhánh này
  thì mở `/m/bp` lúc offline ra trang trắng.
- Thông báo dùng `tag` cố định để bản mới **thay thế** bản cũ. Không có nó thì ba
  ngày không mở app sẽ thành ba thông báo xếp đống rồi người dùng tắt hết.
- Đăng ký push là theo **từng thiết bị**, không theo tài khoản. Endpoint có thể
  bị trình duyệt đổi, nên mỗi lượt đồng bộ client ghi lại — service worker không
  có phiên đăng nhập để tự làm việc đó.
- iOS chỉ nhận push khi app đã cài vào màn hình chính; `pushState()` trả
  `needs-install` để nói thẳng chứ không để người dùng bấm vào chỗ chết.
- **CẤM `await navigator.serviceWorker.ready` trực tiếp.** Khi chưa có service
  worker nào đăng ký, promise đó không resolve và cũng KHÔNG reject — treo vĩnh
  viễn, nên `.catch()` bọc ngoài vô dụng. Dùng `activeRegistration()` trong
  `src/push/index.ts`: nó hỏi `getRegistration()` trước và có chặn thời gian.
- `devOptions.enabled = true` trong vite.config: mặc định `pnpm dev` **không**
  đăng ký service worker nào, nên nút bật Nhắc không làm gì được và mọi thứ chạm
  tới serviceWorker đều treo.
- Mọi bước trong một lượt đồng bộ đều bọc `withTimeout` (30s). Một promise không
  bao giờ settle là đủ để trạng thái kẹt ở "đang đồng bộ" vĩnh viễn, và vì cờ
  `applying` không được hạ nên mọi lượt sau cũng bị chặn. Đã gặp thật.

### Nhắc nhở (cron + Edge Function)

`supabase/functions/send-reminders/` gửi; `public.due_tasks()` quyết định ai cần
nhắc. Cron chạy **5 phút một lần** và KHÔNG biết giờ của người dùng — nó chỉ
đánh thức hàm, còn "ai tới giờ" tính theo `profiles.timezone`. Nhờ vậy bay từ
Pháp về Việt Nam là lịch nhắc tự đổi theo, không phải sửa cron.

- ⚠ **LỊCH LẶP BỊ VIẾT HAI LẦN.** `due_tasks()` trong SQL là bản sao của
  `occursOn()` trong `src/modules/todo/rules.ts`. Không tránh được: client phải
  chạy offline nên không gọi được server, còn cron thì chạy khi không có client
  nào đang mở. **SỬA MỘT BÊN LÀ PHẢI SỬA BÊN KIA.**
- `reminders_sent` một dòng cho mỗi (việc, ngày). Không có nó thì cron 5 phút
  một lần sẽ nhắc lại 5 phút một lần cho tới khi người dùng tick xong.
- Chỉ nhắc trong **3 tiếng** kể từ `time_of_day`. Trừ trên timestamp chứ không
  trên `time`: `time '23:00' + interval '180 min'` vòng về 02:00 và việc đặt giờ
  khuya sẽ không bao giờ được nhắc.
- Việc đã tick hôm nay thì không nhắc — nhớ lọc `deleted_at is null`, bỏ tick là
  phải nhắc lại.
- `verify_jwt = false` cho function này, thay bằng header `x-cron-secret`: cron
  gọi qua pg_net nên không có JWT của người dùng nào. Secret nằm trong **Vault**,
  không viết thẳng vào job — `cron.job` là bảng đọc được.
- Thiết bị trả 404/410 thì xoá khỏi `push_subscriptions` ngay, đừng để nó làm
  mọi lượt cron sau đều lỗi.
- Chỉ ghi `reminders_sent` khi gửi được **ít nhất một** thiết bị; trượt hết thì
  để lượt sau thử lại.

**Lưu ý về CLI:** `supabase migration new` và `supabase db push` hay treo trong
môi trường không tương tác. `db push` cần `printf 'y\n' |` đưa xác nhận vào,
còn `migration new` thì tự tạo file rỗng — viết thẳng file vào
`supabase/migrations/<timestamp>_<tên>.sql` là chắc hơn.

## Trạng thái hiện tại

**Xong:** vỏ launcher, Việc cần làm, Cân nặng, Huyết áp, Thể dục, Kinh nguyệt,
Tin tức, đồng bộ Supabase, nhắc nhở qua Web Push. Vẫn chạy đầy đủ khi chưa đăng nhập —
riêng Tin tức cần mạng cho lần tải đầu.

**Giới hạn đã biết:** `completeLinked()` tick *tất cả* việc trỏ về một module,
nên mỗi module chỉ đăng ký được **một** việc. Muốn có cả "đo buổi sáng" và "đo
buổi tối" thì phải cho việc trỏ tới từng lần đo, không chỉ tới module.

**Lời nhắc đã chạy** qua Web Push + cron (giai đoạn 3). Trên iOS chỉ nhận được
khi app đã cài vào màn hình chính — `pushState()` trả `needs-install` để nói
thẳng chứ không để người dùng bấm vào chỗ chết.

## Lộ trình

| GĐ | Nội dung |
|---|---|
| 1 ✓ | Launcher + Việc cần làm + Cân nặng |
| 2 ✓ | **Huyết áp** — 3 chỉ số (tâm thu/tâm trương/nhịp), thẻ màu 7 mức ESC/ESH ngưỡng tại nhà, trung bình 7 ngày, biểu đồ có dải tham chiếu. Ba ô nhập dùng `NumberField` (`step=1`), gõ tay được. Điều kiện đo cố định: tay trái, ngồi, vòng bít bắp tay — không cho chọn. **Không** làm xuất PDF. |
| 3 ✓ | Supabase: đồng bộ + Web Push. Lưu `timezone` trong profile, cron phải nhắc theo giờ nơi người dùng đang ở. |
| 4 ✓ | ~~Thể dục~~ ✓, ~~Tin tức~~ ✓ (RSS qua Edge Function, mở ra trình duyệt) |

## Đã làm rồi bỏ

**Anime** (lịch chiếu AniList, kiểu `hybrid`) — dựng xong rồi bỏ vì thực tế không
dùng tới. Đừng dựng lại mà không hỏi. Thứ còn lại từ nó và **cố ý giữ**: bảng
`cache` trong Dexie v3 cùng `readCache`/`writeCache`/`cacheAge` — module Tin tức
đang dùng đúng những thứ đó.

## Nguyên tắc phạm vi

Đây là app cá nhân. Khi phân vân giữa cấu hình được và đơn giản, **chọn đơn
giản**. Ví dụ đã quyết: cân nặng chỉ nhập kg, huyết áp chỉ 3 số, điều kiện đo
cố định, không light mode, không xuất PDF.

Đừng thêm tính năng không được yêu cầu. Đừng làm màn hình cài đặt cho những
thứ chỉ đặt một lần.

**Ngoại lệ, do chủ dự án yêu cầu:** sheet "Cá nhân" ở chân trang chính, hiện chỉ
có một dòng chọn giới tính để bật/tắt module Kinh nguyệt. Đặt ở chân trang chứ
KHÔNG nhét vào sheet Đồng bộ: sheet đó chỉ mở được khi đã cấu hình Supabase, nên
nếu tắt đồng bộ thì sẽ không còn chỗ nào đổi được lựa chọn này. Tắt module không
xoá dữ liệu đã ghi.
