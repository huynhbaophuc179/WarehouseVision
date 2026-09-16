import type { ReactNode } from "react";

export interface ScannerKeycapProps {
  children: ReactNode;
}

export function ScannerKeycap({ children }: ScannerKeycapProps) {
  return <span className="scanner-keycap" aria-hidden="true">{children}</span>;
}
