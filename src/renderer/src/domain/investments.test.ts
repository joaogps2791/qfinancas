import { describe, expect, it } from 'vitest'
import {
  bcbDateToIso,
  computePositions,
  contributionsInMonth,
  dividendsByMonth,
  estimateFixedIncome,
  irRateFor,
  lastDividend,
  parseQuantity,
  yieldOnCost,
  type Dividend,
  type FixedIncome,
  type InvestmentTransaction,
  type RatePoint
} from './investments'

let n = 0
const op = (o: Partial<InvestmentTransaction>): InvestmentTransaction => ({
  id: `t${n++}`,
  type: 'compra',
  assetType: 'acao',
  ticker: 'PETR4',
  quantity: 10,
  unitPriceCents: 2000,
  feesCents: 0,
  date: '2026-01-10',
  ...o
})

describe('computePositions (preço médio)', () => {
  it('pondera as compras e inclui as taxas no custo', () => {
    const [p] = computePositions([
      op({ quantity: 10, unitPriceCents: 2000, feesCents: 5 }),
      op({ quantity: 10, unitPriceCents: 3000, date: '2026-02-10' })
    ])
    expect(p.quantity).toBe(20)
    expect(p.totalCostCents).toBe(50005)
    expect(p.avgPriceCents).toBe(2500)
  })

  it('venda não muda o preço médio e gera o resultado realizado', () => {
    const [p] = computePositions([
      op({ quantity: 10, unitPriceCents: 2000, feesCents: 5 }),
      op({ quantity: 10, unitPriceCents: 3000, date: '2026-02-10' }),
      op({ type: 'venda', quantity: 5, unitPriceCents: 4000, feesCents: 2, date: '2026-03-10' })
    ])
    expect(p.quantity).toBe(15)
    expect(p.avgPriceCents).toBe(2500)
    // custo tirado: 50005 × 5/20 = 12501; venda líquida: 20000 − 2 = 19998
    expect(p.realizedCents).toBe(19998 - 12501)
    expect(p.totalCostCents).toBe(50005 - 12501)
  })

  it('usa a ordem das datas, não a ordem em que foi lançado', () => {
    const [p] = computePositions([
      op({ type: 'venda', quantity: 10, unitPriceCents: 2500, date: '2026-05-01' }),
      op({ quantity: 10, unitPriceCents: 2000, date: '2026-01-01' })
    ])
    expect(p.quantity).toBe(0)
    expect(p.realizedCents).toBe(5000)
    expect(p.oversold).toBe(false)
  })

  it('zera ao vender tudo e avisa quando vende mais do que tem', () => {
    const [p] = computePositions([
      op({ quantity: 3 }),
      op({ type: 'venda', quantity: 5, date: '2026-02-01' })
    ])
    expect(p.quantity).toBe(0)
    expect(p.totalCostCents).toBe(0)
    expect(p.oversold).toBe(true)
  })

  it('aceita fração sem sobrar resto de ponto flutuante', () => {
    const [p] = computePositions([
      op({ ticker: 'ivvb11', assetType: 'etf', quantity: 0.1 }),
      op({ ticker: 'IVVB11', assetType: 'etf', quantity: 0.2 }),
      op({ ticker: 'IVVB11', assetType: 'etf', type: 'venda', quantity: 0.3, date: '2026-02-01' })
    ])
    expect(p.ticker).toBe('IVVB11')
    expect(p.quantity).toBe(0)
    expect(p.oversold).toBe(false)
  })
})

describe('contributionsInMonth', () => {
  it('soma compras com taxas e aplicações de renda fixa do mês', () => {
    const fixed: FixedIncome[] = [
      {
        id: 'f',
        name: 'CDB Banco X',
        assetType: 'cdb',
        indexer: 'cdi',
        rate: 100,
        investedCents: 100000,
        startDate: '2026-11-03'
      }
    ]
    const items = contributionsInMonth(
      [
        op({ date: '2026-11-05', feesCents: 10 }),
        op({ date: '2026-10-05' }),
        op({ type: 'venda', date: '2026-11-06' })
      ],
      fixed,
      '2026-11'
    )
    expect(items.map((i) => i.cents)).toEqual([20010, 100000])
  })
})

