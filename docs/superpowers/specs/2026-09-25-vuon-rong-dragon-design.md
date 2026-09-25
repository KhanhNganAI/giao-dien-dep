# Đặc tả thiết kế: Vườn Rồng Tri Thức trong Dragon System 3

## Mục tiêu

Đưa game Vườn Rồng Tri Thức vào Dragon System 3 tại đường dẫn `/vuon-rong`, dưới dạng một trang trong chính ứng dụng Dragon, không nhúng iframe. Người dùng mở game từ trang chủ Dragon và dùng cùng tài khoản đăng nhập. Màn hình game chỉ tập trung vào việc trồng cây, tiến độ học tập, Xu và quà trong game; không hiển thị trang bán hàng hay thanh toán.

The Skill tiếp tục là ứng dụng riêng, giữ luồng thanh toán tiền mặt và quyền truy cập riêng. Không trừ Xu Dragon khi mua The Skill.

Người dùng đã xác nhận có thể tái sử dụng mã nguồn và kết hợp nhiều công cụ cho bài thi Vua APP. Sản phẩm cần tùy biến để dùng được, không làm website bất động sản. Repo giao diện Dragon là `KhanhNganAI/giao-dien-dep`. Thư mục làm việc hiện tại `D:\Web Dragon System 3` là repo The Skill riêng và không thuộc phạm vi triển khai này; cần giữ nguyên các thay đổi chưa commit trong repo đó.

## Quyết định đã được duyệt

- Game chạy tại `/vuon-rong` trong ứng dụng Dragon và có liên kết từ trang chủ.
- Dragon và game dùng chung đăng nhập Supabase Auth và một số dư Xu Dragon.
- Xu Dragon có thể dùng để mua hạt giống và đổi quà trong game. Thu hoạch cây cộng Xu vào cùng ví.
- The Skill giữ luồng thanh toán và quyền sử dụng riêng, không dùng ví Xu Dragon.
- Dùng Supabase project `fjefdnvvkezuamiiushl` làm backend chung cho Dragon và game.
- Giữ Lovable Cloud hiện tại trong thời gian chuyển đổi; chỉ dừng dùng sau khi bản mới đăng nhập và lưu dữ liệu ổn định.
- Vì Dragon chưa có backend hoàn chỉnh, tạo mô hình ví Xu và tiến độ học trong Supabase mới. Chậu nâng cấp dựa trên số bài học đã hoàn thành thực tế; không tự tạo tiến độ giả.
- Mỗi tài khoản có 12 ô vườn. RLS giới hạn người dùng vào dữ liệu của chính họ.
- Các hành động làm thay đổi số dư phải được máy chủ kiểm tra và thực hiện nguyên tử. Không cho trình duyệt tự ghi số dư hay phần thưởng thu hoạch. Khóa `service_role` chỉ lưu phía máy chủ, không đưa vào Git hay mã trình duyệt.
- Mức thu hoạch được chọn ngẫu nhiên đều trong khoảng của cây. Táo, Lê, Hồng Tím và Phong Lan chỉ trồng được ở hàng dưới.

## Màn hình game và hình ảnh

Trang `/vuon-rong` giữ nhận diện Dragon ở điều hướng và chi tiết trang trí nhưng có màn chơi riêng. Dùng asset người dùng đã cung cấp khi phù hợp: nền trời đêm, dải mây, chậu, nụ hoa, dây leo, ong, bí ngô, banner và logo KOL AI. Bố cục thích ứng với màn hình nhỏ, nền trời sao tối và các ô trồng trên mây.

Màn hình gồm:

- Lưới vườn 4 cột × 3 hàng, tổng cộng 12 ô; tự co giãn trên điện thoại.
- Khu vực tiến độ học tập và mốc mở khóa chậu.
- Danh sách trạng thái của cả 12 ô.
- Cửa hàng hạt giống, kho hạt đã mua và thao tác gieo, gieo các ô trống đủ điều kiện, đổi hạt, thu hoạch các cây đã chín.
- Danh mục quà trong game để đổi bằng Xu Dragon.
- Trạng thái đang tải, trống, thành công và lỗi. Giao diện không báo giao dịch thành công nếu máy chủ chưa xác nhận.

Mốc chậu theo nội dung người dùng đã nhập (số bài học : loại chậu : thưởng): 0 : đất nung : 5%, 4 : sứ trắng : 8%, 10 : đá hoa : 10%, 18 : đồng cổ : 13%, 24 : vàng ngọc : 15%, 40 : ốc đảo nhiệt đới : 18%, 50 : vũ trụ : 22%. Dùng số bài hoàn thành trong backend chung. Đề xuất áp dụng thưởng chậu bằng cách nhân phần thưởng cơ bản đã chọn với `1 + tỷ lệ thưởng`, sau đó làm tròn xuống Xu nguyên. Đây là quy tắc tính cần người dùng rà soát trong đặc tả.

## Cây và luật vườn

