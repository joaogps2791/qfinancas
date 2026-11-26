// Importação de extrato (OFX e CSV). Funções puras: recebem o texto do arquivo e devolvem
// linhas { data, descrição, valor em centavos com sinal }. Negativo = saída.
import { classifyCategory, normalizeText } from './categories'
import { daysUntil, splitCents, type Transaction, type TransactionInput } from './finance'

export type ImportRow = {
  date: string
  description: string
  amountCents: number
  /** cartão: fatura desta linha (Open Finance); sem ela vale a fatura escolhida na tela */
  invoiceDate?: string
  /** cartão: compra parcelada (Open Finance); `amountCents` é o total da compra */
  installments?: number
  /** parcela da fatura `invoiceDate` (as anteriores já foram pagas e não entram) */
  firstInstallment?: number
  /** saldo que a conta tinha antes do primeiro lançamento do extrato */
  opening?: boolean
}

const OPENING_LINE = /^saldo (anterior|inicial)\b/
/** "Saldo do dia", "SALDO FINAL", "S A L D O": não é dinheiro entrando ou saindo. */
const BALANCE_LINE = /^(saldo|s a l d o)\b/

/** Linha com o saldo anterior, na data do primeiro lançamento. */
const openingRow = (date: string, amountCents: number): ImportRow => ({
  date,
  description: 'Saldo anterior',
  amountCents,
  opening: true
})

/** Bancos brasileiros ainda exportam em Windows-1252; tenta UTF-8 primeiro. */
export function decodeText(bytes: Uint8Array): string {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    text = new TextDecoder('windows-1252').decode(bytes)
  }
  // Tira o BOM (U+FEFF) que alguns bancos põem no começo do arquivo.
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

export const isOfx = (text: string): boolean => /<OFX>/i.test(text) || /^OFXHEADER:/m.test(text)

// ---------- Números e datas ----------

/**
 * "1.234,56", "-1234.56", "R$ 12,30", "(12,30)" e "12,30-" viram centavos com sinal.
 * Com ponto e vírgula juntos, o último é o decimal. Só vírgula: decimal. Só ponto: decimal,
 * a não ser que apareça mais de uma vez ("1.234.567").
 */
export function parseMoney(raw: string): number | null {
  // \s já inclui o espaço não separável que o Excel põe em "R$ 1.234,56".
  let text = raw.replace(/R\$|\s/g, '')
  if (!text) return null
  let negative = false
  if (/^\(.*\)$/.test(text)) {
    negative = true
    text = text.slice(1, -1)
  }
  if (text.endsWith('-')) {
    negative = true
    text = text.slice(0, -1)
  }
  if (/^[-+]/.test(text)) {
    negative = text[0] === '-'
    text = text.slice(1)
  }
  const lastDot = text.lastIndexOf('.')
  const lastComma = text.lastIndexOf(',')
  let decimal: string | null = null
  if (lastDot >= 0 && lastComma >= 0) decimal = lastDot > lastComma ? '.' : ','
  else if (lastComma >= 0) decimal = ','
  else if (lastDot >= 0 && text.indexOf('.') === lastDot) decimal = '.'
  const cut = decimal ? text.lastIndexOf(decimal) : text.length
  const digits = text.slice(0, cut).replace(/[.,]/g, '')
  const fraction = decimal ? text.slice(cut + 1) : ''
  if (!/^\d*$/.test(digits) || !/^\d*$/.test(fraction) || (!digits && !fraction)) return null
  // Mais de 2 casas (OFX às vezes manda "12.3400"): arredonda para centavos.
  const cents = Math.round(Number(`${digits || '0'}.${fraction || '0'}`) * 100)
  return negative ? -cents : cents
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** "31/12/2026", "31-12-26", "2026-12-31" e "20261231…" (OFX) viram "2026-12-31". */
export function parseDate(raw: string): string | null {
  const text = raw.trim()
  let y: number, m: number, d: number
  let match = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(text)
  if (match) {
    ;[y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  } else {
    // shortcut: assume dia/mês (padrão brasileiro); arquivo em mês/dia sai com data errada
    match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/.exec(text)
    if (!match) return null
    ;[d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])]
    if (y < 100) y += 2000
  }
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return `${y}-${pad(m)}-${pad(d)}`
}

