import type { CSSProperties } from 'react'

export function Segmented<T extends string>({ label, value, options, onChange, columns = options.length, className = '' }: {
  label: string; value: T; options: readonly { id: T; label: string }[];
  onChange: (value: T) => void; columns?: number; className?: string;
}) {
  const index = options.findIndex(option => option.id === value)
  return <div className={`theme-options segmented ${className}`} role="group" aria-label={label}
    style={{ '--columns': columns, '--rows': Math.ceil(options.length / columns), '--column': index % columns, '--row': Math.floor(index / columns) } as CSSProperties}>
    <span className="segment-bubble" aria-hidden="true" />
    {options.map(option => <button type="button" key={option.id} aria-pressed={value === option.id} onClick={() => onChange(option.id)}>{option.label}</button>)}
  </div>
}
