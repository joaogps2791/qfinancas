// Open Finance (Meu Pluggy) → prévia da importação, carteira de investimentos e cartões.

/** Desligado a pedido do João (26/11/2026): some das telas, mas o código fica para religar. */
export const OPEN_FINANCE = false
import type { PluggyCard, PluggyData, PluggyInvestment } from '../../../main/pluggy'
import { normalizeText as plain, type Card } from './categories'
import { issuerOf, type Issuer, type Network } from './cardSkins'
import { suggestInvoiceDate } from './finance'
import type { ImportRow } from './importer'
import type { AssetType, FixedIncome, Indexer, InvestmentTransaction } from './investments'

/**
 * Converte as transações de uma conta da Pluggy. Negativo = saída, como no resto da importação.
 * - Conta: `type` DEBIT é saída e CREDIT é entrada.
 * - Cartão: valor positivo é gasto e negativo é pagamento/estorno (documentação da Pluggy).
 *   A data da linha é a da compra (bate com o que foi lançado à mão). A fatura é a que o banco
 *   informa; sem ela, sai da data de lançamento e dos dias de fechamento e vencimento (os do
 *   banco ou, sem eles, os do cartão no app).
 * - Cartão parcelado: a Pluggy manda cada parcela como uma transação ("4/10" de R$ 120). As
 *   parcelas da mesma compra viram UMA compra parcelada, como no lançamento à mão, mas começando
 *   na parcela mais antiga que o banco mostrou (as anteriores já foram pagas e não entram): a 4/10
 *   fica na fatura dela e as próximas, uma em cada fatura seguinte.
 */
export function pluggyRows(
  data: PluggyData,
  accountId: string,
  card?: { closingDay?: number; dueDay?: number }
): ImportRow[] {
  const account = data.accounts.find((a) => a.id === accountId)
  if (!account) return []
  const closingDay = account.closingDay ?? card?.closingDay
  const dueDay = account.dueDay ?? card?.dueDay
  const invoiceOf = (t: PluggyData['transactions'][number]): string | undefined =>
    t.invoiceDate ??
    (closingDay && dueDay ? suggestInvoiceDate(t.date, closingDay, dueDay) : undefined)

  const rows: ImportRow[] = []
  const purchases = new Map<string, { number: number; row: ImportRow }>()
  for (const t of data.transactions.filter((t) => t.accountId === accountId)) {
    // A Pluggy manda reais com casas decimais; só aqui vira centavo inteiro.
    const cents = Math.round(Math.abs(t.amount) * 100)
    const label = t.description || 'Sem descrição'
    const total = t.totalInstallments ?? 1
    if (account.type === 'BANK') {
      rows.push({
        date: t.date,
        description: total > 1 ? `${label} (${t.installmentNumber}/${total})` : label,
        amountCents: t.type === 'DEBIT' ? -cents : cents
      })
      continue
    }
    if (total < 2 || t.amount <= 0) {
      rows.push({
        date: t.purchaseDate ?? t.date,
        description: label,
        amountCents: t.amount > 0 ? -cents : cents,
        invoiceDate: invoiceOf(t)
      })
      continue
    }
    const number = t.installmentNumber ?? 1
    const description = label.replace(INSTALLMENT_SUFFIX, '') || label
    const date = t.purchaseDate ?? t.date
    const key = `${date}|${plain(description)}|${total}|${cents}`
    const known = purchases.get(key)
    if (known && known.number <= number) continue
    purchases.set(key, {
      number,
      row: {
        date,
        description,
        amountCents: -(t.totalAmount ? Math.round(Math.abs(t.totalAmount) * 100) : cents * total),
        installments: total,
        ...(number > 1 ? { firstInstallment: number } : {}),
        invoiceDate: invoiceOf(t)
      }
    })
  }
  return [...rows, ...[...purchases.values()].map((p) => p.row)]
    .filter((row) => row.amountCents !== 0)
    .sort((a, b) => a.date.localeCompare(b.date))
}

