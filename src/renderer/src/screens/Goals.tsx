import { useState } from 'react'
import { Plus, Target } from 'lucide-react'
import { deleteGoal, friendlyError, saveGoal, useApp } from '../data/store'
import { useGoals, usePortfolio, type GoalView } from '../data/portfolio'
import { centsToInput, parseAmountToCents, todayISO } from '../domain/finance'
import { PALETTE } from '../domain/categories'
import { ASSET_TYPE_LABELS } from '../domain/investments'
import { type Goal } from '../domain/planning'
import { Button, Card, EmptyState, Input, Menu, Modal, Select } from '../components/ui'
import { IconPicker } from '../components/TxIcon'
import { GoalItem } from '../components/Planning'
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
          <p className="muted">Metas de economia: quanto guardar e até quando.</p>
        </div>
        <div className="page-head__actions">
          <Button variant="primary" icon={<Plus size={18} />} onClick={() => setEditing('new')}>
            Nova meta
          </Button>
        </div>
      </header>

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
