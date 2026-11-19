import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { buildWorkbook } from './exportExcel'
import { buildReport } from '../domain/reports'
import type { Transaction } from '../domain/finance'

const tx: Transaction[] = [
  {
    id: '1',
    kind: 'income',
    description: 'Salário',
    amountCents: 500000,
    date: '2026-11-05',
    incomeType: 'Salário'
  },
  {
    id: '2',
    kind: 'cash',
    description: 'Mercado',
    amountCents: 12345,
    date: '2026-11-10',
    category: 'Alimentação',
    paymentMethod: 'Pix'
  }
]

describe('buildWorkbook', () => {
  it('gera as abas Resumo, Transações e Investimentos com valores em reais', async () => {
    const bytes = await buildWorkbook({
      title: 'Relatório de Novembro de 2026',
      report: buildReport(tx, ['2026-11']),
      assets: [],
      fixed: [],
      dividends: []
    })
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(bytes.buffer as ArrayBuffer)
    expect(book.worksheets.map((w) => w.name)).toEqual(['Resumo', 'Transações', 'Investimentos'])

    const sheet = book.getWorksheet('Transações')!
    const values = sheet.getRow(4).values as unknown[]
    expect(values.slice(2, 5)).toEqual(['Mercado', 'À vista', 'Alimentação'])
    expect(values[8]).toBe(-123.45)
    expect(sheet.getRow(4).getCell(8).numFmt).toContain('R$')
    expect((values[1] as Date).toISOString().slice(0, 10)).toBe('2026-11-10')

    const summary = book.getWorksheet('Resumo')!
    const totals = summary.getColumn(1).values.indexOf('Total')
    expect(summary.getRow(totals).getCell(6).value).toBe(5000 - 123.45)
  })
})
