// Orçamento do mês: limite por categoria e quanto já foi gasto. Aqui vai crescer o
// planejamento mensal completo; por enquanto é o mesmo orçamento que ficava em Metas.
import { useMemo, useState } from 'react'
import { Copy, PiggyBank } from 'lucide-react'
import { friendlyError, setBudget, useApp } from '../data/store'
import {
  centsToInput,
  formatBRL,
  formatMonth,
  monthEntries,
  parseAmountToCents,
  totalsByCategory
} from '../domain/finance'
import { budgetRows, previousBudget, type BudgetLimits } from '../domain/planning'
import { Button, Card, EmptyState } from '../components/ui'
import { BudgetList } from '../components/Planning'
import MonthPicker from '../components/MonthPicker'
import './planning.css'

export default function Budget(): React.JSX.Element {
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Orçamento</h1>
          <p className="muted">Quanto você planeja gastar em cada categoria no mês.</p>
        </div>
        <div className="page-head__actions">
          <MonthPicker />
        </div>
      </header>

      <BudgetCard />
    </div>
  )
}

function BudgetCard(): React.JSX.Element {
  const month = useApp((s) => s.month)
  const budgets = useApp((s) => s.budgets)
  const transactions = useApp((s) => s.transactions)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const limits = budgets[month] ?? {}
  const spent = useMemo(
    () => totalsByCategory(monthEntries(transactions, month)),
    [transactions, month]
  )
  const rows = budgetRows(limits, spent)
  const previous = previousBudget(budgets, month)
  const totalLimit = rows.reduce((s, r) => s + r.limitCents, 0)
  const totalSpent = rows.reduce((s, r) => s + r.spentCents, 0)

  const copy = (): void => {
    if (!previous) return
    setError(null)
    setBudget(month, previous.limits).catch((e) => setError(friendlyError(e)))
  }

  return (
    <Card>
      <div className="card-head">
        <div>
          <h2>Orçamento do mês</h2>
          {rows.length > 0 && (
            <>
              <p className="card-head__value">{formatBRL(totalSpent)}</p>
              <p className="muted small budget-total">de {formatBRL(totalLimit)} planejados</p>
            </>
          )}
        </div>
        {rows.length > 0 && !editing && (
          <Button size="sm" onClick={() => setEditing(true)}>
            Editar
          </Button>
        )}
      </div>

      {editing ? (
        <BudgetEditor
          month={month}
          limits={limits}
          previous={previous}
          onDone={() => setEditing(false)}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<PiggyBank size={22} />}
          title="Sem orçamento neste mês"
          description="Defina um limite por categoria. A barra fica amarela em 80% e vermelha ao passar do limite."
          action={
            <div className="row">
              <Button onClick={() => setEditing(true)}>Montar orçamento</Button>
              {previous && (
                <Button icon={<Copy size={14} />} onClick={copy}>
                  Copiar de {formatMonth(previous.month).toLowerCase()}
                </Button>
              )}
            </div>
          }
        />
      ) : (
        <BudgetList rows={rows} />
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </Card>
  )
}

function BudgetEditor({
  month,
  limits,
  previous,
  onDone
}: {
  month: string
  limits: BudgetLimits
  previous: { month: string; limits: BudgetLimits } | null
  onDone: () => void
}): React.JSX.Element {
  const categories = useApp((s) => s.settings?.categories) ?? []
  // Categorias de hoje + as que já tinham limite (caso alguma tenha saído das Configurações).
  const names = [...new Set([...categories.map((c) => c.name), ...Object.keys(limits)])]
  const toInputs = (source: BudgetLimits): Record<string, string> =>
    Object.fromEntries(names.map((n) => [n, source[n] ? centsToInput(source[n]) : '']))
  const [values, setValues] = useState(() => toInputs(limits))
  const [error, setError] = useState<string | null>(null)

  const save = (): void => {
    const parsed: BudgetLimits = {}
    for (const [name, text] of Object.entries(values)) {
      if (!text.trim()) continue
      const cents = parseAmountToCents(text)
      if (cents === null) return setError(`Confira o valor de ${name} (formato 1.234,56).`)
      if (cents > 0) parsed[name] = cents
    }
    setBudget(month, parsed)
      .then(onDone)
      .catch((e) => setError(friendlyError(e)))
  }

  return (
    <div className="budget-editor">
      {previous && (
        <Button
          size="sm"
          variant="ghost"
          icon={<Copy size={14} />}
          onClick={() => setValues(toInputs(previous.limits))}
        >
          Preencher com {formatMonth(previous.month).toLowerCase()}
        </Button>
      )}
      {names.map((name) => {
        const color = categories.find((c) => c.name === name)?.color ?? 'var(--text-muted)'
        return (
          <div key={name} className="budget-editor__row">
            <label htmlFor={`budget-${name}`}>
              <span className="legend__dot" style={{ background: color }} />
              {name}
            </label>
            <input
              id={`budget-${name}`}
              className="ui-input"
              inputMode="decimal"
              placeholder="Sem limite"
              value={values[name] ?? ''}
              onChange={(e) => setValues({ ...values, [name]: e.target.value })}
            />
          </div>
        )
      })}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="tx-form__actions">
        <Button onClick={onDone}>Cancelar</Button>
        <Button variant="primary" onClick={save}>
          Salvar orçamento
        </Button>
      </div>
    </div>
  )
}
