import assert from "node:assert/strict";
import test from "node:test";
import { scannerKey, scannerQuantityKey } from "./scanner-keymap.ts";

test("phím số hàng trên và bàn phím số đều có đủ 0–9", () => {
  for (let digit = 0; digit <= 9; digit++) {
    const key = String(digit);
    assert.equal(scannerKey({ key, code: `Digit${digit}` }), key);
    assert.equal(scannerKey({ key, code: `Numpad${digit}` }), key);
  }
});

test("tắt khóa số vẫn ánh xạ theo vị trí phím số", () => {
  const keys = ["Insert", "End", "ArrowDown", "PageDown", "ArrowLeft", "Clear", "ArrowRight", "Home", "ArrowUp", "PageUp"];
  keys.forEach((key, digit) => {
    assert.equal(scannerKey({ key, code: `Numpad${digit}` }), String(digit));
    assert.equal(scannerKey({ key, code: key }), null);
  });
});

test("hai phím xác nhận được nhận dạng và các phím khác bị bỏ qua", () => {
  assert.equal(scannerKey({ key: "Enter", code: "Enter" }), "Enter");
  assert.equal(scannerKey({ key: "Unidentified", code: "NumpadEnter" }), "Enter");
  for (const key of ["Escape", "Tab", "a", ".", " ", "+", "Backspace"]) {
    assert.equal(scannerKey({ key, code: key }), null);
  }
});

test("đang soạn và tổ hợp điều khiển không kích hoạt hành động", () => {
  for (const modifier of ["isComposing", "altKey", "ctrlKey", "metaKey"]) {
    assert.equal(scannerKey({ key: "1", code: "Numpad1", [modifier]: true }), null);
    assert.equal(scannerKey({ key: "Enter", code: "NumpadEnter", [modifier]: true }), null);
  }
  assert.equal(scannerKey({ key: "1", code: "Digit1" }), "1");
});

test("số 0 trong ô số lượng được nhập khi bật khóa số", () => {
  for (const digit of ["0", "1", "2"]) {
    assert.equal(scannerQuantityKey(digit, `Numpad${digit}`, true), "input");
    assert.equal(scannerQuantityKey(digit, `Digit${digit}`, false), "input");
  }
  assert.equal(scannerQuantityKey("0", "Numpad0", false), "cancel");
  for (let digit = 1; digit <= 9; digit++) {
    assert.equal(scannerQuantityKey(String(digit), `Numpad${digit}`, false), "ignore");
  }
});

test("xác nhận số lượng hoạt động với cả hai trạng thái khóa số", () => {
  for (const numLock of [true, false]) {
    assert.equal(scannerQuantityKey("Enter", "NumpadEnter", numLock), "save");
    assert.equal(scannerQuantityKey("Enter", "Enter", numLock), "save");
  }
});
