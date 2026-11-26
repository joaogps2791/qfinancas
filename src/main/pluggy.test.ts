import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchPluggyInvestments } from './pluggy'

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
