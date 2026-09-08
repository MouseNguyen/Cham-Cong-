import type { ReactNode } from 'react';

export default function TracePanel({ children }: { children: ReactNode }) {
  return <section className="trace" aria-label="Giải thích tính lương">{children}</section>;
}
