import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  applyMapping,
  buildPreview,
  decodeText,
  findDuplicate,
  guessMapping,
  isOfx,
  parseCsv,
  parseDate,
  parseMoney,
  parseOfx,
  similarDescription,
  toTransaction
} from './importer'
import type { Transaction } from './finance'

const fixture = (name: string): string =>
  decodeText(new Uint8Array(readFileSync(join(__dirname, '../../../../tests/fixtures', name))))

const simple = (rows: { date: string; description: string; amountCents: number }[]): string[] =>
  rows.map((r) => `${r.date} ${r.amountCents} ${r.description}`)

describe('parseMoney', () => {
  it('entende os formatos brasileiro e americano', () => {
    expect(parseMoney('1.234,56')).toBe(123456)
    expect(parseMoney('-1234.56')).toBe(-123456)
    expect(parseMoney('R$ 12,30')).toBe(1230)
    expect(parseMoney('(12,30)')).toBe(-1230)
    expect(parseMoney('12,30-')).toBe(-1230)
    expect(parseMoney('-245.9')).toBe(-24590)
    expect(parseMoney('1.234.567')).toBe(123456700)
    expect(parseMoney('12.3400')).toBe(1234)
    expect(parseMoney(`R$${String.fromCharCode(160)}1.234,56`)).toBe(123456)
    expect(parseMoney('')).toBeNull()
    expect(parseMoney('abc')).toBeNull()
  })
})

describe('decodeText', () => {
  it('tira o BOM do UTF-8 e cai para Windows-1252 quando não é UTF-8', () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]))).toBe('A')
    expect(decodeText(new Uint8Array([0x53, 0xe3, 0x6f]))).toBe('São')
  })
})

describe('parseDate', () => {
  it('lê dia/mês/ano, ISO e a data do OFX', () => {
    expect(parseDate('31/12/2026')).toBe('2026-12-31')
    expect(parseDate('05/11/26')).toBe('2026-11-05')
    expect(parseDate('2026-11-02')).toBe('2026-11-02')
    expect(parseDate('20261105000000[-3:BRT]')).toBe('2026-11-05')
    expect(parseDate('31/02/2026')).toBeNull()
    expect(parseDate('data')).toBeNull()
  })
})

describe('OFX', () => {
  it('lê OFX 1.x (SGML) em Windows-1252, com acentos e entidades', () => {
    const text = fixture('conta-sgml-1252.ofx')
    expect(isOfx(text)).toBe(true)
    const { rows, isCard } = parseOfx(text)
    expect(isCard).toBe(false)
    expect(simple(rows)).toEqual([
      '2026-11-05 650000 SALÁRIO EMPRESA FICTÍCIA LTDA',
      '2026-11-10 -180000 PIX ENVIADO ALUGUEL',
      '2026-11-14 -24590 Mercado São João',
      '2026-11-16 -3850 UBER *TRIP & CIA'
    ])
  })

  it('lê OFX 2.x (XML) de cartão', () => {
    const { rows, isCard } = parseOfx(fixture('cartao.ofx'))
    expect(isCard).toBe(true)
    expect(rows.map((r) => r.amountCents)).toEqual([-5590, -12000, 98045])
  })
})

