export interface ScannerKeyEvent {
  key: string; code: string; repeat?: boolean; isComposing?: boolean;
  altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean;
}
export function scannerKey(event: ScannerKeyEvent): string | null {
  if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return null;
  if (event.key === "Enter" || event.code === "NumpadEnter") return "Enter";
  if (/^Numpad[0-9]$/.test(event.code)) return event.code.slice(-1);
  return /^[0-9]$/.test(event.key) ? event.key : null;
}

export function scannerQuantityKey(key: string, code: string, numLock: boolean): "save" | "cancel" | "input" | "ignore" {
  if (key === "Enter") return "save";
  if (code.startsWith("Numpad") && !numLock) return key === "0" ? "cancel" : "ignore";
  return "input";
}
