// Vencimentos (faturas de cartão e contas fixas) e quais avisos mandar. Funções puras.
import type { Card } from './categories'
import {
  daysUntil,
  formatBRL,
  formatDayMonth,
  monthKey,
  openInvoices,
  shiftMonthKey,
  upcomingInvoices,
  type Transaction
} from './finance'

/** Conta fixa (aluguel, luz, internet...). Fica em users/{uid}/bills/{id}. */
export type Bill = {
  id: string
  name: string
  amountCents: number
  /** 1 a 31; em mês mais curto vale o último dia */
  dueDay: number
  category: string
  paymentMethod: string
  active: boolean
  /** mês (YYYY-MM) → id do lançamento criado ao marcar como paga */
  paid?: Record<string, string>
  /** empréstimo, financiamento: mês (YYYY-MM) da última parcela; sem ele, não acaba */
  endMonth?: string | null
}

/** A conta vence neste mês? Pausada ou depois do último mês, não. */
export const billRunsIn = (bill: Pick<Bill, 'active' | 'endMonth'>, month: string): boolean =>
  bill.active && (!bill.endMonth || month <= bill.endMonth)

/** Fica em settings/main.notifications. */
export type NotificationSettings = {
  enabled: boolean
  cards: boolean
  bills: boolean
  /** quantos dias antes avisar (além do aviso no dia) */
  daysBefore: number
}

export const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  enabled: true,
  cards: true,
  bills: true,
  daysBefore: 3
}

const lastDayOf = (month: string): number => {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export const billDueDate = (bill: Pick<Bill, 'dueDay'>, month: string): string =>
  `${month}-${String(Math.min(bill.dueDay, lastDayOf(month))).padStart(2, '0')}`

/** Para onde o clique no aviso leva. */
export type AlertTarget =
  { to: '/cartoes'; card: string; month: string } | { to: '/contas'; bill: string }

export type DueItem = {
  /** identifica o vencimento (não muda entre aberturas do app) */
  key: string
  kind: 'card' | 'bill'
  title: string
  dueDate: string
  amountCents: number
  /** dias até vencer; negativo = atrasada (só contas fixas) */
  days: number
  /** mês da conta (contas fixas) ou da fatura */
  month: string
  billId?: string
  target: AlertTarget
}

/**
 * Próximos vencimentos: a próxima fatura em aberto de cada cartão e, de cada conta fixa ativa, a
 * primeira ocorrência ainda não paga (deste mês, mesmo atrasada, ou do próximo).
 * Com `month` de outro mês (o escolhido no Dashboard): as faturas e contas que vencem nele, mais
 * o que ficou atrasado.
 */
export function dueItems(
  transactions: Transaction[],
  cards: Card[],
  bills: Bill[],
  today: string,
  month = monthKey(today)
): DueItem[] {
  const thisMonth = monthKey(today)
  const other = month !== thisMonth
  const invoices = other
    ? openInvoices(transactions, cards, today).filter(
        (inv) => monthKey(inv.dueDate) === month || inv.dueDate < today
      )
    : upcomingInvoices(transactions, cards, today)
  const items: DueItem[] = invoices.map((inv) => ({
    key: `card:${inv.card}:${inv.dueDate}`,
    kind: 'card',
    title: `Fatura ${inv.card}`,
    dueDate: inv.dueDate,
    amountCents: inv.totalCents,
    days: daysUntil(inv.dueDate, today),
    month: monthKey(inv.dueDate),
    target: { to: '/cartoes', card: inv.card, month: monthKey(inv.dueDate) }
  }))
  for (const bill of bills) {
    const open = (m: string): boolean => billRunsIn(bill, m) && !bill.paid?.[m]
    const months = other
      ? [thisMonth, month].filter((m) => open(m) && (m === month || billDueDate(bill, m) < today))
      : [[thisMonth, shiftMonthKey(thisMonth, 1)].find(open)].filter((m) => m !== undefined)
    for (const m of months) {
      const dueDate = billDueDate(bill, m)
      items.push({
        key: `bill:${bill.id}:${m}`,
        kind: 'bill',
        title: bill.name,
        dueDate,
        amountCents: bill.amountCents,
        days: daysUntil(dueDate, today),
        month: m,
        billId: bill.id,
        target: { to: '/contas', bill: bill.id }
      })
    }
  }
  return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title))
}

export type Alert = { key: string; title: string; body: string; target: AlertTarget }

/**
 * Avisos a mandar agora: um quando entra na janela de `daysBefore` dias e outro no dia.
 * `sent` guarda as chaves já avisadas neste PC, para não repetir.
 */
export function alertsToSend(
  items: DueItem[],
  settings: NotificationSettings,
  sent: Set<string>
): Alert[] {
  if (!settings.enabled) return []
  const alerts: Alert[] = []
  for (const item of items) {
    if (item.kind === 'card' ? !settings.cards : !settings.bills) continue
    if (item.days < 0 || item.days > settings.daysBefore) continue
    const key = `${item.key}:${item.days === 0 ? 'day' : 'before'}`
    if (sent.has(key)) continue
    const when =
      item.days === 0
        ? 'vence hoje'
        : item.days === 1
          ? `vence amanhã (${formatDayMonth(item.dueDate)})`
          : `vence em ${item.days} dias (${formatDayMonth(item.dueDate)})`
    alerts.push({
      key,
      title: `${item.title} ${when}`,
      body: `${formatBRL(item.amountCents)}. Clique para abrir no QFinanças.`,
      target: item.target
    })
  }
  return alerts
}
