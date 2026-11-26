// Transações do Open Finance (Meu Pluggy) → linhas da prévia da importação (Fase 6).
import type { PluggyData, PluggyInvestment } from '../../../main/pluggy'
import { suggestInvoiceDate } from './finance'
import type { ImportRow } from './importer'
import type { AssetType, FixedIncome, Indexer, InvestmentTransaction } from './investments'

/**
 * Converte as transações de uma conta da Pluggy. Negativo = saída, como no resto da importação.
 * - Conta: `type` DEBIT é saída e CREDIT é entrada.
 * - Cartão: valor positivo é gasto e negativo é pagamento/estorno (documentação da Pluggy).
 *   A data da linha é a da compra (bate com o que foi lançado à mão, parcelas inclusive) e a
 *   fatura sai da data de lançamento e do fechamento do cartão, quando ele está configurado.
 */
export function pluggyRows(
  data: PluggyData,
  accountId: string,
  card?: { closingDay?: number; dueDay?: number }
): ImportRow[] {
  const account = data.accounts.find((a) => a.id === accountId)
  if (!account) return []
  return data.transactions
    .filter((t) => t.accountId === accountId)
    .map((t) => {
      // A Pluggy manda reais com casas decimais; só aqui vira centavo inteiro.
      const cents = Math.round(Math.abs(t.amount) * 100)
      const parcel =
        t.totalInstallments && t.totalInstallments > 1
          ? ` (${t.installmentNumber}/${t.totalInstallments})`
          : ''
      const description = `${t.description || 'Sem descrição'}${parcel}`
      if (account.type === 'BANK') {
        return { date: t.date, description, amountCents: t.type === 'DEBIT' ? -cents : cents }
      }
      return {
        date: t.purchaseDate ?? t.date,
        description,
        amountCents: t.amount > 0 ? -cents : cents,
        invoiceDate:
          card?.closingDay && card.dueDay
            ? suggestInvoiceDate(t.date, card.closingDay, card.dueDay)
            : undefined
      }
    })
    .filter((row) => row.amountCents !== 0)
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ---------- Investimentos (Pluggy × carteira lançada à mão) ----------

export type HoldingDraft =
  | { kind: 'operation'; data: Omit<InvestmentTransaction, 'id'> }
  | { kind: 'fixed'; data: Omit<FixedIncome, 'id'> }

export type HoldingMatch = {
  investment: PluggyInvestment
  /** saldo bruto de hoje na Pluggy */
  pluggyCents: number
  /** valor de hoje no app; null = não lançado */
  appCents: number | null
  appName?: string
  /** como entraria na carteira, para revisar no formulário antes de salvar */
  draft: HoldingDraft
}

const cents = (reais: number): number => Math.round(reais * 100)
const normalize = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

function variableType(i: PluggyInvestment): AssetType {
  if (i.type === 'ETF') return 'etf'
  if (i.type !== 'EQUITY') return 'outro'
  if (i.subtype === 'REAL_ESTATE_FUND') return 'fii'
  if (i.subtype === 'STOCK' || i.subtype === 'BDR') return 'acao'
  return i.code?.endsWith('11') ? 'fii' : 'acao'
}

function fixedType(subtype = ''): AssetType {
  if (subtype === 'TREASURY') return 'tesouro'
  if (subtype === 'CDB') return 'cdb'
  if (subtype === 'LCI' || subtype === 'LCA') return 'lci_lca'
  return 'outro'
}

/** cdi/selic: % do índice (110); ipca/prefixado: % ao ano. Sem indexador conhecido, prefixado. */
function fixedRate(i: PluggyInvestment): { indexer: Indexer; rate: number } {
  const type = (i.rateType ?? '').toUpperCase()
  if (type.includes('CDI')) return { indexer: 'cdi', rate: i.rate ?? 100 }
  if (type.includes('SELIC')) return { indexer: 'selic', rate: i.rate ?? 100 }
  if (type.includes('IPCA')) return { indexer: 'ipca', rate: i.fixedAnnualRate ?? i.rate ?? 0 }
  return { indexer: 'prefixado', rate: i.fixedAnnualRate ?? i.rate ?? 0 }
}

function draftOf(i: PluggyInvestment, today: string): HoldingDraft {
  const date = i.purchaseDate ?? today
  if (i.type === 'FIXED_INCOME') {
    return {
      kind: 'fixed',
      data: {
        name: i.name,
        assetType: fixedType(i.subtype),
        ...fixedRate(i),
        investedCents: cents(i.amountOriginal ?? i.balance),
        startDate: date,
        maturityDate: i.dueDate && i.dueDate > date ? i.dueDate : undefined
      }
    }
  }
  // Fundos, previdência e COE não têm cota na brapi: entram como "Outros", 1 cota pelo aplicado.
  const quantity = i.quantity && i.quantity > 0 && i.type !== 'MUTUAL_FUND' ? i.quantity : 1
  const invested = i.amountOriginal ?? (quantity === 1 ? i.balance : (i.value ?? 0) * quantity)
  return {
    kind: 'operation',
    data: {
      type: 'compra',
      assetType: variableType(i),
      ticker: (i.code ?? i.name).toUpperCase(),
      quantity,
      unitPriceCents: Math.round(cents(invested || i.balance) / quantity),
      feesCents: 0,
      date,
      broker: i.bank
    }
  }
}

/**
 * Liga cada investimento da Pluggy ao que foi lançado à mão: renda variável pelo ticker, renda
 * fixa pelo nome (igual ou um contendo o outro). Cada item do app é usado uma vez só.
 */
export function compareHoldings(
  investments: PluggyInvestment[],
  app: {
    assets: { ticker: string; valueCents: number }[]
    fixed: { id: string; name: string; grossCents: number }[]
  },
  today: string
): HoldingMatch[] {
  const used = new Set<string>()
  return investments
    .map((investment) => {
      const draft = draftOf(investment, today)
      let found: { key: string; name: string; cents: number } | undefined
      if (draft.kind === 'operation') {
        const asset = app.assets.find((a) => a.ticker === draft.data.ticker)
        if (asset) found = { key: `t:${asset.ticker}`, name: asset.ticker, cents: asset.valueCents }
      } else {
        const target = normalize(investment.name)
        const fixed = app.fixed.find((f) => {
          const name = normalize(f.name)
          if (used.has(`f:${f.id}`) || !name || !target) return false
          return (
            name === target ||
            (Math.min(name.length, target.length) >= 4 &&
              (name.includes(target) || target.includes(name)))
          )
        })
        if (fixed) found = { key: `f:${fixed.id}`, name: fixed.name, cents: fixed.grossCents }
      }
      if (found && used.has(found.key)) found = undefined
      if (found) used.add(found.key)
      return {
        investment,
        pluggyCents: cents(investment.balance),
        appCents: found?.cents ?? null,
        appName: found?.name,
        draft
      }
    })
    .sort((a, b) => b.pluggyCents - a.pluggyCents)
}
