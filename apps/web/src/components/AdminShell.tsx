'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const links = [
  { href: '/dashboard', label: 'Tổng quan' },
  { href: '/employees', label: 'Nhân viên' },
  { href: '/attendance', label: 'Bảng công' },
  { href: '/pay-runs', label: 'Kỳ lương' },
];

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <div className="admin-layout"><div className="admin-shell"><header className="admin-topbar"><Link className="brand-lockup" href="/dashboard"><span className="brand-frame"><Image className="brand-logo" src="/the-kays-gelato-logo.jpg" alt="The Kay’s Gelato" width={44} height={44} unoptimized /></span><span>The Kay’s Gelato<br />Pay Slip</span></Link><span className="admin-context">Quản trị nội bộ · Việt Nam</span></header><nav className="admin-nav" aria-label="Quản trị bảng lương">{links.map((link) => <Link aria-current={pathname === link.href ? 'page' : undefined} href={link.href} key={link.href}>{link.label}</Link>)}</nav>{children}</div></div>;
}
