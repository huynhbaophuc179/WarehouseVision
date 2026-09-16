import { Button } from "antd";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { ScannerKeycap } from "./scanner-keycap";

export interface ScannerActionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color"> {
  shortcut?: ReactNode;
  tier?: "primary" | "secondary" | "normal";
}

export const ScannerActionButton = forwardRef<HTMLButtonElement, ScannerActionButtonProps>(
  function ScannerActionButton({ shortcut, tier = "normal", className = "", children, type = "button", ...props }, ref) {
    return (
      <Button {...props} ref={ref} htmlType={type} type={tier === "primary" ? "primary" : tier === "normal" ? "text" : "default"} className={`scanner-action scanner-action--${tier} ${className}`}>
        <span className="scanner-action__key">
          {shortcut != null && <ScannerKeycap>{shortcut}</ScannerKeycap>}
        </span>
        <span className="scanner-action__label">{children}</span>
        <span className="scanner-action__balance" aria-hidden="true" />
      </Button>
    );
  },
);
