import type { ReactNode } from "react";
import { Modal } from "antd";

export interface ScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  dismissible?: boolean;
  onAfterOpen?: () => void;
}

export function ScannerDialog({ open, onOpenChange, title, children, dismissible = true, onAfterOpen }: ScannerDialogProps) {
  return (
    <Modal open={open} title={<span className="sr-only">{title}</span>}
      rootClassName="scanner-theme" className="scanner-dialog" width={760} centered
      zIndex={1000} footer={null} closable={false} keyboard={dismissible}
      mask={{ closable: false }} destroyOnHidden
      focusable={{ trap: true, focusTriggerAfterClose: true }}
      styles={{ header: { margin: 0 }, body: { maxHeight: "calc(100dvh - 64px)", overflowY: "auto" } }}
      onCancel={() => { if (dismissible) onOpenChange(false); }}
      afterOpenChange={(visible) => { if (visible) onAfterOpen?.(); }}>
      {children}
    </Modal>
  );
}
