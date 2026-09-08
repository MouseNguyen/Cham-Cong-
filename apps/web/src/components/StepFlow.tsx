const steps = ['Nháp', 'Đã tính', 'Chờ duyệt', 'Đã duyệt', 'Đã chốt'] as const;
type Step = typeof steps[number];

export default function StepFlow({ current }: { current: Step }) {
  const active = steps.indexOf(current);
  return <ol className="step-flow" aria-label="Tiến trình kỳ lương">{steps.map((step, index) => <li className={`step${index <= active ? ' step-active' : ''}`} key={step}>{step}</li>)}</ol>;
}
