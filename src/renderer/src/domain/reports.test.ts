import { describe, expect, it } from 'vitest'
import type { Transaction } from './finance'
import type { FixedIncome, InvestmentTransaction } from './investments'
import {
  buildReport,
  exportRows,
  investedSeries,
  periodLabel,
  periodMonths,
  previousPeriod
} from './reports'

const tx: Transaction[] = [
  {
    id: '1',
    kind: 'income',
    description: 'Salário',
    amountCents: 500000,
    date: '2026-10-05',
    incomeType: 'Salário'
  },
  {
    id: '2',
    kind: 'income',
    description: 'Freela',
    amountCents: 100000,
    date: '2026-11-08',
    incomeType: 'Freelance'
  },
  {
    id: '3',
    kind: 'cash',
    description: 'Mercado',
    amountCents: 30000,
    date: '2026-11-10',
    category: 'Alimentação',
    paymentMethod: 'Pix'
  },
  {
    id: '4',
    kind: 'card',
    description: 'TV',
    amountCents: 300000,
    date: '2026-10-20',
    category: 'Casa',
    card: 'Nubank',
    invoiceDate: '2026-11-10',
    installments: 3
  },
  {
    id: '5',
    kind: 'card',
    description: 'Restaurante',
    amountCents: 12000,
    date: '2026-11-02',
    category: 'Alimentação',
    card: 'Itaú',
    invoiceDate: '2026-11-15',
    installments: 1
  }
]

describe('períodos', () => {
  it('mês tem um mês; ano tem os 12, de janeiro a dezembro', () => {
    expect(periodMonths({ kind: 'month', month: '2026-11' })).toEqual(['2026-11'])
    const year = periodMonths({ kind: 'year', year: 2026 })
    expect(year).toHaveLength(12)
    expect([year[0], year[11]]).toEqual(['2026-01', '2026-12'])
    expect(periodLabel({ kind: 'month', month: '2026-11' })).toBe('Novembro de 2026')
    expect(previousPeriod({ kind: 'month', month: '2026-01' })).toEqual({
      kind: 'month',
      month: '2025-12'
    })
    expect(previousPeriod({ kind: 'year', year: 2026 })).toEqual({ kind: 'year', year: 2025 })
  })
})

describe('buildReport', () => {
  it('soma o mês com o cartão pela fatura (1 parcela da TV em novembro)', () => {
    const r = buildReport(tx, ['2026-11'])
    expect(r.totals).toEqual({
      incomeCents: 100000,
      cashCents: 30000,
      cardCents: 112000,
      expenseCents: 142000,
      balanceCents: -42000
    })
    expect(r.byCategory).toEqual([
      { name: 'Casa', cents: 100000 },
      { name: 'Alimentação', cents: 42000 }
    ])
    expect(r.byCard).toEqual([
      { name: 'Nubank', cents: 100000 },
      { name: 'Itaú', cents: 12000 }
    ])
    expect(r.byIncomeType).toEqual([{ name: 'Freelance', cents: 100000 }])
  })

  it('no ano, junta os meses e mantém a série mês a mês', () => {
    const r = buildReport(tx, periodMonths({ kind: 'year', year: 2026 }))
    expect(r.totals.incomeCents).toBe(600000)
    // As 3 parcelas da TV caem em nov, dez e jan: só 2 ficam em 2026.
    expect(r.byCard.find((c) => c.name === 'Nubank')?.cents).toBe(200000)
    expect(r.months.find((m) => m.month === '2026-10')?.incomeCents).toBe(500000)
    expect(r.months.reduce((s, m) => s + m.expenseCents, 0)).toBe(r.totals.expenseCents)
  })
})

describe('exportRows', () => {
  it('uma linha por parcela, com sinal e parcela "1/3"', () => {
    const rows = exportRows(buildReport(tx, ['2026-11']).entries)
    expect(rows.map((r) => [r.date, r.description, r.amountCents, r.installment])).toEqual([
      ['2026-10-20', 'TV', -100000, '1/3'],
      ['2026-11-02', 'Restaurante', -12000, ''],
      ['2026-11-08', 'Freela', 100000, ''],
      ['2026-11-10', 'Mercado', -30000, '']
    ])
    expect(rows[0]).toMatchObject({ kind: 'Cartão', method: 'Nubank', invoice: '2026-11-10' })
  })
})

describe('investedSeries', () => {
  const ops: InvestmentTransaction[] = [
    {
      id: 'a',
      type: 'compra',
      assetType: 'acao',
      ticker: 'PETR4',
      quantity: 10,
      unitPriceCents: 4000,
      feesCents: 0,
      date: '2026-09-10'
    },
    {
      id: 'b',
      type: 'venda',
      assetType: 'acao',
      ticker: 'PETR4',
      quantity: 5,
      unitPriceCents: 4500,
      feesCents: 0,
      date: '2026-11-03'
    }
  ]
  const fixed: FixedIncome[] = [
    {
      id: 'f',
      name: 'CDB',
      assetType: 'cdb',
      indexer: 'cdi',
      rate: 100,
      investedCents: 100000,
      startDate: '2026-10-31'
    }
  ]

  it('mostra o custo do que estava aplicado no fim de cada mês', () => {
    expect(investedSeries(ops, fixed, ['2026-08', '2026-09', '2026-10', '2026-11'])).toEqual([
      { month: '2026-08', cents: 0 },
      { month: '2026-09', cents: 40000 },
      { month: '2026-10', cents: 140000 },
      { month: '2026-11', cents: 120000 }
    ])
  })
})
