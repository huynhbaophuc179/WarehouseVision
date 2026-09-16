import { useState, type ReactNode } from "react";
import { Dropdown } from "antd";
import { Ellipsis } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TableAction {
  key: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  keepOpen?: boolean;
}

interface TableActionMenuProps {
  label: string;
  actions: TableAction[];
  disabled?: boolean;
}

export function TableActionMenu({ label, actions, disabled }: TableActionMenuProps) {
  const [open, setOpen] = useState(false);
  return (
    <Dropdown trigger={["click"]} placement="bottomRight" open={open} disabled={disabled}
      onOpenChange={(nextOpen, info) => { if (info.source === "trigger") setOpen(nextOpen); }}
      menu={{ items: actions.map(({ key, label: actionLabel, icon, danger, disabled: actionDisabled, keepOpen, onSelect }) => ({
        key, label: actionLabel, icon, danger, disabled: actionDisabled,
        onClick: ({ domEvent }) => {
          domEvent.stopPropagation();
          onSelect();
          if (!keepOpen) setOpen(false);
        },
      })) }}>
      <Button variant="ghost" size="icon" className="management-icon-action"
        disabled={disabled} aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open}>
        <Ellipsis size={18} aria-hidden="true" />
      </Button>
    </Dropdown>
  );
}
