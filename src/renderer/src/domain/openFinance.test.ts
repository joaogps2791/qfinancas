import { describe, expect, it } from 'vitest'
import { compareHoldings, pluggyRows } from './openFinance'
import type { PluggyData, PluggyInvestment } from '../../../main/pluggy'

const data: PluggyData = {
  errors: [],
  accounts: [
    { id: 'conta', itemId: 'i', bank: 'Nubank', name: 'Conta', type: 'BANK' },
    { id: 'cartao', itemId: 'i', bank: 'Nubank', name: 'Cartão', type: 'CREDIT' }
  ],
  transactions: [
    {
      id: '1',
      accountId: 'conta',
      date: '2026-11-05',
      description: 'Salário',
      amount: 6500,
      type: 'CREDIT'
    },
    {
      id: '2',
      accountId: 'conta',
      date: '2026-11-10',
      description: 'Pix aluguel',
      amount: -1800.1,
      type: 'DEBIT'
    },
    // Algumas instituições mandam o débito com valor positivo: quem manda é o `type`.
    {
      id: '3',
      accountId: 'conta',
      date: '2026-11-11',
      description: 'Mercado',
      amount: 245.9,
      type: 'DEBIT'
    },
    {
      id: '4',
      accountId: 'cartao',
      date: '2026-11-16',
      description: 'Loja Exemplo',
      amount: 120,
      type: 'DEBIT',
      purchaseDate: '2026-09-03',
      installmentNumber: 3,
      totalInstallments: 5
    },
    {
      id: '5',
      accountId: 'cartao',
      date: '2026-11-10',
      description: 'Pagamento recebido',
      amount: -980.45,
      type: 'CREDIT'
    },
    { id: '6', accountId: 'cartao', date: '2026-11-12', description: '', amount: 0, type: 'DEBIT' }
  ]
}

describe('pluggyRows', () => {
  it('conta: o sinal vem do type (DEBIT sai, CREDIT entra), em centavos', () => {
    expect(pluggyRows(data, 'conta').map((r) => [r.date, r.amountCents])).toEqual([
      ['2026-11-05', 650000],
      ['2026-11-10', -180010],
      ['2026-11-11', -24590]
    ])
  })

  it('cartão: positivo é gasto, negativo é pagamento; parcela com data da compra e fatura do lançamento', () => {
    const rows = pluggyRows(data, 'cartao', { closingDay: 3, dueDay: 10 })
    expect(rows).toEqual([
      {
        date: '2026-09-03',
        description: 'Loja Exemplo (3/5)',
        amountCents: -12000,
        invoiceDate: '2026-12-10'
      },
      {
        date: '2026-11-10',
        description: 'Pagamento recebido',
        amountCents: 98045,
        invoiceDate: '2026-12-10'
      }
    ])
  })

  it('cartão sem fechamento configurado: deixa a fatura para a tela', () => {
    expect(pluggyRows(data, 'cartao')[0].invoiceDate).toBeUndefined()
  })

  it('conta desconhecida não devolve nada', () => {
    expect(pluggyRows(data, 'outra')).toEqual([])
  })
})

describe('compareHoldings', () => {
  const base = { bank: 'XP' }
  const investments: PluggyInvestment[] = [
    {
      ...base,
      id: 'a',
      name: 'PETROBRAS PN',
      code: 'PETR4',
      type: 'EQUITY',
      subtype: 'STOCK',
      balance: 380.5,
      quantity: 10,
      value: 38.05,
      amountOriginal: 300,
      purchaseDate: '2026-01-10'
    },
    {
      ...base,
      id: 'b',
      name: 'CDB BRB',
      type: 'FIXED_INCOME',
      subtype: 'CDB',
      balance: 200.33,
      amountOriginal: 200,
      purchaseDate: '2026-11-19',
      dueDate: '2028-11-19',
      rateType: 'CDI',
      rate: 108
    },
    {
      ...base,
      id: 'c',
      name: 'Tesouro IPCA+ 2035',
      type: 'FIXED_INCOME',
      subtype: 'TREASURY',
      balance: 1050,
      amountOriginal: 1000,
      rateType: 'IPCA',
      fixedAnnualRate: 6.5
    },
    {
      ...base,
      id: 'd',
      name: 'Fundo Multimercado',
      type: 'MUTUAL_FUND',
      balance: 500.1,
      quantity: 412.7
    }
  ]
  const result = compareHoldings(
    investments,
    {
      assets: [{ ticker: 'PETR4', valueCents: 37_000 }],
      fixed: [{ id: 'x', name: 'CDB Brb 108%', grossCents: 20_026 }]
    },
    '2026-11-25'
  )
  const byId = Object.fromEntries(result.map((r) => [r.investment.id, r]))

  it('liga ação pelo ticker e renda fixa pelo nome', () => {
    expect(byId.a).toMatchObject({ pluggyCents: 38_050, appCents: 37_000, appName: 'PETR4' })
    expect(byId.b).toMatchObject({ pluggyCents: 20_033, appCents: 20_026, appName: 'CDB Brb 108%' })
    expect(byId.c.appCents).toBeNull()
  })

  it('monta o rascunho para lançar o que falta', () => {
    expect(byId.a.draft).toEqual({
      kind: 'operation',
      data: {
        type: 'compra',
        assetType: 'acao',
        ticker: 'PETR4',
        quantity: 10,
        unitPriceCents: 3_000,
        feesCents: 0,
        date: '2026-01-10',
        broker: 'XP'
      }
    })
    expect(byId.c.draft).toEqual({
      kind: 'fixed',
      data: {
        name: 'Tesouro IPCA+ 2035',
        assetType: 'tesouro',
        indexer: 'ipca',
        rate: 6.5,
        investedCents: 100_000,
        startDate: '2026-11-25',
        maturityDate: undefined
      }
    })
    // Fundo: 1 cota pelo saldo (sem aplicado informado), classe "Outros".
    expect(byId.d.draft.data).toMatchObject({
      assetType: 'outro',
      quantity: 1,
      unitPriceCents: 50_010
    })
  })

  it('ordena do maior saldo para o menor', () => {
    expect(result.map((r) => r.investment.id)).toEqual(['c', 'd', 'a', 'b'])
  })
})
