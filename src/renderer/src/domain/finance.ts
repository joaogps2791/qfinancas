// Regras de negócio portadas do legacy/script.js. Tudo em centavos (inteiros) e
// datas como string ISO YYYY-MM-DD, sem depender do fuso do computador.

export const INCOME_TYPES = [
  'Salário',
  'Freelance',
  'Investimentos',
  'Reembolso',
  'Saldo anterior',
  'Outros'
]
export const PAYMENT_METHODS = ['Pix', 'Débito', 'Dinheiro', 'Transferência', 'Boleto']

type Base = {
  id: string
  description: string
  amountCents: number
  date: string
  /** ícone escolhido à mão: "brand:netflix" ou "cat:food". Sem ele, o app adivinha. */
  icon?: string
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
    /**
     * Compra que entrou no meio (Open Finance: parcelas já pagas antes não são lançadas).
     * `amountCents` é o total da compra, `installments` o total de parcelas e `invoiceDate` a
     * fatura desta parcela. Sem o campo, começa na 1ª.
     */
    firstInstallment?: number
    notes?: string
    /**
     * Crédito na fatura (pagamento antecipado): abate da fatura `invoiceDate` em vez de somar.
     * `amountCents` continua positivo; sempre 1 parcela.
     */
    credit?: boolean
  }

/** Categoria dos créditos na fatura (não entra nos gastos por categoria). */
export const CARD_CREDIT_CATEGORY = 'Pagamento antecipado'

export type Transaction = IncomeTransaction | CashTransaction | CardTransaction
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never
export type TransactionInput = WithoutId<Transaction>

// ---------- Dinheiro ----------

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export const formatBRL = (cents: number): string => currency.format(cents / 100)

const percent = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero'
})

/** 0.123 → "+12,3%" */
export const formatPercent = (ratio: number): string => percent.format(ratio)

/** Variação de um mês para o outro; sem base de comparação (mês anterior zerado) devolve null. */
export const percentChange = (currentCents: number, previousCents: number): number | null =>
  previousCents === 0 ? null : (currentCents - previousCents) / Math.abs(previousCents)

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

export const formatMonth = (key: string): string => {
  // "novembro de 2026" → "Novembro de 2026" (só a primeira letra)
  const text = monthFormatter.format(new Date(`${key}-01T12:00:00Z`))
  return text.charAt(0).toUpperCase() + text.slice(1)
}

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

/**
 * Uma compra parcelada vira uma parcela em cada fatura, a partir da fatura escolhida. Com
 * `firstInstallment` (ex.: 4), a fatura escolhida é a da 4ª parcela e as anteriores não aparecem.
 */
