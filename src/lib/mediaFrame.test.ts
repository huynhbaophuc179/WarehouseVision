import assert from "node:assert/strict";
import test from "node:test";
import { calculateContainedMediaRect } from "./mediaFrame.ts";

test("ảnh 16:9 phủ vừa khung 16:9", () => {
  assert.deepEqual(calculateContainedMediaRect(1600, 900, 1920, 1080), {
    x: 0,
    y: 0,
    width: 1600,
    height: 900,
  });
});

test("ảnh dọc được canh giữa và hiển thị trọn chiều cao", () => {
  assert.deepEqual(calculateContainedMediaRect(1600, 900, 960, 1280), {
    x: 462.5,
    y: 0,
    width: 675,
    height: 900,
  });
});

test("ảnh vuông được canh giữa trong khung ngang", () => {
  assert.deepEqual(calculateContainedMediaRect(1600, 900, 1000, 1000), {
    x: 350,
    y: 0,
    width: 900,
    height: 900,
  });
});

test("kích thước không hợp lệ trả về khung rỗng", () => {
  assert.deepEqual(calculateContainedMediaRect(0, 900, 960, 1280), {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  assert.deepEqual(calculateContainedMediaRect(1600, 900, Number.NaN, 1280), {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
});
