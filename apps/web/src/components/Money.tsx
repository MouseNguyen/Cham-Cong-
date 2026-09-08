type MoneyProps = { amount: string | number | bigint; label?: string };

export default function Money({ amount, label }: MoneyProps) {
  const value = typeof amount === 'bigint' ? amount.toString() : String(amount);
  return <span className="money" aria-label={label}>{new Intl.NumberFormat('vi-VN').format(BigInt(value))} VND</span>;
}