// ---------- OFX ----------

export type OfxResult = { rows: ImportRow[]; isCard: boolean }

const decodeEntities = (text: string): string =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

/** Lê OFX 1.x (SGML, sem tags de fechamento) e 2.x (XML). */
export function parseOfx(text: string): OfxResult {
  const field = (block: string, tag: string): string =>
    new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i').exec(block)?.[1].trim() ?? ''
  const rows: ImportRow[] = []
  for (const raw of text.split(/<STMTTRN>/i).slice(1)) {
    const block = raw.split(/<\/STMTTRN>/i)[0]
    const date = parseDate(field(block, 'DTPOSTED'))
    const amountCents = parseMoney(field(block, 'TRNAMT'))
    const description = decodeEntities(field(block, 'MEMO') || field(block, 'NAME'))
    if (date && amountCents && !BALANCE_LINE.test(normalizeText(description))) {
      rows.push({ date, description, amountCents })
    }
  }
  const isCard = /<CREDITCARDMSGSRSV1>|<CCSTMTRS>/i.test(text)
  // Conta: o OFX traz o saldo final (LEDGERBAL); o anterior é ele menos os lançamentos.
  const ledger = /<LEDGERBAL>[\s\S]*?<BALAMT>([^<\r\n]*)/i.exec(text)
  const closing = ledger ? parseMoney(ledger[1].trim()) : null
  if (!isCard && closing !== null && rows.length) {
    const opening = closing - rows.reduce((s, r) => s + r.amountCents, 0)
    const first = rows.reduce((min, r) => (r.date < min ? r.date : min), rows[0].date)
    if (opening) rows.unshift(openingRow(first, opening))
  }
  return { rows, isCard }
}

// ---------- CSV ----------

/** Separa as células respeitando aspas. O separador (; , ou tab) é o que mais aparece na 1ª linha. */
export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const separator = [';', ',', '\t'].reduce((best, s) =>
    firstLine.split(s).length > firstLine.split(best).length ? s : best
  )
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const endRow = (): void => {
    row.push(cell.trim())
    if (row.some(Boolean)) rows.push(row)
    row = []
    cell = ''
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === separator) {
      row.push(cell.trim())
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      endRow()
    } else cell += c
  }
  endRow()
  return rows
}

/** Como ler as colunas de um CSV. Índices começam em 0; -1 = não usar. */
export type CsvMapping = {
  hasHeader: boolean
  date: number
  description: number
  /** valor com sinal, ou a coluna de débitos quando `credit` está definida */
  amount: number
  /** coluna separada de créditos (extratos com "Débito" e "Crédito") */
  credit: number
  /** coluna com o tipo ("D"/"C", "Débito"/"Crédito", "Saída"/"Entrada") */
  type: number
  /** coluna de saldo, para achar o saldo anterior (perfis antigos não têm) */
  balance?: number
  /** troca o sinal de tudo (ex.: fatura em que a compra vem positiva) */
  invert: boolean
}

type ColumnKey = 'date' | 'description' | 'amount' | 'credit' | 'type' | 'balance'

// O tipo vem antes do crédito: "Entrada/Saída" e "Crédito/Débito" são a coluna de tipo, não de valor.
const HEADER_GUESS: [ColumnKey, RegExp][] = [
  ['date', /^(data|date|dt)\b/],
  [
    'type',
    /^(tipo|natureza)|^(d|c|credito|debito|entrada|saida)\s*\/\s*(d|c|credito|debito|entrada|saida)\b/
  ],
  ['description', /descri|historico|lancamento|title|titulo|estabelecimento|memo/],
  ['credit', /^(credito|entrada)s?\b/],
  ['amount', /valor|amount|quantia|^(debito|saida)/],
  ['balance', /^saldo\b/]
]

