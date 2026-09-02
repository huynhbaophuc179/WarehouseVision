# Hệ thống nhận diện và kiểm kho

Ứng dụng chạy hoàn toàn bằng giao diện React/Vite. Giao diện Streamlit cũ đã được loại bỏ.

## Kiến trúc

- `src/`: giao diện React 18, TypeScript, Vite và Tailwind CSS.
- `app/`: API FastAPI, nhận diện vùng bằng YOLO, mã hàng bằng CLIP và tìm kiếm vector.
- PostgreSQL 15 cùng pgvector: lưu sản phẩm, vector ảnh tham chiếu, giao dịch kho và phiên rà soát.
- `models/warehouse.pt`: trọng số YOLO tùy chỉnh dùng để tìm vùng sản phẩm.
- `data/`: ảnh tham chiếu, ảnh phiên và dữ liệu huấn luyện phát sinh trong quá trình sử dụng.

Luồng nhận diện chính:

```text
Ảnh chụp -> YOLO tìm vùng -> CLIP tạo vector -> pgvector tìm mã hàng -> người dùng xác nhận -> cập nhật kho
```

## Khởi chạy bằng Docker

Yêu cầu Docker Desktop đang hoạt động. Từ thư mục gốc dự án chạy:

```bash
docker compose up -d --build
```

Sau khi các dịch vụ sẵn sàng:

- Giao diện: http://localhost:5173
- API: http://localhost:8000
- Kiểm tra API: http://localhost:8000/health

Xem nhật ký:

```bash
docker compose logs -f api frontend
```

Dừng hệ thống nhưng giữ dữ liệu:

```bash
docker compose down
```

Xóa cả cơ sở dữ liệu Docker để làm lại từ đầu:

```bash
docker compose down -v
```

Lệnh cuối cùng xóa dữ liệu PostgreSQL. Ảnh trong thư mục `data/` vẫn còn trên máy.

## Mô hình nhận diện

Tệp `models/warehouse.pt` được lưu trong Git và được Docker gắn vào `/models/warehouse.pt`. Cấu hình hiện tại là:

```yaml
YOLO_MODEL_PATH: /models/warehouse.pt
CLIP_MODEL_NAME: openai/clip-vit-base-patch32
```

Mã kiểm tra SHA-256 của mô hình YOLO đi kèm:

```text
5d4a46f4a6063ad65108df236d5f2240dcf500df90e864dfd4e02df72b26b15b
```

CLIP không được lưu trong Git vì có dung lượng lớn. Ở lần khởi động đầu tiên, thư viện Transformers tải `openai/clip-vit-base-patch32` và lưu vào Docker volume `model_cache`. Vì vậy máy mới cần kết nối mạng một lần. Muốn triển khai hoàn toàn ngoại tuyến, cần chuyển riêng nội dung bộ nhớ đệm Hugging Face sang máy đích trước khi khởi động.

Mô hình YOLO chỉ tìm vùng sản phẩm. Danh tính mã hàng phụ thuộc vào ảnh tham chiếu và vector đang lưu trong PostgreSQL; tệp `warehouse.pt` không chứa danh sách SKU của doanh nghiệp.

## Dữ liệu cần bàn giao

Git chứa mã nguồn, tệp mẫu và mô hình YOLO. Git không chứa dữ liệu vận hành cục bộ:

- PostgreSQL volume `postgres_data`: sản phẩm, vector, tồn kho, giao dịch và phiên rà soát.
- `data/product_references`: ảnh tham chiếu của sản phẩm.
- `data/yolo_dataset`: dữ liệu huấn luyện vùng sản phẩm.
- Docker volume `model_cache`: mô hình CLIP đã tải.

Nếu bàn giao một hệ thống đã có SKU và ảnh tham chiếu, cần xuất cơ sở dữ liệu PostgreSQL và sao chép thư mục `data/` ngoài việc clone Git. Nếu chỉ bàn giao mã nguồn để tạo dữ liệu mới, clone Git và chạy Docker Compose là đủ sau lần tải CLIP đầu tiên.

## Chạy giao diện khi phát triển

Khởi động cơ sở dữ liệu và API:

```bash
docker compose up -d db api
```

Sau đó chạy giao diện:

```bash
npm ci
npm run dev
```

## Kiểm tra

```bash
npm run build
docker compose config
docker compose exec -T api python smoke_tests.py
```

## Biến môi trường chính

- `DATABASE_URL`: kết nối PostgreSQL.
- `CORS_ALLOWED_ORIGINS`: nguồn được phép gọi API.
- `YOLO_MODEL_PATH`: đường dẫn mô hình tìm vùng.
- `CLIP_MODEL_NAME`: tên hoặc đường dẫn mô hình tạo vector.
- `AUTO_ACCEPT_SCORE_THRESHOLD`: ngưỡng tự động chấp nhận mã hàng, mặc định `0.75`.
- `DETECTOR_RECOGNIZED_CONFIDENCE_THRESHOLD`: ngưỡng vùng nhận diện chắc chắn.
- `DETECTOR_UNCERTAIN_CONFIDENCE_THRESHOLD`: ngưỡng thấp nhất để đề nghị người dùng kiểm tra.
- `TOP_K_CANDIDATES`: số mã hàng gần nhất trả về.
- `ENABLE_OCR`: bật hoặc tắt OCR, mặc định tắt.
- `PRODUCT_REFERENCE_DIR`: nơi lưu ảnh tham chiếu.
- `YOLO_DATASET_DIR`: nơi lưu dữ liệu huấn luyện vùng sản phẩm.

## Giới hạn hiện tại

- Chưa có xác thực và phân quyền.
- Chưa tự huấn luyện lại mô hình trong ứng dụng.
- OCR mặc định tắt.
- Chất lượng nhận diện phụ thuộc mạnh vào ảnh tham chiếu, góc chụp, ánh sáng và ngưỡng đã hiệu chỉnh.
- Không được tự động cập nhật tồn kho chỉ dựa trên kết quả AI; người dùng phải xác nhận trước.
