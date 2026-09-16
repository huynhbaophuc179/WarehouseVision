import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ScannerReviewCanvas, type ScannerReviewCanvasProps } from "./scanner-review-canvas";

function canvas(overrides: Partial<ScannerReviewCanvasProps> = {}) {
  return renderToStaticMarkup(<ScannerReviewCanvas activeItemId="gao" activeItemName="Gạo thơm"
    imageUrl="/anh-ra-soat.jpg" imageWidth={1600} imageHeight={900}
    boxes={[
      { id: "gao-1", groupId: "gao", box: [10, 20, 110, 220] },
      { id: "gao-2", groupId: "gao", box: [200, 300, 500, 700] },
      { id: "muoi-1", groupId: "muoi", box: [900, 100, 1200, 400] },
    ]} onPreviousObject={() => {}} onNextObject={() => {}} {...overrides} />);
}

test("lớp vùng dùng hệ tọa độ ảnh gốc và chỉ mở sáng các vật thuộc nhóm chọn", () => {
  const html = canvas();
  assert.match(html, /viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid meet"/);
  const mask = html.match(/<mask\b[^>]*>(.*?)<\/mask>/)?.[1];
  assert.ok(mask);
  assert.match(mask, /width="1600" height="900" fill="white"/);
  assert.match(mask, /x="10" y="20" width="100" height="200" fill="black"/);
  assert.match(mask, /x="200" y="300" width="300" height="400" fill="black"/);
  assert.equal((mask.match(/fill="black"/g) ?? []).length, 2);
  assert.doesNotMatch(html, /x="900"/);
  const maskId = html.match(/<mask id="([^"]+)"/)?.[1];
  assert.ok(maskId);
  assert.ok(html.includes(`mask="url(#${maskId})"`));
});

test("vật đang chọn có một viền riêng và số thứ tự tương ứng", () => {
  const html = canvas({ activeObjectId: "gao-2" });
  assert.match(html, />Vật 2 \/ 2</);
  assert.equal((html.match(/scanner-review-box-current/g) ?? []).length, 1);
  assert.match(html, /x="200" y="300" width="300" height="400" class="scanner-review-box scanner-review-box-current"/);
  assert.equal((html.match(/vector-effect="non-scaling-stroke"/g) ?? []).length, 2);
});

test("vùng có tọa độ lỗi hoặc diện tích không dương không tạo lỗ sáng", () => {
  const html = canvas({ boxes: [
    { id: "nan", groupId: "gao", box: [NaN, 20, 110, 220] },
    { id: "inf", groupId: "gao", box: [10, 20, Infinity, 220] },
    { id: "zero", groupId: "gao", box: [10, 20, 10, 220] },
    { id: "negative", groupId: "gao", box: [110, 220, 10, 20] },
  ] });
  const mask = html.match(/<mask\b[^>]*>(.*?)<\/mask>/)?.[1];
  assert.ok(mask);
  assert.doesNotMatch(mask, /fill="black"/);
  assert.doesNotMatch(html, /NaN|Infinity|scanner-review-box-current/);
});

test("chưa biết kích thước ảnh không dựng lớp vùng sai tọa độ", () => {
  const html = canvas({ imageWidth: undefined, imageHeight: undefined });
  assert.match(html, /alt="Ảnh các sản phẩm đang rà soát"/);
  assert.doesNotMatch(html, /class="scanner-review-boxes"/);
});

test("bộ đếm và điều hướng chỉ tính vùng hợp lệ, vật chọn cũ trở về vùng đầu tiên", () => {
  const html = canvas({ activeObjectId: "khong-con", boxes: [
    { id: "loi", groupId: "gao", box: [NaN, 20, 110, 220] },
    { id: "gao-1", groupId: "gao", box: [10, 20, 110, 220] },
  ] });
  assert.match(html, />Vật 1 \/ 1</);
  assert.match(html, /x="10" y="20" width="100" height="200" class="scanner-review-box scanner-review-box-current"/);
  const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map(([tag]) => tag);
  assert.ok(buttons.every((tag) => tag.includes("disabled")));
});

test("không có ảnh hiển thị hướng dẫn và nhóm một vật khóa điều hướng", () => {
  const html = canvas({ imageUrl: undefined, boxes: [
    { id: "gao-1", groupId: "gao", box: [10, 20, 110, 220] },
  ] });
  assert.match(html, /Chưa có ảnh để rà soát/);
  const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map(([tag]) => tag);
  assert.equal(buttons.length, 2);
  assert.ok(buttons.every((tag) => tag.includes("disabled")));
  assert.match(html, /aria-keyshortcuts="4"/);
  assert.match(html, /aria-keyshortcuts="6"/);
});
