import assert from "node:assert/strict";
import test from "node:test";
import { assignScannerDetection, assignScannerProduct, createScannerGroups, createScannerReceipt, reviewAllScannerGroups,
  reviewScannerGroup, setScannerQuantity, verifyScannerConfirmation } from "./scanner-session.ts";
import type { DetectionResult, InventoryConfirmResponse, Product } from "../types/api.ts";

const product = (id: string): Product => ({ product_id: id, name: `Sản phẩm ${id}`, inventory_count: 20 });
const detection = (id: string, productId: string | null, status: DetectionResult["status"] = "recognized"): DetectionResult => ({
  detection_id: id, product_id: productId, status, name: productId, inventory_count: 20,
  distance: 0.2, candidates: [], box: [0, 0, 10, 10], crop_preview_base64: "aW1hZ2U=",
});
const groups = () => createScannerGroups([detection("a", "A"), detection("b", "A"), detection("c", "B")], [product("A"), product("B")]);
const receipt = () => createScannerReceipt(reviewAllScannerGroups(groups()), "stock_out");
const response = (): InventoryConfirmResponse => ({
  confirmed_items: receipt().payload.confirmed_items.map((item, index) => ({
    ...item, transaction_id: index + 1, quantity_delta: -item.quantity, inventory_count: 10,
  })), rejected_items: [],
});

test("recognized regions share SKU group; uncertain and unknown regions require classification", () => {
  const result = createScannerGroups([detection("a", "A"), detection("b", "A"),
    detection("c", "A", "uncertain"), detection("d", null, "unknown")], [{ ...product("A"), category: "Đồ uống", thumbnail_base64: "cGhvdG8=" }]);
  assert.equal(result.length, 3);
  assert.deepEqual(result[0].detectionIds, ["a", "b"]);
  assert.equal(result[0].quantity, 2);
  assert.equal(result[0].name, "Sản phẩm A");
  assert.equal(result[0].imageUrl, "data:image/jpeg;base64,cGhvdG8=");
  assert.equal(result[0].category, "Đồ uống");
  assert.ok(result.every((group) => !group.reviewed));
  assert.deepEqual(result.slice(1).map((group) => group.productId), [null, null]);
  assert.equal(result[2].imageUrl, "data:image/jpeg;base64,aW1hZ2U=");
});

test("duplicate or absent detection IDs fail instead of losing physical regions", () => {
  assert.throws(() => createScannerGroups([detection("a", "A"), detection("a", "B")], []), /trùng/);
  assert.throws(() => createScannerGroups([detection("", "A")], []), /thiếu/);
});

test("malformed boxes, candidate arrays and product metadata are rejected at recognition boundary", () => {
  for (const box of [undefined, null, [], [0, 0, 10], [0, 0, NaN, 10], [0, 0, 0, 10], [1, 2, 0, 0], [0, 0, "10", 10]]) {
    assert.throws(() => createScannerGroups([{ ...detection("a", "A"), box } as DetectionResult], []), /Khung/);
  }
  for (const patch of [{ candidates: null }, { candidates: [null] }, { status: "bad" }, { product_id: null }, { name: {} }]) {
    assert.throws(() => createScannerGroups([{ ...detection("a", "A"), ...patch } as DetectionResult], []), /Thông tin/);
  }
});

test("classifying one of two regions preserves the other and invalidates both affected reviews", () => {
  const original = reviewAllScannerGroups(setScannerQuantity(groups(), groups()[0].id, "10"));
  const split = assignScannerDetection(original, original[0].id, "a", product("B"));
  assert.deepEqual(split.map((group) => [group.productId, group.quantity, group.detectionIds, group.reviewed]),
    [["A", 9, ["b"], false], ["B", 2, ["c", "a"], false]]);
  assert.deepEqual(original[0].detectionIds, ["a", "b"]);
  const newProduct = assignScannerDetection(original, original[0].id, "a", product("C"));
  assert.equal(new Set(newProduct.map((group) => group.id)).size, 3);
  assert.deepEqual(newProduct[2].detectionIds, ["a"]);
  assert.equal(newProduct[1].reviewed, true);
  assert.equal(assignScannerDetection(original, original[0].id, "a", product("A")), original);
});