// "LOJA X PARC 03/05", "Loja X 3/5", "Loja X - 03/05": o número da parcela que alguns bancos
// põem no texto (a parcela já vem nos campos da Pluggy).
const INSTALLMENT_SUFFIX = /\s*-?\s*(?:parc(?:ela)?\.?\s*)?\d{1,2}\s*\/\s*\d{1,2}\s*$/i

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
    .replace(/[\u0300-\u036f]/g, '')
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

// ---------- Cartões ----------

export type CardMatch = {
  source: PluggyCard
  /** nome do cartão do app que já é este; sem ele, falta cadastrar */
  existing?: string
  /** como entraria no app, para conferir no cadastro antes de salvar */
  draft: Card
}

// Nomes que os conectores usam e que não batem direto com o rótulo do banco.
const ISSUER_ALIASES: [RegExp, Issuer][] = [
  [/nu ?pagamentos|nubank|\bnu\b/, 'nubank'],
  [/itau/, 'itau'],
  [/banco ?inter|\binter\b/, 'inter'],
  [/\bc6\b/, 'c6'],
  [/santander/, 'santander'],
  [/bradesco/, 'bradesco'],
  [/banco do brasil|\bbb\b/, 'bb'],
  [/caixa/, 'caixa'],
  [/picpay/, 'picpay'],
  [/mercado ?pago/, 'mercadopago'],
  [/\bxp\b/, 'xp'],
  [/btg/, 'btg'],
  [/neon/, 'neon']
]

export function issuerFromBank(bank: string): Issuer {
  const name = plain(bank)
  return ISSUER_ALIASES.find(([re]) => re.test(name))?.[1] ?? 'outro'
}

export function networkFromBrand(brand = ''): Network | undefined {
  const b = brand.toUpperCase()
  if (b.includes('VISA')) return 'visa'
  if (b.includes('MASTER')) return 'mastercard'
  if (b.includes('ELO')) return 'elo'
  if (b.includes('AMEX') || b.includes('AMERICAN')) return 'amex'
  if (b.includes('HIPER')) return 'hipercard'
  return undefined
}

const title = (text: string): string =>
  text.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())

/**
 * Cartões da Pluggy ao lado dos do app. Já cadastrado = mesmo final de 4 dígitos ou, quando um
 * dos dois não tem final, o mesmo banco (para não criar o mesmo cartão duas vezes).
 */
export function compareCards(cards: PluggyCard[], existing: Card[]): CardMatch[] {
  const taken = new Set(existing.map((c) => c.name.toLowerCase()))
  const used = new Set<string>()
  return cards.map((source) => {
    const issuer = issuerFromBank(source.bank)
    const same = existing.find(
      (c) =>
        !used.has(c.name) &&
        (source.last4 && c.last4
          ? c.last4 === source.last4
          : issuer !== 'outro' && (c.issuer ?? issuerFromBank(c.name)) === issuer)
    )
    if (same) used.add(same.name)

    const label = issuer === 'outro' ? source.bank : issuerOf({ issuer }).label
    let name = label
    if (taken.has(name.toLowerCase())) name = `${label} ${source.last4 ?? source.name}`.trim()
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${label} ${n}`
    taken.add(name.toLowerCase())

    const network = networkFromBrand(source.brand)
    // "Ultravioleta" + GOLD → "Ultravioleta Gold"; não repete o nível se ele já está no nome.
    const level = source.level && !plain(source.name).includes(plain(source.level))
    const nickname = [source.name, level ? title(source.level ?? '') : ''].join(' ').trim()
    const draft: Card = {
      name,
      color: issuerOf({ issuer }).color,
      issuer,
      ...(network ? { network } : {}),
      ...(source.last4 ? { last4: source.last4 } : {}),
      ...(nickname ? { nickname } : {}),
      ...(source.closingDay ? { closingDay: source.closingDay } : {}),
      ...(source.dueDay ? { dueDay: source.dueDay } : {}),
      ...(source.creditLimit ? { limitCents: Math.round(source.creditLimit * 100) } : {})
    }
    return { source, existing: same?.name, draft }
  })
}
