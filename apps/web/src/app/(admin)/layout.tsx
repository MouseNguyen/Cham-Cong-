import type { ReactNode } from 'react';
import '../../styles/globals.css';
import AdminShell from '../../components/AdminShell';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
