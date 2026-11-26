// Open Finance pelo Meu Pluggy (uso pessoal). Só leitura: auth, itens, contas, transações e investimentos.
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
  /** cartão: dias de fechamento e vencimento informados pelo banco */
  closingDay?: number
  dueDay?: number
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
  /** cartão: valor da compra inteira (em reais), quando o banco manda */
  totalAmount?: number
  /** cartão: vencimento (YYYY-MM-DD) da fatura em que o banco colocou esta transação */
  invoiceDate?: string
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
    totalAmount?: number
    billId?: string | null
  }
}
type RawBill = { id: string; dueDate?: string | null; billClosingDate?: string | null }

/**
 * Faturas do cartão: vencimento de cada uma (para pôr cada transação na fatura certa) e os dias
 * de fechamento e vencimento. Nem todo banco manda faturas; aí volta vazio.
 */
async function creditInfo(
  creds: PluggyCredentials,
  account: RawCreditAccount
): Promise<{ dueByBill: Map<string, string>; closingDay?: number; dueDay?: number }> {
  const bills = await get<{ results: RawBill[] }>(creds, `/bills?accountId=${account.id}`)
    .then((r) => r.results)
    .catch((): RawBill[] => [])
  const dueByBill = new Map<string, string>()
  for (const bill of bills) if (bill.dueDate) dueByBill.set(bill.id, saoPauloDate(bill.dueDate))
  const latest = [...bills]
    .filter((b) => b.dueDate)
    .sort((a, b) => String(b.dueDate).localeCompare(String(a.dueDate)))[0]
  const credit = account.creditData ?? undefined
  return {
    dueByBill,
    closingDay: dayOf(credit?.balanceCloseDate) ?? dayOf(latest?.billClosingDate),
    dueDay: dayOf(credit?.balanceDueDate) ?? dayOf(latest?.dueDate)
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
      const { results: accounts } = await get<{ results: RawCreditAccount[] }>(
        creds,
        `/accounts?itemId=${itemId}`
      )
      for (const account of accounts) {
        if (account.type !== 'BANK' && account.type !== 'CREDIT') continue
        const name = [account.marketingName || account.name, account.number]
          .filter(Boolean)
          .join(' · ')
        const credit = account.type === 'CREDIT' ? await creditInfo(creds, account) : null
        data.accounts.push({
          id: account.id,
          itemId,
          bank,
          name,
          type: account.type,
          ...(credit?.closingDay ? { closingDay: credit.closingDay } : {}),
          ...(credit?.dueDay ? { dueDay: credit.dueDay } : {})
        })

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
              totalAmount: meta?.totalAmount,
              totalInstallments: meta?.totalInstallments,
              invoiceDate: meta?.billId ? credit?.dueByBill.get(meta.billId) : undefined
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

// ---------- Investimentos ----------

export type PluggyInvestment = {
  id: string
  bank: string
  name: string
  /** ticker (PETR4) quando a Pluggy manda */
  code?: string
  type: string
  subtype?: string
  /** saldo bruto de hoje, em reais como a Pluggy manda */
  balance: number
  /** quanto foi aplicado, em reais */
  amountOriginal?: number
  quantity?: number
  /** preço da cota, em reais */
  value?: number
  /** YYYY-MM-DD */
  purchaseDate?: string
  dueDate?: string
  rateType?: string
  rate?: number
  fixedAnnualRate?: number
}

export type PluggyInvestments = { investments: PluggyInvestment[]; errors: string[] }

type RawInvestment = {
  id: string
  name?: string
  code?: string | null
  type: string
  subtype?: string | null
  status?: string | null
  balance?: number | null
  amount?: number | null
  amountOriginal?: number | null
  quantity?: number | null
  value?: number | null
  purchaseDate?: string | null
  issueDate?: string | null
  dueDate?: string | null
  rateType?: string | null
  rate?: number | null
  fixedAnnualRate?: number | null
}

const optional = <T>(value: T | null | undefined): T | undefined => value ?? undefined
const optionalDate = (value: string | null | undefined): string | undefined =>
  value ? saoPauloDate(value) : undefined

/** Posições de investimento de todos os itens (só as ativas e com saldo). */
export async function fetchPluggyInvestments(creds: PluggyCredentials): Promise<PluggyInvestments> {
  requireCredentials(creds)
  const data: PluggyInvestments = { investments: [], errors: [] }

  for (const itemId of creds.itemIds) {
    let bank = itemId
    try {
      bank = (await get<RawItem>(creds, `/items/${itemId}`)).connector?.name ?? itemId
      for (let page = 1, pages = 1; page <= pages && page <= 20; page++) {
        const result = await get<{ results: RawInvestment[]; totalPages?: number }>(
          creds,
          `/investments?itemId=${itemId}&pageSize=500&page=${page}`
        )
        pages = result.totalPages ?? 1
        for (const i of result.results) {
          const balance = i.balance ?? i.amount ?? 0
          if ((i.status && i.status !== 'ACTIVE') || balance <= 0) continue
          data.investments.push({
            id: i.id,
            bank,
            name: (i.name ?? '').trim() || i.code || 'Investimento',
            code: optional(i.code)?.trim().toUpperCase() || undefined,
            type: i.type,
            subtype: optional(i.subtype),
            balance,
            amountOriginal: optional(i.amountOriginal),
            quantity: optional(i.quantity),
            value: optional(i.value),
            purchaseDate: optionalDate(i.purchaseDate ?? i.issueDate),
            dueDate: optionalDate(i.dueDate),
            rateType: optional(i.rateType),
            rate: optional(i.rate),
            fixedAnnualRate: optional(i.fixedAnnualRate)
          })
        }
      }
    } catch (error) {
      data.errors.push(`${bank}: ${(error as Error).message}`)
    }
  }
  return data
}

// ---------- Cartões ----------

export type PluggyCard = {
  id: string
  bank: string
  /** nome do produto (ex.: "Ultravioleta", "Elo Mais") */
  name: string
  /** só os 4 últimos dígitos, quando o banco manda */
  last4?: string
  /** bandeira como a Pluggy manda (VISA, MASTERCARD, ELO…) */
  brand?: string
  /** nível (GOLD, PLATINUM, BLACK…) */
  level?: string
  closingDay?: number
  dueDay?: number
  /** limite total, em reais */
  creditLimit?: number
}

export type PluggyCards = { cards: PluggyCard[]; errors: string[] }

type RawCreditAccount = RawAccount & {
  creditData?: {
    brand?: string | null
    level?: string | null
    balanceCloseDate?: string | null
    balanceDueDate?: string | null
    creditLimit?: number | null
  } | null
}

const dayOf = (iso: string | null | undefined): number | undefined =>
  iso ? Number(saoPauloDate(iso).slice(8, 10)) : undefined

/** Cartões de crédito de todos os itens, com bandeira, final, fechamento, vencimento e limite. */
export async function fetchPluggyCards(creds: PluggyCredentials): Promise<PluggyCards> {
  requireCredentials(creds)
  const data: PluggyCards = { cards: [], errors: [] }
  for (const itemId of creds.itemIds) {
    let bank = itemId
    try {
      bank = (await get<RawItem>(creds, `/items/${itemId}`)).connector?.name ?? itemId
      const { results } = await get<{ results: RawCreditAccount[] }>(
        creds,
        `/accounts?itemId=${itemId}&type=CREDIT`
      )
      for (const account of results) {
        if (account.type !== 'CREDIT') continue
        // O número vem mascarado ou só com o final; guarda só os 4 últimos dígitos.
        const digits = (account.number ?? '').replace(/\D/g, '')
        const credit = account.creditData ?? undefined
        data.cards.push({
          id: account.id,
          bank,
          name: (account.marketingName || account.name || '').trim(),
          last4: digits.length >= 4 ? digits.slice(-4) : undefined,
          brand: credit?.brand ?? undefined,
          level: credit?.level ?? undefined,
          closingDay: dayOf(credit?.balanceCloseDate),
          dueDay: dayOf(credit?.balanceDueDate),
          creditLimit: credit?.creditLimit ?? undefined
        })
      }
    } catch (error) {
      data.errors.push(`${bank}: ${(error as Error).message}`)
    }
  }
  return data
}
