import assert from "node:assert/strict";
import test from "node:test";
import { getPaginationBounds, normalizeListSearch } from "./management-list.ts";

test("tìm kiếm bỏ dấu tiếng Việt, chữ hoa và khoảng trắng ngoài", () => {
  assert.equal(normalizeListSearch("  ĐIỆN TRỞ Đỏ  "), "dien tro do");
  assert.equal(normalizeListSearch("Chưa phân loại"), "chua phan loai");
});

test("tìm kiếm nhận cùng kết quả với dấu Unicode dựng sẵn hoặc tổ hợp", () => {
  const name = "Đầu nối đồng";
  assert.equal(normalizeListSearch(name), normalizeListSearch(name.normalize("NFD")));
  assert.equal(normalizeListSearch(" \t\n "), "");
});

test("phân trang hiển thị đúng phạm vi trang đầu, giữa và cuối còn ít dòng", () => {
  assert.deepEqual(getPaginationBounds(45, 1, 20), { page: 1, pageCount: 3, start: 1, end: 20 });
  assert.deepEqual(getPaginationBounds(45, 2, 20), { page: 2, pageCount: 3, start: 21, end: 40 });
  assert.deepEqual(getPaginationBounds(45, 3, 20), { page: 3, pageCount: 3, start: 41, end: 45 });
});

test("xóa dòng duy nhất ở trang cuối chuyển về trang trước và hiển thị dữ liệu", () => {
  const previous = getPaginationBounds(41, 3, 20);
  assert.equal(previous.start, 41);
  const remaining = Array.from({ length: 40 }, (_, index) => index + 1);
  const bounds = getPaginationBounds(remaining.length, previous.page, 20);
  assert.deepEqual(bounds, { page: 2, pageCount: 2, start: 21, end: 40 });
  assert.deepEqual(remaining.slice(bounds.start - 1, bounds.end), remaining.slice(20));
});

test("danh sách rỗng luôn có phạm vi 0 đến 0 dù trước đó đang ở trang sau", () => {
  assert.deepEqual(getPaginationBounds(0, 5, 20), { page: 1, pageCount: 1, start: 0, end: 0 });
});

test("lọc hẹp từ trang sau vẫn trả đúng các phân loại khớp dấu tiếng Việt", () => {
  const categories = ["Chưa phân loại", "Điện trở", "Đầu nối điện", "Ốc vít", "Đồng hồ"];
  const filtered = categories.filter((name) => normalizeListSearch(name).includes(normalizeListSearch("DIEN")));
  const bounds = getPaginationBounds(filtered.length, 3, 2);
  assert.deepEqual(bounds, { page: 1, pageCount: 1, start: 1, end: 2 });
  assert.deepEqual(filtered.slice(bounds.start - 1, bounds.end), ["Điện trở", "Đầu nối điện"]);
});

test("số dòng vừa đủ một trang không tạo thêm trang trống", () => {
  assert.deepEqual(getPaginationBounds(20, 2, 20), { page: 1, pageCount: 1, start: 1, end: 20 });
  assert.deepEqual(getPaginationBounds(1, 1, 20), { page: 1, pageCount: 1, start: 1, end: 1 });
});

test("trang vượt giới hạn và kích thước trang không dương được đưa về giá trị hợp lệ", () => {
  assert.deepEqual(getPaginationBounds(7, -2, 3), { page: 1, pageCount: 3, start: 1, end: 3 });
  assert.deepEqual(getPaginationBounds(7, 99, 3), { page: 3, pageCount: 3, start: 7, end: 7 });
  assert.deepEqual(getPaginationBounds(3, 2, 0), { page: 2, pageCount: 3, start: 2, end: 2 });
});
