# Bản nháp so sánh bố cục kiểm kho

## Giả định và kế hoạch

- Người dùng đã chọn hướng cân bằng; giữ hai hướng còn lại để đối chiếu.
- Giữ thanh điều hướng ngang; chỉ so sánh màn rà soát kết quả kiểm kho.
- Ba hướng: cân bằng ảnh/danh sách, ưu tiên ảnh với dải mặt hàng, ưu tiên bảng với ảnh chi tiết.
- Cùng ba mặt hàng minh họa, không ảnh kho thật và không kết nối API.
- HTML/CSS thuần theo ngôn ngữ Ant Design trong https://ant.design/design.md; không sử dụng thư viện thành phần Ant Design ở thời gian chạy.
- Nền sáng, lưới 4 px, bo 6/8 px, chữ hệ thống 16 px. Màu chủ đạo #0958D9 là tùy chỉnh tăng tương phản so với màu mặc định #1677FF.
- Trình tự: dựng trang so sánh → kiểm tra trình duyệt máy tính/điện thoại → người dùng chọn bố cục → mới bàn triển khai ứng dụng.

## Xem bản nháp

Mở `index.html` trực tiếp hoặc qua máy chủ tĩnh. Ba nút đầu trang đổi bố cục, giữ nguyên mặt hàng đang chọn. Phím 1/2/3 chọn mặt hàng; phím 0 đặt lại lựa chọn. Phím Enter mở phiếu minh họa; phím 0 đóng phiếu. Chuột và nút trên trang có hành vi tương ứng. Các mục điều hướng còn lại chỉ thông báo phạm vi bản nháp.

Không có lưu trữ, cập nhật tồn kho, chỉnh sửa dữ liệu thật hoặc yêu cầu mạng. Phiếu chỉ minh họa bước rà soát, không phải biên nhận giao dịch.

## Còn chờ

- Duyệt chi tiết hướng cân bằng trước khi triển khai ứng dụng.

## Đã kiểm tra

- Mở và quan sát cả ba bố cục trong trình duyệt; thử thêm bố cục bảng ở cửa sổ hẹp.
- Chọn mặt hàng bằng chuột và phím số, mở phiếu bằng Enter, đóng phiếu bằng 0.
- Enter trên vùng chưa chọn chọn vùng trước; Enter trên vùng đang chọn mở phiếu.
- Đã sửa vấn đề tiêu điểm được tác vụ rà soát phát hiện và kiểm tra lại trong trình duyệt.
- Cú pháp JavaScript và `git diff --check` đạt. Không kiểm thử API hoặc giao dịch kho vì bản nháp không kết nối các chức năng đó.

## Điều chỉnh theo phản hồi

- Bỏ hướng dẫn lặp lại, ghi chú dưới danh sách và chú giải vùng ảnh.
- Vùng ảnh và dòng hàng đang chọn dùng nhấn sáng cùng bóng đổ; giữ nhãn trợ năng và thông báo cho trình đọc màn hình.
- Giữ phím tắt cạnh hành động; chỉ hiện thông báo khi có thao tác liên quan.

- Bỏ chỉ báo bước 1/2/3; bước xác nhận cuối nằm trong hộp thoại.
