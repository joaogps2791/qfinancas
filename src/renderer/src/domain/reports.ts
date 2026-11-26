// Relatórios por período (mês ou ano). Funções puras, valores em centavos.
import {
  formatMonth,
  monthEntries,
  shiftMonthKey,
  summarizeEntries,
  type MonthEntry,
  type MonthPoint,
  type MonthSummary,
  type Transaction
} from './finance'
import { computePositions, type FixedIncome, type InvestmentTransaction } from './investments'

export type Period = { kind: 'month'; month: string } | { kind: 'year'; year: number }

/** Meses do período, do mais antigo ao mais novo (YYYY-MM). */
export function periodMonths(period: Period): string[] {
  if (period.kind === 'month') return [period.month]
  return Array.from({ length: 12 }, (_, i) => `${period.year}-${String(i + 1).padStart(2, '0')}`)
}

export function periodLabel(period: Period): string {
  return period.kind === 'month' ? formatMonth(period.month) : String(period.year)
}

/** Mesmo período um passo antes (mês anterior ou ano anterior), para o comparativo. */
export function previousPeriod(period: Period): Period {
  return period.kind === 'month'
    ? { kind: 'month', month: shiftMonthKey(period.month, -1) }
    : { kind: 'year', year: period.year - 1 }
}

export type Slice = { name: string; cents: number }

export type Report = {
  months: MonthPoint[]
  totals: MonthSummary
  entries: MonthEntry[]
  byCategory: Slice[]
  byCard: Slice[]
  byIncomeType: Slice[]
}

function slices(entries: MonthEntry[], key: (e: MonthEntry) => string | null): Slice[] {
  const totals = new Map<string, number>()
  for (const e of entries) {
    const name = key(e)
    if (name !== null) totals.set(name, (totals.get(name) ?? 0) + e.amountCents)
  }
  return [...totals]
    .map(([name, cents]) => ({ name, cents }))
    .sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name))
}

/** Tudo do período: cartão conta pela fatura, como no resto do app. */
export function buildReport(transactions: Transaction[], months: string[]): Report {
  const perMonth = months.map((month) => ({ month, entries: monthEntries(transactions, month) }))
  const entries = perMonth.flatMap((m) => m.entries)
  return {
    months: perMonth.map((m) => ({ month: m.month, ...summarizeEntries(m.entries) })),
    totals: summarizeEntries(entries),
    entries,
    // pagamento antecipado não é gasto de categoria; no cartão vale só a fatura (sem a saída)
    byCategory: slices(entries, (e) =>
      e.transaction.kind === 'income' || (e.transaction.kind === 'card' && e.transaction.credit)
        ? null
        : e.transaction.category
    ),
    byCard: slices(entries, (e) =>
      e.transaction.kind === 'card' && !e.prepayment ? e.transaction.card : null
    ),
    byIncomeType: slices(entries, (e) =>
      e.transaction.kind === 'income' ? e.transaction.incomeType : null
    )
  }
}

/**
 * Patrimônio investido no fim de cada mês, pelo custo: ações/FIIs/ETFs que ainda estavam na
 * carteira + renda fixa aplicada até ali.
 * shortcut: pelo custo, sem cotação histórica; renda fixa vencida continua contando até ter resgate.
 */
export function investedSeries(
  investmentTransactions: InvestmentTransaction[],
  fixedIncome: FixedIncome[],
  months: string[]
): { month: string; cents: number }[] {
  return months.map((month) => {
    const end = `${shiftMonthKey(month, 1)}-01`
    const variable = computePositions(investmentTransactions.filter((t) => t.date < end))
      .filter((p) => p.quantity > 0)
      .reduce((s, p) => s + p.totalCostCents, 0)
    const fixed = fixedIncome
      .filter((f) => f.startDate < end)
      .reduce((s, f) => s + f.investedCents, 0)
    return { month, cents: variable + fixed }
  })
}

// ---------- Linhas para exportar ----------

const KIND_LABEL = { income: 'Entrada', cash: 'À vista', card: 'Cartão' } as const

export type ExportRow = {
  date: string
  description: string
  kind: string
  category: string
  /** forma de pagamento (à vista) ou cartão */
  method: string
  invoice: string
  installment: string
  /** com sinal: entrada positiva, saída negativa */
  amountCents: number
}

/** Uma linha por lançamento do período (parcelas de cartão uma a uma, pela fatura). */
export function exportRows(entries: MonthEntry[]): ExportRow[] {
  return entries
    .map(({ transaction: t, amountCents, installmentNumber, date }) => ({
      date,
      description: t.description,
      kind: KIND_LABEL[t.kind],
      category: t.kind === 'income' ? t.incomeType : t.category,
      method: t.kind === 'cash' ? t.paymentMethod : t.kind === 'card' ? t.card : '',
      invoice: t.kind === 'card' ? t.invoiceDate : '',
      installment:
        t.kind === 'card' && t.installments > 1 ? `${installmentNumber}/${t.installments}` : '',
      amountCents: t.kind === 'income' ? amountCents : -amountCents
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description))
}