/** Adivinha o mapeamento pelos nomes do cabeçalho. */
export function guessMapping(rows: string[][]): CsvMapping {
  const header = (rows[0] ?? []).map((h) => normalizeText(h).trim())
  const hasHeader = header.length > 0 && !header.some((h) => parseDate(h) || /^-?[\d.,]+$/.test(h))
  const mapping: CsvMapping = {
    hasHeader,
    date: 0,
    description: 1,
    amount: 2,
    credit: -1,
    type: -1,
    balance: -1,
    invert: false
  }
  if (!hasHeader) return mapping
  const used = new Set<number>()
  for (const [key, pattern] of HEADER_GUESS) {
    const index = header.findIndex((h, i) => !used.has(i) && pattern.test(h))
    if (index >= 0) {
      mapping[key] = index
      used.add(index)
    }
  }
  return mapping
}

const DEBIT_WORD = /^(d|deb|debito|saida|s|-)$/

/** Aplica o mapeamento; linhas sem data ou valor válidos são contadas em `skipped`. */
export function applyMapping(
  rows: string[][],
  mapping: CsvMapping
): { rows: ImportRow[]; skipped: number } {
  const out: ImportRow[] = []
  // saldo depois de cada linha de `out` (coluna de saldo), para calcular o anterior
  const balances: (number | null)[] = []
  let opening: number | null = null
  let skipped = 0
  const balanceCol = mapping.balance ?? -1
  for (const cells of mapping.hasHeader ? rows.slice(1) : rows) {
    const date = parseDate(cells[mapping.date] ?? '')
    const description = (cells[mapping.description] ?? '').replace(/\s+/g, ' ').trim()
    const balance = balanceCol >= 0 ? parseMoney(cells[balanceCol] ?? '') : null
    const line = normalizeText(description)
    if (BALANCE_LINE.test(line)) {
      // "Saldo anterior": o valor vem na coluna de saldo ou na de valor.
      if (OPENING_LINE.test(line) && opening === null) {
        opening = balance ?? parseMoney(cells[mapping.amount] ?? '')
      }
      continue
    }
    let amount = parseMoney(cells[mapping.amount] ?? '')
    if (mapping.credit >= 0) {
      const credit = parseMoney(cells[mapping.credit] ?? '')
      if (credit) amount = Math.abs(credit)
      else if (amount !== null) amount = -Math.abs(amount)
    }
    if (mapping.type >= 0 && amount !== null) {
      const kind = normalizeText(cells[mapping.type] ?? '').trim()
      amount = DEBIT_WORD.test(kind) ? -Math.abs(amount) : Math.abs(amount)
    }
    if (!date || !amount) {
      skipped++
      continue
    }
    out.push({ date, description, amountCents: mapping.invert ? -amount : amount })
    balances.push(balance)
  }
  if (out.length) {
    // Extrato do mais antigo para o mais novo, ou o contrário: o primeiro lançamento é o mais antigo.
    const oldest = out[0].date <= out[out.length - 1].date ? 0 : out.length - 1
    const after = balances[oldest]
    if (opening === null && after !== null) opening = after - out[oldest].amountCents
    if (opening) out.unshift(openingRow(out[oldest].date, opening))
  }
  return { rows: out, skipped }
}

// ---------- Duplicados ----------

const words = (text: string): Set<string> =>
  new Set(
    normalizeText(text)
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((t) => t.length > 1 && !/^\d+$/.test(t))
  )

