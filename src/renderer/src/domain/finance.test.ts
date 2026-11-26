import { describe, expect, it } from 'vitest'
import {
  addMonths,
  buildRecurringSeries,
  centsToInput,
  daysUntil,
  expandInstallments,
  formatDayMonth,
  formatMonth,
  formatMonthShort,
  formatPercent,
  invoicePaidBy,
  monthEntries,
  monthlySeries,
  parseAmountToCents,
  percentChange,
  shiftMonthKey,
  splitCents,
  suggestInvoiceDate,
  summarizeEntries,
  totalsByCategory,
  upcomingInvoices,
  type CardTransaction,
  type Transaction
} from './finance'
import { classifyCategory, defaultSettings, detectBrand, DEFAULT_CATEGORIES } from './categories'

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

describe('percentChange / formatPercent', () => {
  it('calcula a variação contra o mês anterior', () => {
    expect(percentChange(11000, 10000)).toBeCloseTo(0.1)
    expect(percentChange(9000, 10000)).toBeCloseTo(-0.1)
    // saldo negativo que melhora é variação positiva
    expect(percentChange(-5000, -10000)).toBeCloseTo(0.5)
    expect(percentChange(5000, 0)).toBeNull()
  })
  it('formata com sinal e vírgula', () => {
    expect(formatPercent(0.123).replace(/\s/g, ' ')).toBe('+12,3%')
    expect(formatPercent(-0.05)).toBe('-5%')
    expect(formatPercent(0)).toBe('0%')
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
  it('compra que entrou no meio: só da parcela informada em diante, na fatura escolhida', () => {
    const items = expandInstallments(
      card({ installments: 5, amountCents: 50000, firstInstallment: 4 })
    )
    expect(items.map((i) => [i.installmentNumber, i.statementMonth, i.installmentCents])).toEqual([
      [4, '2026-12', 10000],
      [5, '2027-01', 10000]
    ])
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
      pendingCardCents: 0,
      prepaidCents: 0,
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

describe('suggestInvoiceDate', () => {
  it('compra antes do fechamento cai na fatura do mês', () => {
    expect(suggestInvoiceDate('2026-11-02', 3, 10)).toBe('2026-11-10')
  })
  it('compra no dia do fechamento ou depois vai para a fatura seguinte', () => {
    expect(suggestInvoiceDate('2026-11-03', 3, 10)).toBe('2026-12-10')
  })
  it('vencimento antes do fechamento cai no mês seguinte ao fechamento', () => {
    expect(suggestInvoiceDate('2026-11-20', 25, 5)).toBe('2026-12-05')
    expect(suggestInvoiceDate('2026-11-26', 25, 5)).toBe('2027-01-05')
  })
  it('ajusta dias que o mês não tem', () => {
    // fecha "dia 31" em fevereiro = dia 28
    expect(suggestInvoiceDate('2026-02-28', 31, 10)).toBe('2026-04-10')
    expect(suggestInvoiceDate('2026-01-10', 20, 31)).toBe('2026-01-31')
    expect(suggestInvoiceDate('2026-01-25', 20, 31)).toBe('2026-02-28')
  })
})

describe('upcomingInvoices', () => {
  const tx = card({ amountCents: 30000, installments: 2, invoiceDate: '2026-12-10' })
  const cards = [{ name: 'Nubank', dueDay: 10 }, { name: 'Itaú' }]
  it('mostra a fatura do mês se ainda não venceu', () => {
    expect(upcomingInvoices([tx], cards, '2026-12-05')).toEqual([
      { card: 'Nubank', dueDate: '2026-12-10', totalCents: 15000, count: 1 }
    ])
  })
  it('fatura vencida e não paga continua aparecendo (atrasada)', () => {
    expect(upcomingInvoices([tx], cards, '2026-12-15')).toEqual([
      { card: 'Nubank', dueDate: '2026-12-10', totalCents: 15000, count: 1 }
    ])
  })
  it('marcada como paga, passa para a do mês seguinte', () => {
    const paidCards = [{ name: 'Nubank', dueDay: 10, paidInvoices: ['2026-12'] }]
    expect(upcomingInvoices([tx], paidCards, '2026-12-15')).toEqual([
      { card: 'Nubank', dueDate: '2027-01-10', totalCents: 15000, count: 1 }
    ])
  })
  it('pagamento antecipado abate da fatura e já conta como saída', () => {
    const credit = card({
      description: 'Pagamento antecipado',
      category: 'Pagamento antecipado',
      amountCents: 10000,
      installments: 1,
      invoiceDate: '2026-12-10',
      date: '2026-12-01',
      credit: true
    })
    // fatura de dezembro: 150,00 de compra − 100,00 de crédito
    expect(upcomingInvoices([tx, credit], cards, '2026-12-05')[0].totalCents).toBe(5000)
    const entries = monthEntries([tx, credit], '2026-12')
    const unpaid = summarizeEntries(entries, () => false)
    expect(unpaid).toMatchObject({ cardCents: 15000, pendingCardCents: 5000, expenseCents: 10000 })
    expect(summarizeEntries(entries, () => true).expenseCents).toBe(15000)
    expect(totalsByCategory(entries)).toEqual({ Educação: 15000 })
    // pago em novembro para a fatura de dezembro: sai em novembro, abate em dezembro
    const early = card({ ...credit, date: '2026-11-26' })
    const nov = summarizeEntries(monthEntries([tx, early], '2026-11'), () => false)
    expect(nov).toMatchObject({ cardCents: 0, expenseCents: 10000 })
    const decEntries = monthEntries([tx, early], '2026-12')
    expect(summarizeEntries(decEntries, () => false).expenseCents).toBe(0)
    expect(summarizeEntries(decEntries, () => true).expenseCents).toBe(5000)
    // quitada antes do vencimento: some dos vencimentos
    const all = card({ ...credit, amountCents: 15000 })
    expect(upcomingInvoices([tx, all], cards, '2026-12-05')[0].dueDate).toBe('2027-01-10')
  })
  it('só a fatura paga conta nas saídas; mês passado conta como pago', () => {
    const paid = invoicePaidBy([{ name: 'Nubank', paidInvoices: ['2027-01'] }], '2026-12-20')
    const dec = summarizeEntries(monthEntries([tx], '2026-12'), (c) => paid(c, '2026-12'))
    expect(dec).toMatchObject({ cardCents: 15000, pendingCardCents: 15000, expenseCents: 0 })
    const jan = summarizeEntries(monthEntries([tx], '2027-01'), (c) => paid(c, '2027-01'))
    expect(jan).toMatchObject({ pendingCardCents: 0, expenseCents: 15000 })
    expect(paid('Nubank', '2026-11')).toBe(true)
  })
  it('fatura vazia não aparece', () => {
    expect(upcomingInvoices([tx], cards, '2027-02-11')).toEqual([])
  })
  it('fatura deste mês vazia não esconde a do próximo', () => {
    const later = card({ amountCents: 9000, installments: 1, invoiceDate: '2027-01-10' })
    expect(upcomingInvoices([later], cards, '2026-12-05')).toEqual([
      { card: 'Nubank', dueDate: '2027-01-10', totalCents: 9000, count: 1 }
    ])
  })
  it('cartão sem dia de vencimento usa o vencimento da fatura escolhida na compra', () => {
    const itau = card({
      card: 'Itaú',
      amountCents: 5000,
      installments: 1,
      invoiceDate: '2026-12-07'
    })
    expect(upcomingInvoices([itau], cards, '2026-12-01')).toEqual([
      { card: 'Itaú', dueDate: '2026-12-07', totalCents: 5000, count: 1 }
    ])
  })
})

describe('monthlySeries', () => {
  it('traz os meses em ordem, terminando no mês pedido', () => {
    const series = monthlySeries([card()], '2027-01', 3)
    expect(series.map((p) => p.month)).toEqual(['2026-11', '2026-12', '2027-01'])
    expect(series.map((p) => p.cardCents)).toEqual([0, 33334, 33333])
  })
})

describe('detectBrand', () => {
  it('reconhece assinaturas e apps pela descrição', () => {
    expect(detectBrand('Netflix Premium')?.id).toBe('netflix')
    expect(detectBrand('Disney+ anual')?.id).toBe('disneyplus')
    expect(detectBrand('Uber Eats - pedido')?.id).toBe('ubereats')
    expect(detectBrand('uber centro')?.id).toBe('uber')
    expect(detectBrand('Mercado')).toBeNull()
  })
  it('a marca manda na categoria', () => {
    expect(classifyCategory('Netflix', DEFAULT_CATEGORIES)).toBe('Assinaturas')
    expect(classifyCategory('iFood', DEFAULT_CATEGORIES)).toBe('Alimentação')
  })
})

describe('formatos da tela', () => {
  it('centavos voltam para o campo de valor e são lidos de novo igual', () => {
    for (const cents of [0, 5, 1250, 123456, 100000000]) {
      expect(parseAmountToCents(centsToInput(cents))).toBe(cents)
    }
    expect(centsToInput(123456)).toBe('1234,56')
  })
  it('data e mês curtos', () => {
    expect(formatDayMonth('2026-11-18')).toBe('18 nov')
    expect(formatMonthShort('2027-01')).toBe('jan')
  })
  it('dias até o vencimento', () => {
    expect(daysUntil('2026-12-10', '2026-12-05')).toBe(5)
    expect(daysUntil('2026-11-01', '2026-10-31')).toBe(1)
    expect(daysUntil('2026-12-01', '2026-12-05')).toBe(-4)
  })
})

describe('formatMonth', () => {
  it('só a primeira letra maiúscula', () => {
    expect(formatMonth('2026-11')).toBe('Novembro de 2026')
  })
})
