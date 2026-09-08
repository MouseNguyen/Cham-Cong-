import { cloneElement, useId, type ReactElement } from 'react';

type FieldProps = { children: ReactElement<{ id?: string; 'aria-describedby'?: string }>; hint?: string; label: string };

export default function Field({ children, hint, label }: FieldProps) {
  const generatedId = useId();
  const controlId = children.props.id ?? generatedId;
  const hintId = `${generatedId}-hint`;
  const describedBy = [children.props['aria-describedby'], hint ? hintId : null].filter(Boolean).join(' ');
  return <div className="field"><label htmlFor={controlId}>{label}</label>{cloneElement(children, { id: controlId, ...(describedBy ? { 'aria-describedby': describedBy } : {}) })}{hint ? <span id={hintId} className="field-hint">{hint}</span> : null}</div>;
}