test("single-region assignment carries edited quantity; unresolved regions still block receipts", () => {
  const original = createScannerGroups([detection("u", null, "unknown"), detection("v", null, "unknown")], []);
  const edited = setScannerQuantity(original, original[0].id, "20");
  const assigned = assignScannerDetection(edited, edited[0].id, "u", product("A"));
  assert.equal(assigned[0].quantity, 20);
  assert.equal(assigned[1].productId, null);
  assert.throws(() => createScannerReceipt(reviewAllScannerGroups(assigned), "stock_in"), /tất cả/);
  const merged = assignScannerDetection(assigned, assigned[1].id, "v", product("A"));
  assert.equal(merged[0].quantity, 21);
  assert.deepEqual(merged[0].detectionIds, ["u", "v"]);
});

test("per-object allocation blocks insufficient source quantity and target overflow", () => {
  const original = groups();
  const insufficient = setScannerQuantity(original, original[0].id, "1");
  assert.throws(() => assignScannerDetection(insufficient, insufficient[0].id, "a", product("B")), /sửa số lượng/);
  const fullTarget = setScannerQuantity(original, original[1].id, String(Number.MAX_SAFE_INTEGER));
  assert.throws(() => assignScannerDetection(fullTarget, fullTarget[0].id, "a", product("B")), /gộp/);
  assert.throws(() => assignScannerDetection(original, original[0].id, "missing", product("B")), /Không tìm/);
});

test("reassign whole group merges edited quantities and invalidates destination review", () => {
  const original = reviewAllScannerGroups(setScannerQuantity(groups(), groups()[0].id, "10"));
  const result = assignScannerProduct(original, original[0].id, product("B"));
  assert.equal(result.length, 1);
  assert.equal(result[0].id, original[1].id);
  assert.equal(result[0].quantity, 11);
  assert.equal(result[0].reviewed, false);
  assert.deepEqual(result[0].detectionIds, ["c", "a", "b"]);
  assert.equal(original[0].reviewed, true);
  assert.equal(original[1].quantity, 1);
});

test("assigning an unclassified or new SKU preserves group identity and all regions", () => {
  const original = reviewAllScannerGroups(groups());
  const result = assignScannerProduct(original, original[0].id, product("C"));
  assert.equal(result[0].id, original[0].id);
  assert.equal(result[0].productId, "C");
  assert.equal(result[0].imageUrl, undefined);
  assert.deepEqual(result[0].detectionIds, ["a", "b"]);
  assert.equal(result[0].reviewed, false);
  assert.equal(result[1].reviewed, true);
  const unresolved = createScannerGroups([detection("u", null, "unknown")], []);
  assert.equal(assignScannerProduct(unresolved, unresolved[0].id, product("A"))[0].productId, "A");
});

test("quantity accepts whole digit strings only and invalidates just the edited group", () => {
  const original = reviewAllScannerGroups(groups());
  for (const input of ["", "0", "-1", "1.5", "1e2", " 1", "1 ", "+1", "Infinity", "9007199254740992"]) {
    assert.throws(() => setScannerQuantity(original, original[0].id, input), /Số lượng/);
  }
  for (const input of ["1", "10", "20", String(Number.MAX_SAFE_INTEGER)]) {
    const edited = setScannerQuantity(original, original[0].id, input);
    assert.equal(edited[0].quantity, Number(input));
    assert.equal(edited[0].reviewed, false);
    assert.equal(edited[1].reviewed, true);
  }
  const huge = setScannerQuantity(original, original[0].id, String(Number.MAX_SAFE_INTEGER));
  assert.throws(() => assignScannerProduct(huge, huge[0].id, product("B")), /gộp/);
});

