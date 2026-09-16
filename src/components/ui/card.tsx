import * as React from "react";
import { Card as AntCard, Typography } from "antd";
import { cn } from "@/lib/utils";

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  (props, ref) => <AntCard {...props} ref={ref} styles={{ body: {
    padding: 0, height: "100%", minHeight: 0, display: "flex", flexDirection: "column",
  } }} />,
);
Card.displayName = "Card";
export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div {...props} ref={ref} className={cn("flex flex-col gap-1.5 p-4", className)} />,
);
CardHeader.displayName = "CardHeader";
export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  (props, ref) => <Typography.Title {...props} ref={ref} level={5} style={{ margin: 0, ...props.style }} />,
);
CardTitle.displayName = "CardTitle";
export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ children, ...props }, ref) => <p {...props} ref={ref}><Typography.Text type="secondary">{children}</Typography.Text></p>,
);
CardDescription.displayName = "CardDescription";
export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div {...props} ref={ref} className={cn("p-4 pt-0", className)} />,
);
CardContent.displayName = "CardContent";
