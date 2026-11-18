import { useMemo, useState } from 'react'
import { addTransactions, deleteTransaction, friendlyError, signOut, useApp } from '../data/store'
import { classifyCategory } from '../domain/categories'
import {
  buildRecurringSeries,
  formatBRL,
  formatDateShort,
  formatMonth,
  INCOME_TYPES,
  monthEntries,
  monthKey,
  parseAmountToCents,
  PAYMENT_METHODS,
  shiftMonthKey,
  summarizeEntries,
  todayISO,
  type MonthEntry,
  type Transaction,
  type TransactionInput
} from '../domain/finance'

// shortcut: tela provisória da Fase 1 (lançar e listar); o visual de verdade vem na Fase 3.

export default function Home(): React.JSX.Element {
  const { user, settings, transactions, error } = useApp()
  const [month, setMonth] = useState(() => monthKey(todayISO()))

  const entries = useMemo(() => monthEntries(transactions, month), [transactions, month])
  const summary = summarizeEntries(entries)

  return (
    <main className="page">
      <header className="row between">
        <div>
          <h1>Olá, {user?.displayName || user?.email}</h1>
          <p className="muted">Fase 1: base do app. O visual novo vem nas próximas fases.</p>
        </div>
        <button onClick={signOut}>Sair</button>
      </header>

      {error && <p className="error">{error}</p>}

      <div className="row month">
        <button onClick={() => setMonth(shiftMonthKey(month, -1))} aria-label="Mês anterior">
          ‹
        </button>
        <strong>{formatMonth(month)}</strong>
        <button onClick={() => setMonth(shiftMonthKey(month, 1))} aria-label="Próximo mês">
          ›
        </button>
      </div>

      <section className="stats">
        <Stat label="Entradas" cents={summary.incomeCents} />
        <Stat label="À vista" cents={summary.cashCents} />
        <Stat label="Cartões" cents={summary.cardCents} />
        <Stat label="Saldo do mês" cents={summary.balanceCents} />
      </section>

      <div className="columns">
        {settings ? (
          <TransactionForm
            categories={settings.categories.map((c) => c.name)}
            cards={settings.cards.map((c) => c.name)}
          />
        ) : (
          <div className="card muted">Preparando suas categorias…</div>
        )}
        <EntryList entries={entries} />
      </div>
    </main>
  )
}

function Stat({ label, cents }: { label: string; cents: number }): React.JSX.Element {
  return (
    <div className="card">
      <span className="muted">{label}</span>
      <strong className={cents < 0 ? 'negative' : undefined}>{formatBRL(cents)}</strong>
    </div>
  )
}

const kindLabel = { income: 'Entrada', cash: 'À vista', card: 'Cartão' }

function entryDetail(entry: MonthEntry): string {
  const t: Transaction = entry.transaction
  const occurrence =
    'occurrenceTotal' in t && t.occurrenceTotal
      ? ` · ${t.occurrenceNumber}/${t.occurrenceTotal}`
      : ''
  if (t.kind === 'income') return t.incomeType
  if (t.kind === 'cash') return `${t.category} · ${t.paymentMethod}${occurrence}`
  return `${t.category} · ${t.card} · ${entry.installmentNumber}/${t.installments}${occurrence}`
}