describe('CSV', () => {
  it('Nubank conta: vírgula, cabeçalho e valor com ponto', () => {
    const cells = parseCsv(fixture('nubank-conta.csv'))
    const mapping = guessMapping(cells)
    expect(mapping).toMatchObject({ hasHeader: true, date: 0, amount: 1, description: 3 })
    const { rows, skipped } = applyMapping(cells, mapping)
    expect(skipped).toBe(0)
    expect(rows[0]).toEqual({
      date: '2026-11-05',
      description: 'Transferência recebida - EMPRESA FICTICIA',
      amountCents: 650000
    })
    expect(rows[1].amountCents).toBe(-180000)
  })

  it('Nubank cartão: compra positiva, corrigida com "inverter sinal"', () => {
    const cells = parseCsv(fixture('nubank-cartao.csv'))
    const mapping = { ...guessMapping(cells), invert: true }
    expect(mapping).toMatchObject({ date: 0, description: 1, amount: 2 })
    expect(applyMapping(cells, mapping).rows.map((r) => r.amountCents)).toEqual([
      -5590, -12000, 98045
    ])
  })

  it('Itaú: ponto e vírgula, aspas com separador dentro, 1.234,56 e linha inválida', () => {
    const cells = parseCsv(fixture('itau.csv'))
    expect(cells[1][1]).toBe('SALARIO EMPRESA; FICTICIA')
    const { rows, skipped } = applyMapping(cells, guessMapping(cells))
    expect(skipped).toBe(1)
    expect(rows.map((r) => r.amountCents)).toEqual([650000, -180000, -24590])
  })

  it('colunas separadas de débito e crédito', () => {
    const cells = parseCsv(fixture('debito-credito.csv'))
    const mapping = guessMapping(cells)
    expect(mapping).toMatchObject({ date: 0, description: 1, amount: 2, credit: 3 })
    expect(applyMapping(cells, mapping).rows.map((r) => r.amountCents)).toEqual([
      650000, -180000, -24590
    ])
  })

  it('coluna de tipo D/C define o sinal', () => {
    const cells = parseCsv(
      'Data;Descrição;Valor;Tipo\n01/11/2026;Café;10,00;D\n02/11/2026;Pix;50,00;C\n'
    )
    const mapping = guessMapping(cells)
    expect(mapping.type).toBe(3)
    expect(applyMapping(cells, mapping).rows.map((r) => r.amountCents)).toEqual([-1000, 5000])
  })

  it('colunas "Entrada" e "Saída": entram as duas', () => {
    const cells = parseCsv(
      'Data;Descrição;Entrada;Saída;Saldo\n01/11/2026;Pix;50,00;;150,00\n02/11/2026;Café;;10,00;140,00\n'
    )
    const mapping = guessMapping(cells)
    expect(mapping).toMatchObject({ credit: 2, amount: 3, balance: 4 })
    // 150,00 de saldo depois do Pix de 50,00: tinha 100,00 antes
    expect(applyMapping(cells, mapping).rows.map((r) => r.amountCents)).toEqual([
      10000, 5000, -1000
    ])
  })

  it('coluna "Entrada/Saída" é o tipo, não o valor', () => {
    const cells = parseCsv(
      'Data;Descrição;Valor;Entrada/Saída\n01/11/2026;Pix;50,00;Entrada\n02/11/2026;Café;10,00;Saída\n'
    )
    const mapping = guessMapping(cells)
    expect(mapping).toMatchObject({ amount: 2, credit: -1, type: 3 })
    expect(applyMapping(cells, mapping).rows.map((r) => r.amountCents)).toEqual([5000, -1000])
  })

  it('saldo anterior pela coluna de saldo; extrato do mais novo para o mais antigo', () => {
    const cells = parseCsv(
      'Data;Descrição;Valor;Saldo\n03/11/2026;Café;-10,00;1.040,00\n02/11/2026;Pix;50,00;1.050,00\n'
    )
    const { rows } = applyMapping(cells, guessMapping(cells))
    expect(rows[0]).toEqual({
      date: '2026-11-02',
      description: 'Saldo anterior',
      amountCents: 100000,
      opening: true
    })
    // saldo anterior + lançamentos = saldo de hoje no banco
    expect(rows.reduce((s, r) => s + r.amountCents, 0)).toBe(104000)
  })

  it('linha "Saldo anterior" vira o saldo; "Saldo do dia" fica de fora', () => {
    const cells = parseCsv(
      'Data;Descrição;Valor\n01/11/2026;SALDO ANTERIOR;-200,00\n02/11/2026;Pix;50,00\n02/11/2026;SALDO DO DIA;-150,00\n'
    )
    const { rows } = applyMapping(cells, guessMapping(cells))
    expect(rows.map((r) => [r.description, r.amountCents])).toEqual([
      ['Saldo anterior', -20000],
      ['Pix', 5000]
    ])
  })

  it('OFX de conta: saldo anterior = saldo final menos os lançamentos', () => {
    const { rows } = parseOfx(
      '<OFX><BANKTRANLIST><STMTTRN><DTPOSTED>20261102<TRNAMT>-10.00<MEMO>Café</STMTTRN></BANKTRANLIST><LEDGERBAL><BALAMT>990.00<DTASOF>20261130</LEDGERBAL></OFX>'
    )
    expect(rows[0]).toMatchObject({ description: 'Saldo anterior', amountCents: 100000 })
  })

  it('sem cabeçalho, usa as três primeiras colunas', () => {
    const cells = parseCsv('01/11/2026;Café;-10,00\n')
    expect(guessMapping(cells).hasHeader).toBe(false)
    expect(applyMapping(cells, guessMapping(cells)).rows).toHaveLength(1)
  })
})

