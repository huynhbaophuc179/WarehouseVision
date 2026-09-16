import * as React from "react";
import { Drawer } from "antd";
import { X } from "lucide-react";
import { Dialog, useDialogState } from "@/components/ui/dialog";

export const Sheet = Dialog;
export interface SheetContentProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  size?: number;
}

export const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(
  ({ className, children, title, description, size = 448, ...props }, ref) => {
    const { open, onOpenChange, titleId, descriptionId } = useDialogState();
    return (
      <Drawer
        title={<h2 id={titleId} className="text-lg font-semibold text-content">{title}</h2>}
        open={open}
        onClose={() => onOpenChange(false)}
        placement="right"
        size={`min(${size}px, calc(100vw - 24px))`}
        destroyOnHidden
        push={false}
        closable={{ "aria-label": "Đóng", placement: "end", closeIcon: <X aria-hidden="true" size={16} /> }}
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        classNames={{ wrapper: className }}
        styles={{ header: { borderBottom: 0, paddingBottom: 0 } }}
      >
        <div {...props} ref={ref}>
          {description && <p id={descriptionId} className="mb-4 text-sm text-muted">{description}</p>}
          {children}
        </div>
      </Drawer>
    );
  },
);
SheetContent.displayName = "SheetContent";
