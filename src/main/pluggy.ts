// Open Finance pelo Meu Pluggy (uso pessoal). Só leitura: auth, itens, contas e transações.
// Tudo sai do processo principal; o Client Secret nunca chega à tela.
// Documentação conferida em 19/11/2026: o GET /transactions antigo só vale até 31/12/2026,
// por isso as transações vêm do GET /v2/transactions (cursor em `next`).

const API = 'https://api.pluggy.ai'
const KEY_TTL = 100 * 60 * 1000 // a chave vale 2 h; renova antes
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO = /^\d{4}-\d{2}-\d{2}$/

export type PluggyCredentials = { clientId: string; clientSecret: string; itemIds: string[] }

export type PluggyItemStatus = {
  id: string
  bank: string
  status: string
  lastUpdatedAt?: string
  consentExpiresAt?: string
  error?: string
}

export type PluggyAccount = {
  id: string
  itemId: string
  bank: string
  name: string
  type: 'BANK' | 'CREDIT'
}

export type PluggyTransaction = {
  id: string
  accountId: string
  /** YYYY-MM-DD em São Paulo */
  date: string
  description: string
  /** como a Pluggy manda (reais, com sinal da Pluggy) */
  amount: number
  type: 'DEBIT' | 'CREDIT'
  /** cartão: data da compra original (parcelas) */
  purchaseDate?: string
  installmentNumber?: number
  totalInstallments?: number
}

export type PluggyData = {
  accounts: PluggyAccount[]
  transactions: PluggyTransaction[]
  errors: string[]
}

/** "cole, um, por, linha" → UUIDs válidos, sem repetir. */
export const parseItemIds = (raw: string | null): string[] => [
  ...new Set((raw ?? '').split(/[\s,;]+/).filter((id) => UUID.test(id)))
]

const saoPauloDate = (iso: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso))

let cachedKey: { key: string; at: number; clientId: string } | null = null

async function apiKey(creds: PluggyCredentials, renew = false): Promise<string> {
  if (!renew && cachedKey?.clientId === creds.clientId && Date.now() - cachedKey.at < KEY_TTL) {
    return cachedKey.key
  }
  const response = await fetch(`${API}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: creds.clientId, clientSecret: creds.clientSecret }),
    signal: AbortSignal.timeout(20_000)
  })
  if (response.status === 401 || response.status === 403) {
    throw new Error('A Pluggy recusou o Client ID ou o Client Secret. Confira em Integrações.')
  }
  if (!response.ok) throw new Error(`A Pluggy respondeu com erro (${response.status}).`)
  const { apiKey: key } = (await response.json()) as { apiKey: string }
  cachedKey = { key, at: Date.now(), clientId: creds.clientId }
  return key
}

/** GET com a chave; se ela tiver vencido no meio do caminho, renova uma vez. */
async function get<T>(creds: PluggyCredentials, path: string): Promise<T> {
  for (const renew of [false, true]) {
    const response = await fetch(`${API}${path}`, {
      headers: { 'X-API-KEY': await apiKey(creds, renew) },
      signal: AbortSignal.timeout(30_000)
    })
    if (response.status === 401 && !renew) continue
    if (response.status === 404) throw new Error('não encontrado na Pluggy (confira o Item ID)')
    if (!response.ok) throw new Error(`a Pluggy respondeu com erro (${response.status})`)
    return (await response.json()) as T
  }
  throw new Error('a Pluggy recusou a chave de acesso')
}

function requireCredentials(creds: PluggyCredentials): void {
  if (!creds.clientId || !creds.clientSecret) {
    throw new Error('Falta o Client ID ou o Client Secret da Pluggy em Integrações.')
  }
  if (!creds.itemIds.length) throw new Error('Cole pelo menos um Item ID da Pluggy em Integrações.')
}

type RawItem = {
  id: string
  status: string
  lastUpdatedAt?: string
  consentExpiresAt?: string
  connector?: { name?: string }
}

/** "Testar conexão": a chave funciona e cada item responde (com status e validade). */
export async function testPluggy(creds: PluggyCredentials): Promise<PluggyItemStatus[]> {
  requireCredentials(creds)
  await apiKey(creds, true)
  return Promise.all(
    creds.itemIds.map(async (id) => {
      try {
        const item = await get<RawItem>(creds, `/items/${id}`)
        return {
          id,
          bank: item.connector?.name ?? id,
          status: item.status,
          lastUpdatedAt: item.lastUpdatedAt,
          consentExpiresAt: item.consentExpiresAt
        }
      } catch (error) {
        return { id, bank: id, status: 'ERROR', error: (error as Error).message }
      }
    })
  )
}

type RawAccount = {
  id: string
  name: string
  marketingName?: string
  number?: string
  type: string
}
type RawTransaction = {
  id: string
  date: string
  description?: string
  descriptionRaw?: string
  amount: number
  type: 'DEBIT' | 'CREDIT'
  creditCardMetadata?: {
    purchaseDate?: string
    installmentNumber?: number
    totalInstallments?: number
  }
}

/** Contas e transações de todos os itens desde `dateFrom` (YYYY-MM-DD). */
export async function fetchPluggy(
  creds: PluggyCredentials,
  dateFrom: unknown
): Promise<PluggyData> {
  requireCredentials(creds)
  if (typeof dateFrom !== 'string' || !ISO.test(dateFrom)) throw new Error('Data inválida.')
  const data: PluggyData = { accounts: [], transactions: [], errors: [] }

  for (const itemId of creds.itemIds) {
    let bank = itemId
    try {
      bank = (await get<RawItem>(creds, `/items/${itemId}`)).connector?.name ?? itemId
      const { results: accounts } = await get<{ results: RawAccount[] }>(
        creds,
        `/accounts?itemId=${itemId}`
      )
      for (const account of accounts) {
        if (account.type !== 'BANK' && account.type !== 'CREDIT') continue
        const name = [account.marketingName || account.name, account.number]
          .filter(Boolean)
          .join(' · ')
        data.accounts.push({ id: account.id, itemId, bank, name, type: account.type })

        let query = `?accountId=${account.id}&dateFrom=${dateFrom}`
        // Páginas de até 500; `next` traz o resto da query (com o cursor `after`).
        for (let page = 0; page < 50 && query; page++) {
          const result = await get<{ results: RawTransaction[]; next: string | null }>(
            creds,
            `/v2/transactions${query}`
          )
          for (const t of result.results) {
            const meta = t.creditCardMetadata
            data.transactions.push({
              id: t.id,
              accountId: account.id,
              date: saoPauloDate(t.date),
              description: (t.description || t.descriptionRaw || '').trim(),
              amount: t.amount,
              type: t.type,
              purchaseDate: meta?.purchaseDate ? saoPauloDate(meta.purchaseDate) : undefined,
              installmentNumber: meta?.installmentNumber,
              totalInstallments: meta?.totalInstallments
            })
          }
          query = result.next ?? ''
        }
      }
    } catch (error) {
      data.errors.push(`${bank}: ${(error as Error).message}`)
    }
  }
  return data
}
