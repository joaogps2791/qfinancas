import { useMemo, useState } from 'react'
import { Copy, PiggyBank, Plus, Target } from 'lucide-react'
import { deleteGoal, friendlyError, saveGoal, setBudget, useApp } from '../data/store'
import { useGoals, usePortfolio, type GoalView } from '../data/portfolio'
import {
  centsToInput,
  formatBRL,
  formatMonth,
  monthEntries,
  parseAmountToCents,
  todayISO,
  totalsByCategory
} from '../domain/finance'
import { PALETTE } from '../domain/categories'
import { ASSET_TYPE_LABELS } from '../domain/investments'
import { budgetRows, previousBudget, type BudgetLimits, type Goal } from '../domain/planning'
import { Button, Card, EmptyState, Input, Menu, Modal, Select } from '../components/ui'
import { IconPicker } from '../components/TxIcon'
import { BudgetList, GoalItem } from '../components/Planning'
import MonthPicker from '../components/MonthPicker'
import './planning.css'

export default function Goals(): React.JSX.Element {
  const goals = useGoals()
  const [editing, setEditing] = useState<GoalView['goal'] | 'new' | null>(null)

  const remove = (goal: Goal): void => {
    if (confirm(`Excluir a meta "${goal.name}"?`))
      deleteGoal(goal.id).catch((e) => alert(friendlyError(e)))
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Metas</h1>
          <p className="muted">Orçamento do mês e metas de economia.</p>
        </div>
        <div className="page-head__actions">
          <MonthPicker />
          <Button variant="primary" icon={<Plus size={18} />} onClick={() => setEditing('new')}>
            Nova meta
          </Button>
        </div>
      </header>

      <div className="planning-grid">
        <Budget />

        <Card>
          <div className="card-head">
            <h2>Metas de economia</h2>
          </div>
          {goals.length === 0 ? (
            <EmptyState
              icon={<Target size={22} />}
              title="Nenhuma meta ainda"
              description="Uma viagem, a reserva de emergência, um carro: diga quanto e até quando, e o app mostra quanto guardar por mês."
              action={<Button onClick={() => setEditing('new')}>Criar meta</Button>}
            />
          ) : (
            <div className="goals">
              {goals.map((view) => (
                <GoalItem
                  key={view.goal.id}
                  view={view}
                  actions={
                    <Menu
                      label={`Ações da meta ${view.goal.name}`}
                      items={[
                        { label: 'Editar', onSelect: () => setEditing(view.goal) },
                        { label: 'Excluir', danger: true, onSelect: () => remove(view.goal) }
                      ]}
                    />
                  }
                />
              ))}
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Nova meta' : 'Editar meta'}
      >
        {editing !== null && (
          <GoalForm
            key={editing === 'new' ? 'new' : editing.id}
            goal={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
    </div>
  )
}

// ---------- Orçamento ----------

function Budget(): React.JSX.Element {
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

// ---------- Formulário de meta ----------

function GoalForm({ goal, onDone }: { goal?: Goal; onDone: () => void }): React.JSX.Element {
  const goalCount = useApp((s) => s.goals.length)
  const { open, fixed } = usePortfolio(false)
  const [form, setForm] = useState({
    name: goal?.name ?? '',
    target: goal ? centsToInput(goal.targetCents) : '',
    targetDate: goal?.targetDate ?? '',
    color: goal?.color ?? PALETTE[goalCount % PALETTE.length],
    icon: goal?.icon ?? 'invest',
    link: goal?.link ?? '',
    saved: goal?.savedCents ? centsToInput(goal.savedCents) : ''
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<typeof form>): void => setForm({ ...form, ...patch })

  const linkOptions = [
    { value: '', label: 'Informo o valor à mão' },
    ...open.map((p) => ({
      value: `ticker:${p.ticker}`,
      label: `${ASSET_TYPE_LABELS[p.assetType]}: ${p.ticker}`
    })),
    ...fixed.map((f) => ({
      value: `fixed:${f.id}`,
      label: `${ASSET_TYPE_LABELS[f.assetType]}: ${f.name}`
    }))
  ]
  // Meta ligada a um ativo que já foi vendido: mantém a opção para não trocar sem querer.
  if (form.link && !linkOptions.some((o) => o.value === form.link)) {
    linkOptions.push({ value: form.link, label: 'Ativo que saiu da carteira' })
  }

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    const targetCents = parseAmountToCents(form.target)
    const savedCents = form.saved.trim() ? parseAmountToCents(form.saved) : 0
    if (!form.name.trim()) return setError('Dê um nome para a meta.')
    if (!targetCents || targetCents <= 0)
      return setError('Confira o valor-alvo (formato 1.234,56).')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.targetDate)) return setError('Escolha a data-alvo.')
    if (!form.link && (savedCents === null || savedCents < 0)) {
      return setError('Confira o valor já guardado (formato 1.234,56).')
    }
    const data: Omit<Goal, 'id'> = {
      name: form.name.trim(),
      targetCents,
      targetDate: form.targetDate,
      color: form.color,
      icon: form.icon,
      savedCents: form.link ? 0 : (savedCents ?? 0),
      ...(form.link ? { link: form.link } : {})
    }
    setSaving(true)
    saveGoal(data, goal?.id)
      .then(onDone)
      .catch((err) => {
        setError(friendlyError(err))
        setSaving(false)
      })
  }

  return (
    <form className="tx-form" onSubmit={submit} noValidate>
      <Input
        label="Nome"
        placeholder="Ex.: Viagem para o Chile"
        value={form.name}
        onChange={(e) => set({ name: e.target.value })}
      />
      <div className="form-grid">
        <Input
          label="Valor-alvo (R$)"
          inputMode="decimal"
          placeholder="0,00"
          value={form.target}
          onChange={(e) => set({ target: e.target.value })}
        />
        <Input
          label="Data-alvo"
          type="date"
          min={todayISO()}
          value={form.targetDate}
          onChange={(e) => set({ targetDate: e.target.value })}
        />
      </div>
      <div className="form-grid">
        <Select
          label="De onde vem o valor guardado"
          options={linkOptions}
          value={form.link}
          onChange={(e) => set({ link: e.target.value })}
        />
        {form.link ? (
          <p className="muted small">
            O valor guardado acompanha o valor de hoje desse ativo na carteira.
          </p>
        ) : (
          <Input
            label="Já guardado (R$)"
            inputMode="decimal"
            placeholder="0,00"
            value={form.saved}
            onChange={(e) => set({ saved: e.target.value })}
          />
        )}
      </div>
      <details className="tx-form__icon">
        <summary>Ícone e cor</summary>
        <div className="row">
          <label className="row small">
            Cor
            <input
              type="color"
              className="color-input"
              value={form.color}
              onChange={(e) => set({ color: e.target.value })}
            />
          </label>
        </div>
        <IconPicker
          categoriesOnly
          color={form.color}
          value={`cat:${form.icon}`}
          onChange={(value) => set({ icon: value.slice(4) })}
        />
      </details>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="tx-form__actions">
        <Button onClick={onDone}>Cancelar</Button>
        <Button type="submit" variant="primary" disabled={saving}>
          {goal ? 'Salvar meta' : 'Criar meta'}
        </Button>
      </div>
    </form>
  )
}