const daily = (start: string, count: number, value: number): RatePoint[] =>
  Array.from({ length: count }, (_, i) => ({
    date: new Date(Date.parse(`${start}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10),
    value
  }))

const fi = (o: Partial<FixedIncome>): FixedIncome => ({
  id: 'x',
  name: 'CDB',
  assetType: 'cdb',
  indexer: 'cdi',
  rate: 100,
  investedCents: 100000,
  startDate: '2026-01-01',
  ...o
})

describe('estimateFixedIncome', () => {
  it('CDI: multiplica os dias do período pela porcentagem contratada', () => {
    const rates = { cdi: daily('2026-01-01', 3, 0.05), selic: [], ipca: [] }
    expect(estimateFixedIncome(fi({}), rates, '2026-01-04').grossCents).toBe(
      Math.round(100000 * 1.0005 ** 3)
    )
    expect(estimateFixedIncome(fi({ rate: 110 }), rates, '2026-01-04').grossCents).toBe(
      Math.round(100000 * 1.00055 ** 3)
    )
  })

  it('não conta o dia de hoje nem dias antes da aplicação', () => {
    const rates = { cdi: daily('2025-12-30', 6, 0.05), selic: [], ipca: [] }
    // pontos de 30/12 a 04/01; contam 01/01, 02/01 e 03/01
    expect(estimateFixedIncome(fi({}), rates, '2026-01-04').grossCents).toBe(
      Math.round(100000 * 1.0005 ** 3)
    )
  })

  it('prefixado: 252 dias úteis a 10% a.a. rendem 10%', () => {
    const rates = { cdi: daily('2026-01-01', 252, 0.04), selic: [], ipca: [] }
    const est = estimateFixedIncome(fi({ indexer: 'prefixado', rate: 10 }), rates, '2027-01-01')
    expect(est.grossCents).toBe(110000)
  })

  it('IPCA: meses inteiros publicados + taxa real', () => {
    const rates = {
      cdi: [],
      selic: [],
      ipca: [
        { date: '2025-12-01', value: 5 },
        { date: '2026-01-01', value: 1 },
        { date: '2026-02-01', value: 1 },
        { date: '2026-03-01', value: 1 }
      ]
    }
    // conta janeiro e fevereiro; dezembro é antes, março é o mês corrente
    const est = estimateFixedIncome(fi({ indexer: 'ipca', rate: 0 }), rates, '2026-03-15')
    expect(est.grossCents).toBe(102010)
  })

  it('para de render no vencimento', () => {
    const rates = { cdi: daily('2026-01-01', 10, 0.05), selic: [], ipca: [] }
    const est = estimateFixedIncome(fi({ maturityDate: '2026-01-03' }), rates, '2026-01-20')
    expect(est.grossCents).toBe(Math.round(100000 * 1.0005 ** 2))
  })

  it('IR regressivo sobre o ganho; LCI/LCA é isenta', () => {
    const rates = { cdi: daily('2026-01-01', 3, 0.05), selic: [], ipca: [] }
    const cdb = estimateFixedIncome(fi({}), rates, '2026-01-04')
    expect(cdb.irRate).toBe(0.225)
    expect(cdb.irCents).toBe(Math.round(cdb.gainCents * 0.225))
    expect(cdb.netCents).toBe(cdb.grossCents - cdb.irCents)
    const lci = estimateFixedIncome(fi({ assetType: 'lci_lca' }), rates, '2026-01-04')
    expect(lci.irCents).toBe(0)
  })

  it('faixas do IR regressivo', () => {
    expect([180, 181, 360, 361, 720, 721].map((d) => irRateFor('cdb', d))).toEqual([
      0.225, 0.2, 0.2, 0.175, 0.175, 0.15
    ])
  })

  it('converte a data do BCB', () => {
    expect(bcbDateToIso('13/11/2026')).toBe('2026-11-13')
  })
})

describe('proventos', () => {
  const divs: Dividend[] = [
    { id: '1', ticker: 'HGLG11', type: 'rendimento', amountCents: 1100, paymentDate: '2026-10-14' },
    { id: '2', ticker: 'HGLG11', type: 'rendimento', amountCents: 1200, paymentDate: '2026-11-14' },
    { id: '3', ticker: 'HGLG11', type: 'rendimento', amountCents: 9999, paymentDate: '2025-10-14' },
    { id: '4', ticker: 'PETR4', type: 'jcp', amountCents: 500, paymentDate: '2026-11-20' }
  ]

  it('totais por mês', () => {
    expect(dividendsByMonth(divs, '2026-11', 2)).toEqual([
      { month: '2026-10', cents: 1100 },
      { month: '2026-11', cents: 1700 }
    ])
  })

  it('yield sobre o custo dos últimos 12 meses', () => {
    const [p] = computePositions([
      op({ ticker: 'HGLG11', assetType: 'fii', quantity: 1, unitPriceCents: 23000 })
    ])
    expect(yieldOnCost(divs, p, '2026-11-19')).toBeCloseTo(2300 / 23000)
  })

  it('último valor do ticker', () => {
    expect(lastDividend(divs, 'HGLG11')?.amountCents).toBe(1200)
    expect(lastDividend(divs, 'XPML11')).toBeUndefined()
  })
})

describe('parseQuantity', () => {
  it('aceita vírgula ou ponto decimal', () => {
    expect(parseQuantity('10')).toBe(10)
    expect(parseQuantity('0,5')).toBe(0.5)
    expect(parseQuantity('0.5')).toBe(0.5)
    expect(parseQuantity('1.000,5')).toBe(1000.5)
  })
  it('recusa zero, negativo e texto', () => {
    expect(parseQuantity('0')).toBeNull()
    expect(parseQuantity('-1')).toBeNull()
    expect(parseQuantity('abc')).toBeNull()
    expect(parseQuantity('')).toBeNull()
  })
})
