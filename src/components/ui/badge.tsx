import type * as React from "react";
import { Tag } from "antd";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "success" | "warning" | "destructive" | "outline" | null;
}

export const Badge = ({ variant = "default", ...props }: BadgeProps): JSX.Element => (
  <Tag {...props} color={variant === "destructive" ? "error" : variant === "success" || variant === "warning" ? variant : variant === "default" ? "blue" : undefined}
    variant={variant === "outline" ? "outlined" : "filled"} />
);