test("review all leaves unresolved groups blocking receipt; empty and unreviewed sessions fail", () => {
  const unresolved = createScannerGroups([detection("u", null, "unknown"), detection("a", "A")], []);
  assert.throws(() => reviewScannerGroup(unresolved, unresolved[0].id), /phân loại/);
  const reviewed = reviewAllScannerGroups(unresolved);
  assert.equal(reviewed[0].reviewed, false);
  assert.equal(reviewed[1].reviewed, true);
  assert.throws(() => createScannerReceipt(reviewed, "stock_in"), /tất cả/);
  assert.throws(() => createScannerReceipt([], "stock_in"), /ít nhất/);
  assert.throws(() => createScannerReceipt(groups(), "stock_in"), /tất cả/);
  assert.throws(() => reviewScannerGroup(unresolved, "missing"), /Không tìm/);
  const individuallyReviewed = reviewScannerGroup(unresolved, unresolved[1].id);
  assert.equal(individuallyReviewed[1].reviewed, true);
  assert.equal(individuallyReviewed[0].reviewed, false);
});

test("receipt snapshots reviewed values into exactly one payload item per SKU", () => {
  const original = reviewAllScannerGroups(setScannerQuantity(groups(), groups()[0].id, "20"));
  const snapshot = createScannerReceipt(original, "stock_in");
  assert.deepEqual(snapshot.items.map((item) => [item.id, item.code, item.quantity]), [["A", "A", 20], ["B", "B", 1]]);
  assert.deepEqual(snapshot.payload.confirmed_items, [
    { detection_id: "a", product_id: "A", quantity: 20, action: "stock_in" },
    { detection_id: "c", product_id: "B", quantity: 1, action: "stock_in" },
  ]);
  original[0].quantity = 5;
  original[0].detectionIds[0] = "changed";
  assert.equal(snapshot.items[0].quantity, 20);
  assert.equal(snapshot.payload.confirmed_items[0].detection_id, "a");
  assert.throws(() => createScannerReceipt([original[0], { ...original[0], id: "other" }], "stock_in"), /một lần/);
});

test("valid transaction responses match snapshot regardless of response order", () => {
  assert.doesNotThrow(() => verifyScannerConfirmation(response(), receipt()));
  const reversed = response();
  reversed.confirmed_items.reverse();
  assert.doesNotThrow(() => verifyScannerConfirmation(reversed, receipt()));
});

test("malformed and mismatched responses never claim success", () => {
  const malformed: unknown[] = [null, {}, { confirmed_items: [] }, { confirmed_items: [], rejected_items: [] }];
  for (const value of malformed) assert.throws(() => verifyScannerConfirmation(value as InventoryConfirmResponse, receipt()), /Chưa xác định/);
  for (const patch of [{ transaction_id: 0 }, { transaction_id: 1.5 }, { transaction_id: "1" },
    { product_id: "X" }, { quantity: 5 }, { quantity_delta: 2 }, { detection_id: "wrong" },
    { action: "stock_in" }, { inventory_count: -1 }, { inventory_count: NaN }]) {
    const changed = response();
    Object.assign(changed.confirmed_items[0], patch);
    assert.throws(() => verifyScannerConfirmation(changed, receipt()), /Chưa xác định/);
  }
  const duplicate = response();
  duplicate.confirmed_items[1] = duplicate.confirmed_items[0];
  assert.throws(() => verifyScannerConfirmation(duplicate, receipt()), /Chưa xác định/);
  const duplicateTransaction = response();
  duplicateTransaction.confirmed_items[1].transaction_id = duplicateTransaction.confirmed_items[0].transaction_id;
  assert.throws(() => verifyScannerConfirmation(duplicateTransaction, receipt()), /Chưa xác định/);
  const rejected = response();
  rejected.rejected_items.push({ detection_id: "a", reason: "rejected" });
  assert.throws(() => verifyScannerConfirmation(rejected, receipt()), /Chưa xác định/);
});
