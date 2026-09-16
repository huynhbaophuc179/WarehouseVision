import type { ReactNode } from 'react';
import '@/styles/management.css';

type ManagementPageProps = {
  title: string;
  description: string;
  actions: ReactNode;
  filters: ReactNode;
  summary: ReactNode;
  notice?: string | null;
  error?: string | null;
  pagination: ReactNode;
  children: ReactNode;
};

export function ManagementPage({ title, description, actions, filters, summary, notice, error, pagination, children }: ManagementPageProps) {
  return (
    <section className="management-page" aria-label={title}>
      <header className="management-heading">
        <div className="management-heading-copy">
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="management-heading-actions">{actions}</div>
      </header>
      {notice && <div className="management-notice" role="status">{notice}</div>}
      {error && <div className="management-error" role="alert">{error}</div>}
      <div className="management-panel">
        {filters}
        <div className="management-results">
          <div className="management-summary" aria-live="polite">{summary}</div>
          <div className="management-table-scroll">{children}</div>
          {pagination}
        </div>
      </div>
    </section>
  );
}
