# Đồng bộ bảng dữ liệu và bộ lọc quản trị

Ngày: 13/09/2026. Cập nhật 16/09/2026: người dùng chọn hướng bộ lọc bên trái và cho phép triển khai React: “ok implement thôi”. Trạng thái: đã triển khai, rà soát và kiểm chứng giao diện; API nghiệp vụ không chạy nên chưa kiểm chứng dữ liệu thật/thao tác ghi.

## Mục tiêu và phạm vi

- Thiết kế chuẩn chung cho hai trang Mã hàng và Phân loại: đầu trang, tìm kiếm/bộ lọc, bảng, thông báo và phân trang.
- Giữ năm mục điều hướng ngang, chế độ sáng/tối và các thao tác nghiệp vụ hiện có.
- Giao diện tối giản; không thêm thẻ chỉ số, hướng dẫn dài hoặc chức năng ngoài yêu cầu.
- Trang Rà soát chỉ là đối tượng áp dụng chuẩn trình bày chung ở bước sau nếu được duyệt; không mở rộng vào máy quét hoặc phiếu xác nhận.

## Nguồn và khác biệt trước triển khai

- [README](../../README.md), [kiến trúc giao diện](../../docs/frontend-architecture.md): React/Ant Design; trang giữ dữ liệu/quy trình, thành phần trình bày nhận thuộc tính; giữ provider sáng/tối và thanh điều hướng đã duyệt.
- [Mã hàng](../../src/components/ProductManagementPage.tsx): bộ lọc phân loại, tồn kho, ảnh nhận diện nằm bên trái trên màn hình rộng; tìm kiếm ở thanh riêng; phân trang Trước/Sau bên dưới.
- Ở màn hình hẹp, Mã hàng chỉ đưa phân loại và tồn kho vào thanh lọc; bộ lọc ảnh bị ẩn cùng cột bên trái. Bản mới cần giữ khả năng dùng cả ba bộ lọc trên màn hình hẹp.
- [Bảng mã hàng](../../src/components/product-management-table.tsx): nhiều lớp đệm/chiều rộng bên trong ô, số tồn đặt cạnh trạng thái, nội dung dài bị cắt; cần chuẩn hóa căn lề, mật độ và cách xem đầy đủ nội dung.
- Kiểm chứng trình duyệt của tác vụ chính: nút chụp ảnh/chi tiết rộng 32 px nhưng SVG cao 16 px bị co còn khoảng 0,33 px chiều rộng nên gần như mất biểu tượng. Sau duyệt, kiểm tra lớp chuyển tiếp nút và dùng thuộc tính biểu tượng Ant Design hoặc cấu hình biểu tượng 16 px không co; kiểm chứng lại kích thước hiển thị thực.
- [Phân loại](../../src/components/CategoryManagementPage.tsx): ba thẻ tổng quan, không có tìm kiếm/phân trang; ô số căn giữa, thao tác căn phải; bảng dựng trực tiếp tại trang và có hàng Chưa phân loại riêng.
- [Rà soát](../../src/components/ReviewPage.tsx) dùng bảng với chiều rộng cuộn khác theo ngữ cảnh; chỉ tham chiếu để tránh ép mọi bảng có cùng tập cột.

## Ba hướng đối chiếu

1. Bộ lọc ngang — phương án đối chiếu: tìm kiếm và các bộ lọc cùng vùng trên bảng, dành bề ngang cho dữ liệu.
2. Bộ lọc bên trái — hướng người dùng chọn ngày 16/09/2026: “bộ lọc bên trái khá okai á”; trên màn hình hẹp chuyển vùng lọc lên trên bảng theo bản nháp.
3. Bộ lọc thu gọn — ưu tiên diện tích bảng; hiển thị điều kiện đang áp dụng và số bộ lọc, mở vùng lọc khi cần.

Mỗi hướng minh họa cả Mã hàng và Phân loại, hỗ trợ sáng/tối. Phân loại chỉ có tìm kiếm phù hợp dữ liệu; không thêm bộ lọc tồn kho/ảnh hoặc điều kiện không có ý nghĩa. Dữ liệu và thao tác trong HTML là minh họa để đánh giá thiết kế, không xác nhận hoạt động API.

## Chuẩn chung đề xuất

