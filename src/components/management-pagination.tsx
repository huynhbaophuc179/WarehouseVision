import { Pagination, Select } from 'antd';
import viVN from 'antd/locale/vi_VN';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getPaginationBounds } from '@/lib/management-list';

type ManagementPaginationProps = {
  total: number;
  page: number;
  pageSize: number;
  onChange: (page: number, pageSize: number) => void;
};

export function ManagementPagination({ total, page, pageSize, onChange }: ManagementPaginationProps) {
  const bounds = getPaginationBounds(total, page, pageSize);
  return (
    <footer className="management-pagination">
      <div className="management-pagination-controls">
        <Select aria-label="Số dòng mỗi trang" value={pageSize} onChange={(size) => onChange(1, size)} options={[10, 20, 50].map((value) => ({ value, label: `${value} / trang` }))} />
        <Pagination current={bounds.page} pageSize={pageSize} total={total} onChange={onChange} showSizeChanger={false} showLessItems locale={viVN.Pagination}
          itemRender={(_, type, original) => {
            if (type === 'prev') return <button type="button" className="ant-pagination-item-link" aria-label="Trang trước" disabled={bounds.page === 1}><ChevronLeft size={16} aria-hidden="true" /></button>;
            if (type === 'next') return <button type="button" className="ant-pagination-item-link" aria-label="Trang sau" disabled={bounds.page === bounds.pageCount}><ChevronRight size={16} aria-hidden="true" /></button>;
            return original;
          }} />
      </div>
    </footer>
  );
}
