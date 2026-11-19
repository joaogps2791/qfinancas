// Cotações (brapi.dev) e taxas (Banco Central, SGS). Tudo sai do processo principal:
// o token da brapi nunca chega à tela.

export type Quote = { priceCents: number; changePercent: number; name: string; time: string }
export type QuotesResult = { quotes: Record<string, Quote>; errors: Record<string, string> }
type RatePoint = { date: string; value: number }
export type Rates = { cdi: RatePoint[]; selic: RatePoint[]; ipca: RatePoint[] }

type Storage = {
  read: <T>(name: string, fallback: T) => T
  write: (name: string, data: unknown) => void
}

const QUOTE_TTL = 15 * 60 * 1000
const TICKER = /^[A-Z0-9]{4,12}$/

/**
 * Busca as cotações, um ticker por vez (o plano grátis da brapi aceita 1 ticker por chamada
 * e 1 chamada por vez), reaproveitando o que tiver menos de 15 minutos.
 */
export async function fetchQuotes(
  tickers: unknown,
  force: boolean,
  token: string | null,
  storage: Storage
): Promise<QuotesResult> {
  const list = Array.isArray(tickers)
    ? [...new Set(tickers.map((t) => String(t).trim().toUpperCase()))].filter((t) => TICKER.test(t))
    : []
  const cache = storage.read<Record<string, { at: number; quote: Quote }>>('quotes-cache.json', {})
  const result: QuotesResult = { quotes: {}, errors: {} }
  let stop: string | null = null

  for (const ticker of list) {
    const cached = cached15(cache[ticker], force)
    if (cached) {
      result.quotes[ticker] = cached
      continue
    }
    if (stop) {
      if (cache[ticker]) result.quotes[ticker] = cache[ticker].quote
      result.errors[ticker] = stop
      continue
    }
    try {
      const response = await fetch(`https://brapi.dev/api/quote/${ticker}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(15_000)
      })
      const body = (await response.json().catch(() => ({}))) as {
        results?: {
          regularMarketPrice?: number
          regularMarketChangePercent?: number
          shortName?: string
          regularMarketTime?: string
        }[]
        code?: string
      }
      const item = body.results?.[0]
      if (response.ok && typeof item?.regularMarketPrice === 'number') {
        const quote: Quote = {
          priceCents: Math.round(item.regularMarketPrice * 100),
          changePercent: item.regularMarketChangePercent ?? 0,
          name: item.shortName ?? ticker,
          time: item.regularMarketTime ?? new Date().toISOString()
        }
        cache[ticker] = { at: Date.now(), quote }
        result.quotes[ticker] = quote
        continue
      }
      const message = quoteError(response.status, body.code)
      // Token recusado ou limite estourado valem para todos os próximos. Já o "sem token" não:
      // PETR4, VALE3, ITUB4 e MGLU3 respondem sem token.
      if (response.status === 429 || (response.status === 401 && body.code !== 'MISSING_TOKEN')) {
        stop = message
      }
      if (cache[ticker]) result.quotes[ticker] = cache[ticker].quote
      result.errors[ticker] = message
    } catch {
      if (cache[ticker]) result.quotes[ticker] = cache[ticker].quote
      result.errors[ticker] = 'Sem conexão com a brapi. Mostrando a última cotação guardada.'
    }
  }
  storage.write('quotes-cache.json', cache)
  return result
}

const cached15 = (entry: { at: number; quote: Quote } | undefined, force: boolean): Quote | null =>
  entry && !force && Date.now() - entry.at < QUOTE_TTL ? entry.quote : null

function quoteError(status: number, code?: string): string {
  if (status === 401 && code === 'MISSING_TOKEN') {
    return 'Este ativo precisa do token da brapi. Cadastre em Configurações → Integrações.'
  }
  if (status === 401)
    return 'O token da brapi foi recusado. Confira em Configurações → Integrações.'
  if (status === 402 || status === 403) return 'O plano da brapi não inclui este ativo.'
  if (status === 404) return 'Ticker não encontrado na brapi.'
  if (status === 429) {
    return 'Limite de consultas da brapi atingido (o plano grátis dá 15 mil por mês). Tente mais tarde.'
  }
  return `A brapi respondeu com erro (${status}).`
}

// ---------- Banco Central (SGS) ----------

const SERIES = { selic: 11, cdi: 12, ipca: 433 } as const
const ISO = /^\d{4}-\d{2}-\d{2}$/

const toBcb = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const fromBcb = (date: string): string =>
  `${date.slice(6, 10)}-${date.slice(3, 5)}-${date.slice(0, 2)}`
// 29/02 + anos vira 28/02 (o ano de destino pode não ser bissexto).
const addYears = (iso: string, years: number): string =>
  `${Number(iso.slice(0, 4)) + years}${iso.slice(4) === '-02-29' ? '-02-28' : iso.slice(4)}`

/** O SGS só aceita janelas de até 10 anos por consulta; divide o período em janelas de 9. */
async function fetchSeries(code: number, from: string, to: string): Promise<RatePoint[]> {
  const points: RatePoint[] = []
  for (let start = from; start <= to; start = addYears(start, 9)) {
    const end = addYears(start, 9) < to ? addYears(start, 9) : to
    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=${toBcb(start)}&dataFinal=${toBcb(end)}`
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`O Banco Central respondeu com erro (${response.status}).`)
    const rows = (await response.json()) as { data: string; valor: string }[]
    for (const row of rows) points.push({ date: fromBcb(row.data), value: Number(row.valor) })
    if (end === to) break
  }
  // As janelas se encostam num dia; tira repetidos.
  return points.filter((p, i) => i === 0 || p.date !== points[i - 1].date)
}

/** Selic e CDI diários e IPCA mensal desde `from`, guardados no PC e renovados uma vez por dia. */
export async function fetchRates(from: unknown, today: string, storage: Storage): Promise<Rates> {
  const start = typeof from === 'string' && ISO.test(from) && from < today ? from : today
  const cache = storage.read<(Rates & { day: string; from: string }) | null>(
    'rates-cache.json',
    null
  )
  if (cache && cache.day === today && cache.from <= start) return cache

  try {
    const [cdi, selic, ipca] = await Promise.all([
      fetchSeries(SERIES.cdi, start, today),
      fetchSeries(SERIES.selic, start, today),
      // O IPCA é mensal: começa no dia 1 do mês da aplicação.
      fetchSeries(SERIES.ipca, `${start.slice(0, 8)}01`, today)
    ])
    const rates = { cdi, selic, ipca }
    storage.write('rates-cache.json', { ...rates, day: today, from: start })
    return rates
  } catch (error) {
    // Sem internet: usa a última série guardada, mesmo de outro dia.
    if (cache) return cache
    throw error instanceof Error ? error : new Error(String(error))
  }
}
