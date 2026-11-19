// Planilha .xlsx do relatório: abas Resumo, Transações e Investimentos.
// O exceljs só é carregado quando alguém exporta (é grande e não precisa abrir com o app).
import type { Worksheet } from 'exceljs'
import { formatMonth } from '../domain/finance'
import {
  ASSET_TYPE_LABELS,
  DIVIDEND_TYPE_LABELS,
  INDEXER_LABELS,
  type Dividend
} from '../domain/investments'
import { exportRows, type Report } from '../domain/reports'
import type { AssetRow, FixedRow } from '../data/portfolio'

const MONEY = '"R$" #,##0.00;[Red]-"R$" #,##0.00'
const DATE = 'dd/mm/yyyy'

// Só na planilha o valor vira reais: o Excel precisa de número para somar e formatar.
const reais = (cents: number): number => cents / 100
const excelDate = (iso: string): Date | string =>
  iso ? new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))) : ''

function table(
  sheet: Worksheet,
  title: string,
  columns: { header: string; width: number; format?: string }[],
  rows: unknown[][]
): void {
  if (sheet.rowCount > 0) sheet.addRow([])
  sheet.addRow([title]).font = { bold: true, size: 13 }
  const header = sheet.addRow(columns.map((c) => c.header))
  header.font = { bold: true }
  header.eachCell((cell) => {
    cell.border = { bottom: { style: 'thin' } }
  })
  for (const values of rows) {
    const row = sheet.addRow(values)
    columns.forEach((c, i) => {
      if (c.format) row.getCell(i + 1).numFmt = c.format
    })
  }
  columns.forEach((c, i) => {
    const column = sheet.getColumn(i + 1)
    column.width = Math.max(column.width ?? 0, c.width)
  })
}

export type ExcelInput = {
  title: string
  report: Report
  assets: AssetRow[]
  fixed: FixedRow[]
  dividends: Dividend[]
}

export async function buildWorkbook({
  title,
  report,
  assets,
  fixed,
  dividends
}: ExcelInput): Promise<Uint8Array> {
  const { default: ExcelJS } = await import('exceljs')
  const book = new ExcelJS.Workbook()
  book.creator = 'QFinanças'

  const summary = book.addWorksheet('Resumo')
  summary.addRow([title]).font = { bold: true, size: 15 }
  const t = report.totals
  table(
    summary,
    'Mês a mês',
    [
      { header: 'Mês', width: 20 },
      { header: 'Entradas', width: 16, format: MONEY },
      { header: 'À vista', width: 16, format: MONEY },
      { header: 'Cartão', width: 16, format: MONEY },
      { header: 'Saídas', width: 16, format: MONEY },
      { header: 'Saldo', width: 16, format: MONEY }
    ],
    [
      ...report.months.map((m) => [
        formatMonth(m.month),
        reais(m.incomeCents),
        reais(m.cashCents),
        reais(m.cardCents),
        reais(m.expenseCents),
        reais(m.balanceCents)
      ]),
      [
        'Total',
        reais(t.incomeCents),
        reais(t.cashCents),
        reais(t.cardCents),
        reais(t.expenseCents),
        reais(t.balanceCents)
      ]
    ]
  )
  summary.getRow(summary.rowCount).font = { bold: true }
  const share = (cents: number, total: number): number => (total ? cents / total : 0)
  table(
    summary,
    'Saídas por categoria',
    [
      { header: 'Categoria', width: 20 },
      { header: 'Valor', width: 16, format: MONEY },
      { header: '% das saídas', width: 16, format: '0.0%' }
    ],
    report.byCategory.map((s) => [s.name, reais(s.cents), share(s.cents, t.expenseCents)])
  )
  if (report.byCard.length) {
    table(
      summary,
      'Por cartão',
      [
        { header: 'Cartão', width: 20 },
        { header: 'Valor', width: 16, format: MONEY }
      ],
      report.byCard.map((s) => [s.name, reais(s.cents)])
    )
  }
  if (report.byIncomeType.length) {
    table(
      summary,
      'Entradas por tipo',
      [
        { header: 'Tipo', width: 20 },
        { header: 'Valor', width: 16, format: MONEY }
      ],
      report.byIncomeType.map((s) => [s.name, reais(s.cents)])
    )
  }

  const txSheet = book.addWorksheet('Transações')
  table(
    txSheet,
    'Lançamentos',
    [
      { header: 'Data', width: 12, format: DATE },
      { header: 'Descrição', width: 36 },
      { header: 'Tipo', width: 10 },
      { header: 'Categoria', width: 18 },
      { header: 'Pagamento/cartão', width: 18 },
      { header: 'Fatura', width: 12, format: DATE },
      { header: 'Parcela', width: 9 },
      { header: 'Valor', width: 16, format: MONEY }
    ],
    exportRows(report.entries).map((r) => [
      excelDate(r.date),
      r.description,
      r.kind,
      r.category,
      r.method,
      excelDate(r.invoice),
      r.installment,
      reais(r.amountCents)
    ])
  )
  txSheet.views = [{ state: 'frozen', ySplit: 2 }]

  const invest = book.addWorksheet('Investimentos')
  table(
    invest,
    'Ações, FIIs e ETFs (hoje)',
    [
      { header: 'Ativo', width: 14 },
      { header: 'Classe', width: 14 },
      { header: 'Quantidade', width: 12, format: '#,##0.########' },
      { header: 'Preço médio', width: 14, format: MONEY },
      { header: 'Custo', width: 16, format: MONEY },
      { header: 'Valor hoje', width: 16, format: MONEY },
      { header: 'Resultado', width: 16, format: MONEY }
    ],
    assets.map((a) => [
      a.ticker,
      ASSET_TYPE_LABELS[a.assetType],
      a.quantity,
      reais(a.avgPriceCents),
      reais(a.totalCostCents),
      reais(a.valueCents),
      reais(a.resultCents)
    ])
  )
  table(
    invest,
    'Renda fixa (estimativa bruta, sem marcação a mercado)',
    [
      { header: 'Nome', width: 24 },
      { header: 'Tipo', width: 14 },
      { header: 'Indexador', width: 14 },
      { header: 'Taxa', width: 10 },
      { header: 'Aplicado', width: 16, format: MONEY },
      { header: 'Início', width: 12, format: DATE },
      { header: 'Vencimento', width: 12, format: DATE },
      { header: 'Estimado hoje', width: 16, format: MONEY }
    ],
    fixed.map((f) => [
      f.name,
      ASSET_TYPE_LABELS[f.assetType],
      INDEXER_LABELS[f.indexer],
      f.rate,
      reais(f.investedCents),
      excelDate(f.startDate),
      excelDate(f.maturityDate ?? ''),
      reais(f.estimate.grossCents)
    ])
  )
  const months = new Set(report.months.map((m) => m.month))
  table(
    invest,
    'Proventos do período',
    [
      { header: 'Pagamento', width: 12, format: DATE },
      { header: 'Ativo', width: 14 },
      { header: 'Tipo', width: 14 },
      { header: 'Valor', width: 16, format: MONEY }
    ],
    dividends
      .filter((d) => months.has(d.paymentDate.slice(0, 7)))
      .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate))
      .map((d) => [
        excelDate(d.paymentDate),
        d.ticker,
        DIVIDEND_TYPE_LABELS[d.type],
        reais(d.amountCents)
      ])
  )

  return new Uint8Array(await book.xlsx.writeBuffer())
}
