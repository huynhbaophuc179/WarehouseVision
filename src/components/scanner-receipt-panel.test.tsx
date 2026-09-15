import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ScannerReceiptPanel, type ScannerReceiptPanelProps } from "./scanner-receipt-panel";

function receipt(overrides: Partial<ScannerReceiptPanelProps> = {}) {
  return renderToStaticMarkup(<ScannerReceiptPanel action="stock_in"
    items={[{ id: "gao", name: "Gạo thơm", code: "GAO-01", quantity: 1200 }]}
    onBack={() => {}} onConfirm={() => {}} {...overrides} />);
}

function buttons(html: string) {
  return [...html.matchAll(/<button\b[^>]*>/g)].map(([tag]) => tag);
}

test("phiếu hợp lệ hiển thị tổng và cho phép xác nhận nhập kho", () => {
  const html = receipt();
  assert.match(html, /<h2>Phiếu nhập kho<\/h2>/);
  assert.match(html, /<strong>1\.200<\/strong>/);
  assert.match(html, />Xác nhận nhập kho</);
  assert.equal(buttons(html).length, 2);
  assert.ok(buttons(html).every((tag) => !tag.includes("disabled")));
});

test("phiếu xuất dùng đúng tiêu đề và nhãn xác nhận", () => {
  const html = receipt({ action: "stock_out" });
  assert.match(html, /<h2>Phiếu xuất kho<\/h2>/);
  assert.match(html, />Xác nhận xuất kho</);
});

test("phiếu rỗng khóa xác nhận nhưng vẫn cho quay lại", () => {
  const html = receipt({ items: [] });
  assert.match(html, /Chưa có hàng trong phiếu/);
  assert.match(html, /<strong>—<\/strong>/);
  assert.doesNotMatch(buttons(html)[0], /disabled/);
  assert.match(buttons(html)[1], /disabled/);
});

test("phiếu có số lượng sai khóa xác nhận và không hiển thị tổng gây hiểu nhầm", () => {
  for (const quantity of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const html = receipt({ items: [{ id: "gao", name: "Gạo thơm", code: "GAO-01", quantity }] });
    assert.match(buttons(html)[1], /disabled/);
    assert.match(html, /<strong>—<\/strong>/);
    assert.match(html, /số lượng nguyên dương hợp lệ/);
    assert.doesNotMatch(html, /<td>(?:NaN|Infinity)<\/td>/);
  }
});

test("tổng vượt miền số nguyên an toàn khóa xác nhận dù từng dòng hợp lệ", () => {
  const html = receipt({ items: [
    { id: "gao", name: "Gạo thơm", code: "GAO-01", quantity: Number.MAX_SAFE_INTEGER },
    { id: "muoi", name: "Muối", code: "MUOI-01", quantity: 1 },
  ] });
  assert.match(buttons(html)[1], /disabled/);
  assert.match(html, /<strong>—<\/strong>/);
});

test("đang gửi phiếu khóa cả hai hành động và công bố trạng thái bận", () => {
  const html = receipt({ pending: true });
  assert.match(html, /aria-busy="true"/);
  assert.match(html, />Đang xác nhận…</);
  assert.ok(buttons(html).every((tag) => tag.includes("disabled")));
});
