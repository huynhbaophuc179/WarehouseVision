import * as React from "react";
import { Button as AntButton } from "antd";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "success" | null;
  size?: "default" | "sm" | "lg" | "icon" | null;
}

const buttonAppearances = {
  default: { color: "primary", variant: "solid" },
  destructive: { color: "danger", variant: "solid" },
  outline: { color: "default", variant: "outlined" },
  secondary: { color: "default", variant: "filled" },
  ghost: { color: "default", variant: "text" },
  success: { color: "green", variant: "solid" },
} as const;

const buttonSizes = { default: "middle", sm: "small", lg: "large", icon: "middle" } as const;

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "default", size, type = "button", ...props }, ref) => (
    <AntButton {...props} ref={ref} htmlType={type}
      {...buttonAppearances[variant ?? "default"]}
      size={buttonSizes[size ?? "default"]}
      shape={size === "icon" ? "square" : undefined} />
  ),
);
Button.displayName = "Button";
