// TEST ONLY: isolated manufactured fixtures. Never imports backend code or forwards requests.
const http = require("node:http");
const mode = process.argv.includes("--uncertain") ? "uncertain" : process.argv.includes("--reject") ? "reject" : "success";
const products = Array.from({ length: 13 }, (_, index) => ({
  product_id: `THU-${String(index + 1).padStart(2, "0")}`,
  name: `${["Hộp trà", "Túi gạo", "Chai nước", "Hộp bánh", "Gói cà phê", "Hộp sữa", "Túi đường", "Gói muối", "Chai dầu", "Hộp đậu", "Gói mì", "Túi bột", "Hũ mật"][index]} thử nghiệm`,
  category: "Hàng thử nghiệm", inventory_count: 100,
}));
const counts = { recognize: 0, confirm: 0, successfulConfirm: 0 };
let lastConfirmation = null;
let transactionId = 0;
const boxes = [[120, 140, 320, 490], [390, 180, 590, 530], [680, 120, 900, 500]];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700" viewBox="0 0 1000 700"><rect width="1000" height="700" fill="#eee9df"/><text x="50" y="65" font-size="28">Ảnh thử nghiệm — không phải hàng thật</text>${boxes.map(([x1, y1, x2, y2], i) => `<rect x="${x1}" y="${y1}" width="${x2-x1}" height="${y2-y1}" rx="16" fill="${i === 2 ? "#d18b69" : "#9faf7a"}"/><text x="${x1 + 20}" y="${y1 + 75}" font-size="23">${i === 2 ? "Chưa rõ" : "Hộp trà"}</text>`).join("")}</svg>`;

function json(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

http.createServer(async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }
  const url = new URL(request.url, "http://127.0.0.1:8187");
  if (request.method === "GET" && url.pathname === "/test-status") {
    json(response, 200, { testOnly: true, mode, counts, lastConfirmation }); return;
  }
  if (request.method === "GET" && url.pathname === "/test-image.svg") {
    response.writeHead(200, { "Content-Type": "image/svg+xml; charset=utf-8" }); response.end(svg); return;
  }
  if (request.method === "GET" && url.pathname === "/api/v1/products") {
    const search = (url.searchParams.get("search") || "").toLocaleLowerCase("vi");
    const limit = Math.max(0, Number(url.searchParams.get("limit") || 100));
    json(response, 200, products.filter((item) => `${item.name} ${item.product_id}`.toLocaleLowerCase("vi").includes(search)).slice(0, limit)); return;
  }
  if (request.method !== "POST" || !["/api/v1/recognize", "/api/v1/inventory/confirm"].includes(url.pathname)) {
    json(response, 404, { detail: "Đường dẫn ngoài phạm vi thử nghiệm." }); return;
  }
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 20 * 1024 * 1024) { json(response, 413, { detail: "Ảnh thử nghiệm quá lớn." }); return; }
      chunks.push(chunk);
    }
    if (url.pathname === "/api/v1/recognize") {
      counts.recognize++;
      json(response, 200, boxes.map((box, index) => ({
        detection_id: `thu-vung-${counts.recognize}-${index + 1}`, box,
        product_id: index < 2 ? products[0].product_id : null,
        name: index < 2 ? products[0].name : null,
        inventory_count: index < 2 ? products[0].inventory_count : null,
        distance: index < 2 ? 0.12 : null,
        status: index < 2 ? "recognized" : "unknown", candidates: [],
      }))); return;
    }
    counts.confirm++;
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    lastConfirmation = payload;
    if (mode !== "success") {
      json(response, mode === "uncertain" ? 500 : 400, { detail: "Tình huống lỗi thử nghiệm có chủ đích." }); return;
    }
    const items = payload.confirmed_items;
    if (!Array.isArray(items) || items.length === 0 || items.some((item) =>
      !products.some((product) => product.product_id === item.product_id) || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || !["stock_in", "stock_out"].includes(item.action))) {
      json(response, 400, { detail: "Phiếu thử nghiệm không hợp lệ." }); return;
    }
    const confirmed = items.map((item) => {
      const product = products.find((candidate) => candidate.product_id === item.product_id);
      const delta = item.action === "stock_out" ? -item.quantity : item.quantity;
      product.inventory_count += delta;
      return { ...item, quantity_delta: delta, inventory_count: product.inventory_count, transaction_id: ++transactionId };
    });
    counts.successfulConfirm++;
    json(response, 200, { confirmed_items: confirmed, rejected_items: [] });
  } catch {
    json(response, 400, { detail: "Không đọc được dữ liệu thử nghiệm." });
  }
}).listen(8187, "127.0.0.1", () => {
  console.log(`TEST ONLY — chỉ dữ liệu thử nghiệm tại http://127.0.0.1:8187; chế độ ${mode}. Không có kết nối kho thật.`);
});
