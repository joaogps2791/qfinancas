// Regras de negócio portadas do legacy/script.js. Tudo em centavos (inteiros) e
// datas como string ISO YYYY-MM-DD, sem depender do fuso do computador.

export const INCOME_TYPES = ['Salário', 'Freelance', 'Investimentos', 'Reembolso', 'Outros']
export const PAYMENT_METHODS = ['Pix', 'Débito', 'Dinheiro', 'Transferência', 'Boleto']

type Base = {
  id: string
  description: string
  amountCents: number
  date: string
}

type Recurrence = {
  recurringGroup?: string
  occurrenceNumber?: number
  occurrenceTotal?: number
}

export type IncomeTransaction = Base & { kind: 'income'; incomeType: string }
export type CashTransaction = Base &
  Recurrence & { kind: 'cash'; category: string; paymentMethod: string }
export type CardTransaction = Base &
  Recurrence & {
    kind: 'card'
    category: string
    card: string
    invoiceDate: string
    installments: number
    notes?: string
  }

export type Transaction = IncomeTransaction | CashTransaction | CardTransaction
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never
export type TransactionInput = WithoutId<Transaction>

// ---------- Dinheiro ----------

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export const formatBRL = (cents: number): string => currency.format(cents / 100)

/** "1.234,56" → 123456. Ponto é separador de milhar, vírgula é decimal. */
export function parseAmountToCents(text: string): number | null {
  const clean = text.replace(/R\$|\s/g, '').replace(/\./g, '')
  const match = /^(\d+)(?:,(\d{1,2}))?$/.exec(clean)
  if (!match) return null
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
}

/** Divide um total em partes inteiras; os centavos que sobram vão para as primeiras. */
export function splitCents(totalCents: number, parts: number): number[] {
  const base = Math.floor(totalCents / parts)
  const remainder = totalCents - base * parts
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0))
}

// ---------- Datas ----------

const pad = (n: number): string => String(n).padStart(2, '0')

export const todayISO = (): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date())

export const monthKey = (isoDate: string): string => isoDate.slice(0, 7)

/** Soma meses mantendo o dia; se o mês não tiver esse dia, usa o último (31/01 + 1 = 28/02). */
export function addMonths(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const total = year * 12 + (month - 1) + months
  const newYear = Math.floor(total / 12)
  const newMonth = (((total % 12) + 12) % 12) + 1
  const lastDay = new Date(Date.UTC(newYear, newMonth, 0)).getUTCDate()
  return `${newYear}-${pad(newMonth)}-${pad(Math.min(day, lastDay))}`
}

export const shiftMonthKey = (key: string, months: number): string =>
  addMonths(`${key}-01`, months).slice(0, 7)

const monthFormatter = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC'
})

export const formatMonth = (key: string): string =>
  monthFormatter.format(new Date(`${key}-01T12:00:00Z`))

export const formatDateShort = (isoDate: string): string => {
  const [, month, day] = isoDate.split('-')
  return `${day}/${month}`
}

// ---------- Parcelas de cartão ----------

export type Installment = {
  transaction: CardTransaction
  statementDate: string
  statementMonth: string
  installmentNumber: number
  installmentCents: number
}

/** Uma compra parcelada vira uma parcela em cada fatura, a partir da fatura escolhida. */
export function expandInstallments(transaction: CardTransaction): Installment[] {
  const first = transaction.invoiceDate || transaction.date
  return splitCents(transaction.amountCents, transaction.installments).map((cents, index) => {
    const statementDate = addMonths(first, index)
    return {
      transaction,
      statementDate,
      statementMonth: monthKey(statementDate),
      installmentNumber: index + 1,
      installmentCents: cents
    }
  })
}

// ---------- Recorrência ----------

/**
 * Repete um lançamento à vista ou de cartão por `count` meses (um documento por mês).
 * Lançamento de cartão recorrente é sempre à vista na fatura (1 parcela), como no site.
 */
export function buildRecurringSeries(
  input: TransactionInput,
  count: number,
  groupId: string
): TransactionInput[] {
  if (input.kind === 'income' || count <= 1) return [input]
  return Array.from({ length: count }, (_, index) => {
    const recurrence = {
      date: addMonths(input.date, index),
      recurringGroup: groupId,
      occurrenceNumber: index + 1,
      occurrenceTotal: count
    }
    return input.kind === 'card'
      ? {
          ...input,
          ...recurrence,
          installments: 1,
          invoiceDate: addMonths(input.invoiceDate, index)
        }
      : { ...input, ...recurrence }
  })
}

// ---------- Totais do mês ----------

export type MonthEntry = {
  transaction: Transaction
  date: string
  amountCents: number
  installmentNumber?: number
}

/** Tudo que pesa no mês: entradas e à vista pela data, cartão pela fatura. */
export function monthEntries(transactions: Transaction[], key: string): MonthEntry[] {
  const entries: MonthEntry[] = []
  for (const transaction of transactions) {
    if (transaction.kind === 'card') {
      for (const item of expandInstallments(transaction)) {
        if (item.statementMonth === key) {
          entries.push({
            transaction,
            date: transaction.date,
            amountCents: item.installmentCents,
            installmentNumber: item.installmentNumber
          })
        }
      }
    } else if (monthKey(transaction.date) === key) {
      entries.push({ transaction, date: transaction.date, amountCents: transaction.amountCents })
    }
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date))
}

export type MonthSummary = {
  incomeCents: number
  cashCents: number
  cardCents: number
  expenseCents: number
  balanceCents: number
}

export function summarizeEntries(entries: MonthEntry[]): MonthSummary {
  const total = (kind: Transaction['kind']): number =>
    entries.filter((e) => e.transaction.kind === kind).reduce((sum, e) => sum + e.amountCents, 0)
  const incomeCents = total('income')
  const cashCents = total('cash')
  const cardCents = total('card')
  const expenseCents = cashCents + cardCents
  return {
    incomeCents,
    cashCents,
    cardCents,
    expenseCents,
    balanceCents: incomeCents - expenseCents
  }
}

export function totalsByCategory(entries: MonthEntry[]): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const { transaction, amountCents } of entries) {
    if (transaction.kind === 'income') continue
    totals[transaction.category] = (totals[transaction.category] ?? 0) + amountCents
  }
  return totals
}