describe('duplicados', () => {
  const existing: Transaction[] = [
    {
      id: '1',
      kind: 'cash',
      description: 'Mercado São João',
      amountCents: 24590,
      date: '2026-11-13',
      category: 'Alimentação',
      paymentMethod: 'Débito'
    },
    {
      id: '2',
      kind: 'income',
      description: 'Salário',
      amountCents: 650000,
      date: '2026-11-05',
      incomeType: 'Salário'
    },
    {
      id: '3',
      kind: 'card',
      description: 'Loja Exemplo',
      amountCents: 60000,
      date: '2026-11-03',
      category: 'Compras',
      card: 'Nubank',
      invoiceDate: '2026-11-10',
      installments: 5
    }
  ]

  it('compara descrições sem acento e por palavras', () => {
    expect(similarDescription('Compra no débito - Mercado Sao Joao', 'Mercado São João')).toBe(true)
    expect(similarDescription('SALARIO EMPRESA FICTICIA', 'Salário')).toBe(true)
    expect(similarDescription('Farmácia', 'Mercado')).toBe(false)
  })

  it('mesmo valor, data a 1 dia e descrição parecida → duplicado', () => {
    const row = { date: '2026-11-14', description: 'MERCADO SAO JOAO', amountCents: -24590 }
    expect(findDuplicate(row, existing, 'account')?.id).toBe('1')
    expect(findDuplicate({ ...row, date: '2026-11-15' }, existing, 'account')).toBeNull()
    expect(findDuplicate({ ...row, amountCents: -24500 }, existing, 'account')).toBeNull()
    // Entrada não casa com saída de mesmo valor.
    expect(findDuplicate({ ...row, amountCents: 24590 }, existing, 'account')).toBeNull()
  })

  it('no cartão, reconhece a parcela de uma compra parcelada', () => {
    const row = {
      date: '2026-11-03',
      description: 'Loja Exemplo - Parcela 2/5',
      amountCents: -12000
    }
    expect(findDuplicate(row, existing, 'card')?.id).toBe('3')
    expect(findDuplicate(row, existing, 'account')).toBeNull()
  })

  it('a prévia desmarca duplicados e pagamentos de fatura', () => {
    const rows = [
      { date: '2026-11-03', description: 'Loja Exemplo - Parcela 2/5', amountCents: -12000 },
      { date: '2026-11-02', description: 'Netflix.com', amountCents: -5590 },
      { date: '2026-11-04', description: 'Pagamento recebido', amountCents: 98045 }
    ]
    const preview = buildPreview(rows, existing, 'card', ['Alimentação', 'Assinaturas', 'Outros'])
    expect(preview.map((p) => [p.include, !!p.duplicate, p.ignored])).toEqual([
      [false, true, false],
      [true, false, false],
      [false, false, true]
    ])
    expect(preview[1].category).toBe('Assinaturas')
  })
})

describe('toTransaction', () => {
  const row = {
    key: 0,
    include: true,
    duplicate: null,
    ignored: false,
    date: '2026-11-14',
    description: 'Mercado',
    amountCents: -24590,
    category: 'Alimentação'
  }

  it('conta: saída vira à vista e entrada vira entrada', () => {
    expect(toTransaction(row, { destination: 'account', paymentMethod: 'Débito' })).toEqual({
      kind: 'cash',
      description: 'Mercado',
      amountCents: 24590,
      date: '2026-11-14',
      category: 'Alimentação',
      paymentMethod: 'Débito'
    })
    expect(
      toTransaction(
        { ...row, amountCents: 650000, category: 'Salário' },
        { destination: 'account', paymentMethod: 'Débito' }
      )
    ).toMatchObject({ kind: 'income', incomeType: 'Salário', amountCents: 650000 })
  })

  it('cartão: compra em 1x na fatura escolhida', () => {
    expect(
      toTransaction(row, { destination: 'card', card: 'Nubank', invoiceDate: '2026-12-10' })
    ).toMatchObject({ kind: 'card', card: 'Nubank', invoiceDate: '2026-12-10', installments: 1 })
  })
})
