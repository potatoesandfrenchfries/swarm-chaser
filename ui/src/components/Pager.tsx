import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** A page of a long list, and the controls to move through it. */
export function usePage<T>(items: T[], size: number) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(items.length / size));
  // A list that shrank keeps a valid page.
  const at = Math.min(page, pages - 1);
  return { slice: items.slice(at * size, at * size + size), at, pages, size, total: items.length, setPage };
}

export function Pager({ p, label }: { p: ReturnType<typeof usePage>; label: string }) {
  if (p.pages < 2) return null;
  const from = p.at * p.size + 1;
  const to = Math.min(p.total, from + p.size - 1);
  return (
    <nav className="pager" aria-label={`${label} pages`}>
      <span>
        {from}–{to} of {p.total}
      </span>
      <button type="button" className="pager-btn" aria-label="Previous page" disabled={p.at === 0} onClick={() => p.setPage(p.at - 1)}>
        <ChevronLeft size={16} aria-hidden="true" />
      </button>
      <button type="button" className="pager-btn" aria-label="Next page" disabled={p.at >= p.pages - 1} onClick={() => p.setPage(p.at + 1)}>
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </nav>
  );
}
