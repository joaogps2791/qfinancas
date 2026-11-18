import { describe, expect, it } from 'vitest'
import {
  addMonths,
  buildRecurringSeries,
  expandInstallments,
  monthEntries,
  parseAmountToCents,
  shiftMonthKey,
  splitCents,
  summarizeEntries,
  totalsByCategory,
  type CardTransaction,
  type Transaction
} from './finance'
import { classifyCategory, defaultSettings, DEFAULT_CATEGORIES } from './categories'

describe('parseAmountToCents', () => {
  it('lê valores no formato brasileiro', () => {
    expect(parseAmountToCents('1.234,56')).toBe(123456)
    expect(parseAmountToCents('12,5')).toBe(1250)
    expect(parseAmountToCents('R$ 40')).toBe(4000)
    expect(parseAmountToCents('0,07')).toBe(7)
  })
  it('recusa texto inválido', () => {
    expect(parseAmountToCents('')).toBeNull()
    expect(parseAmountToCents('abc')).toBeNull()
    expect(parseAmountToCents('1,234')).toBeNull()
    expect(parseAmountToCents('-10')).toBeNull()
  })
})

describe('splitCents', () => {
  it('não perde centavos', () => {
    expect(splitCents(10000, 3)).toEqual([3334, 3333, 3333])
    expect(splitCents(10000, 3).reduce((a, b) => a + b)).toBe(10000)
    expect(splitCents(5, 1)).toEqual([5])
  })
})

describe('addMonths', () => {
  it('soma meses e vira o ano', () => {
    expect(addMonths('2026-11-10', 1)).toBe('2026-12-10')
    expect(addMonths('2026-12-10', 1)).toBe('2027-01-10')
    expect(addMonths('2026-01-10', -1)).toBe('2025-12-10')
    expect(addMonths('2026-03-15', 24)).toBe('2028-03-15')
  })
  it('usa o último dia quando o mês é mais curto', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonths('2026-01-31', 2)).toBe('2026-03-31')
  })
  it('anda mês a mês', () => {
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01')
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12')
  })
})

const card = (overrides: Partial<CardTransaction> = {}): CardTransaction => ({
  id: 'c1',
  kind: 'card',
  description: 'Notebook',
  amountCents: 100000,
  date: '2026-11-05',
  invoiceDate: '2026-12-10',
  installments: 3,
  category: 'Educação',
  card: 'Nubank',
  ...overrides
})

describe('expandInstallments', () => {
  it('gera uma parcela por fatura a partir da fatura escolhida', () => {
    const items = expandInstallments(card())
    expect(items.map((i) => i.statementMonth)).toEqual(['2026-12', '2027-01', '2027-02'])
    expect(items.map((i) => i.installmentCents)).toEqual([33334, 33333, 33333])
    expect(items.map((i) => i.installmentNumber)).toEqual([1, 2, 3])
  })
  it('sem data de fatura usa a data da compra', () => {
    const items = expandInstallments(card({ invoiceDate: '', installments: 1 }))
    expect(items[0].statementMonth).toBe('2026-11')
  })
})

describe('buildRecurringSeries', () => {
  it('repete à vista todo mês', () => {
    const series = buildRecurringSeries(
      {
        kind: 'cash',
        description: 'Aluguel',
        amountCents: 150000,
        date: '2026-01-31',
        category: 'Moradia',
        paymentMethod: 'Pix'
      },
      3,
      'g1'
    )
    expect(series.map((s) => s.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
    expect(series.map((s) => 'occurrenceNumber' in s && s.occurrenceNumber)).toEqual([1, 2, 3])
    expect(series.every((s) => 'recurringGroup' in s && s.recurringGroup === 'g1')).toBe(true)
  })
  it('cartão recorrente vira uma parcela por mês, com a fatura andando junto', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, ...input } = card({ installments: 5 })
    const series = buildRecurringSeries(input, 2, 'g2') as CardTransaction[]
    expect(series.map((s) => s.installments)).toEqual([1, 1])
    expect(series.map((s) => s.invoiceDate)).toEqual(['2026-12-10', '2027-01-10'])
  })
  it('uma vez só não marca como recorrente', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, ...input } = card()
    expect(buildRecurringSeries(input, 1, 'g3')).toEqual([input])
  })
})

describe('totais do mês', () => {
  const transactions: Transaction[] = [
    {
      id: 'i1',
      kind: 'income',
      description: 'Salário',
      amountCents: 500000,
      date: '2026-12-05',
      incomeType: 'Salário'
    },
    {
      id: 'x1',
      kind: 'cash',
      description: 'Mercado',
      amountCents: 30000,
      date: '2026-12-08',
      category: 'Alimentação',
      paymentMethod: 'Pix'
    },
    {
      id: 'x2',
      kind: 'cash',
      description: 'Fora do mês',
      amountCents: 99999,
      date: '2026-11-30',
      category: 'Lazer',
      paymentMethod: 'Pix'
    },
    card()
  ]

  it('soma entradas, à vista e a parcela da fatura do mês', () => {
    const entries = monthEntries(transactions, '2026-12')
    expect(summarizeEntries(entries)).toEqual({
      incomeCents: 500000,
      cashCents: 30000,
      cardCents: 33334,
      expenseCents: 63334,
      balanceCents: 436666
    })
    expect(totalsByCategory(entries)).toEqual({ Alimentação: 30000, Educação: 33334 })
  })
  it('compra de novembro com fatura em dezembro não pesa em novembro', () => {
    const entries = monthEntries(transactions, '2026-11')
    expect(summarizeEntries(entries).cardCents).toBe(0)
    expect(summarizeEntries(entries).cashCents).toBe(99999)
  })
})

describe('classifyCategory', () => {
  const categories = DEFAULT_CATEGORIES
  it('acha a categoria pela descrição, sem ligar para acento ou maiúscula', () => {
    expect(classifyCategory('iFood - Pizza', categories)).toBe('Alimentação')
    expect(classifyCategory('Uber viagem', categories)).toBe('Transporte')
    expect(classifyCategory('FARMÁCIA São João', categories)).toBe('Saúde')
    expect(classifyCategory('Spotify Family', categories)).toBe('Assinaturas')
  })
  it('só casa palavra inteira (com plural)', () => {
    expect(classifyCategory('Barbearia', categories)).toBe(categories[0])
    expect(classifyCategory('Happy hour no bar', categories)).toBe('Lazer')
    expect(classifyCategory('Lanches da tarde', categories)).toBe('Alimentação')
  })
  it('pula a regra se o usuário não tem a categoria', () => {
    expect(classifyCategory('Uber', ['Outros', 'Lazer'])).toBe('Outros')
  })
})

describe('defaultSettings', () => {
  it('traz as categorias e cartões do site, com ícone', () => {
    const settings = defaultSettings()
    expect(settings.schemaVersion).toBe(2)
    expect(settings.categories.map((c) => c.name)).toEqual(DEFAULT_CATEGORIES)
    expect(settings.categories[0].icon).toBe('food')
    expect(settings.cards.map((c) => c.name)).toEqual(['Nubank', 'Itaú', 'Santander'])
  })
})
