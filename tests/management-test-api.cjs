// TEST ONLY: manufactured, read-only fixtures. No backend imports or request forwarding.
const http = require("node:http");
const allowedOrigin = "http://localhost:5174";
const thumbnail = "/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAEKADAAQAAAABAAAAEAAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAEAAQAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A6yiiivPPzs//2Q==";
const categoryNames = [
  "Đồ điện", "Ốc vít", "Dụng cụ cầm tay", "Thiết bị đo", "Vòng bi",
  "Dây đai", "Keo dán", "Van nước", "Ống dẫn", "Mối nối",
  "Bản lề", "Tay nắm", "Bánh xe", "Lò xo", "Đinh tán",
  "Vật tư đóng gói", "Đồ bảo hộ", "Bộ lọc", "Chổi than", "Giấy nhám",
  "Mũi khoan", "Lưỡi cắt", "Kẹp giữ", "Gioăng cao su",
  "Phụ kiện cơ khí có tên dài để kiểm tra cách hiển thị đầy đủ nội dung",
];
const products = Array.from({ length: 45 }, (_, index) => {
  const referenceCount = index % 2 === 0 ? 0 : 2;
  return {
    product_id: `THU-${String(index + 1).padStart(3, "0")}`,
    name: `${["Ốc vít đầu tròn", "Đèn điện", "Kìm cắt", "Bu lông thép", "Dây dẫn điện"][index % 5]} thử nghiệm ${index + 1}`,
    category: index % 10 === 0 ? null : categoryNames[index % categoryNames.length],
    inventory_count: [0, 3, 8][index % 3],
    embedding_count: referenceCount,
    approved_embedding_count: referenceCount,
    pending_embedding_count: 0,
    reference_image_count: referenceCount,
    thumbnail_base64: referenceCount ? thumbnail : null,
  };
});
const categories = categoryNames.map((name, index) => ({
  id: index + 1, name, product_count: products.filter((product) => product.category === name).length,
}));
const normalize = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[đĐ]/g, "d").toLowerCase().trim();
function json(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}
http.createServer((request, response) => {
  response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (request.headers.origin && request.headers.origin !== allowedOrigin) {
    json(response, 403, { detail: "Nguồn truy cập ngoài phạm vi kiểm thử." }); return;
  }
  if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }
  if (request.method !== "GET") {
    json(response, 405, { detail: "Dữ liệu kiểm thử chỉ cho phép xem; thao tác ghi đã bị chặn." }); return;
  }
  const url = new URL(request.url, "http://127.0.0.1:8187");
  if (url.pathname === "/api/v1/products") {
    const search = normalize(url.searchParams.get("search") || "");
    const parsedLimit = Number(url.searchParams.get("limit") || 100);
    const limit = Number.isFinite(parsedLimit) ? Math.max(0, parsedLimit) : 100;
    json(response, 200, products.filter((product) =>
      normalize(`${product.product_id} ${product.name} ${product.category || ""}`).includes(search)).slice(0, limit)); return;
  }
  if (url.pathname === "/api/v1/product-categories") {
    json(response, 200, { categories, unclassified_product_count: products.filter((product) => !product.category).length }); return;
  }
  const detailMatch = url.pathname.match(/^\/api\/v1\/products\/([^/]+)$/);
  if (detailMatch) {
    const product = products.find((item) => item.product_id === decodeURIComponent(detailMatch[1]));
    if (!product) { json(response, 404, { detail: "Không có mã hàng kiểm thử này." }); return; }
    json(response, 200, { ...product, embeddings: Array.from({ length: product.reference_image_count }, (_, index) => ({
      id: index + 1, product_id: product.product_id, view_label: `Góc chụp thử nghiệm ${index + 1}`,
      image_path: null, source: "manual", quality_status: "approved", image_preview_base64: thumbnail,
    })) }); return;
  }
  json(response, 404, { detail: "Đường dẫn ngoài phạm vi kiểm thử." });
}).listen(8187, "127.0.0.1", () => {
  console.log("Dữ liệu kiểm thử: 45 mã hàng, 25 phân loại; chỉ đọc tại http://127.0.0.1:8187/api/v1");
});
