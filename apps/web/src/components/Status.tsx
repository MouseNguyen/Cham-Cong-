type StatusProps = { children: string; tone?: 'success' | 'warning' | 'error' | 'muted' };

export default function Status({ children, tone = 'muted' }: StatusProps) {
  return <span className={`status status-${tone}`}><span aria-hidden="true">●</span>{children}</span>;
}
