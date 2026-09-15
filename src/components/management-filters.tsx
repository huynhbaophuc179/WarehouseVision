import { useId, type ReactNode } from 'react';
import { Button, Input } from 'antd';
import { Search } from 'lucide-react';

type ManagementFiltersProps = {
  title?: string;
  search: string;
  onSearchChange: (value: string) => void;
  placeholder: string;
  active: boolean;
  onReset: () => void;
  children?: ReactNode;
};

export function ManagementFilterField({ label, children }: { label: string; children: ReactNode }) {
  return <div className="management-filter-field"><span className="management-filter-label">{label}</span>{children}</div>;
}

export function ManagementFilters({ title = 'Bộ lọc', search, onSearchChange, placeholder, active, onReset, children }: ManagementFiltersProps) {
  const searchId = useId();
  return (
    <aside className="management-filters" aria-label={title}>
      <h2>{title}</h2>
      <div className="management-filter-fields">
        <div className="management-filter-field">
          <label className="management-filter-label" htmlFor={searchId}>Tìm kiếm</label>
          <Input id={searchId} value={search} placeholder={placeholder} prefix={<Search size={16} aria-hidden="true" />} onChange={(event) => onSearchChange(event.target.value)} />
        </div>
        {children}
      </div>
      <Button className="management-filter-reset" disabled={!active} onClick={onReset}>Xóa bộ lọc</Button>
    </aside>
  );
}
