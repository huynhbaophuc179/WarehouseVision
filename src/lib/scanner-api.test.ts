import assert from "node:assert/strict";
import { afterEach, before, test } from "node:test";
import { build } from "esbuild";
import type { InventoryConfirmRequest } from "../types/api.ts";

let api: typeof import("./api");
const originalFetch = globalThis.fetch;
const base = "http://test.invalid/api/v1";
const payload: InventoryConfirmRequest = {
  confirmed_items: [{ detection_id: "vung-1", product_id: "SP-01", quantity: 20, action: "stock_in" }],
  rejected_items: [],
};

before(async () => {
  // Compile the real Vite module for Node; only build-time environment is substituted.
  const result = await build({ entryPoints: [new URL("./api.ts", import.meta.url).pathname],
    bundle: true, platform: "node", format: "esm", write: false, define: { "import.meta.env": "{}" } });
  api = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
});
afterEach(() => { globalThis.fetch = originalFetch; });

test("tải mã hàng mất mạng báo tiếng Việt và không tự gửi lại", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new TypeError("Failed to fetch"); };
  await assert.rejects(api.fetchProducts(base), {
    name: "TypeError",
    message: "Không kết nối được máy chủ. Vui lòng kiểm tra kết nối và thử lại.",
  });
  assert.equal(calls, 1);
});

test("hủy nhận diện giữ nguyên lỗi hủy để luồng xử lý nhận biết", async () => {
  const controller = new AbortController();
  const error = new DOMException("The operation was aborted", "AbortError");
  controller.abort(error);
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls++;
    assert.equal(options?.signal, controller.signal);
    throw controller.signal.reason;
  };
  await assert.rejects(api.recognizeImage(base, {
    file: new File(["anh"], "anh.png", { type: "image/png" }),
    topK: 5,
    autoAcceptScoreThreshold: 0.75,
    signal: controller.signal,
  }), (actual) => actual === error);
  assert.equal(calls, 1);
});

test("lỗi máy chủ giữ nguyên chi tiết tiếng Việt thay vì báo mất kết nối", async () => {
  const detail = "Không tìm thấy mã hàng yêu cầu.";
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ detail }, { status: 404 });
  };
  await assert.rejects(api.fetchProducts(base), { name: "Error", message: detail });
  assert.equal(calls, 1);
});

test("nhận diện gửi ảnh, tham số và tín hiệu hủy đúng một lần", async () => {
  const controller = new AbortController();
  const file = new File(["anh-thu-nghiem"], "anh.png", { type: "image/png" });
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, `${base}/recognize`);
    assert.equal(options?.method, "POST");
    assert.equal(options?.signal, controller.signal);
    const form = options?.body as FormData;
    assert.equal(form.get("file"), file);
    assert.equal(form.get("top_k"), "5");
    assert.equal(form.get("auto_accept_score_threshold"), "0.75");
    assert.deepEqual([...form.keys()], ["file", "top_k", "auto_accept_score_threshold"]);
    return Response.json([]);
  };
  assert.deepEqual(await api.recognizeImage(base, { file, topK: 5, autoAcceptScoreThreshold: 0.75, signal: controller.signal }), []);
  assert.equal(calls, 1);
});

test("xác nhận gửi nguyên phiếu cùng tín hiệu và trả phản hồi", async () => {
  const controller = new AbortController();
  const result = { confirmed_items: [{ ...payload.confirmed_items[0], transaction_id: 1, quantity_delta: 20, inventory_count: 40 }], rejected_items: [] };
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, `${base}/inventory/confirm`);
    assert.equal(options?.method, "POST");
    assert.equal(options?.signal, controller.signal);
    assert.deepEqual(options?.headers, { "Content-Type": "application/json" });
    assert.deepEqual(JSON.parse(options?.body as string), payload);
    return Response.json(result);
  };
  assert.deepEqual(await api.confirmInventory(base, payload, controller.signal), result);
  assert.equal(calls, 1);
});

test("mã lỗi xác nhận được giữ nguyên và không tự gửi lại", async () => {
  for (const status of [400, 408, 409, 422, 500, 503]) {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response("Lỗi thử nghiệm", { status }); };
    await assert.rejects(api.confirmInventory(base, payload), (error: unknown) =>
      error instanceof api.InventoryRequestError && error.status === status);
    assert.equal(calls, 1, `Không gửi lại khi lỗi ${status}`);
  }
});

test("mất mạng và hủy xác nhận không tự gửi lại", async () => {
  for (const error of [new TypeError("Mất kết nối thử nghiệm"), new DOMException("Đã hủy", "AbortError")]) {
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw error; };
    await assert.rejects(api.confirmInventory(base, payload), (actual) => actual === error);
    assert.equal(calls, 1);
  }
});

test("phản hồi xác nhận không phải JSON không được xem là thành công", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response("không phải JSON"); };
  await assert.rejects(api.confirmInventory(base, payload), SyntaxError);
  assert.equal(calls, 1);
});
