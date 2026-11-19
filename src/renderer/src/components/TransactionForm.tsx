import { useState } from 'react'
import { addTransactions, friendlyError, updateTransaction, useApp } from '../data/store'
import { classifyCategory, type Card } from '../domain/categories'
import {
  buildRecurringSeries,
  centsToInput,
  INCOME_TYPES,
  parseAmountToCents,
  PAYMENT_METHODS,
  suggestInvoiceDate,
  todayISO,
  type Transaction,
  type TransactionInput
} from '../domain/finance'
import { Button, Input, Pills, Select, Toggle } from './ui'
import { IconPicker } from './TxIcon'

type Kind = Transaction['kind']

type FormState = {
  kind: Kind
  description: string
  amount: string
  date: string
  incomeType: string
  category: string
  paymentMethod: string
  card: string
  invoiceDate: string
  /** a fatura foi escolhida à mão (então não recalcula sozinha) */
  invoiceTouched: boolean
  installments: string
  recurring: boolean
  recurrenceCount: string
  notes: string
  icon: string
}

const KINDS: { value: Kind; label: string }[] = [
  { value: 'income', label: 'Entrada' },
  { value: 'cash', label: 'À vista' },
  { value: 'card', label: 'Cartão' }
]

// "Memória" do site antigo: o último cartão e fatura usados valem por 15 minutos.
const MEMORY_TTL = 15 * 60 * 1000
const memoryKey = (uid: string): string => `qf-card-memory-${uid}`

function readCardMemory(uid: string): { card: string; invoiceDate: string } | null {
  try {
    const memory = JSON.parse(localStorage.getItem(memoryKey(uid)) ?? 'null')
    return memory && Date.now() - memory.savedAt < MEMORY_TTL ? memory : null
  } catch {
    return null
  }
}

function saveCardMemory(uid: string, card: string, invoiceDate: string): void {
  try {
    localStorage.setItem(memoryKey(uid), JSON.stringify({ card, invoiceDate, savedAt: Date.now() }))
  } catch {
    // Sem localStorage só perde a memória, nada mais.
  }
}

const invoiceFor = (cards: Card[], cardName: string, date: string): string | null => {
  const card = cards.find((c) => c.name === cardName)
  return card?.closingDay && card.dueDay
    ? suggestInvoiceDate(date, card.closingDay, card.dueDay)
    : null
}

function initialState(editing: Transaction | undefined, cards: Card[], uid: string): FormState {
  const today = todayISO()
  const blank: FormState = {
    kind: 'cash',
    description: '',
    amount: '',
    date: today,
    incomeType: INCOME_TYPES[0],
    category: '',
    paymentMethod: PAYMENT_METHODS[0],
    card: cards[0]?.name ?? '',
    invoiceDate: invoiceFor(cards, cards[0]?.name ?? '', today) ?? today,
    invoiceTouched: false,
    installments: '1',
    recurring: false,
    recurrenceCount: '12',
    notes: '',
    icon: ''
  }

  if (!editing) {
    const memory = readCardMemory(uid)
    if (memory && cards.some((c) => c.name === memory.card)) {
      return { ...blank, card: memory.card, invoiceDate: memory.invoiceDate, invoiceTouched: true }
    }
    return blank
  }

  const base = {
    ...blank,
    kind: editing.kind,
    description: editing.description,
    amount: centsToInput(editing.amountCents),
    date: editing.date,
    icon: editing.icon ?? ''
  }
  if (editing.kind === 'income') return { ...base, incomeType: editing.incomeType }
  if (editing.kind === 'cash') {
    return { ...base, category: editing.category, paymentMethod: editing.paymentMethod }
  }
  return {
    ...base,
    category: editing.category,
    card: editing.card,
    invoiceDate: editing.invoiceDate,
    invoiceTouched: true,
    installments: String(editing.installments),
    notes: editing.notes ?? ''
  }
}

