import { describe, expect, it } from 'vitest'
import { compareCards, compareHoldings, pluggyRows } from './openFinance'
import type { Card } from './categories'
import type { PluggyCard, PluggyData, PluggyInvestment } from '../../../main/pluggy'

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

  it('cartão: positivo é gasto, negativo é pagamento; parcela entra a partir dela mesma', () => {
    const rows = pluggyRows(data, 'cartao', { closingDay: 3, dueDay: 10 })
    expect(rows).toEqual([
      // 3/5 de R$ 120 lançada em 16/11 (fatura de dez): da 3ª à 5ª, a partir de dez
      {
        date: '2026-09-03',
        description: 'Loja Exemplo',
        amountCents: -60000,
        installments: 5,
        firstInstallment: 3,
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

describe('compareCards', () => {
  const card = (o: Partial<PluggyCard>): PluggyCard => ({
    id: o.id ?? 'x',
    bank: 'Nubank',
    name: '',
    ...o
  })
  const existing: Card[] = [
    { name: 'Nubank', color: '#820ad1', issuer: 'nubank', last4: '1234' },
    { name: 'Caixa', color: '#005ca9', issuer: 'caixa' }
  ]
  const result = compareCards(
    [
      card({
        id: 'a',
        bank: 'Nu Pagamentos',
        name: 'Ultravioleta',
        last4: '1234',
        brand: 'MASTERCARD'
      }),
      card({
        id: 'b',
        bank: 'Nubank',
        name: 'Nubank Gold',
        level: 'GOLD',
        last4: '9876',
        brand: 'MASTERCARD',
        closingDay: 3,
        dueDay: 10,
        creditLimit: 4500.5
      }),
      card({
        id: 'c',
        bank: 'Caixa Econômica Federal',
        name: 'Caixa Gold',
        last4: '5555',
        brand: 'VISA'
      }),
      card({
        id: 'd',
        bank: 'Bradesco',
        name: 'Elo Mais',
        level: 'GOLD',
        last4: '4321',
        brand: 'ELO'
      })
    ],
    existing
  )
  const byId = Object.fromEntries(result.map((r) => [r.source.id, r]))

  it('reconhece o que já está cadastrado pelo final ou pelo banco', () => {
    expect(byId.a.existing).toBe('Nubank')
    expect(byId.b.existing).toBeUndefined()
    // a Caixa do app não tem final: conta como a mesma, para não duplicar
    expect(byId.c.existing).toBe('Caixa')
  })

  it('monta o cartão com nome sem repetir, bandeira, dias e limite', () => {
    expect(byId.b.draft).toEqual({
      name: 'Nubank 9876',
      color: '#820ad1',
      issuer: 'nubank',
      network: 'mastercard',
      last4: '9876',
      nickname: 'Nubank Gold',
      closingDay: 3,
      dueDay: 10,
      limitCents: 450_050
    })
    expect(byId.d.draft).toMatchObject({
      name: 'Bradesco',
      issuer: 'bradesco',
      network: 'elo',
      nickname: 'Elo Mais Gold'
    })
  })

  it('banco desconhecido fica como "Outro banco" com o nome do conector', () => {
    const [r] = compareCards([card({ bank: 'Cooperativa Sicredi', brand: 'VISA' })], [])
    expect(r.draft).toMatchObject({ name: 'Cooperativa Sicredi', issuer: 'outro', network: 'visa' })
  })
})

it('cartão antigo sem banco salvo é reconhecido pelo nome', () => {
  const [r] = compareCards(
    [{ id: 'a', bank: 'Nubank', name: 'Nubank Croma', last4: '4821' }],
    [{ name: 'Nubank', color: '#8a05be' }]
  )
  expect(r.existing).toBe('Nubank')
})

describe('pluggyRows: parcelas do cartão', () => {
  const parcel = (
    id: string,
    date: string,
    n: number,
    extra: Partial<PluggyData['transactions'][number]> = {}
  ): PluggyData['transactions'][number] => ({
    id,
    accountId: 'cartao',
    date,
    description: `MAGAZINE LOJA PARC ${String(n).padStart(2, '0')}/10`,
    amount: 250,
    type: 'DEBIT',
    purchaseDate: '2026-08-20',
    installmentNumber: n,
    totalInstallments: 10,
    ...extra
  })
  const withParcels = (transactions: PluggyData['transactions']): PluggyData => ({
    ...data,
    transactions
  })

  it('várias parcelas da mesma compra viram uma compra só, a partir da mais antiga mostrada', () => {
    const rows = pluggyRows(
      withParcels([parcel('a', '2026-11-20', 4), parcel('b', '2026-10-20', 3)]),
      'cartao',
      { closingDay: 3, dueDay: 10 }
    )
    expect(rows).toEqual([
      {
        date: '2026-08-20',
        description: 'MAGAZINE LOJA',
        amountCents: -250_000,
        installments: 10,
        // 1ª e 2ª já pagas (não entram); a 3ª foi lançada em 20/10 → fatura de 10/11
        firstInstallment: 3,
        invoiceDate: '2026-11-10'
      }
    ])
  })

  it('fatura e dias do banco valem mais que o cálculo pelo cartão do app', () => {
    const bankCard: PluggyData = {
      ...withParcels([parcel('a', '2026-11-20', 2, { invoiceDate: '2026-12-15' })]),
      accounts: [
        {
          id: 'cartao',
          itemId: 'i',
          bank: 'Nubank',
          name: 'Cartão',
          type: 'CREDIT',
          closingDay: 8,
          dueDay: 15
        }
      ]
    }
    expect(pluggyRows(bankCard, 'cartao', { closingDay: 3, dueDay: 10 })[0]).toMatchObject({
      firstInstallment: 2,
      invoiceDate: '2026-12-15'
    })
    // sem a fatura na transação, usa os dias do banco (fecha 8, vence 15)
    const [row] = pluggyRows(
      { ...bankCard, transactions: [parcel('a', '2026-11-20', 2)] },
      'cartao',
      { closingDay: 3, dueDay: 10 }
    )
    expect(row.invoiceDate).toBe('2026-12-15')
  })

  it('usa o valor total da compra quando o banco manda', () => {
    const [row] = pluggyRows(
      withParcels([parcel('a', '2026-11-20', 4, { totalAmount: 2499.9 })]),
      'cartao'
    )
    expect(row).toMatchObject({ amountCents: -249_990, installments: 10, invoiceDate: undefined })
  })

  it('compras parceladas diferentes no mesmo dia continuam separadas', () => {
    const rows = pluggyRows(
      withParcels([
        parcel('a', '2026-11-20', 4),
        parcel('b', '2026-11-20', 1, {
          amount: 99,
          description: 'Outra loja',
          purchaseDate: '2026-11-15'
        })
      ]),
      'cartao'
    )
    expect(rows.map((r) => [r.description, r.installments])).toEqual([
      ['MAGAZINE LOJA', 10],
      ['Outra loja', 10]
    ])
  })
})