Giá trong bảng là giá mua hạt giống: khi mua, Xu Dragon được trừ và hạt được cộng vào kho trong cùng giao dịch. Gieo tiêu thụ một hạt trong kho, không trừ Xu thêm lần nữa. Nếu mua không đủ Xu hoặc gieo khi kho không còn hạt phù hợp, thao tác tương ứng không làm thay đổi một phần dữ liệu. Khi thu hoạch, máy chủ chọn một số nguyên đồng xác suất trong khoảng thưởng của loại cây, áp dụng thưởng chậu nếu có, rồi cộng Xu vào cùng ví.

| Loại cây | Giá hạt (Xu) | Thời gian lớn | Thu hoạch cơ bản (Xu) | Vị trí |
| --- | ---: | ---: | ---: | --- |
| Hồng Đỏ | 5 | 2 giờ | 9–11 | Mọi hàng |
| Hoa Tím | 8 | 6 giờ | 12–16 | Mọi hàng |
| Hồng Vàng | 12 | 12 giờ | 17–22 | Mọi hàng |
| Táo | 15 | 1 ngày | 26–33 | Chỉ hàng dưới |
| Lê | 20 | 2 ngày | 44–54 | Chỉ hàng dưới |
| Hồng Tím | 25 | 2 ngày | 52–62 | Chỉ hàng dưới |
| Phong Lan | 30 | 2 ngày | 60–72 | Chỉ hàng dưới |

Đánh số hàng từ trên xuống; hàng dưới là các ô 9–12. Trạng thái ô gồm `empty`, `growing` và `harvestable`. Thời gian hoàn thành dựa trên mốc thời gian do máy chủ ghi, nên vẫn chính xác sau khi tải lại trang hoặc rời game. Chỉ máy chủ quyết định cây đã chín chưa. Hai yêu cầu thu hoạch đồng thời không thể cộng thưởng hai lần.

Giữ sự kiện ốc sên trong game theo đề xuất đã trao đổi: xác suất 5% cho mỗi lần gieo cây; sự kiện được lưu phía máy chủ và kéo dài thời gian lớn thêm 10% thời gian cơ bản của cây. Giao diện báo ốc sên và giờ hoàn thành đã điều chỉnh. Tải lại hoặc gửi lại yêu cầu không được gieo lại xác suất.

### Các chi tiết đề xuất cần rà soát

Các điểm dưới đây là cách diễn giải để đặc tả không mơ hồ; người dùng có thể sửa khi xem tài liệu:

- Thưởng chậu nhân vào khoảng thu hoạch cơ bản, làm tròn xuống Xu nguyên.
- Xác suất ốc sên được tính một lần khi gieo; thời gian lớn tăng thêm 10% thời gian cơ bản.
- Đổi hạt là đổi một hạt đang sở hữu sang hạt khác theo giá hạt hiện tại; phần chênh lệch được thu hoặc hoàn vào ví Xu Dragon. Cần xác nhận cách này đúng với ý “Đổi hạt”.
- Gieo hàng loạt gieo các ô trống đủ điều kiện mà kho có đủ hạt tương ứng; hiển thị số ô/các loại hạt sẽ dùng trước khi xác nhận.
- Danh mục và giá quà do quản trị viên cấu hình; mỗi lần đổi quà ghi lại giao dịch và lịch sử nhận quà. Danh sách quà cụ thể chưa nằm trong yêu cầu hiện tại.

## Mô hình dữ liệu và backend

Dùng Supabase project mới làm nguồn dữ liệu chính. Các nhóm bảng dự kiến:

- `profiles`: liên kết với ID người dùng Supabase Auth và thông tin hồ sơ.
- `dragon_wallets`: một số dư Xu Dragon cho mỗi người dùng.
- `dragon_wallet_transactions`: sổ giao dịch chỉ ghi nối tiếp, gồm số Xu thay đổi, loại giao dịch, mã tham chiếu, thời gian và số dư sau giao dịch. Phân biệt nạp/mua Xu, mua hạt, thưởng thu hoạch, đổi quà và đổi hạt.
- `learning_progress`: số bài hoàn thành của mỗi người, cùng nguồn hoặc mã tham chiếu cập nhật. Chỉ nguồn tin cậy phía máy chủ hoặc quản trị viên được phép thay đổi.
- `garden_slots`: 12 ô mỗi người, chỉ số ô, cây, trạng thái, thời điểm gieo/hoàn thành và trạng thái sự kiện ốc sên.
- `seed_inventory`: số lượng hạt từng loại theo người dùng.
- `game_gifts` và `gift_redemptions`: danh mục quà, giá Xu, và lịch sử đổi quà thành công.

Theo dõi SQL migrations trong repo Dragon. Thêm ràng buộc một ví mỗi người, đúng 12 chỉ số ô duy nhất cho mỗi người, số dư và số hạt không âm, loại cây/trạng thái hợp lệ, giá danh mục dương.

RLS giới hạn dữ liệu hồ sơ, ví, tiến độ, vườn, kho hạt, lịch sử giao dịch và đổi quà theo chủ sở hữu. Người dùng đã đăng nhập có thể đọc danh mục; chỉ quản trị viên sửa danh mục. Trình duyệt không được ghi trực tiếp vào ví hoặc sổ giao dịch. Dùng RPC PostgreSQL hoặc Edge Functions đã xác thực, chạy trong giao dịch cơ sở dữ liệu, cho các thao tác nạp Xu, mua/đổi hạt, gieo, thu hoạch, thao tác hàng loạt và đổi quà. Dùng mã idempotency cho webhook thanh toán và thao tác có thể gửi lại. Mỗi giao dịch SePay có mã tham chiếu duy nhất.