function EntryList({ entries }: { entries: MonthEntry[] }): React.JSX.Element {
  const remove = (t: Transaction): void => {
    const series = 'occurrenceTotal' in t && t.occurrenceTotal ? ' (só este mês da série)' : ''
    if (confirm(`Excluir "${t.description}"${series}?`)) {
      deleteTransaction(t.id).catch((e) => alert(friendlyError(e)))
    }
  }

  return (
    <section className="card">
      <h2>Lançamentos do mês</h2>
      {entries.length === 0 ? (
        <p className="muted">Nenhum lançamento neste mês.</p>
      ) : (
        <ul className="entries">
          {entries.map((entry) => {
            const t = entry.transaction
            return (
              <li key={`${t.id}-${entry.installmentNumber ?? 0}`}>
                <span className="muted">{formatDateShort(entry.date)}</span>
                <div>
                  <strong>{t.description}</strong>
                  <small className="muted">
                    {kindLabel[t.kind]} · {entryDetail(entry)}
                  </small>
                </div>
                <span className={t.kind === 'income' ? 'positive' : 'negative'}>
                  {t.kind === 'income' ? '+' : '−'} {formatBRL(entry.amountCents)}
                </span>
                <button className="link" onClick={() => remove(t)} aria-label="Excluir">
                  Excluir
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

type FormState = {
  kind: Transaction['kind']
  description: string
  amount: string
  date: string
  incomeType: string
  category: string
  paymentMethod: string
  card: string
  invoiceDate: string
  installments: string
  recurring: boolean
  recurrenceCount: string
  notes: string
}

function TransactionForm({
  categories,
  cards
}: {
  categories: string[]
  cards: string[]
}): React.JSX.Element {
  const blank = (): FormState => ({
    kind: 'cash',
    description: '',
    amount: '',
    date: todayISO(),
    incomeType: INCOME_TYPES[0],
    category: '',
    paymentMethod: PAYMENT_METHODS[0],
    card: cards[0] ?? '',
    invoiceDate: todayISO(),
    installments: '1',
    recurring: false,
    recurrenceCount: '12',
    notes: ''
  })
  const [form, setForm] = useState(blank)
  const [message, setMessage] = useState<string | null>(null)
  const set = (patch: Partial<FormState>): void => setForm((f) => ({ ...f, ...patch }))

  const submit = (event: React.FormEvent): void => {
    event.preventDefault()
    setMessage(null)
    const description = form.description.trim()
    const amountCents = parseAmountToCents(form.amount)
    if (!description) return setMessage('Escreva uma descrição.')
    if (!amountCents) return setMessage('Valor inválido. Use o formato 1.234,56.')

    const category = form.category || classifyCategory(description, categories)
    const base = { description, amountCents, date: form.date }
    let input: TransactionInput
    if (form.kind === 'income') {
      input = { ...base, kind: 'income', incomeType: form.incomeType }
    } else if (form.kind === 'cash') {
      input = { ...base, kind: 'cash', category, paymentMethod: form.paymentMethod }
    } else {
      const installments = Number(form.installments)
      if (!form.card) return setMessage('Cadastre um cartão primeiro.')
      if (!Number.isInteger(installments) || installments < 1 || installments > 72) {
        return setMessage('Parcelas: de 1 a 72.')
      }
      input = {
        ...base,
        kind: 'card',
        category,
        card: form.card,
        invoiceDate: form.invoiceDate,
        installments,
        notes: form.notes.trim() || undefined
      }
    }

    const count = form.recurring ? Number(form.recurrenceCount) : 1
    if (!Number.isInteger(count) || count < 1 || count > 120) {
      return setMessage('Repetições: de 1 a 120 meses.')
    }

    // O cache local mostra o lançamento na hora; o envio ao servidor segue em segundo plano.
    addTransactions(buildRecurringSeries(input, count, crypto.randomUUID())).catch((e) =>
      setMessage(friendlyError(e))
    )
    setForm({ ...blank(), kind: form.kind, card: form.card, invoiceDate: form.invoiceDate })
  }

  const isExpense = form.kind !== 'income'

  return (
    <form className="card form" onSubmit={submit}>
      <h2>Novo lançamento</h2>

      <div className="pills" role="radiogroup" aria-label="Tipo">
        {(['income', 'cash', 'card'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={form.kind === kind}
            className={form.kind === kind ? 'active' : undefined}
            onClick={() => set({ kind })}
          >
            {kindLabel[kind]}
          </button>
        ))}
      </div>

      <label>
        Descrição
        <input value={form.description} onChange={(e) => set({ description: e.target.value })} />
      </label>
      <div className="grid2">
        <label>
          Valor (R$)
          <input
            inputMode="decimal"
            placeholder="0,00"
            value={form.amount}
            onChange={(e) => set({ amount: e.target.value })}
          />
        </label>
        <label>
          {form.kind === 'card' ? 'Data da compra' : 'Data'}
          <input
            type="date"
            value={form.date}
            onChange={(e) => set({ date: e.target.value })}
            required
          />
        </label>
      </div>

      {form.kind === 'income' && (
        <label>
          Tipo de entrada
          <select value={form.incomeType} onChange={(e) => set({ incomeType: e.target.value })}>
            {INCOME_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      )}

      {isExpense && (
        <label>
          Categoria
          <select value={form.category} onChange={(e) => set({ category: e.target.value })}>
            <option value="">Automática (pela descrição)</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      )}

      {form.kind === 'cash' && (
        <label>
          Forma de pagamento
          <select
            value={form.paymentMethod}
            onChange={(e) => set({ paymentMethod: e.target.value })}
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
      )}

      {form.kind === 'card' && (
        <>
          <div className="grid2">
            <label>
              Cartão
              <select value={form.card} onChange={(e) => set({ card: e.target.value })}>
                {cards.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Primeira fatura
              <input
                type="date"
                value={form.invoiceDate}
                onChange={(e) => set({ invoiceDate: e.target.value })}
                required
              />
            </label>
          </div>
          <label>
            Parcelas
            <input
              type="number"
              min={1}
              max={72}
              value={form.recurring ? '1' : form.installments}
              disabled={form.recurring}
              onChange={(e) => set({ installments: e.target.value })}
            />
          </label>
          <label>
            Observações
            <input value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
          </label>
        </>
      )}

      {isExpense && (
        <div className="grid2">
          <label className="check">
            <input
              type="checkbox"
              checked={form.recurring}
              onChange={(e) => set({ recurring: e.target.checked })}
            />
            Repetir todo mês
          </label>
          {form.recurring && (
            <label>
              Por quantos meses
              <input
                type="number"
                min={1}
                max={120}
                value={form.recurrenceCount}
                onChange={(e) => set({ recurrenceCount: e.target.value })}
              />
            </label>
          )}
        </div>
      )}

      {message && <p className="error">{message}</p>}
      <button className="primary" type="submit">
        Salvar
      </button>
    </form>
  )
}
