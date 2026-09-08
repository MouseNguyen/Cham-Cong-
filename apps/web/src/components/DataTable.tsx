import type { ReactNode } from 'react';

type DataTableProps = { caption: string; children: ReactNode };

export default function DataTable({ caption, children }: DataTableProps) {
  return <div className="table-region" role="region" aria-label={caption}><table><caption className="sr-only">{caption}</caption>{children}</table></div>;
}
