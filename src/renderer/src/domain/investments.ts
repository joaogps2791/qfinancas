// Regras de investimentos: carteira (preço médio), renda fixa estimada, IR e proventos.
// Dinheiro sempre em centavos inteiros; quantidade pode ter casas decimais (ETF, fração).

import { monthKey, shiftMonthKey } from './finance'

export type AssetType =
  'acao' | 'fii' | 'etf' | 'tesouro' | 'cdb' | 'lci_lca' | 'poupanca' | 'outro'

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  acao: 'Ações',
  fii: 'FIIs',
  etf: 'ETFs',
  tesouro: 'Tesouro',
  cdb: 'CDB',
  lci_lca: 'LCI/LCA',
  poupanca: 'Poupança',
  outro: 'Outros'
}

/** Ativos de renda variável (com cotação), lançados como compra e venda. */
export const VARIABLE_TYPES: AssetType[] = ['acao', 'fii', 'etf', 'outro']
/** Ativos de renda fixa, lançados como aplicação. */
export const FIXED_TYPES: AssetType[] = ['tesouro', 'cdb', 'lci_lca', 'poupanca', 'outro']

export type InvestmentTransaction = {
  id: string
  /** aporte/resgate valem como compra/venda (para ativos sem cotação, use quantidade 1) */
  type: 'compra' | 'venda' | 'aporte' | 'resgate'
  assetType: AssetType
  /** ticker em maiúsculas (PETR4) ou o nome do ativo */
  ticker: string
  quantity: number
  unitPriceCents: number
  feesCents: number
  date: string
  broker?: string
}

export type Position = {
  ticker: string
  assetType: AssetType
  quantity: number
  /** custo das cotas que ainda estão na carteira (compras + taxas, tirando o custo das vendidas) */
  totalCostCents: number
  /** preço médio por cota, arredondado para exibir */
  avgPriceCents: number
  /** lucro ou prejuízo das vendas já feitas */
  realizedCents: number
  /** vendeu mais do que tinha: provavelmente faltou lançar uma compra */
  oversold: boolean
}

const isBuy = (t: InvestmentTransaction): boolean => t.type === 'compra' || t.type === 'aporte'
// Evita sobra de 0,0000000001 cota por causa de ponto flutuante.
const cleanQty = (q: number): number => Math.round(q * 1e8) / 1e8

/**
 * Posição de cada ativo a partir das operações. Preço médio ponderado incluindo taxas;
 * a venda não muda o preço médio, só tira das cotas o custo proporcional.
 */
export function computePositions(transactions: InvestmentTransaction[]): Position[] {
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date))
  const map = new Map<string, Position>()

  for (const t of sorted) {
    const key = t.ticker.trim().toUpperCase()
    const p =
      map.get(key) ??
      ({
        ticker: key,
        assetType: t.assetType,
        quantity: 0,
        totalCostCents: 0,
        avgPriceCents: 0,
        realizedCents: 0,
        oversold: false
      } satisfies Position)
    const gross = Math.round(t.quantity * t.unitPriceCents)

    if (isBuy(t)) {
      p.quantity = cleanQty(p.quantity + t.quantity)
      p.totalCostCents += gross + t.feesCents
    } else {
      const sold = Math.min(t.quantity, p.quantity)
      if (t.quantity > p.quantity) p.oversold = true
      const costRemoved = p.quantity > 0 ? Math.round((p.totalCostCents * sold) / p.quantity) : 0
      const proceeds = Math.round(sold * t.unitPriceCents) - t.feesCents
      p.realizedCents += proceeds - costRemoved
      p.totalCostCents -= costRemoved
      p.quantity = cleanQty(p.quantity - sold)
      if (p.quantity === 0) p.totalCostCents = 0
    }
    p.avgPriceCents = p.quantity > 0 ? Math.round(p.totalCostCents / p.quantity) : 0
    map.set(key, p)
  }
  return [...map.values()].sort((a, b) => a.ticker.localeCompare(b.ticker))
}

/** Quanto foi investido (compras e aportes, com taxas) num mês, por ativo. */
export function contributionsInMonth(
  transactions: InvestmentTransaction[],
  fixed: FixedIncome[],
  month: string
): { ticker: string; assetType: AssetType; cents: number }[] {
  const items = transactions
    .filter((t) => isBuy(t) && monthKey(t.date) === month)
    .map((t) => ({
      ticker: t.ticker.trim().toUpperCase(),
      assetType: t.assetType,
      cents: Math.round(t.quantity * t.unitPriceCents) + t.feesCents
    }))
  const fixedItems = fixed
    .filter((f) => monthKey(f.startDate) === month)
    .map((f) => ({ ticker: f.name, assetType: f.assetType, cents: f.investedCents }))
  return [...items, ...fixedItems]
}

// ---------- Renda fixa ----------

export type Indexer = 'cdi' | 'selic' | 'ipca' | 'prefixado' | 'poupanca'

export const INDEXER_LABELS: Record<Indexer, string> = {
  cdi: '% do CDI',
  selic: '% da Selic',
  ipca: 'IPCA + % a.a.',
  prefixado: 'Prefixado % a.a.',
  poupanca: 'Poupança'
}

export type FixedIncome = {
  id: string
  name: string
  assetType: AssetType
  indexer: Indexer
  /** cdi/selic: percentual do índice (110 = 110% do CDI); ipca/prefixado: % ao ano */
  rate: number
  investedCents: number
  startDate: string
  maturityDate?: string
  liquidity?: string
}