/** Descrições parecidas: uma contém a outra, ou metade das palavras em comum. */
export function similarDescription(a: string, b: string): boolean {
  const na = normalizeText(a).replace(/[^a-z0-9]/g, '')
  const nb = normalizeText(b).replace(/[^a-z0-9]/g, '')
  if (!na || !nb) return na === nb
  if (na.includes(nb) || nb.includes(na)) return true
  const wa = words(a)
  const wb = words(b)
  const common = [...wa].filter((t) => wb.has(t)).length
  return common > 0 && common / Math.min(wa.size, wb.size) >= 0.5
}

export type Destination = 'account' | 'card'

/**
 * Lançamento já existente que parece ser esta linha: mesmo valor, data a até 1 dia e descrição
 * parecida. No cartão vale também o valor de uma parcela (a fatura mostra "2/5" com a parcela).
 */
export function findDuplicate(
  row: ImportRow,
  existing: Transaction[],
  destination: Destination
): Transaction | null {
  const value = Math.abs(row.amountCents)
  return (
    existing.find((t) => {
      if ((destination === 'card') !== (t.kind === 'card')) return false
      if (destination === 'account' && (t.kind === 'income') !== row.amountCents > 0) return false
      const amounts =
        t.kind === 'card' && t.installments > 1
          ? [t.amountCents, ...splitCents(t.amountCents, t.installments)]
          : [t.amountCents]
      return (
        amounts.includes(value) &&
        Math.abs(daysUntil(t.date, row.date)) <= 1 &&
        similarDescription(t.description, row.description)
      )
    }) ?? null
  )
}

// ---------- Prévia e conversão ----------

export type PreviewRow = ImportRow & {
  key: number
  include: boolean
  /** categoria (saídas) ou tipo de entrada (entradas na conta) */
  category: string
  duplicate: Transaction | null
  /** no cartão, pagamento da fatura e estorno (valores positivos) ficam de fora */
  ignored: boolean
}

const INCOME_GUESS: [string, RegExp][] = [
  ['Salário', /salario|folha|pagto sal|vencimento/],
  ['Reembolso', /reembolso|estorno|devolucao/],
  ['Investimentos', /rendimento|dividendo|jcp|resgate|juros/]
]

export function buildPreview(
  rows: ImportRow[],
  existing: Transaction[],
  destination: Destination,
  categories: string[]
): PreviewRow[] {
  return rows.map((row, key) => {
    const duplicate = findDuplicate(row, existing, destination)
    const ignored = destination === 'card' && (row.amountCents > 0 || !!row.opening)
    const text = normalizeText(row.description)
    const category =
      row.opening && row.amountCents > 0
        ? 'Saldo anterior'
        : row.amountCents < 0 || destination === 'card'
          ? classifyCategory(row.description, categories, 'Outros')
          : (INCOME_GUESS.find(([, p]) => p.test(text))?.[0] ?? 'Outros')
    return { ...row, key, duplicate, ignored, include: !duplicate && !ignored, category }
  })
}

export type ImportTarget =
  | { destination: 'account'; paymentMethod: string }
  | { destination: 'card'; card: string; invoiceDate: string }

/** Linha da prévia → lançamento. Na conta, crédito vira entrada; no cartão, compra em 1x ou parcelada. */
export function toTransaction(row: PreviewRow, target: ImportTarget): TransactionInput {
  const base = {
    description: row.description || 'Sem descrição',
    amountCents: Math.abs(row.amountCents),
    date: row.date
  }
  if (target.destination === 'card') {
    return {
      ...base,
      kind: 'card',
      category: row.category,
      card: target.card,
      invoiceDate: row.invoiceDate ?? target.invoiceDate,
      installments: row.installments ?? 1,
      ...(row.firstInstallment && row.firstInstallment > 1
        ? { firstInstallment: row.firstInstallment }
        : {})
    }
  }
  if (row.amountCents > 0) return { ...base, kind: 'income', incomeType: row.category }
  return { ...base, kind: 'cash', category: row.category, paymentMethod: target.paymentMethod }
}
