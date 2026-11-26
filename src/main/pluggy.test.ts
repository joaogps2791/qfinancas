import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchPluggyCards, fetchPluggyInvestments } from './pluggy'

const ITEM = '11111111-2222-3333-4444-555555555555'
const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 })

afterEach(() => vi.unstubAllGlobals())

describe('fetchPluggyInvestments', () => {
  it('junta as páginas e ignora resgatados ou zerados', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/auth')) return json({ apiKey: 'k' })
        if (url.includes('/items/')) return json({ connector: { name: 'XP' } })
        const page = Number(new URL(url).searchParams.get('page'))
        return json({
          totalPages: 2,
          results:
            page === 1
              ? [
                  {
                    id: 'a',
                    name: 'Petrobras',
                    code: 'petr4',
                    type: 'EQUITY',
                    status: 'ACTIVE',
                    balance: 10
                  },
                  {
                    id: 'b',
                    name: 'Velho',
                    type: 'FIXED_INCOME',
                    status: 'TOTAL_WITHDRAWAL',
                    balance: 5
                  }
                ]
              : [
                  { id: 'c', name: 'CDB', type: 'FIXED_INCOME', balance: 0 },
                  {
                    id: 'd',
                    name: 'LCI',
                    type: 'FIXED_INCOME',
                    balance: 7,
                    dueDate: '2027-05-01T03:00:00.000Z'
                  }
                ]
        })
      })
    )
    const result = await fetchPluggyInvestments({
      clientId: 'id',
      clientSecret: 's',
      itemIds: [ITEM]
    })
    expect(result.errors).toEqual([])
    expect(result.investments.map((i) => [i.id, i.bank, i.code, i.dueDate])).toEqual([
      ['a', 'XP', 'PETR4', undefined],
      ['d', 'XP', undefined, '2027-05-01']
    ])
  })
})

describe('fetchPluggyCards', () => {
  it('guarda só o final do número e tira os dias de fechamento e vencimento', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/auth')) return json({ apiKey: 'k' })
        if (url.includes('/items/')) return json({ connector: { name: 'Nubank' } })
        return json({
          results: [
            {
              id: 'c1',
              type: 'CREDIT',
              name: 'Ultravioleta',
              number: '**** **** **** 1234',
              creditData: {
                brand: 'MASTERCARD',
                level: 'BLACK',
                balanceCloseDate: '2026-12-03T03:00:00.000Z',
                balanceDueDate: '2026-12-10T03:00:00.000Z',
                creditLimit: 5000
              }
            },
            { id: 'c2', type: 'CREDIT', name: 'Virtual', number: '12' }
          ]
        })
      })
    )
    const { cards } = await fetchPluggyCards({ clientId: 'id', clientSecret: 's', itemIds: [ITEM] })
    expect(cards).toEqual([
      {
        id: 'c1',
        bank: 'Nubank',
        name: 'Ultravioleta',
        last4: '1234',
        brand: 'MASTERCARD',
        level: 'BLACK',
        closingDay: 3,
        dueDay: 10,
        creditLimit: 5000
      },
      expect.objectContaining({ id: 'c2', last4: undefined })
    ])
  })
})