/** Taxa de um dia (Selic/CDI, % ao dia útil) ou de um mês (IPCA, % ao mês, data = dia 1). */
export type RatePoint = { date: string; value: number }
export type RateSeries = { cdi: RatePoint[]; selic: RatePoint[]; ipca: RatePoint[] }

export type FixedIncomeEstimate = {
  grossCents: number
  gainCents: number
  irRate: number
  irCents: number
  netCents: number
  days: number
}

const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000)

/** IR regressivo pelo prazo da aplicação. LCI/LCA e poupança são isentas. */
export function irRateFor(assetType: AssetType, days: number): number {
  if (assetType === 'lci_lca' || assetType === 'poupanca') return 0
  if (days <= 180) return 0.225
  if (days <= 360) return 0.2
  if (days <= 720) return 0.175
  return 0.15
}

/**
 * Valor estimado hoje: aplicado corrigido pela taxa contratada. Estimativa, sem marcação a
 * mercado. Os dias úteis vêm da própria série do CDI (o BCB só publica dias úteis).
 */
export function estimateFixedIncome(
  fi: FixedIncome,
  rates: RateSeries,
  today: string
): FixedIncomeEstimate {
  const end = fi.maturityDate && fi.maturityDate < today ? fi.maturityDate : today
  const inRange = (p: RatePoint): boolean => p.date >= fi.startDate && p.date < end
  const businessDays = rates.cdi.filter(inRange).length
  const calendarDays = Math.max(0, daysBetween(fi.startDate, end))
  // Sem a série (offline), aproxima dias úteis por dias corridos.
  const years = businessDays > 0 ? businessDays / 252 : calendarDays / 365

  let factor = 1
  if (fi.indexer === 'cdi' || fi.indexer === 'selic') {
    for (const p of rates[fi.indexer].filter(inRange))
      factor *= 1 + (p.value / 100) * (fi.rate / 100)
  } else if (fi.indexer === 'ipca') {
    // shortcut: só meses inteiros de IPCA já publicados, sem pró-rata do mês corrente
    const startMonth = fi.startDate.slice(0, 7)
    for (const p of rates.ipca) {
      if (p.date.slice(0, 7) >= startMonth && p.date.slice(0, 7) < end.slice(0, 7))
        factor *= 1 + p.value / 100
    }
    factor *= (1 + fi.rate / 100) ** years
  } else if (fi.indexer === 'prefixado') {
    factor = (1 + fi.rate / 100) ** years
  } else {
    // shortcut: poupança = 0,5% por mês completo, sem TR (vale enquanto a Selic estiver acima de 8,5%)
    factor = 1.005 ** Math.floor(calendarDays / 30)
  }

  const grossCents = Math.round(fi.investedCents * factor)
  const gainCents = grossCents - fi.investedCents
  const irRate = irRateFor(fi.assetType, calendarDays)
  const irCents = gainCents > 0 ? Math.round(gainCents * irRate) : 0
  return {
    grossCents,
    gainCents,
    irRate,
    irCents,
    netCents: grossCents - irCents,
    days: calendarDays
  }
}

/** "13/11/2026" (formato do BCB) → "2026-11-13" */
export const bcbDateToIso = (date: string): string => {
  const [d, m, y] = date.split('/')
  return `${y}-${m}-${d}`
}

// ---------- Proventos ----------

export type Dividend = {
  id: string
  ticker: string
  type: 'rendimento' | 'dividendo' | 'jcp'
  amountCents: number
  paymentDate: string
  exDate?: string
}

export const DIVIDEND_TYPE_LABELS: Record<Dividend['type'], string> = {
  rendimento: 'Rendimento',
  dividendo: 'Dividendo',
  jcp: 'JCP'
}

/** Total recebido em cada um dos `count` meses que terminam em `lastMonth`. */
export function dividendsByMonth(
  dividends: Dividend[],
  lastMonth: string,
  count: number
): { month: string; cents: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const month = shiftMonthKey(lastMonth, i - count + 1)
    const cents = dividends
      .filter((d) => monthKey(d.paymentDate) === month)
      .reduce((sum, d) => sum + d.amountCents, 0)
    return { month, cents }
  })
}

/** Proventos dos últimos 12 meses sobre o custo atual do ativo (0.08 = 8%). */
export function yieldOnCost(
  dividends: Dividend[],
  position: Position,
  today: string
): number | null {
  if (position.totalCostCents <= 0) return null
  const from = shiftMonthKey(monthKey(today), -11)
  const total = dividends
    .filter(
      (d) =>
        d.ticker === position.ticker && monthKey(d.paymentDate) >= from && d.paymentDate <= today
    )
    .reduce((sum, d) => sum + d.amountCents, 0)
  return total / position.totalCostCents
}

/** O último provento lançado para o ticker (para o "repetir o último valor"). */
export const lastDividend = (dividends: Dividend[], ticker: string): Dividend | undefined =>
  dividends
    .filter((d) => d.ticker === ticker)
    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))[0]

/**
 * Quantidade ou taxa digitada: "10", "0,5", "0.5", "1.000,5". O ponto só é milhar quando
 * também há vírgula (assim "0.5" não vira 5). Zero, negativo ou texto → null.
 */
export function parseQuantity(text: string): number | null {
  const clean = text.trim()
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null
  const value = Number(normalized)
  return value > 0 ? value : null
}