export default function TransactionForm({
  editing,
  onDone
}: {
  editing?: Transaction
  onDone: () => void
}): React.JSX.Element {
  const settings = useApp((s) => s.settings)
  const uid = useApp((s) => s.user?.uid ?? '')
  const cards = settings?.cards ?? []
  const categories = settings?.categories.map((c) => c.name) ?? []

  const [form, setForm] = useState(() => initialState(editing, cards, uid))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const set = (patch: Partial<FormState>): void =>
    setForm((f) => {
      const next = { ...f, ...patch }
      // Fatura sugerida pelo fechamento do cartão, até a pessoa escolher outra.
      if (!next.invoiceTouched && ('card' in patch || 'date' in patch || 'kind' in patch)) {
        next.invoiceDate = invoiceFor(cards, next.card, next.date) ?? next.invoiceDate
      }
      return next
    })

  const autoCategory = form.description.trim()
    ? classifyCategory(form.description, categories)
    : null
  const categoryColor = settings?.categories.find(
    (c) => c.name === (form.category || autoCategory)
  )?.color

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    setError(null)
    const description = form.description.trim()
    const amountCents = parseAmountToCents(form.amount)
    if (!description) return setError('Escreva uma descrição.')
    if (!amountCents) return setError('Valor inválido. Use o formato 1.234,56.')
    if (!form.date) return setError('Escolha a data.')

    const category = form.category || classifyCategory(description, categories)
    const base = { description, amountCents, date: form.date, icon: form.icon || undefined }
    let input: TransactionInput
    if (form.kind === 'income') {
      input = { ...base, kind: 'income', incomeType: form.incomeType }
    } else if (form.kind === 'cash') {
      input = { ...base, kind: 'cash', category, paymentMethod: form.paymentMethod }
    } else {
      const installments = Number(form.installments)
      if (!form.card) return setError('Cadastre um cartão em Configurações primeiro.')
      if (!form.invoiceDate) return setError('Escolha a fatura.')
      if (!Number.isInteger(installments) || installments < 1 || installments > 72) {
        return setError('Parcelas: de 1 a 72.')
      }
      input = {
        ...base,
        kind: 'card',
        category,
        card: form.card,
        invoiceDate: form.invoiceDate,
        installments: form.recurring ? 1 : installments,
        notes: form.notes.trim() || undefined
      }
    }

    setSaving(true)
    try {
      if (editing) {
        // Editar mexe só neste lançamento; numa série, os outros meses ficam como estão.
        const keepSeries =
          editing.kind === input.kind && 'recurringGroup' in editing && editing.recurringGroup
            ? {
                recurringGroup: editing.recurringGroup,
                occurrenceNumber: editing.occurrenceNumber,
                occurrenceTotal: editing.occurrenceTotal
              }
            : {}
        await updateTransaction(editing.id, { ...input, ...keepSeries } as TransactionInput)
      } else {
        const count = form.recurring ? Number(form.recurrenceCount) : 1
        if (!Number.isInteger(count) || count < 1 || count > 120) {
          setSaving(false)
          return setError('Repetições: de 1 a 120 meses.')
        }
        // Com o cache local o lançamento aparece na hora; o envio segue em segundo plano.
        addTransactions(buildRecurringSeries(input, count, crypto.randomUUID())).catch((e) =>
          alert(friendlyError(e))
        )
        if (input.kind === 'card') saveCardMemory(uid, input.card, input.invoiceDate)
      }
      onDone()
    } catch (e) {
      setError(friendlyError(e))
      setSaving(false)
    }
  }

  const isExpense = form.kind !== 'income'

  return (
    <form className="tx-form" onSubmit={submit} noValidate>
      <Pills
        label="Tipo de lançamento"
        options={KINDS}
        value={form.kind}
        onChange={(kind) => set({ kind })}
      />

      <Input
        label="Descrição"
        value={form.description}
        onChange={(e) => set({ description: e.target.value })}
        placeholder={form.kind === 'income' ? 'Ex.: Salário' : 'Ex.: Mercado, Netflix'}
        autoFocus
      />
      <div className="form-grid">
        <Input
          label="Valor (R$)"
          inputMode="decimal"
          placeholder="0,00"
          value={form.amount}
          onChange={(e) => set({ amount: e.target.value })}
        />
        <Input
          label={form.kind === 'card' ? 'Data da compra' : 'Data'}
          type="date"
          value={form.date}
          onChange={(e) => set({ date: e.target.value })}
        />
      </div>

      {form.kind === 'income' && (
        <Select
          label="Tipo de entrada"
          options={INCOME_TYPES}
          value={form.incomeType}
          onChange={(e) => set({ incomeType: e.target.value })}
        />
      )}

      {isExpense && (
        <Select
          label="Categoria"
          options={[
            { value: '', label: autoCategory ? `Automática (${autoCategory})` : 'Automática' },
            ...categories
          ]}
          value={form.category}
          onChange={(e) => set({ category: e.target.value })}
        />
      )}

      {form.kind === 'cash' && (
        <Select
          label="Forma de pagamento"
          options={PAYMENT_METHODS}
          value={form.paymentMethod}
          onChange={(e) => set({ paymentMethod: e.target.value })}
        />
      )}

      {form.kind === 'card' && (
        <>
          <div className="form-grid">
            <Select
              label="Cartão"
              options={cards.map((c) => c.name)}
              value={form.card}
              onChange={(e) => set({ card: e.target.value })}
            />
            <Input
              label="Vencimento da fatura"
              type="date"
              value={form.invoiceDate}
              hint={
                invoiceFor(cards, form.card, form.date)
                  ? 'Sugerida pelo fechamento do cartão.'
                  : undefined
              }
              onChange={(e) => set({ invoiceDate: e.target.value, invoiceTouched: true })}
            />
          </div>
          <div className="form-grid">
            <Input
              label="Parcelas"
              type="number"
              min={1}
              max={72}
              value={form.recurring ? '1' : form.installments}
              disabled={form.recurring}
              onChange={(e) => set({ installments: e.target.value })}
            />
            <Input
              label="Observações"
              value={form.notes}
              onChange={(e) => set({ notes: e.target.value })}
            />
          </div>
        </>
      )}

      {isExpense && !editing && (
        <div className="form-grid form-grid--center">
          <Toggle
            label="Repetir todo mês"
            checked={form.recurring}
            onChange={(recurring) => set({ recurring })}
          />
          {form.recurring && (
            <Input
              label="Por quantos meses"
              type="number"
              min={1}
              max={120}
              value={form.recurrenceCount}
              onChange={(e) => set({ recurrenceCount: e.target.value })}
            />
          )}
        </div>
      )}

      <details className="tx-form__icon">
        <summary>Ícone {form.icon ? '(escolhido)' : '(automático)'}</summary>
        <IconPicker value={form.icon} onChange={(icon) => set({ icon })} color={categoryColor} />
      </details>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="tx-form__actions">
        <Button onClick={onDone}>Cancelar</Button>
        <Button variant="primary" type="submit" disabled={saving}>
          {editing ? 'Salvar alterações' : 'Salvar'}
        </Button>
      </div>
    </form>
  )
}
