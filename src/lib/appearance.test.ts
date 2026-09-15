import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import { getInitialColorMode, saveColorMode } from "./appearance.ts";

const storageKey = "warehousevision-color-mode";

function browser(t: TestContext, value: unknown): void {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  });
}

for (const saved of ["light", "dark"] as const) {
  test(`ưu tiên lựa chọn ${saved} đã lưu thay vì giao diện hệ thống`, (t) => {
    browser(t, {
      localStorage: { getItem: (key: string) => { assert.equal(key, storageKey); return saved; } },
      matchMedia: () => { assert.fail("Không cần đọc hệ thống khi lựa chọn đã lưu hợp lệ"); },
    });
    assert.equal(getInitialColorMode(), saved);
  });
}

for (const saved of [null, "invalid", "DARK", ""]) {
  test(`lựa chọn ${JSON.stringify(saved)} dùng giao diện hệ thống`, (t) => {
    let dark = true;
    browser(t, {
      localStorage: { getItem: () => saved },
      matchMedia: (query: string) => {
        assert.equal(query, "(prefers-color-scheme: dark)");
        return { matches: dark };
      },
    });
    assert.equal(getInitialColorMode(), "dark");
    dark = false;
    assert.equal(getInitialColorMode(), "light");
  });
}

test("bộ nhớ bị chặn vẫn lấy được giao diện tối của hệ thống", (t) => {
  browser(t, {
    get localStorage() { throw new Error("Storage access denied"); },
    matchMedia: () => ({ matches: true }),
  });
  assert.equal(getInitialColorMode(), "dark");
  assert.doesNotThrow(() => saveColorMode("dark"));
});

test("lỗi đọc và ghi bộ nhớ không làm hỏng lựa chọn giao diện", (t) => {
  browser(t, {
    localStorage: {
      getItem: () => { throw new Error("Read denied"); },
      setItem: () => { throw new Error("Quota exceeded"); },
    },
    matchMedia: () => ({ matches: true }),
  });
  assert.equal(getInitialColorMode(), "dark");
  assert.doesNotThrow(() => saveColorMode("light"));
});

test("lưu cả hai lựa chọn để lần mở sau dùng lại", (t) => {
  const saved = new Map<string, string>();
  browser(t, {
    localStorage: {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
    },
  });
  for (const mode of ["dark", "light"] as const) {
    saveColorMode(mode);
    assert.equal(saved.get(storageKey), mode);
    assert.equal(getInitialColorMode(), mode);
  }
});

test("không có trình duyệt vẫn khởi tạo sáng và không lỗi khi lưu", (t) => {
  browser(t, undefined);
  assert.equal(getInitialColorMode(), "light");
  assert.doesNotThrow(() => saveColorMode("dark"));
});

test("không có truy vấn giao diện hệ thống thì dùng sáng", (t) => {
  browser(t, { localStorage: { getItem: () => null } });
  assert.equal(getInitialColorMode(), "light");
});

test("truy vấn giao diện hệ thống bị lỗi thì dùng sáng", (t) => {
  browser(t, {
    localStorage: { getItem: () => null },
    matchMedia: () => { throw new Error("Media query unavailable"); },
  });
  assert.equal(getInitialColorMode(), "light");
});