- Đầu trang thống nhất thứ bậc tiêu đề, số kết quả và vị trí hành động chính/phụ; giữ nguyên các hành động hiện có.
- Điều khiển cao 40 px theo cấu hình diện mạo hiện tại; hàng dữ liệu đề xuất cao tối thiểu 56 px, cùng đệm giữa hai trang, cho phép tăng khi nội dung cần xuống dòng.
- Văn bản căn trái; số lượng căn phải và dùng chữ số có độ rộng bằng nhau; trạng thái có chữ kèm màu; thao tác căn phải, nút biểu tượng có nhãn trợ năng và chú thích tiếng Việt.
- Nút thao tác đề xuất 32 px trên màn hình rộng và tối thiểu 40 px trên màn hình hẹp; biểu tượng 16 px không bị co bởi đệm hoặc bố cục nút.
- Nội dung dài được cắt có chủ đích với cách xem đầy đủ; ảnh giữ tỷ lệ, có trạng thái thiếu ảnh; không suy diễn điểm nhận diện thành xác suất.
- Vùng thông báo lỗi/thành công thống nhất; phân biệt đang tải, chưa có dữ liệu và không có kết quả lọc. Không thêm hành động thử lại nếu trang chưa cung cấp hàm tương ứng.
- Phân trang dùng cùng cách đếm/phạm vi kết quả; đặt lại trang khi điều kiện lọc đổi và bảo đảm trang còn hợp lệ khi dữ liệu giảm. Phân loại áp dụng tìm kiếm và phân trang, giữ hàng Chưa phân loại theo nghiệp vụ hiện có.
- Trên màn hình hẹp, bộ lọc xuống dòng hoặc thu gọn tùy hướng; mọi bộ lọc vẫn truy cập được, chỉ bảng cuộn ngang, toàn trang không tràn ngang.
- Giữ quy tắc xóa hai bước và hàng Chưa phân loại của Phân loại; giữ chụp ảnh, chi tiết và các thao tác đầu trang Mã hàng. Không đổi API, ngưỡng tồn kho hay ranh giới xác nhận kho.

## Ghép thành phần React đã được duyệt

- Khung trang quản trị: nhận đầu trang, vùng lọc, thông báo, bảng và phân trang qua thành phần con; không gọi API.
- Đầu trang và thanh lọc: dùng lại bố cục/khoảng cách; từng trang cung cấp trường lọc và thao tác thực tế.
- Bảng: dùng Ant Design với cấu hình hiển thị chung; từng trang sở hữu kiểu dữ liệu, khóa hàng, cột nghiệp vụ và hàm thao tác.
- Phân trang: phần trình bày có điều khiển từ bên ngoài; trang sở hữu tìm kiếm, bộ lọc, truy vấn, dữ liệu đã lọc và trạng thái trang.
- Tái sử dụng token sáng/tối hiện có; chỉ tách phần thực sự dùng chung, không tạo lớp trừu tượng bao toàn bộ API bảng.

## Phân công và kiểm tra tích hợp

- Tác vụ chính sở hữu `management-page.tsx`, `management-pagination.tsx`, `management-filters.tsx`, `management.css` và `lib/management-list.ts`: khung trình bày, vùng lọc bên trái, phân trang có điều khiển và tiện ích danh sách.
- Nhánh Mã hàng sở hữu `ProductManagementPage.tsx` và `product-management-table.tsx`; nhánh Phân loại sở hữu `CategoryManagementPage.tsx` và `category-management-table.tsx`. Không sửa chéo tệp; thống nhất thuộc tính thành phần dùng chung trước tích hợp.
- Trang tiếp tục sở hữu trạng thái và API nghiệp vụ; giữ truy vấn, thao tác ghi, làm mới dữ liệu và xác nhận xóa hiện có. Chỉ triển khai hai trang trên.
- Kiểm tra trang cuối sau xóa/làm mới: giới hạn trang theo dữ liệu đã lọc trước khi cắt danh sách; dữ liệu rỗng không hiển thị phạm vi âm hoặc trang vượt giới hạn.
- Khi đổi tìm kiếm hoặc bộ lọc, về trang đầu; kiểm tra tìm kiếm không dấu của Phân loại, xóa tìm kiếm và kết hợp cả ba bộ lọc Mã hàng. Tìm kiếm Mã hàng giữ hành vi API hiện có, không bảo đảm tìm không dấu. Đếm kết quả nhất quán với dữ liệu thực sự hiển thị, kể cả hàng Chưa phân loại.
- Kiểm tra màn hình hẹp giữ đủ phân loại, tồn kho và ảnh nhận diện; chỉ bảng cuộn ngang. Kiểm tra biểu tượng thao tác có chiều rộng/cao thực 16 px, không bị co; giữ nhãn trợ năng, chú thích và toàn bộ nội dung tiếng Việt.

## Tiến độ và tiêu chí hoàn tất

