# Vườn Rồng Tri Thức Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tích hợp Vườn Rồng Tri Thức vào Dragon System 3 tại `/vuon-rong`, dùng Supabase Auth và ví Xu Dragon chung cho game.

**Architecture:** Dùng Supabase project `fjefdnvvkezuamiiushl` làm nguồn dữ liệu cho xác thực, hồ sơ, tiến độ học, ví, ledger, vườn và kho hạt. PostgreSQL migrations/RPC đảm bảo các giao dịch Xu và thao tác game nguyên tử; Supabase Edge Function nhận webhook SePay và chỉ máy chủ được phép xác nhận nạp Xu. Route TanStack mới hiển thị game trong ứng dụng Dragon, lấy dữ liệu qua Supabase Auth/RLS.

**Tech Stack:** React 19, TanStack Start/Router, TypeScript, Tailwind CSS 4, Supabase JS/Auth/Postgres/Edge Functions, SQL migrations, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-25-vuon-rong-dragon-design.md`

## Global Constraints

- Game là route `/vuon-rong` trong Dragon, không dùng iframe.
- Dùng chung Supabase project `fjefdnvvkezuamiiushl` cho Dragon và game.
- Dragon và game dùng chung một số dư Xu Dragon; The Skill vẫn dùng thanh toán và quyền truy cập riêng.
- Mỗi user có 12 ô; RLS phải giới hạn dữ liệu theo user.
- Tất cả thao tác thay đổi số dư phải chạy phía máy chủ trong giao dịch nguyên tử.
- Không đóng Lovable Cloud cũ trước khi bản mới đăng nhập và lưu dữ liệu ổn định.
- Không đưa khóa `service_role` hoặc bí mật SePay vào Git hay bundle trình duyệt.
- Thưởng thu hoạch là số nguyên đồng xác suất trong khoảng cây; Táo, Lê, Hồng Tím và Phong Lan chỉ ở ô 9–12.
- Tôn trọng repo The Skill riêng `D:\Web Dragon System 3`, không ghi đè các thay đổi chưa commit của repo này.

## Review Focus

- Hai yêu cầu mua/thu hoạch đồng thời trên cùng ví: test phải chứng minh không thể chi vượt số dư hoặc nhận thưởng hai lần.
- Người dùng thử sửa `user_id`, số dư, loại cây hoặc phần thưởng từ trình duyệt: test phải chứng minh server/RLS từ chối.
- Webhook SePay gửi lại, sai mã, sai số tiền hoặc là giao dịch tiền ra: không được cộng Xu.
- Người không đăng nhập hoặc user khác mở `/vuon-rong`: không được đọc dữ liệu vườn.
- Hạt cao cấp gieo vào hàng trên hoặc gieo thiếu hạt: thao tác bị từ chối mà không trừ Xu hay làm đổi ô.

---

## Bản đồ file dự kiến

- `supabase/config.toml`: liên kết cấu hình CLI tới project dùng chung.
- `supabase/migrations/*.sql`: schema, seed catalog, RLS, constraint và RPC nguyên tử.
- `supabase/functions/sepay-webhook/index.ts`: xác thực webhook và gọi giao dịch nạp Xu.
- `src/integrations/supabase/client.ts`: browser client hiện có, nhận cấu hình public của project mới qua env.
- `src/integrations/supabase/types.ts`: types được sinh từ schema sau migration.
- `src/components/auth-prototype-dialog.tsx`: thay form mẫu bằng đăng ký/đăng nhập thật.
- `src/routes/index.tsx`: giữ trang chủ hiện tại và liên kết tới game; bỏ trạng thái game xem trước như điểm vào duy nhất.
- `src/routes/vuon-rong.tsx`: route bảo vệ cho màn game.
- `src/features/vuon-rong/*`: component game, catalog cây/chậu, dữ liệu truy cập Supabase và trạng thái loading/lỗi.
- `src/features/wallet/*`: số dư, lịch sử giao dịch và luồng mua gói Xu/QR.
- `public/game/*`: asset game đã cung cấp.
- `vitest.config.ts`, `src/test/setup.ts`, `src/**/*.test.ts(x)`: test tương tác và quy tắc hiển thị.
- `src/db/*.test.ts`: test migration, RLS và RPC bằng PGlite khi máy không có Docker.
- `package.json`, `bun.lock`: script và dependency test.
- PGlite tests trong `src/db`: thực thi migration PostgreSQL và kiểm tra RLS/RPC; xác minh thêm trên Supabase project khi triển khai.
- `.env.example`: chỉ tên biến môi trường và URL mẫu không chứa bí mật.
- `vite.config.ts` (nếu cần): adapter Nitro tương thích với mục tiêu Vercel sau khi build kiểm chứng.

Không sửa `src/routeTree.gen.ts` thủ công; TanStack sẽ sinh lại từ route file.

## Task 1: Tạo schema chung, RLS và test database

**Files:**
- Create: `supabase/migrations/202609250001_vuon_rong_core.sql`
- Create: `src/db/vuon-rong-schema.test.ts`
- Modify: `supabase/config.toml`
- Modify: `src/integrations/supabase/types.ts` (sinh lại bằng Supabase CLI)
- Modify: `package.json`, `bun.lock` (Vitest, Testing Library, PGlite)
- Create: `vitest.config.ts`, `src/test/setup.ts`

**Interfaces:**
- Migrations tạo `profiles`, `dragon_wallets`, `dragon_wallet_transactions`, `learning_progress`, `garden_slots`, `seed_inventory`, `seed_catalog`, `game_gifts`, `gift_redemptions`.
- Một user có một wallet và đúng 12 slot indices `1..12`.
- Ledger chỉ ghi nối tiếp; browser không có quyền `INSERT`, `UPDATE`, `DELETE` vào wallet hoặc ledger.
- Catalog cây được seed đúng bảng trong spec; catalog quà ban đầu có thể rỗng và phải có trạng thái rỗng rõ ràng cho tới khi admin cấu hình quà.

- [ ] **Bước 1: Cấu hình test runner và viết test schema thất bại**

Thêm Vitest, Testing Library, jsdom và `@electric-sql/pglite`; thêm script `"test": "vitest run"`. Trong `src/db/vuon-rong-schema.test.ts`, khởi tạo PGlite với schema `auth`, bảng `auth.users` và hàm `auth.uid()` mô phỏng Supabase JWT claim. Viết test áp dụng migration rồi assert trigger tạo một wallet/12 ô, hai user tách biệt bởi RLS, và role `authenticated` không ghi được wallet/ledger.

- [ ] **Bước 2: Chạy test và xác nhận thất bại trước migration**

Chạy `bun run test -- src/db/vuon-rong-schema.test.ts`. Kết quả mong đợi: FAIL vì migration lõi chưa tồn tại hoặc chưa tạo bảng/policy.

- [ ] **Bước 3: Viết migration lõi**

Thêm bảng, khóa ngoại, unique/check constraints, trigger tạo profile/wallet/12 slot khi có auth user mới, seed catalog cây, RLS owner-scoped và quyền admin cho catalog. Gắn config CLI với ref `fjefdnvvkezuamiiushl`; không ghi API key vào config.

- [ ] **Bước 4: Áp dụng migration và chạy database test**

Chạy `bun run test -- src/db/vuon-rong-schema.test.ts`. Kết quả mong đợi: PASS; hai user cô lập dữ liệu và direct writes vào wallet/ledger bị chặn. Nếu Docker/Supabase CLI có sẵn, chạy thêm `supabase db reset` và `supabase test db` như kiểm tra tương thích Supabase.

- [ ] **Bước 5: Sinh types và kiểm tra migration**

Chạy `supabase gen types typescript --local` vào `src/integrations/supabase/types.ts`; chạy `git diff --check` và kiểm tra repo không có service-role key hoặc secret.

- [ ] **Bước 6: Commit task**

```bash
git add package.json bun.lock vitest.config.ts src/test src/db supabase/config.toml supabase/migrations src/integrations/supabase/types.ts
git commit -m "feat: add shared Dragon garden schema"
```

## Task 2: RPC giao dịch Xu và luật game nguyên tử

**Files:**
- Create: `supabase/migrations/202609250002_vuon_rong_transactions.sql`
- Create: `src/db/vuon-rong-transactions.test.ts`
- Modify: `src/integrations/supabase/types.ts` (sinh lại sau migration RPC)

**Interfaces:**
- `purchase_seed(p_seed_key text, p_quantity integer, p_idempotency_key uuid)` trừ Xu và cộng kho hạt nguyên tử.
- `plant_crop(p_slot_index integer, p_seed_key text, p_idempotency_key uuid)` tiêu thụ một hạt, kiểm tra vị trí, tạo thời gian hoàn thành và rút xác suất ốc sên đúng một lần.
- `plant_crops(p_slot_indices integer[], p_seed_key text, p_idempotency_key uuid)` gieo các slot hợp lệ với lượng hạt trong kho, trả lại slot đã gieo và lượng hạt đã dùng.
- `harvest_crop(p_slot_index integer, p_idempotency_key uuid)` xác nhận server time, chọn reward, áp dụng bonus chậu theo spec, cộng ví/ledger và reset slot nguyên tử.
- `harvest_crops(p_slot_indices integer[], p_idempotency_key uuid)` xử lý các slot đã chín, trả kết quả từng slot để UI hiển thị thành công/thất bại rõ ràng.
- `exchange_seed(p_from_seed text, p_to_seed text, p_idempotency_key uuid)` thực hiện quy tắc đổi hạt trong spec và ghi chênh lệch ví/ledger.
- `redeem_game_gift(p_gift_id uuid, p_idempotency_key uuid)` trừ ví, tạo redemption và ledger nguyên tử.
- RPC trả kiểu dữ liệu có cấu trúc cho số dư mới, reward/slot đã xử lý và lỗi nghiệp vụ; client không truyền giá hoặc reward tin cậy.

- [ ] **Bước 1: Thêm SQL test cho luật tiền và cây**

Trong PGlite test, apply migration lõi và transaction migration; test mua hạt đủ/thiếu Xu; mỗi loại cây đúng hàng; gieo thiếu hạt; retry cùng idempotency key; harvest chưa chín/chín/lặp; đổi hạt; đổi quà thiếu tiền; pot threshold; snail timestamp.

- [ ] **Bước 2: Chạy test và xác nhận các RPC chưa tồn tại**

Chạy `bun run test -- src/db/vuon-rong-transactions.test.ts`; kết quả mong đợi: FAIL ở các RPC chưa được tạo.

- [ ] **Bước 3: Tạo RPC với khóa hàng và cập nhật ledger cùng transaction**

Khóa wallet và slot liên quan bằng `FOR UPDATE`; kiểm tra `auth.uid()` và quyền gọi. Dùng idempotency key unique để cùng một thao tác retry không thực hiện lần hai. Tính reward ngẫu nhiên phía database/server, dùng giờ UTC từ database, và ghi ledger cùng lúc cập nhật balance.

- [ ] **Bước 4: Chạy lại SQL test, gồm race và invariants**

Kiểm tra mỗi thao tác được gọi lặp bằng cùng key chỉ ghi một ledger entry; harvest thứ hai không cộng Xu; balance và inventory không âm; `plant_crops` bỏ qua slot sai/đã trồng và không dùng quá số hạt tồn.

- [ ] **Bước 5: Rà soát quyền EXECUTE và commit**

Thu hồi execute từ `anon` cho mọi giao dịch; chỉ `authenticated` có thể gọi các RPC user-facing. Chạy test lại và commit:

```bash
git add supabase/migrations src/db src/integrations/supabase/types.ts
git commit -m "feat: add atomic garden and wallet operations"
```

## Task 3: SePay QR nạp Xu và webhook chống cộng trùng

**Files:**
- Create: `supabase/migrations/202609250003_wallet_topups.sql`
- Create: `supabase/functions/sepay-webhook/index.ts`
- Create: `src/features/wallet/sepay-handler.ts`
- Create: `src/features/wallet/sepay-handler.test.ts`
- Modify: `src/db/vuon-rong-transactions.test.ts`
- Modify: `src/integrations/supabase/types.ts` (sinh lại sau migration topup)

**Interfaces:**
- `create_wallet_topup(p_bundle_id text, p_idempotency_key uuid)` chỉ cho user đã đăng nhập tạo order; trả `topup_id`, mã chuyển khoản duy nhất, giá VND, lượng Xu và expiry.
- Webhook nhận payload SePay, xác thực `Authorization: Apikey ...` bằng secret phía server, chỉ nhận giao dịch tiền vào có mã order/số tiền khớp, rồi dùng transaction ID SePay duy nhất để xác nhận topup và cộng ví một lần.
- `wallet_topups` lưu trạng thái `pending|paid|expired|review`, giao dịch ngân hàng, gói, số VND, số Xu, code và thời hạn.
- Gói khởi tạo dùng các mức đang hiển thị: 100.000 VND → 10.000 Xu, 300.000 → 30.000 Xu, 500.000 → 50.000 Xu; dữ liệu giá do server sở hữu.
- QR được tạo từ cấu hình tài khoản nhận tiền ở môi trường triển khai và mã order. Tài khoản ngân hàng/SePay chưa được đưa vào repo.

- [ ] **Bước 1: Viết test cho webhook hợp lệ, giả mạo và retry**

Test 200 với API key hợp lệ và giao dịch tiền vào khớp order; 401 sai API key; 400 thiếu trường; không cộng với transferType ra, code không tồn tại, sai số tiền; webhook cùng transaction ID gọi lần hai chỉ có một ledger entry.

- [ ] **Bước 2: Chạy test webhook để xác nhận chúng thất bại ban đầu**

Chạy `bun run test -- src/features/wallet/sepay-handler.test.ts`; kỳ vọng FAIL vì handler chưa có.

- [ ] **Bước 3: Thêm order topup và Edge Function**

Tạo order qua SQL function xác thực user; xác thực webhook bằng server secret; gọi một hàm database nguyên tử xử lý event và ghi transfer ID idempotent. Với amount/code không khớp, đánh dấu `review` hoặc từ chối và tuyệt đối không cộng Xu.

- [ ] **Bước 4: Chạy test, thêm test database cho topup idempotency**

Chạy Edge Function handler test qua Vitest và `bun run test -- src/db/vuon-rong-transactions.test.ts`. Kết quả mong đợi: event hợp lệ cộng đúng một lần, mọi trường hợp sai không tăng số dư.

- [ ] **Bước 5: Ghi hướng dẫn cấu hình sandbox và commit**

Ghi rõ tạo webhook test-mode, cấu hình secret bằng `supabase secrets set`, deploy function, và cấu hình account/QR qua env; không ghi secret thật vào tài liệu. Tài liệu chính thức nêu SePay POST webhook, hỗ trợ API Key và có thể gửi lại event, vì vậy handler phải xác thực và idempotent: [SePay webhook](https://developer.sepay.vn/vi/sepay-webhooks/tich-hop-webhook), [SePay VietQR](https://developer.sepay.vn/vi/tien-ich-khac/tao-qr-code).

```bash
git add supabase/migrations supabase/functions supabase/tests docs
git commit -m "feat: add SePay wallet topups"
```

## Task 4: Supabase Auth thật cho Dragon

**Files:**
- Modify: `.prettierrc` (`endOfLine: "auto"` để hỗ trợ checkout CRLF trên Windows và LF trên Unix)
- Create: `src/integrations/supabase/auth-provider.tsx`
- Create: `src/integrations/supabase/auth-provider.test.tsx`
- Modify: `src/components/auth-prototype-dialog.tsx`
- Modify: `src/routes/index.tsx`
- Modify: `src/integrations/supabase/client.ts`
- Create: `.env.example`

**Interfaces:**
- `AuthProvider` khôi phục phiên, theo dõi `onAuthStateChange`, expose `user`, `loading`, `signIn(email,password)`, `signUp(name,email,password)`, `signOut()`.
- Đăng ký tạo user Supabase Auth; profile được tạo bằng trigger database, không cho client tự gán role.
- Public env dùng `VITE_SUPABASE_URL` và `VITE_SUPABASE_PUBLISHABLE_KEY`; server-only env tách riêng.
- `returnTo` chỉ chấp nhận đường dẫn nội bộ bắt đầu bằng `/`; không chuyển hướng sang domain ngoài.

- [ ] **Bước 1: Viết test form đăng nhập/đăng ký**

Đặt Prettier `endOfLine` thành `auto`, xác nhận lint pass mà không format hàng loạt các file hiện có. Mock Supabase Auth và assert email/password tới đúng API, đăng ký yêu cầu họ tên/điều khoản, trạng thái pending khóa submit, lỗi auth hiển thị bằng tiếng Việt, đăng xuất xóa UI phiên.


- [ ] **Bước 2: Chạy test trước khi implement**

Chạy `bun run test -- src/integrations/supabase/auth-provider.test.tsx`; xác nhận FAIL do provider/API thật chưa có.

- [ ] **Bước 3: Thêm provider và thay submit giả**

Khởi tạo provider trong `src/routes/__root.tsx`; dùng Supabase browser client đã có; giữ session persistence; sửa auth dialog để gọi `signInWithPassword`, `signUp`, `signOut` tương ứng. Không đổi giao diện Dragon ngoài trạng thái loading/error cần thiết.

- [ ] **Bước 4: Chạy test và kiểm tra route trang chủ**

Chạy test provider/dialog; chạy `bun run lint`. Mở trang chủ, xác nhận các nút login/register tạo session thực khi chạy với env của test project.

- [ ] **Bước 5: Thêm env mẫu và commit**

`.env.example` chỉ liệt kê tên biến và giá trị placeholder; xác nhận `.env*` chứa credential vẫn ignore. Commit:

```bash
git add src .env.example .prettierrc
git commit -m "feat: connect Dragon auth to shared Supabase"
```

## Task 5: Ví Xu và màn hình nạp Xu Dragon

**Files:**
- Create: `src/features/wallet/wallet-api.ts`
- Create: `src/features/wallet/wallet-provider.tsx`
- Create: `src/features/wallet/wallet-components.tsx`
- Create: `src/features/wallet/wallet-components.test.tsx`
- Modify: `src/routes/index.tsx`
- Modify: `src/routes/__root.tsx`

**Interfaces:**
- Wallet provider đọc balance và ledger của user qua authenticated Supabase client/RLS; realtime refresh sau giao dịch.
- `createTopup(bundleId)` yêu cầu server tạo order và QR metadata; browser không tự ghi wallet/topup paid.
- Topup dialog hiển thị QR, mã nội dung, số VND/Xu và trạng thái đang chờ; poll order status với backoff đến paid/expired.

- [ ] **Bước 1: Thêm test UI cho ví và trạng thái thanh toán**

Mock các trạng thái loading/no wallet/insufficient/error/pending/paid/expired; assert Xu chỉ tăng khi order đọc từ backend trả `paid`, và QR dùng đúng payment code.

- [ ] **Bước 2: Xác nhận test thất bại**

Chạy test wallet component; kỳ vọng FAIL do component chưa có.

- [ ] **Bước 3: Implement data hooks và QR checkout**

Tạo wallet API dựa vào RPC/read-only RLS; tạo dialog nạp từ các gói đã có trên trang chủ. Sinh QR URL phía client từ cấu hình public tài khoản nhận tiền + payment code do server cấp. Không đưa API key webhook lên client.

- [ ] **Bước 4: Chạy test, lint và rà soát số dư**

Test paid/failed/retry states; chạy `bun run lint`. Xác nhận gói 100.000 VND nhận 10.000 Xu; UI không cộng trước khi webhook xác nhận.

- [ ] **Bước 5: Commit**

```bash
git add src/features/wallet src/routes src/components
git commit -m "feat: add Dragon Xu wallet and SePay QR checkout"
```

## Task 6: Route game, asset và hành vi người chơi

**Files:**
- Create: `src/routes/vuon-rong.tsx`
- Create: `src/features/vuon-rong/garden-api.ts`
- Create: `src/features/vuon-rong/garden-page.tsx`
- Create: `src/features/vuon-rong/garden-grid.tsx`
- Create: `src/features/vuon-rong/garden-sidebar.tsx`
- Create: `src/features/vuon-rong/garden-actions.tsx`
- Create: `src/features/vuon-rong/seed-catalog.ts`
- Create: `src/features/vuon-rong/garden-page.test.tsx`
- Create: `src/features/vuon-rong/garden-grid.test.tsx`
- Create: `public/game/bee.webp`, `bud.webp`, `cloud-row.webp`, `hero-banner.webp`, `kol-ai-logo.webp`, `pot.webp`, `pumpkin.webp`, `sky-night.webp`, `vine.webp`
- Modify: `src/routes/index.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- `garden-api.ts` expose `loadGarden()`, `buySeeds(seedKey, quantity)`, `plant(slotIndex, seedKey)`, `plantMany(slotIndices, seedKey)`, `harvest(slotIndex)`, `harvestAll()`, `exchangeSeed(from,to)` and `redeemGift(giftId)`; `harvestAll()` calls `harvest_crops` once and renders per-slot results. All mutations call RPC and refresh wallet/garden from database result.
- `seed-catalog.ts` maps exactly seven crop keys to server catalog values; do not trust client prices or time.
- `GardenPage` consumes current authenticated user and wallet provider; renders asset-based game UI, pot threshold/progress, slot list and action dialogs.

- [ ] **Bước 1: Thêm test trang/grid cho rule và trạng thái UI**

Kiểm tra 12 slot, hàng dưới-only, loading/error, count-down từ `planted_at`/`ready_at`, thiếu inventory, cây chín, reward từ response máy chủ, seed catalog matches exact values. Dùng fake timers cho countdown; không giả lập backend reward như nguồn đáng tin.

- [ ] **Bước 2: Chạy test để xác nhận thất bại**

Chạy `bun run test -- src/features/vuon-rong`; test phải FAIL vì route và component chưa tồn tại.

- [ ] **Bước 3: Sao chép asset vào public/game**

Copy 9 webp từ `D:\Phong Menly Course\Game\` theo tên trong Files; kiểm tra kích thước hợp lý và transparency vẫn giữ. Không chỉnh sửa asset gốc.

- [ ] **Bước 4: Implement API wrappers và components**

Call RPC theo user session; tạo route `/vuon-rong` với client-side auth loading/redirect về `/?auth=login&returnTo=/vuon-rong`. Trang chủ đọc `auth`/`returnTo` search params để mở modal login và sau đăng nhập điều hướng về route nội bộ đó. Dữ liệu slot/wallet chỉ query sau khi có session. Hiển thị chậu theo bài học thật; nếu chưa có bài học thì progress là 0 và chậu đầu tiên mở.

- [ ] **Bước 5: Thêm menu vào trang chủ và giao diện responsive**

Tạo CTA “Vườn Rồng Tri Thức” tới route mới; giữ trang chủ Dragon; trang game không render khu vực bán Skill, thanh toán hay card giới thiệu khác. Dùng asset được cung cấp, hỗ trợ mobile, bàn phím, trạng thái lỗi và retry.

- [ ] **Bước 6: Chạy test, lint và build**

Chạy garden tests, wallet tests, `bun run lint`, `bun run build`. Sửa lỗi trước khi commit.

- [ ] **Bước 7: Commit**

```bash
git add public/game src
git commit -m "feat: add Vườn Rồng game route"
```

## Task 7: Tích hợp test end-to-end và chuyển deployment

**Files:**
- Create: `docs/superpowers/runbooks/vuon-rong-release.md`
- Modify: `vite.config.ts` chỉ nếu kiểm tra chứng minh cần adapter Vercel
- Modify: `.env.example`
- Test: toàn bộ tests từ task trước và Supabase test suite

**Interfaces:**
- Release runbook liệt kê env key names, migration order, Supabase function deploy, SePay test webhook/QR, Vercel build/preview, rollback.
- Không chứa API key, service-role key, secret SePay, số tài khoản riêng tư hoặc dữ liệu user.

- [ ] **Bước 1: Cài Supabase local và chạy tất cả database/frontend tests**

Chạy `bun run test`, `bun run lint`, `bun run build`. Nếu Docker/Supabase CLI có sẵn, chạy thêm `supabase start`, `supabase db reset`, `supabase test db`. Mọi test cục bộ phải pass trước deploy.

- [ ] **Bước 2: Kiểm tra deployment adapter và preview**

Xác nhận target Vercel cho Nitro theo version đang khóa trong `bun.lock`. Chỉ sửa `vite.config.ts` nếu local build và Vercel preview chứng minh preset Cloudflare hiện tại không chạy. Không nâng cấp framework ngoài phạm vi.

- [ ] **Bước 3: Tạo cấu hình Supabase mới bằng secret manager**

Đặt `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SEPAY_WEBHOOK_API_KEY`, cùng thông tin tài khoản QR trong môi trường tương ứng. Deploy migrations và `sepay-webhook` vào project `fjefdnvvkezuamiiushl`; kiểm tra ref/URL hiển thị trong app trước khi nhập secret.

- [ ] **Bước 4: Chạy nghiệm thu sandbox trước giao dịch thật**

Tạo tài khoản test A/B; xác minh login/đăng xuất, owner-scoped RLS, gieo/thu hoạch/đổi quà, duplicate RPC, SePay Test mode QR và duplicate webhook; kiểm tra không có secret trong build assets.

- [ ] **Bước 5: Xác minh tài khoản cũ và Vercel Preview**

Đếm/kiểm tra auth users hiện hữu trên Lovable Cloud mà không đọc/export secret. Nếu có user thật, chạy pilot tài khoản và xác định reset/re-register hoặc kế hoạch migration trước cutover. Deploy Vercel Preview, xác minh route game và xác thực. Giữ Lovable Cloud hiện trạng để rollback.

- [ ] **Bước 6: Chốt runbook và commit**

```bash
git add docs/superpowers/runbooks .env.example vite.config.ts
git commit -m "docs: add Dragon garden release runbook"
```

## Coverage tự kiểm tra

- Auth dùng chung, protect route, profile/wallet/progress và migration rollback: Tasks 1, 4, 5, 7.
- 12 ô, cây, luật hàng, timers, snail, pot bonus, assets và UI: Tasks 1, 2, 6.
- Ví chung, ledger, topup QR, SePay webhook và chống retry: Tasks 1–3, 5, 7.
- RLS, không ghi trực tiếp balance, race/idempotency: Tasks 1–3, 7.
- Không đổi The Skill, không iframe, responsive game-only screen: Tasks 6–7.
- Tài khoản Lovable Cloud còn dùng, Vercel target và rollback: Task 7.

## Ghi chú cho lúc thực thi

- Repo nguồn được clone hiện là working checkout riêng `D:\Web Dragon System 3-giao-dien-dep-review`, sạch lúc bắt đầu; nhánh thiết kế hiện tại là `docs/vuon-rong-dragon-design` và commit thiết kế chưa push.
- Tạo worktree/branch triển khai riêng khi người dùng duyệt kế hoạch và chọn cách thực thi. Không dùng thư mục `D:\Web Dragon System 3` làm repo Dragon vì đó là repo The Skill có thay đổi chưa commit.
- SePay yêu cầu endpoint public HTTPS, webhook secret và thông tin QR/account trong môi trường triển khai; các giá trị này chưa có trong repo và không được bịa.
- Người dùng chưa cung cấp danh sách quà cụ thể; game cần hỗ trợ catalog rỗng và chỉ bật đổi quà sau khi admin cấu hình sản phẩm/giá.
