import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, MoreHorizontal, X } from 'lucide-react'
import { formatBRL, formatPercent } from '../domain/finance'
import './ui.css'

// Componentes base do design system. Cores só por tokens (styles/tokens.css).

const cx = (...names: (string | false | null | undefined)[]): string =>
  names.filter(Boolean).join(' ')

// ---------- Button ----------

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  icon?: ReactNode
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps): React.JSX.Element {
  return (
    <button
      type={type}
      className={cx(
        'ui-button',
        `ui-button--${variant}`,
        `ui-button--${size}`,
        !!icon && !children && 'ui-button--icon',
        className
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  )
}

// ---------- Card ----------

type Tone = 'default' | 'sage' | 'butter' | 'lilac'

export function Card({
  tone = 'default',
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { tone?: Tone }): React.JSX.Element {
  return (
    <div className={cx('ui-card', `ui-card--${tone}`, className)} {...props}>
      {children}
    </div>
  )
}

// ---------- StatCard ----------

function Sparkline({ points }: { points: number[] }): React.JSX.Element | null {
  if (points.length < 2) return null
  const min = Math.min(...points)
  const range = Math.max(...points) - min || 1
  const path = points
    .map((p, i) => `${(i / (points.length - 1)) * 100},${28 - ((p - min) / range) * 24}`)
    .join(' ')
  return (
    <svg className="ui-spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden>
      <polyline
        points={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

type StatCardProps = {
  label: string
  valueCents: number
  /** variação em relação ao mês anterior (0.12 = +12%); null quando não dá para calcular */
  change?: number | null
  /** em gastos, subir é ruim: inverte a cor da variação */
  higherIsWorse?: boolean
  tone?: Tone
  spark?: number[]
  icon?: ReactNode
  /** linha pequena embaixo do valor (ex.: "de R$ 1.000,00 planejados") */
  note?: string
}

export function StatCard({
  label,
  valueCents,
  change,
  higherIsWorse = false,
  tone = 'default',
  spark,
  icon,
  note
}: StatCardProps): React.JSX.Element {
  const good = change == null || change === 0 ? null : change > 0 !== higherIsWorse
  return (
    <Card tone={tone} className="ui-stat">
      <div className="ui-stat__top">
        <span className="ui-stat__label">
          {icon}
          {label}
        </span>
        {change != null && (
          <Badge tone={good === null ? 'neutral' : good ? 'success' : 'danger'}>
            {change > 0 ? (
              <ArrowUpRight size={12} />
            ) : change < 0 ? (
              <ArrowDownRight size={12} />
            ) : null}
            {formatPercent(change)}
          </Badge>
        )}
      </div>
      <strong className="ui-stat__value">{formatBRL(valueCents)}</strong>
      {spark && <Sparkline points={spark} />}
      {note && <small className="ui-stat__note">{note}</small>}
    </Card>
  )
}

// ---------- Input / Select ----------

type FieldProps = { label: string; hint?: string; error?: string }

function Field({
  id,
  label,
  hint,
  error,
  children
}: FieldProps & { id: string; children: ReactNode }): React.JSX.Element {
  return (
    <div className="ui-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <small id={`${id}-msg`} className="ui-field__error">
          {error}
        </small>
      ) : (
        hint && (
          <small id={`${id}-msg`} className="ui-field__hint">
            {hint}
          </small>
        )
      )}
    </div>
  )
}

export function Input({
  label,
  hint,
  error,
  className,
  ...props
}: FieldProps & React.InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  const id = useId()
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        className={cx('ui-input', className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-msg` : undefined}
        {...props}
      />
    </Field>
  )
}

type Option = string | { value: string; label: string }
const optionValue = (o: Option): string => (typeof o === 'string' ? o : o.value)
const optionLabel = (o: Option): string => (typeof o === 'string' ? o : o.label)

export function Select({
  label,
  hint,
  error,
  options,
  className,
  ...props
}: FieldProps & {
  options: Option[]
} & React.SelectHTMLAttributes<HTMLSelectElement>): React.JSX.Element {
  const id = useId()
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <select
        id={id}
        className={cx('ui-input', 'ui-select', className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-msg` : undefined}
        {...props}
      >
        {options.map((o) => (
          <option key={optionValue(o)} value={optionValue(o)}>
            {optionLabel(o)}
          </option>
        ))}
      </select>
    </Field>
  )
}

// ---------- Modal ----------

type ModalProps = {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}

/** Usa o <dialog> nativo: foco preso dentro, Esc fecha, fundo escurecido. */
export function Modal({ open, onClose, title, children, footer }: ModalProps): React.JSX.Element {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // O <dialog> foca o primeiro botão (o X); num formulário, o certo é o primeiro campo.
      dialog.querySelector<HTMLElement>('.ui-modal__body :is(input, select, textarea)')?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="ui-modal"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <header className="ui-modal__header">
        <h2 id={titleId}>{title}</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          aria-label="Fechar"
          icon={<X size={18} />}
        />
      </header>
      <div className="ui-modal__body">{children}</div>
      {footer && <footer className="ui-modal__footer">{footer}</footer>}
    </dialog>
  )
}

// ---------- Pills (abas) ----------

type PillsProps<T extends string> = {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}

export function Pills<T extends string>({
  label,
  options,
  value,
  onChange
}: PillsProps<T>): React.JSX.Element {
  const move = (event: React.KeyboardEvent, index: number): void => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = options[(index + step + options.length) % options.length]
    onChange(next.value)
    const buttons = (event.currentTarget.parentElement as HTMLElement).querySelectorAll('button')
    buttons[(index + step + options.length) % options.length]?.focus()
  }

  return (
    <div className="ui-pills" role="radiogroup" aria-label={label}>
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          className={cx('ui-pill', o.value === value && 'is-active')}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => move(e, i)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ---------- Badge ----------

export function Badge({
  tone = 'neutral',
  children
}: {
  tone?: 'neutral' | 'success' | 'danger' | 'warning' | 'accent'
  children: ReactNode
}): React.JSX.Element {
  return <span className={cx('ui-badge', `ui-badge--${tone}`)}>{children}</span>
}

// ---------- Toggle ----------

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}): React.JSX.Element {
  const id = useId()
  return (
    <div className="ui-toggle-row">
      <div>
        <label htmlFor={id}>{label}</label>
        {description && <small className="ui-field__hint">{description}</small>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className="ui-toggle"
        onClick={() => onChange(!checked)}
      >
        <span className="ui-toggle__thumb" />
      </button>
    </div>
  )
}

// ---------- Tooltip ----------

export function Tooltip({
  content,
  children
}: {
  content: ReactNode
  children: ReactNode
}): React.JSX.Element {
  const id = useId()
  return (
    <span className="ui-tooltip" aria-describedby={id}>
      {children}
      <span role="tooltip" id={id} className="ui-tooltip__bubble">
        {content}
      </span>
    </span>
  )
}

// ---------- Avatar ----------

const initials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?'

export function Avatar({
  name,
  src,
  size = 40
}: {
  name: string
  src?: string
  size?: number
}): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  const style = { width: size, height: size, fontSize: size * 0.38 }
  return src && !failed ? (
    <img
      className="ui-avatar"
      src={src}
      alt={name}
      style={style}
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
    />
  ) : (
    <span className="ui-avatar ui-avatar--initials" style={style} role="img" aria-label={name}>
      {initials(name)}
    </span>
  )
}

// ---------- EmptyState ----------

export function EmptyState({
  icon,
  title,
  description,
  action
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}): React.JSX.Element {
  return (
    <div className="ui-empty">
      {icon && <div className="ui-empty__icon">{icon}</div>}
      <h3>{title}</h3>
      {description && <p className="muted">{description}</p>}
      {action}
    </div>
  )
}

// ---------- Menu ("…") ----------

export type MenuItem = { label: string; onSelect: () => void; icon?: ReactNode; danger?: boolean }

/** Botão "…" que abre uma lista de ações. Fecha com Esc, clique fora ou ao escolher. */
export function Menu({ label, items }: { label: string; items: MenuItem[] }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    ref.current?.querySelector<HTMLButtonElement>('[role=menuitem]')?.focus()
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      setOpen(false)
      ref.current?.querySelector<HTMLButtonElement>('.ui-menu__trigger')?.focus()
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const options = [...(ref.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]') ?? [])]
    const index = options.indexOf(document.activeElement as HTMLButtonElement)
    const step = e.key === 'ArrowDown' ? 1 : -1
    options[(index + step + options.length) % options.length]?.focus()
  }

  return (
    <div className="ui-menu" ref={ref} onKeyDown={onKeyDown}>
      <Button
        variant="ghost"
        size="sm"
        className="ui-menu__trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        icon={<MoreHorizontal size={18} />}
      />
      {open && (
        <div className="ui-menu__list" role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={cx('ui-menu__item', item.danger && 'is-danger')}
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- Skeleton ----------

export function Skeleton({
  width = '100%',
  height = 16,
  radius = 'var(--radius-sm)'
}: {
  width?: number | string
  height?: number | string
  radius?: string
}): React.JSX.Element {
  return (
    <span className="ui-skeleton" style={{ width, height, borderRadius: radius }} aria-hidden />
  )
}
