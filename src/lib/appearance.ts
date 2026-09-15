export type ColorMode = "light" | "dark";

const storageKey = "warehousevision-color-mode";

export function getInitialColorMode(): ColorMode {
  if (typeof window === "undefined") return "light";

  try {
    const saved = window.localStorage.getItem(storageKey);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // A blocked storage area must not prevent the dashboard from opening.
  }

  try {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function saveColorMode(mode: ColorMode): void {
  try {
    window.localStorage.setItem(storageKey, mode);
  } catch {
    // The current session can still switch themes when persistence is unavailable.
  }
}
