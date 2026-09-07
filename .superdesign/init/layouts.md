# Shared layouts

## RootLayout

- Source: `apps/web/src/app/layout.tsx`
- Purpose: root Vietnamese document shell and product metadata.

```tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  description: 'Ứng dụng chấm công, tính lương và phiếu lương The Kay’s Gelato.',
  title: 'Pay Slip · The Kay’s Gelato',
};

type RootLayoutProps = Readonly<{ children: ReactNode }>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
```

No shared admin shell, navigation bar, sidebar, header, footer, or breadcrumb exists yet.
