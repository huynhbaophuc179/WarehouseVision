import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ScannerReviewLayout, type ScannerReviewLayoutProps } from "./scanner-review-layout";

function layout(overrides: Partial<ScannerReviewLayoutProps> = {}) {
  return renderToStaticMarkup(<ScannerReviewLayout items={[]} activeItemId="" boxes={[]}
    onSelectItem={() => {}} onPreviousGroup={() => {}} onNextGroup={() => {}}
    onPreviousObject={() => {}} onNextObject={() => {}} onEdit={() => {}}
    onReview={() => {}} onReviewAll={() => {}} onRetake={() => {}} {...overrides} />);
}

function shortcutButton(html: string, shortcut: string) {
  const tag = [...html.matchAll(/<button\b[^>]*>/g)]
    .map(([button]) => button).find((button) => button.includes(`aria-keyshortcuts="${shortcut}"`));
  assert.ok(tag, `Thiếu nút cho phím ${shortcut}`);
  return tag;
}

test("danh sách rỗng khóa duyệt và chỉnh sửa nhưng vẫn cho phép chụp lại", () => {
  const html = layout();
  assert.match(html, /Chưa có sản phẩm để rà soát/);
  for (const shortcut of ["8", "2", "5", "Enter", "9"]) {
    assert.match(shortcutButton(html, shortcut), /disabled/);
  }
  assert.doesNotMatch(shortcutButton(html, "0"), /disabled/);
});

test("nhóm đã duyệt khóa duyệt lại và giữ chỉnh sửa khả dụng", () => {
  const html = layout({
    activeItemId: "gao",
    items: [
      { id: "gao", name: "Gạo thơm", quantity: 2, reviewed: true },
      { id: "muoi", name: "Muối", quantity: 3 },
    ],
  });
  assert.match(html, /2 mã hàng · 5 sản phẩm/);
  assert.match(html, /1 \/ 2 đã duyệt/);
  assert.match(shortcutButton(html, "Enter"), /disabled/);
  assert.doesNotMatch(shortcutButton(html, "5"), /disabled/);
  assert.doesNotMatch(shortcutButton(html, "9"), /disabled/);
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
});
