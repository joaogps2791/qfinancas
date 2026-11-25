import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchRates } from './market'

const memory = (): { read: <T>(n: string, f: T) => T; write: () => void } => ({
  read: <T>(_name: string, fallback: T): T => fallback,
  write: () => undefined
})

/** Responde como o SGS: série 433 (IPCA) com o status pedido; as outras com dados. */
function fakeSgs(ipcaStatus: number): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('sgs.433')) {
        return new Response(JSON.stringify({ erro: { statusCode: ipcaStatus } }), {
          status: ipcaStatus
        })
      }
      return new Response(
        JSON.stringify([
          { data: '19/11/2026', valor: '0.050788' },
          { data: '23/11/2026', valor: '0.050788' }
        ]),
        { status: 200 }
      )
    })
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('fetchRates', () => {
  it('IPCA do mês ainda não publicado (404) não derruba o CDI e a Selic', async () => {
    fakeSgs(404)
    const rates = await fetchRates('2026-11-19', '2026-11-25', memory())
    expect(rates.ipca).toEqual([])
    expect(rates.cdi).toEqual([
      { date: '2026-11-19', value: 0.050788 },
      { date: '2026-11-23', value: 0.050788 }
    ])
    expect(rates.selic).toHaveLength(2)
  })

  it('outro erro do Banco Central (sem cache) continua sendo erro', async () => {
    fakeSgs(500)
    await expect(fetchRates('2026-11-19', '2026-11-25', memory())).rejects.toThrow('(500)')
  })
})
