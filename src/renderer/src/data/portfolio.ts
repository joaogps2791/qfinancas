// Carteira com valores do dia: posições + cotações (brapi) e renda fixa + taxas (Banco Central).
// Usado pela tela de Investimentos e pelas metas ligadas a um ativo.
import { useEffect, useMemo, useState } from 'react'
import { friendlyError, useApp } from './store'
import { todayISO } from '../domain/finance'
import {
  computePositions,
  estimateFixedIncome,
  type FixedIncome,
  type Position,
  type RateSeries
} from '../domain/investments'
import { goalProgress, type Goal, type GoalProgress } from '../domain/planning'
import type { Quote, QuotesResult } from '../../../main/market'

const EMPTY_QUOTES: QuotesResult = { quotes: {}, errors: {} }

function useQuotes(tickers: string[]): {
  result: QuotesResult
  loading: boolean
  refresh: () => void
} {
  const key = tickers.join(',')
  const [state, setState] = useState<{ key: string; result: QuotesResult } | null>(null)
  const [forcing, setForcing] = useState(false)

  const load = (force: boolean): Promise<void> =>
    window.api.market
      .quotes(key.split(','), force)
      .then((result) => setState({ key, result }))
      .catch((e) => setState({ key, result: { quotes: {}, errors: { '': friendlyError(e) } } }))

  useEffect(() => {
    if (!key) return
    let alive = true
    window.api.market
      .quotes(key.split(','))
      .then((result) => alive && setState({ key, result }))
      .catch(
        (e) => alive && setState({ key, result: { quotes: {}, errors: { '': friendlyError(e) } } })
      )
    return () => {
      alive = false
    }
  }, [key])

  const refresh = (): void => {
    setForcing(true)
    load(true).finally(() => setForcing(false))
  }

  return {
    result: state?.result ?? EMPTY_QUOTES,
    loading: forcing || (!!key && state?.key !== key),
    refresh
  }
}

function useRates(fixed: FixedIncome[]): { rates: RateSeries; error: string | null } {
  const from = fixed.map((f) => f.startDate).sort()[0] ?? ''
  const [state, setState] = useState<{ rates: RateSeries; error: string | null }>({
    rates: { cdi: [], selic: [], ipca: [] },
    error: null
  })
  useEffect(() => {
    if (!from) return
    let alive = true
    window.api.market
      .rates(from)
      .then((rates) => alive && setState({ rates, error: null }))
      .catch((e) => alive && setState((s) => ({ ...s, error: friendlyError(e) })))
    return () => {
      alive = false
    }
  }, [from])
  return state
}

export type AssetRow = Position & { quote?: Quote; valueCents: number; resultCents: number }
export type FixedRow = FixedIncome & { estimate: ReturnType<typeof estimateFixedIncome> }

export type Portfolio = {
  /** posições abertas */
  open: Position[]
  assets: AssetRow[]
  fixed: FixedRow[]
  quoteTickers: string[]
  quotes: QuotesResult
  /** carteira inteira hoje (renda variável pela cotação, renda fixa pela estimativa) */
  valueCents: number
  /** quanto custou o que ainda está na carteira */
  costCents: number
  loading: boolean
  refresh: () => void
  ratesError: string | null
}

/** Com `enabled` falso não busca cotação nem taxa (ex.: Dashboard sem meta ligada à carteira). */
export function usePortfolio(enabled = true): Portfolio {
  const { investmentTransactions, fixedIncome } = useApp((s) => s.investments)
  const today = todayISO()
  const positions = useMemo(
    () => computePositions(investmentTransactions),
    [investmentTransactions]
  )
  const open = positions.filter((p) => p.quantity > 0)
  const quoteTickers = open.filter((p) => p.assetType !== 'outro').map((p) => p.ticker)
  const { result: quotes, loading, refresh } = useQuotes(enabled ? quoteTickers : [])
  const { rates, error: ratesError } = useRates(enabled ? fixedIncome : [])

  // Sem cotação, o ativo entra pelo custo.
  const assets: AssetRow[] = open.map((p) => {
    const quote = quotes.quotes[p.ticker]
    const valueCents = quote ? Math.round(p.quantity * quote.priceCents) : p.totalCostCents
    return { ...p, quote, valueCents, resultCents: valueCents - p.totalCostCents }
  })
  const fixed: FixedRow[] = fixedIncome
    .map((f) => ({ ...f, estimate: estimateFixedIncome(f, rates, today) }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate))

  const valueCents =
    assets.reduce((s, a) => s + a.valueCents, 0) +
    fixed.reduce((s, f) => s + f.estimate.grossCents, 0)
  const costCents =
    assets.reduce((s, a) => s + a.totalCostCents, 0) +
    fixed.reduce((s, f) => s + f.investedCents, 0)

  return {
    open,
    assets,
    fixed,
    quoteTickers,
    quotes,
    valueCents,
    costCents,
    loading,
    refresh,
    ratesError
  }
}

/** Valor de hoje do ativo ligado a uma meta ("ticker:HGLG11" ou "fixed:{id}"); null se sumiu. */
export function linkedValue(portfolio: Portfolio, link: string): number | null {
  if (link.startsWith('ticker:')) {
    return portfolio.assets.find((a) => a.ticker === link.slice(7))?.valueCents ?? null
  }
  if (link.startsWith('fixed:')) {
    return portfolio.fixed.find((f) => f.id === link.slice(6))?.estimate.grossCents ?? null
  }
  return null
}

export type GoalView = {
  goal: Goal
  progress: GoalProgress
  linkLabel?: string
  linkMissing: boolean
}

/** Metas com o quanto já foi guardado: à mão, ou o valor de hoje do ativo ligado. */
export function useGoals(): GoalView[] {
  const goals = useApp((s) => s.goals)
  const portfolio = usePortfolio(goals.some((g) => g.link))
  const today = todayISO()
  return [...goals]
    .sort((a, b) => a.targetDate.localeCompare(b.targetDate))
    .map((goal) => {
      const value = goal.link ? linkedValue(portfolio, goal.link) : goal.savedCents
      return {
        goal,
        progress: goalProgress(goal, value ?? 0, today),
        linkLabel: goal.link ? linkLabel(portfolio, goal.link) : undefined,
        linkMissing: value === null
      }
    })
}

export function linkLabel(portfolio: Portfolio, link: string): string {
  if (link.startsWith('ticker:')) return link.slice(7)
  return portfolio.fixed.find((f) => f.id === link.slice(6))?.name ?? 'Renda fixa'
}
