# Hướng thiết kế đã chọn

Ngày: 12/09/2026.

Người dùng: “Mình thích hướng cân bằng hơn”. Yêu cầu tiếp: bỏ ghi chú hướng dẫn thừa và chú giải ảnh, dùng nhấn sáng và độ nổi để thể hiện ngữ cảnh.

Chọn phương án cân bằng trong ba bản nháp tại index.html. Phạm vi lượt này: chỉnh bản HTML đã chọn, chưa chuyển giao diện ứng dụng.

## Bảng dữ liệu và bộ lọc — 16/09/2026

Người dùng: “bộ lọc bên trái khá okai á”.

Chọn phương án 2 trong `data-tables.html?direction=2&view=categories`, áp dụng chuẩn chung cho Mã hàng và Phân loại. Giữ điều hướng và bảng màu sáng/tối đã chọn. Mã hàng có tìm kiếm cùng ba bộ lọc phân loại, tồn kho, ảnh; Phân loại chỉ có tìm kiếm phù hợp. Trên màn hình hẹp, vùng lọc chuyển lên trên bảng theo bản nháp. Ba phương án đã được xem và chụp trực tiếp trong hội thoại; không có tệp ảnh chụp riêng.

Sau khi chọn hướng, người dùng xác nhận tiếp ngày 16/09/2026: “ok implement thôi”. Đã triển khai React cho Mã hàng và Phân loại bằng khung trang, vùng lọc và chân phân trang dùng chung; giữ hành động và API nghiệp vụ hiện có. Mã hàng giữ đủ ba bộ lọc trên màn hình hẹp; Phân loại thêm tìm kiếm không dấu và phân trang, giữ hàng mặc định và xóa hai bước.

Đã hoàn tất triển khai và kiểm chứng giao diện: biên dịch đạt (còn cảnh báo kích thước gói), 89 kiểm thử đạt, kiểm tra Ant Design có 0 lỗi; rà soát mã cuối không có phát hiện mới ngăn tích hợp. Trình duyệt xác minh bố cục 480 px và chế độ tối, đủ ba bộ lọc, kích thước biểu tượng, tìm kiếm/phân trang, kết hợp bộ lọc và mở/đóng hộp thoại trên thành phần thật với dữ liệu thử nghiệm tách biệt. API thử nghiệm chỉ đọc; bước xóa cuối không được thực hiện. API nghiệp vụ hiện không chạy nên chưa xác minh tải hoặc ghi dữ liệu thật. Chi tiết tại [kế hoạch triển khai](../../plans/20260913-management-tables/plan.md).