export function expandInstallments(transaction: CardTransaction): Installment[] {
  const first = transaction.invoiceDate || transaction.date
  const start = Math.min(Math.max(transaction.firstInstallment ?? 1, 1), transaction.installments)
  return splitCents(transaction.amountCents, transaction.installments)
    .slice(start - 1)
    .map((cents, index) => {
      const statementDate = addMonths(first, index)
      return {
        transaction,
        statementDate,
        statementMonth: monthKey(statementDate),
        installmentNumber: start + index,
        // crédito entra negativo: abate da fatura em todo lugar que soma as parcelas
        installmentCents: transaction.credit ? -cents : cents
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
  /**
   * Pagamento antecipado no mês em que foi pago: o dinheiro sai da conta aqui (valor positivo),
   * enquanto o crédito (negativo) abate a fatura no mês dela. Não faz parte de nenhuma fatura.
   */
  prepayment?: boolean
}

/**
 * Tudo que pesa no mês: entradas e à vista pela data, cartão pela fatura. Pagamento antecipado
 * aparece duas vezes: como saída na data do pagamento e como crédito na fatura que abate.
 */
export function monthEntries(transactions: Transaction[], key: string): MonthEntry[] {
  const entries: MonthEntry[] = []
  for (const transaction of transactions) {
    if (transaction.kind === 'card') {
      if (transaction.credit && monthKey(transaction.date) === key) {
        entries.push({
          transaction,
          date: transaction.date,
          amountCents: transaction.amountCents,
          prepayment: true
        })
      }
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
  /** tudo que caiu nas faturas do mês, pagas ou não */
  cardCents: number
  /** parte de `cardCents` em faturas ainda não pagas (fica fora das saídas) */
  pendingCardCents: number
  /** pagamentos antecipados feitos no mês (contam nas saídas) */
  prepaidCents: number
  expenseCents: number
  balanceCents: number
}

/**
 * Fatura paga: marcada no cartão, ou de mês anterior ao atual (o histórico de antes deste
 * controle continua contando como pago).
 */
export const invoicePaidBy =
  (cards: { name: string; paidInvoices?: string[] }[], today: string) =>
  (card: string, month: string): boolean =>
    month < monthKey(today) || !!cards.find((c) => c.name === card)?.paidInvoices?.includes(month)

/** Sem `paid`, toda fatura conta como paga (relatórios de gasto). */
export function summarizeEntries(
  entries: MonthEntry[],
  paid?: (card: string) => boolean
): MonthSummary {
  const total = (kind: Transaction['kind']): number =>
    entries.filter((e) => e.transaction.kind === kind).reduce((sum, e) => sum + e.amountCents, 0)
  const incomeCents = total('income')
  const cashCents = total('cash')
  const invoiceEntries = entries.filter((e) => e.transaction.kind === 'card' && !e.prepayment)
  // Só as compras das faturas do mês (o crédito, negativo, só diminui o que falta pagar).
  const cardCents = invoiceEntries
    .filter((e) => e.amountCents > 0)
    .reduce((sum, e) => sum + e.amountCents, 0)
  // Pagamentos antecipados feitos neste mês: saem da conta agora, seja qual for a fatura.
  const prepaidCents = entries
    .filter((e) => e.prepayment)
    .reduce((sum, e) => sum + e.amountCents, 0)
  // Fatura de cada cartão: compras menos créditos.
  const netByCard = new Map<string, number>()
  for (const e of invoiceEntries) {
    if (e.transaction.kind !== 'card') continue
    netByCard.set(e.transaction.card, (netByCard.get(e.transaction.card) ?? 0) + e.amountCents)
  }
  let pendingCardCents = 0
  let invoicesCents = 0
  for (const [card, net] of netByCard) {
    // Paga: sai o que faltava. Em aberto: nada sai ainda (fica como "a pagar").
    if (!paid || paid(card)) invoicesCents += net
    else pendingCardCents += Math.max(net, 0)
  }
  const expenseCents = cashCents + invoicesCents + prepaidCents
  return {
    incomeCents,
    cashCents,
    cardCents,
    pendingCardCents,
    prepaidCents,
    expenseCents,
    balanceCents: incomeCents - expenseCents
  }
}

export function totalsByCategory(entries: MonthEntry[]): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const { transaction, amountCents } of entries) {
    if (transaction.kind === 'income' || (transaction.kind === 'card' && transaction.credit)) {
      continue
    }
    totals[transaction.category] = (totals[transaction.category] ?? 0) + amountCents
  }
  return totals
}

// ---------- Faturas de cartão ----------

const lastDayOf = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate()

/**
 * Vencimento da fatura em que cai uma compra. A fatura fecha no dia `closingDay`; compra no dia
 * do fechamento ou depois vai para a fatura seguinte. Se o vencimento é num dia menor ou igual
 * ao fechamento, ele cai no mês seguinte ao fechamento.
 */
export function suggestInvoiceDate(
  purchaseDate: string,
  closingDay: number,
  dueDay: number
): string {
  const [year, month, day] = purchaseDate.split('-').map(Number)
  const closingMonthOffset = day >= Math.min(closingDay, lastDayOf(year, month)) ? 1 : 0
  const dueMonthOffset = closingMonthOffset + (dueDay <= closingDay ? 1 : 0)
  const due = addMonths(`${year}-${pad(month)}-01`, dueMonthOffset)
  const [dueYear, dueMonth] = due.split('-').map(Number)
  return `${due.slice(0, 7)}-${pad(Math.min(dueDay, lastDayOf(dueYear, dueMonth)))}`
}

export type UpcomingInvoice = { card: string; dueDate: string; totalCents: number; count: number }

type InvoiceCard = { name: string; dueDay?: number; paidInvoices?: string[] }

/** Próxima fatura em aberto de cada cartão (ver `openInvoices`). */
export function upcomingInvoices(
  transactions: Transaction[],
  cards: InvoiceCard[],
  today: string
): UpcomingInvoice[] {
  const next = new Map<string, UpcomingInvoice>()
  for (const invoice of openInvoices(transactions, cards, today)) {
    const current = next.get(invoice.card)
    if (!current || invoice.dueDate < current.dueDate) next.set(invoice.card, invoice)
  }
  return [...next.values()].sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

const ANNUITY = /anuidade/i

/**
 * Limite usado do cartão, como no banco: tudo que ainda não foi pago, ou seja, as faturas em
 * aberto (a deste mês e as futuras, com as parcelas que faltam), já descontados os créditos.
 * Não ocupam limite: a anuidade (tarifa do banco) e as cobranças recorrentes que ainda não
 * aconteceram (assinatura de janeiro só pesa quando for cobrada).
 */
export const limitUsedCents = (
  transactions: Transaction[],
  cards: InvoiceCard[],
  card: string,
  today: string
): number =>
  openInvoices(
    transactions.filter(
      (t) =>
        t.kind === 'card' &&
        t.card === card &&
        !ANNUITY.test(`${t.description} ${t.category}`) &&
        !(t.recurringGroup && t.date > today)
    ),
    cards,
    today
  ).reduce((sum, invoice) => sum + invoice.totalCents, 0)

/**
 * Faturas em aberto (com saldo a pagar e não pagas) de cada cartão usado nos lançamentos: a deste
 * mês, mesmo vencida, e as futuras. O vencimento é o dia cadastrado no cartão; sem ele, o da
 * fatura escolhida em cada compra.
 */
export function openInvoices(
  transactions: Transaction[],
  cards: InvoiceCard[],
  today: string
): UpcomingInvoice[] {
  const byName = new Map(cards.map((c) => [c.name, c]))
  const thisMonth = monthKey(today)
  const invoices = new Map<string, UpcomingInvoice>()
  for (const transaction of transactions) {
    if (transaction.kind !== 'card') continue
    const card = byName.get(transaction.card)
    for (const item of expandInstallments(transaction)) {
      const [year, month] = item.statementMonth.split('-').map(Number)
      // shortcut: sem dia no cartão, compras do mesmo mês com vencimentos diferentes podem se dividir
      const dueDate = card?.dueDay
        ? `${item.statementMonth}-${pad(Math.min(card.dueDay, lastDayOf(year, month)))}`
        : item.statementDate
      if (card?.paidInvoices?.includes(item.statementMonth)) continue
      // de meses anteriores conta como paga (ver invoicePaidBy)
      if (item.statementMonth < thisMonth) continue
      const key = `${transaction.card}|${item.statementMonth}`
      const invoice = invoices.get(key)
      if (!invoice) {
        invoices.set(key, {
          card: transaction.card,
          dueDate,
          totalCents: item.installmentCents,
          count: 1
        })
        continue
      }
      invoice.totalCents += item.installmentCents
      invoice.count++
      if (dueDate < invoice.dueDate) invoice.dueDate = dueDate
    }
  }
  // quitada com pagamento antecipado: não tem o que pagar
  return [...invoices.values()]
    .filter((invoice) => invoice.totalCents > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

// ---------- Série mensal (gráfico de fluxo de caixa) ----------

export type MonthPoint = MonthSummary & { month: string }

/** Os `count` meses que terminam em `lastMonth`, do mais antigo ao mais novo. */
export function monthlySeries(
  transactions: Transaction[],
  lastMonth: string,
  count: number,
  paid?: (card: string, month: string) => boolean
): MonthPoint[] {
  return Array.from({ length: count }, (_, i) => {
    const month = shiftMonthKey(lastMonth, i - count + 1)
    const paidIn = paid && ((card: string): boolean => paid(card, month))
    return { month, ...summarizeEntries(monthEntries(transactions, month), paidIn) }
  })
}

// ---------- Formatos para a tela ----------

/** 123456 → "1234,56" (o formato que o campo de valor aceita de volta). */
export const centsToInput = (cents: number): string =>
  `${Math.trunc(cents / 100)},${String(Math.abs(cents) % 100).padStart(2, '0')}`

const MONTHS_SHORT = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez'
]

/** "2026-11-18" → "18 nov" */
export const formatDayMonth = (isoDate: string): string =>
  `${isoDate.slice(8, 10)} ${MONTHS_SHORT[Number(isoDate.slice(5, 7)) - 1]}`

/** "2026-11" → "nov" */
export const formatMonthShort = (key: string): string => MONTHS_SHORT[Number(key.slice(5, 7)) - 1]

/** Dias de hoje até a data (negativo se já passou). */
export const daysUntil = (isoDate: string, today: string): number =>
  Math.round((Date.parse(`${isoDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000)
