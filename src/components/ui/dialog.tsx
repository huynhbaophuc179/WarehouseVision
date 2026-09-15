import * as React from "react";
import { Modal } from "antd";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DialogState {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titleId: string;
  descriptionId: string;
}

const DialogContext = React.createContext<DialogState | null>(null);

export function useDialogState(): DialogState {
  const context = React.useContext(DialogContext);
  if (!context) throw new Error("Nội dung hộp thoại phải nằm trong hộp thoại.");
  return context;
}

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps): JSX.Element {
  const id = React.useId();
  const value = React.useMemo(() => ({
    open, onOpenChange, titleId: `${id}-title`, descriptionId: `${id}-description`,
  }), [open, onOpenChange, id]);
  return (
    <DialogContext.Provider value={value}>
      {children}
    </DialogContext.Provider>
  );
}

interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  onOpenAutoFocus?: (event: Event) => void;
}

export const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children, onOpenAutoFocus, ...props }, ref) => {
    const { open, onOpenChange, titleId, descriptionId } = useDialogState();
    return (
      <Modal
        open={open}
        centered
        footer={null}
        destroyOnHidden
        closable={{ "aria-label": "Đóng" }}
        closeIcon={<X aria-hidden="true" size={16} />}
        onCancel={() => onOpenChange(false)}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        afterOpenChange={(visible) => {
          if (visible) onOpenAutoFocus?.(new Event("openAutoFocus", { cancelable: true }));
        }}
      >
        <div {...props} ref={ref} className={className}>{children}</div>
      </Modal>
    );
  },
);
DialogContent.displayName = "DialogContent";

export const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): JSX.Element => (
  <div {...props} className={cn("space-y-2 pr-6 text-left", className)} />
);

export const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): JSX.Element => (
  <div {...props} className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} />
);

export const DialogTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => {
    const { titleId } = useDialogState();
    return <h2 {...props} ref={ref} id={titleId} className={cn("text-lg font-semibold text-content", className)} />;
  },
);
DialogTitle.displayName = "DialogTitle";

export const DialogDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    const { descriptionId } = useDialogState();
    return <p {...props} ref={ref} id={descriptionId} className={cn("text-sm text-muted", className)} />;
  },
);
DialogDescription.displayName = "DialogDescription";
