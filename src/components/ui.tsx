import { useEffect, type ReactNode } from 'react'
import { IconX } from './icons'

export function Screen({
  title,
  subtitle,
  left,
  right,
  onTitleClick,
  titleHint,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  left?: ReactNode
  right?: ReactNode
  /** Если задан, заголовок становится кнопкой. */
  onTitleClick?: () => void
  /** Иконка справа от заголовка — подсказка, что по нему можно нажать. */
  titleHint?: ReactNode
  children: ReactNode
}) {
  const head = (
    <>
      <h1 className="display text-[18px] font-bold leading-tight truncate">{title}</h1>
      {subtitle ? <p className="text-[12px] text-muted leading-tight truncate">{subtitle}</p> : null}
    </>
  )

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-bg">
      <header className="safe-top shrink-0 bg-bg border-b border-line">
        <div className="flex items-center gap-2 px-3 h-14">
          {left}
          {onTitleClick ? (
            <button
              type="button"
              onClick={onTitleClick}
              className="min-w-0 flex-1 flex items-center gap-1.5 text-left active:opacity-60 transition"
            >
              <span className="min-w-0">{head}</span>
              {titleHint ? <span className="shrink-0 text-muted">{titleHint}</span> : null}
            </button>
          ) : (
            <div className="min-w-0 flex-1">{head}</div>
          )}
          {right}
        </div>
      </header>
      {/* Скроллится только содержимое: панель снизу тогда не ездит по экрану. */}
      <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pt-3 pb-6">
        {children}
      </main>
    </div>
  )
}

export function IconButton({
  onClick,
  label,
  children,
  tone = 'default',
}: {
  onClick: () => void
  label: string
  children: ReactNode
  tone?: 'default' | 'danger'
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`shrink-0 grid place-items-center w-10 h-10 rounded-xl active:scale-95 transition ${
        tone === 'danger' ? 'text-danger' : 'text-muted'
      } hover:bg-surface-2`}
    >
      {children}
    </button>
  )
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  type = 'button',
  disabled,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'danger'
  type?: 'button' | 'submit'
  disabled?: boolean
  className?: string
}) {
  const styles = {
    primary: 'bg-accent font-semibold',
    ghost: 'bg-surface-2 text-ink border border-line',
    danger: 'bg-transparent text-danger border border-danger/40',
  }[variant]
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={variant === 'primary' ? { color: 'var(--on-accent)' } : undefined}
      className={`px-4 h-11 rounded-xl active:scale-[0.98] transition disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  )
}

/** Выезжающая снизу панель — на телефоне удобнее диалога по центру. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    // Пока панель открыта, фон за ней скроллиться не должен.
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-surface rounded-t-3xl border-t border-line max-h-[88dvh] flex flex-col">
        <div className="flex items-center gap-2 px-4 h-14 border-b border-line shrink-0">
          <h2 className="display flex-1 text-[16px] font-bold truncate">{title}</h2>
          <IconButton onClick={onClose} label="Закрыть">
            <IconX />
          </IconButton>
        </div>
        <div className="overflow-y-auto px-4 py-4 safe-bottom">{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block mb-4">
      <span className="block text-[13px] text-muted mb-1.5">{label}</span>
      {children}
    </label>
  )
}

export const inputClass =
  'w-full h-11 px-3 rounded-xl bg-surface-2 border border-line outline-none focus:border-accent transition'

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="text-center py-16 px-6">
      <p className="text-muted">{title}</p>
      {hint ? <p className="text-[13px] text-muted/70 mt-1">{hint}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  )
}

/** Переключатель для настроек. */
export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-surface-2 transition"
    >
      <span className="flex-1 min-w-0">
        <span className="block text-[15px]">{label}</span>
        {hint ? <span className="block text-[12px] text-muted mt-0.5">{hint}</span> : null}
      </span>
      <span
        className={`shrink-0 w-12 h-7 rounded-full border transition relative ${
          checked ? 'bg-accent border-accent' : 'bg-surface-2 border-line'
        }`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full transition-all ${
            checked ? 'left-6' : 'left-0.5'
          }`}
          style={{ background: checked ? 'var(--on-accent)' : 'var(--c-muted)' }}
        />
      </span>
    </button>
  )
}