- [x] Đọc nguồn và xác định khác biệt giữa hai trang.
- [x] Hoàn thành ba bố cục HTML dùng chung trình kết xuất, mỗi bố cục có hai trang và sáng/tối: `design-demos/ant-design/data-tables.html`.
- [x] Rà mã và cú pháp JavaScript; kiểm tra trình duyệt ba bố cục, hai trang, tìm kiếm không dấu, xóa tìm kiếm, phân trang, trạng thái rỗng, hộp chi tiết và đổi sáng/tối. Màn hình đo được 480 px không tràn trang, cả ba trường lọc vẫn hiển thị; bảng cuộn riêng. Không có lỗi console. Lựa chọn giá trị trong select gốc chưa kiểm chứng tự động thành công do thao tác của công cụ không đổi lựa chọn; logic kết hợp bộ lọc được rà mã, không coi là đã kiểm thử chọn giá trị trên trình duyệt.
- [x] Người dùng chọn phương án 2 — bộ lọc bên trái, dùng chung cho Mã hàng và Phân loại.
- [x] Người dùng cho phép triển khai React: “ok implement thôi”.
- [x] Tác vụ chính: hoàn thành khung, vùng lọc, phân trang, kiểu trình bày và tiện ích chung.
- [x] Nhánh Mã hàng: ghép hướng 2, giữ truy vấn/thao tác và đủ ba bộ lọc trên mọi kích thước.
- [x] Nhánh Phân loại: ghép hướng 2, tách bảng, thêm tìm kiếm/phân trang và giữ xóa hai bước/hàng Chưa phân loại.
- [x] Tích hợp: biên dịch, rà soát mã, kiểm tra lọc/phân trang và thao tác mở/đóng bằng dữ liệu thử nghiệm, kiểm chứng bố cục sáng/tối và màn hình hẹp. Chưa kiểm chứng tải/ghi dữ liệu qua API nghiệp vụ đang tắt.
- [x] Cập nhật tài liệu kiến trúc và ghi nhận mức kiểm chứng thực tế đến hiện tại. Trang Rà soát nằm ngoài đợt triển khai này.

## Kết quả tích hợp hiện có — 16/09/2026

- Biên dịch TypeScript/Vite đạt, còn cảnh báo kích thước gói JavaScript; 71 kiểm thử thư viện và 18 kiểm thử kết xuất máy quét phía máy chủ đạt (89 tổng cộng); kiểm tra Ant Design trên `src` có 0 lỗi.
- React Doctor: 62/100, 42 cảnh báo. Một cảnh báo thuộc hiệu ứng đồng bộ trang hợp lệ của Phân loại; phần còn lại thuộc mã hiện có hoặc ngoài phạm vi. Không ghi nhận là hoàn toàn sạch.
- Trình duyệt ứng dụng ở chiều rộng thực 480 px: không tràn ngang toàn trang, ba bộ lọc Mã hàng đều hiện, tìm kiếm Phân loại chuyển lên trên bảng; đã xem chế độ tối và mở/đóng hộp thêm mã hàng, nhập danh sách.
- Bản kiểm thử dùng thành phần thật với 45 mã hàng/25 phân loại: phân trang Mã hàng `1–20` → `21–40` → `41–45`; tìm `THU-014` từ trang 3 về `1–1`, xóa bộ lọc khôi phục 45; đổi 10 dòng/trang về `1–10`. Kết hợp “Sắp hết”/“Đã có ảnh”/“Đồ điện” còn lần lượt 15/8/1 dòng, mở đúng chi tiết `THU-026`.
- Phân loại có 26 dòng kể cả mặc định: phân trang `1–20` → `21–26`; tìm `do dien` ra “Đồ điện”, tìm không khớp ra rỗng `0–0`; mở đổi tên/hủy đạt, bấm xóa lần đầu chỉ chuyển sang “Xác nhận xóa”, không bấm xác nhận cuối.
- Bản kiểm thử tối 480 px: chiều rộng cuộn tài liệu bằng 480 px ở cả hai trang, đủ ba bộ lọc, bảng Mã hàng cuộn ngang riêng rộng 780 px. Nút Phân loại 44 px/biểu tượng 16 px; biểu tượng màn hình lớn 16 px. Không có cảnh báo/lỗi trong bảng điều khiển trình duyệt bản kiểm thử.
- Rà soát mã cuối hoàn tất, không có phát hiện mới ngăn tích hợp. Các tệp `tests/management-preview.html`, `tests/management-preview.tsx`, `tests/management-test-api.cjs` chỉ phục vụ kiểm thử tách biệt; API thử nghiệm từ chối ghi bằng `405`, không đổi nguồn dữ liệu vận hành. API nghiệp vụ hiện không chạy: chưa xác minh tải, lưu, nhập hoặc xóa dữ liệu thật. Chi tiết trong [kiến trúc giao diện](../../docs/frontend-architecture.md).

## Câu hỏi còn lại

- Không có. Hướng 2 và việc triển khai React đã được người dùng xác nhận; không cần duyệt lại.
