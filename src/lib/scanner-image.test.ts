import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { captureScannerImage, scannerCameraError, validateScannerImage } from "./scanner-image.ts";

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
afterEach(() => {
  if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
  else Reflect.deleteProperty(globalThis, "document");
});

test("ảnh hợp lệ hoặc không có kiểu MIME được chấp nhận theo API", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp", ""]) {
    assert.equal(validateScannerImage({ type, size: 42 }), null);
  }
  assert.equal(validateScannerImage({ type: "image/jpeg", size: 100_000_000 }), null);
});

test("tệp rỗng và tệp không phải ảnh có thông báo tiếng Việt", () => {
  assert.match(validateScannerImage({ type: "image/jpeg", size: 0 })!, /trống/);
  assert.match(validateScannerImage({ type: "application/pdf", size: 42 })!, /không phải ảnh/);
});

test("phân biệt từ chối quyền, thiếu thiết bị và thiết bị bận", () => {
  assert.match(scannerCameraError(new DOMException("", "NotAllowedError")), /cấp quyền/);
  assert.match(scannerCameraError(new DOMException("", "NotFoundError")), /Không tìm thấy/);
  assert.match(scannerCameraError(new DOMException("", "NotReadableError")), /đang bận/);
  assert.match(scannerCameraError(null), /Không mở được/);
});

function installCanvas(options: { blob?: Blob | null; missingContext?: boolean; drawThrows?: boolean } = {}) {
  const calls: unknown[][] = [];
  const canvas = {
    width: 0, height: 0,
    getContext: () => options.missingContext ? null : {
      drawImage: (...args: unknown[]) => {
        if (options.drawThrows) throw new DOMException("Tainted canvas", "SecurityError");
        calls.push(args);
      },
    },
    toBlob: (callback: BlobCallback, type: string, quality: number) => {
      calls.push([type, quality]);
      callback(options.blob === undefined ? new Blob(["frame"], { type: "image/jpeg" }) : options.blob);
    },
  };
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => canvas } });
  return { canvas, calls };
}

// Only dimensions are consumed from the video by the isolated canvas adapter.
const video = { videoWidth: 1920, videoHeight: 1080 } as HTMLVideoElement;

test("ảnh chụp giữ kích thước khung hình và trả về tệp JPEG", async () => {
  const { canvas, calls } = installCanvas();
  const file = await captureScannerImage(video);
  assert.equal(file.type, "image/jpeg");
  assert.equal(file.size, 5);
  assert.match(file.name, /^anh-chup-\d+\.jpg$/);
  assert.deepEqual([canvas.width, canvas.height], [1920, 1080]);
  assert.deepEqual(calls, [[video, 0, 0, 1920, 1080], ["image/jpeg", 0.92]]);
});

test("chưa có hình không được chụp", async () => {
  await assert.rejects(captureScannerImage({ videoWidth: 0, videoHeight: 0 } as HTMLVideoElement), /chưa có hình/);
});

test("thiếu ngữ cảnh vẽ được báo lỗi", async () => {
  installCanvas({ missingContext: true });
  await assert.rejects(captureScannerImage(video), /Không chụp được/);
});

test("không tạo được blob hoặc blob rỗng được báo lỗi", async () => {
  for (const blob of [null, new Blob([])]) {
    installCanvas({ blob });
    await assert.rejects(captureScannerImage(video), /Không tạo được ảnh/);
  }
});

test("lỗi vẽ được chuyển thành promise bị từ chối để mở khóa chụp", async () => {
  installCanvas({ drawThrows: true });
  await assert.rejects(captureScannerImage(video), { name: "SecurityError" });
});
