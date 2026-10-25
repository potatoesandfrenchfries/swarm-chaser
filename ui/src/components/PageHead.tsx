import type { ReactNode } from 'react';

/** A dashboard page's title bar: what this page is on the left, its controls on the right. */
export function PageHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="page-head-tools">{children}</div>}
    </header>
  );
}
