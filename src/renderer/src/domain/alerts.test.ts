import { describe, expect, it } from 'vitest'
import {
  alertsToSend,
  billDueDate,
  billRunsIn,
  DEFAULT_NOTIFICATIONS,
  dueItems,
  type Bill
} from './alerts'
import type { Transaction } from './finance'

const transactions: Transaction[] = [
  {
    id: 't1',
    kind: 'card',
    description: 'Mercado',
    amountCents: 20000,
    date: '2026-11-01',
    category: 'Alimentação',
    card: 'Nubank',
    invoiceDate: '2026-11-22',
    installments: 1
  }
]
const cards = [{ name: 'Nubank', color: '#820ad1', closingDay: 15, dueDay: 22 }]
const bill = (patch: Partial<Bill> = {}): Bill => ({
  id: 'luz',
  name: 'Conta de luz',
  amountCents: 18000,
  dueDay: 20,
  category: 'Moradia',
  paymentMethod: 'Boleto',
  active: true,
  ...patch
})

describe('billDueDate', () => {
  it('usa o último dia em mês mais curto', () => {
    expect(billDueDate({ dueDay: 31 }, '2026-02')).toBe('2026-02-28')
    expect(billDueDate({ dueDay: 31 }, '2028-02')).toBe('2028-02-29')
    expect(billDueDate({ dueDay: 5 }, '2026-11')).toBe('2026-11-05')
  })
})

describe('dueItems', () => {
  it('junta a próxima fatura e a conta fixa não paga, em ordem de vencimento', () => {
    const items = dueItems(transactions, cards, [bill()], '2026-11-19')
    expect(items.map((i) => [i.title, i.dueDate, i.days, i.amountCents])).toEqual([
      ['Conta de luz', '2026-11-20', 1, 18000],
      ['Fatura Nubank', '2026-11-22', 3, 20000]
    ])
    expect(items[1].target).toEqual({ to: '/cartoes', card: 'Nubank', month: '2026-11' })
  })

  it('conta paga neste mês passa para a do próximo; atrasada continua aparecendo', () => {
    const paid = dueItems([], [], [bill({ paid: { '2026-11': 'tx9' } })], '2026-11-19')
    expect(paid[0]).toMatchObject({ dueDate: '2026-12-20', month: '2026-12', days: 31 })

    const late = dueItems([], [], [bill({ dueDay: 10 })], '2026-11-19')
    expect(late[0]).toMatchObject({ dueDate: '2026-11-10', days: -9 })
  })

  it('ignora conta desativada', () => {
    expect(dueItems([], [], [bill({ active: false })], '2026-11-19')).toEqual([])
  })
})

describe('alertsToSend', () => {
  const items = dueItems(transactions, cards, [bill()], '2026-11-19')

  it('avisa o que está a até X dias, com o texto certo', () => {
    const alerts = alertsToSend(items, DEFAULT_NOTIFICATIONS, new Set())
    expect(alerts.map((a) => [a.key, a.title])).toEqual([
      ['bill:luz:2026-11:before', 'Conta de luz vence amanhã (20 nov)'],
      ['card:Nubank:2026-11-22:before', 'Fatura Nubank vence em 3 dias (22 nov)']
    ])
    expect(alerts[0].body).toContain('R$')
  })

  it('não repete o que já foi avisado; no dia, avisa de novo', () => {
    const sent = new Set(['bill:luz:2026-11:before', 'card:Nubank:2026-11-22:before'])
    expect(alertsToSend(items, DEFAULT_NOTIFICATIONS, sent)).toEqual([])
    const dayOf = dueItems(transactions, cards, [bill()], '2026-11-20')
    expect(alertsToSend(dayOf, DEFAULT_NOTIFICATIONS, sent).map((a) => a.key)).toEqual([
      'bill:luz:2026-11:day'
    ])
  })

  it('respeita as chaves: geral, só cartões, só contas e os dias de antecedência', () => {
    expect(alertsToSend(items, { ...DEFAULT_NOTIFICATIONS, enabled: false }, new Set())).toEqual([])
    expect(
      alertsToSend(items, { ...DEFAULT_NOTIFICATIONS, cards: false }, new Set()).map((a) => a.key)
    ).toEqual(['bill:luz:2026-11:before'])
    expect(
      alertsToSend(items, { ...DEFAULT_NOTIFICATIONS, bills: false }, new Set()).map((a) => a.key)
    ).toEqual(['card:Nubank:2026-11-22:before'])
    expect(
      alertsToSend(items, { ...DEFAULT_NOTIFICATIONS, daysBefore: 1 }, new Set()).map((a) => a.key)
    ).toEqual(['bill:luz:2026-11:before'])
  })

  it('conta atrasada não gera aviso', () => {
    const late = dueItems([], [], [bill({ dueDay: 10 })], '2026-11-19')
    expect(alertsToSend(late, DEFAULT_NOTIFICATIONS, new Set())).toEqual([])
  })
})

describe('conta com data para acabar (empréstimo, financiamento)', () => {
  it('vence até o mês da última parcela, inclusive', () => {
    const loan = bill({ endMonth: '2026-12' })
    expect(billRunsIn(loan, '2026-12')).toBe(true)
    expect(billRunsIn(loan, '2027-01')).toBe(false)
    expect(billRunsIn({ ...loan, active: false }, '2026-11')).toBe(false)
    expect(billRunsIn(bill({ endMonth: null }), '2099-01')).toBe(true)
  })

  it('depois de paga a última parcela, some dos vencimentos', () => {
    const last = bill({ endMonth: '2026-11', paid: { '2026-11': 'tx1' } })
    expect(dueItems([], [], [last], '2026-11-19')).toEqual([])
    // ainda não paga no último mês: aparece normalmente
    expect(dueItems([], [], [bill({ endMonth: '2026-11' })], '2026-11-19')).toHaveLength(1)
  })

  it('terminada antes deste mês não vence mais', () => {
    expect(dueItems([], [], [bill({ endMonth: '2026-10' })], '2026-11-19')).toEqual([])
  })
})
