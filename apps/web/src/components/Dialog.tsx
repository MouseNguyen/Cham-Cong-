'use client';

import { useEffect, useRef, type ReactNode } from 'react';

type DialogProps = { children: ReactNode; name: string; onClose?: () => void; open: boolean };

export default function Dialog({ children, name, onClose, open }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog className="dialog" ref={ref} aria-label={name} onCancel={(event) => { event.preventDefault(); onClose?.(); }} onClose={onClose}>{children}</dialog>;
}