Chỉ cộng Xu mua sau khi webhook SePay được máy chủ xác thực. Không tin URL quay về trang web hoặc thông báo từ trình duyệt. Cấu hình SePay và bí mật triển khai được cung cấp qua biến môi trường phía máy chủ.

## Đăng nhập, triển khai và chuyển đổi

Vì game là route của ứng dụng Dragon nên cùng dùng Supabase Auth. Giao diện đăng nhập Dragon hiện là bản mẫu; tích hợp đăng ký, đăng nhập, đăng xuất và khôi phục phiên thật với project mới. Bảo vệ `/vuon-rong`; người chưa đăng nhập được chuyển tới màn đăng nhập Dragon và quay lại game sau khi đăng nhập.

Không xóa hoặc tắt Lovable Cloud khi bắt đầu chuyển đổi. Trước tiên tạo schema và cấu hình Supabase mới trong nhánh/checkout riêng, kiểm tra đăng nhập, RLS, giao dịch game và triển khai. Giữ backend cũ để khôi phục cho tới khi bản mới ổn định. Repo The Skill triển khai độc lập và SSO giữa hai tên miền nằm ngoài phạm vi hiện tại.

Repo Dragon hiện dùng TanStack Start/Vite với cấu hình Nitro hướng tới Cloudflare. Trước khi chọn Vercel làm nơi triển khai, kiểm tra cấu hình build có tương thích hay cần điều chỉnh. Không lưu secret Supabase trong file được Git theo dõi. URL và anon key công khai cùng khóa chỉ dành cho máy chủ phải được cấu hình đúng môi trường.

Việc chuyển tài khoản hiện có cần kiểm tra riêng: giao diện đăng nhập hiện tại là bản mẫu, nhưng nếu Lovable Cloud đã có tài khoản/dữ liệu thật thì không mặc định rằng mật khẩu hoặc phiên đăng nhập chuyển nguyên vẹn được sang Supabase mới. Bản triển khai phải có phương án cho người dùng hiện hữu đăng ký/đăng nhập lại hoặc quy trình chuyển tài khoản được hỗ trợ, trước khi ngừng backend cũ.

## Lỗi và tính toàn vẹn dữ liệu

- Số dư thấp khi mua hạt/đổi quà, ô/cây/hàng không hợp lệ, hết hạt khi gieo hoặc cây chưa chín thì trả lỗi rõ ràng và không cập nhật một phần dữ liệu.
- Mỗi lần trừ/cộng Xu cập nhật ví và thêm đúng một dòng ledger trong cùng giao dịch cơ sở dữ liệu.
- Yêu cầu gửi lại hoặc chạy đồng thời không thể trừ hai lần, gieo hai lần hay thu hoạch hai lần.
- Bộ đếm thời gian phía trình duyệt chỉ để hiển thị; máy chủ xác định thời gian chín và thời gian bị ốc sên ảnh hưởng.
- Webhook thanh toán phải xác thực và idempotent; xác thực lỗi thì không cộng Xu.
- Nếu Supabase không khả dụng, hiện trạng thái thử lại; không xóa dữ liệu đang hiển thị và không báo giao dịch thành công.

## Tiêu chí kiểm tra

- Các trang Dragon hiện có vẫn build và hiển thị sau khi thêm `/vuon-rong`.
- Phiên đăng nhập dùng được xuyên suốt các route Dragon và route game được bảo vệ.
- Hai tài khoản thử nghiệm không xem được dữ liệu của nhau; client không thể ghi trực tiếp số dư/ledger.
- Giá hạt, thời gian lớn, khoảng thưởng, hàng được trồng và mốc chậu khớp tài liệu.
- Phần thưởng là số nguyên đồng xác suất trong khoảng; áp dụng quy tắc thưởng chậu đã duyệt.
- Mua hạt, gieo, thu hoạch, đổi hạt, gieo hàng loạt, đổi quà và webhook giữ ví/ledger/kho hạt nhất quán khi gửi lại hoặc chạy đồng thời.
- Tải lại hoặc rời ứng dụng không đặt lại đồng hồ hoặc gieo lại sự kiện ốc sên.
- Giao diện game thích ứng kích thước màn hình, không hiển thị thanh toán hay trang bán Skill.
- Bản production trỏ đến Supabase `fjefdnvvkezuamiiushl`; Lovable Cloud giữ khả năng rollback cho tới khi kiểm tra hoàn tất.

## Ngoài phạm vi

- SSO giữa app The Skill riêng và Dragon.
- Thay đổi thanh toán trực tiếp hoặc quyền mua The Skill.
- Tạo nội dung bài học/video; phạm vi hiện tại chỉ lưu tiến độ để mở khóa chậu.
- Đổi/rút Xu game ra tiền mặt hoặc chuyển Xu sang tài khoản khác.
