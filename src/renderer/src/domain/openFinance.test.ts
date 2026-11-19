import { describe, expect, it } from 'vitest'
import { pluggyRows } from './openFinance'
import type { PluggyData } from '../../../main/pluggy'

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
