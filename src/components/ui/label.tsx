import * as React from "react";
import { Typography } from "antd";

export const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ children, ...props }, ref) => <label {...props} ref={ref}><Typography.Text strong>{children}</Typography.Text></label>,
);
Label.displayName = "Label";
