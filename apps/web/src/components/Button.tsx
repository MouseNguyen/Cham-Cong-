import type { ButtonHTMLAttributes } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' };

export default function Button({ className = '', variant = 'primary', ...props }: ButtonProps) {
  const kind = variant === 'primary' ? '' : variant === 'secondary' ? ' button-secondary' : ' button-danger';
  return <button className={`button${kind} ${className}`.trim()} {...props} />;
}
