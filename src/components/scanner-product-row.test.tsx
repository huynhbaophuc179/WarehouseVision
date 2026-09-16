import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ScannerProductRow } from "./scanner-product-row";

test("dòng được chọn công bố trạng thái nút và vẫn giữ trạng thái chưa duyệt", () => {
  const html = renderToStaticMarkup(<ScannerProductRow name="Gạo thơm" code="GAO-01"
    category="Lương thực" quantity={1200} selected onClick={() => {}} />);
  assert.match(html, /^<button[^>]*type="button"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, />Chưa duyệt</);
  assert.match(html, /aria-label="Số lượng 1200">1\.200</);
  assert.match(html, />GAO-01</);
  assert.match(html, />Lương thực</);
});

test("dòng đã duyệt công bố trạng thái và không còn dấu chưa duyệt", () => {
  const html = renderToStaticMarkup(<ScannerProductRow name="Gạo thơm" quantity={2} reviewed />);
  assert.match(html, /^<div/);
  assert.match(html, />Đã duyệt</);
  assert.doesNotMatch(html, /scanner-product-row__unchecked/);
  assert.doesNotMatch(html, /aria-pressed/);
});

test("dòng chưa xác định không trình bày mã và danh mục như thông tin đã biết", () => {
  const html = renderToStaticMarkup(<ScannerProductRow name="Hàng chưa xác định"
    code="MA-CU" category="Danh mục cũ" quantity={1} unknown reviewed />);
  assert.match(html, />Chưa xác định mã hàng</);
  assert.doesNotMatch(html, /MA-CU|Danh mục cũ|>Đã duyệt</);
});

test("số lượng không hợp lệ không được trình bày như số lượng hợp lệ", () => {
  for (const quantity of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const html = renderToStaticMarkup(<ScannerProductRow name="Gạo thơm" quantity={quantity} />);
    assert.match(html, /aria-label="Số lượng không hợp lệ">—</);
  }
});
