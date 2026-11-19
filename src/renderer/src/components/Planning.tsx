// Barras de orçamento e cartão de meta, usados na tela de Metas e no Dashboard.
import { formatBRL, formatMonth, monthKey } from '../domain/finance'
import type { BudgetRow } from '../domain/planning'
import type { GoalView } from '../data/portfolio'
import { Badge } from './ui'
import { IconBadge } from './TxIcon'
import '../screens/planning.css'

const LEVEL_TEXT = { ok: 'dentro do limite', warning: 'perto do limite', over: 'estourou' }

function Bar({
  ratio,
  className,
  label
}: {
  ratio: number
  className: string
  label: string
}): React.JSX.Element {
  const clamped = Math.min(1, Math.max(0, ratio))
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
    >
      <span className={className} style={{ width: `${clamped * 100}%` }} />
    </div>
  )
}

export function BudgetList({ rows }: { rows: BudgetRow[] }): React.JSX.Element {
  return (
    <ul className="budget-list">
      {rows.map((r) => {
        const left = r.limitCents - r.spentCents
        return (
          <li key={r.category}>
            <div className="row between">
              <strong>{r.category}</strong>
              <span className="muted small">
                {formatBRL(r.spentCents)} de {formatBRL(r.limitCents)}
              </span>
            </div>
            <Bar
              ratio={r.spentCents / r.limitCents}
              className={`level--${r.level}`}
              label={`${r.category}: ${LEVEL_TEXT[r.level]}`}
            />
            <small className={`level-text--${r.level}`}>
              {left > 0
                ? `Sobram ${formatBRL(left)}`
                : left === 0
                  ? 'Chegou ao limite'
                  : `Passou ${formatBRL(-left)} do limite`}
            </small>
          </li>
        )
      })}
    </ul>
  )
}

export function GoalItem({
  view,
  actions
}: {
  view: GoalView
  actions?: React.ReactNode
}): React.JSX.Element {
  const { goal, progress, linkLabel, linkMissing } = view
  return (
    <div className="goal">
      <div className="goal__head">
        <IconBadge
          icon={{ kind: 'category', key: goal.icon ?? 'invest', color: goal.color }}
          size={40}
        />
        <div className="goal__title">
          <strong>{goal.name}</strong>
          <small className="muted">
            até {formatMonth(monthKey(goal.targetDate)).toLowerCase()}
            {linkLabel && ` · ligada a ${linkLabel}`}
          </small>
        </div>
        {actions}
      </div>
      <div className="row between">
        <strong className="goal__saved">{formatBRL(progress.savedCents)}</strong>
        <span className="muted small">de {formatBRL(goal.targetCents)}</span>
      </div>
      <Bar
        ratio={progress.ratio}
        className={progress.done ? 'level--ok' : 'goal__fill'}
        label={`Progresso de ${goal.name}`}
      />
      {linkMissing ? (
        <small className="level-text--warning">O ativo ligado não está mais na carteira.</small>
      ) : progress.done ? (
        <span>
          <Badge tone="success">Meta batida</Badge>
        </span>
      ) : progress.monthlyCents === null ? (
        <small className="level-text--over">
          Prazo vencido. Faltam {formatBRL(progress.remainingCents)}.
        </small>
      ) : (
        <small className="muted">
          Faltam {formatBRL(progress.remainingCents)}. Guarde{' '}
          <strong>{formatBRL(progress.monthlyCents)}</strong>{' '}
          {progress.months === 1 ? 'este mês' : `por mês nos próximos ${progress.months} meses`}.
        </small>
      )}
    </div>
  )
}
