import { useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import {
  ChevronLeft,
  ChevronRight,
  FileDown,
  FileSpreadsheet,
  TrendingDown,
  TrendingUp,
  Wallet
} from 'lucide-react'
import { friendlyError, useApp } from '../data/store'
import { usePortfolio } from '../data/portfolio'
import {
  formatBRL,
  formatMonth,
  formatMonthShort,
  formatPercent,
  percentChange,
  shiftMonthKey,
  type MonthPoint
} from '../domain/finance'
import {
  buildReport,
  investedSeries,
  periodLabel,
  periodMonths,
  previousPeriod,
  type Period,
  type Slice
} from '../domain/reports'
import { buildWorkbook } from '../lib/exportExcel'
import { Button, Card, EmptyState, Pills, StatCard } from '../components/ui'
import MonthPicker from '../components/MonthPicker'
import './reports.css'

const compact = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1
})

/** Participação em %, com "<1%" para fatias pequenas (em vez de um "0%" enganoso). */
const share = (cents: number, total: number): string => {
  const pct = total ? (cents / total) * 100 : 0
  return pct > 0 && pct < 1 ? '<1%' : `${Math.round(pct)}%`
}

const fileSlug = (period: Period): string =>
  period.kind === 'month' ? period.month : String(period.year)

/** Põe a tela no layout de impressão (claro, sem a barra lateral), gera o PDF e volta. */
async function savePdf(name: string): Promise<string | null> {
  const root = document.documentElement
  const theme = root.dataset.theme
  root.dataset.theme = 'light'
  root.classList.add('is-printing')
  // Espera os gráficos se redesenharem na largura da folha.
  await new Promise((resolve) => setTimeout(resolve, 400))
  try {
    return await window.api.savePdf(name)
  } finally {
    root.classList.remove('is-printing')
    if (theme) root.dataset.theme = theme
  }
}

export default function Reports(): React.JSX.Element {
  const transactions = useApp((s) => s.transactions)
  const month = useApp((s) => s.month)
  const categories = useApp((s) => s.settings?.categories ?? [])
  const { investmentTransactions, fixedIncome, dividends } = useApp((s) => s.investments)
  const [kind, setKind] = useState<Period['kind']>('month')
  const [year, setYear] = useState(Number(month.slice(0, 4)))
  const [busy, setBusy] = useState<'pdf' | 'excel' | null>(null)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)
  const portfolio = usePortfolio()

  // Contas leves (alguns milhares de lançamentos no máximo): sem memo.
  const period: Period = kind === 'month' ? { kind, month } : { kind, year }
  const report = buildReport(transactions, periodMonths(period))
  const before = buildReport(transactions, periodMonths(previousPeriod(period)))
  // Comparativo: os 12 meses até o mês escolhido, ou os 12 meses do ano.
  const chartMonths =
    kind === 'month'
      ? Array.from({ length: 12 }, (_, i) => shiftMonthKey(month, i - 11))
      : periodMonths(period)
  const series = kind === 'month' ? buildReport(transactions, chartMonths).months : report.months
  const invested = investedSeries(investmentTransactions, fixedIncome, chartMonths)

  const t = report.totals
  const p = before.totals
  const label = periodLabel(period)
  const colorOf = (name: string): string =>
    categories.find((c) => c.name === name)?.color ?? 'var(--text-muted)'

  const run = async (what: 'pdf' | 'excel', job: () => Promise<string | null>): Promise<void> => {
    setBusy(what)
    setMessage(null)
    try {
      const path = await job()
      if (path) setMessage({ text: `Arquivo salvo em ${path}` })
    } catch (error) {
      setMessage({ text: friendlyError(error), error: true })
    } finally {
      setBusy(null)
    }
  }

  const exportPdf = (): Promise<void> =>
    run('pdf', () => savePdf(`relatorio-qfinancas-${fileSlug(period)}.pdf`))

  const exportExcel = (): Promise<void> =>
    run('excel', async () => {
      const bytes = await buildWorkbook({
        title: `QFinanças: relatório de ${label}`,
        report,
        assets: portfolio.assets,
        fixed: portfolio.fixed,
        dividends
      })
      return window.api.files.save(`relatorio-qfinancas-${fileSlug(period)}.xlsx`, bytes, [
        { name: 'Planilha do Excel', extensions: ['xlsx'] }
      ])
    })

  return (
    <div className="page report">
      <header className="page-head">
        <div>
          <h1>Relatórios</h1>
          <p className="muted">
            <span className="no-print">Resumo, comparativo e patrimônio investido.</span>
            <span className="print-only">QFinanças · {label}</span>
          </p>
        </div>
        <div className="page-head__actions no-print">
          <Pills
            label="Período"
            options={[
              { value: 'month', label: 'Mês' },
              { value: 'year', label: 'Ano' }
            ]}
            value={kind}
            onChange={setKind}
          />
          {kind === 'month' ? (
            <MonthPicker />
          ) : (
            <div className="year-picker" role="group" aria-label="Ano">
              <Button
                variant="ghost"
                size="sm"
                aria-label="Ano anterior"
                icon={<ChevronLeft size={16} />}
                onClick={() => setYear(year - 1)}
              />
              <strong>{year}</strong>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Próximo ano"
                icon={<ChevronRight size={16} />}
                onClick={() => setYear(year + 1)}
              />
            </div>
          )}
          <Button icon={<FileDown size={16} />} disabled={busy !== null} onClick={exportPdf}>
            {busy === 'pdf' ? 'Gerando…' : 'PDF'}
          </Button>
          <Button
            icon={<FileSpreadsheet size={16} />}
            disabled={busy !== null}
            onClick={exportExcel}
          >
            {busy === 'excel' ? 'Gerando…' : 'Excel'}
          </Button>
        </div>
      </header>

      {message && (
        <p
          className={`${message.error ? 'error' : 'muted small'} no-print`}
          role={message.error ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      )}

      <section className="stat-row stat-row--3">
        <StatCard
          label="Entradas"
          tone="butter"
          icon={<TrendingUp size={16} />}
          valueCents={t.incomeCents}
          change={percentChange(t.incomeCents, p.incomeCents)}
        />
        <StatCard
          label="Saídas"
          tone="lilac"
          icon={<TrendingDown size={16} />}
          higherIsWorse
          valueCents={t.expenseCents}
          change={percentChange(t.expenseCents, p.expenseCents)}
          note={`${formatBRL(t.cashCents)} à vista · ${formatBRL(t.cardCents)} no cartão`}
        />
        <StatCard
          label="Saldo"
          tone="sage"
          icon={<Wallet size={16} />}
          valueCents={t.balanceCents}
          change={percentChange(t.balanceCents, p.balanceCents)}
        />
      </section>

      <Card className="report-chart">
        <div className="card-head">
          <div>
            <h2>Mês a mês</h2>
            <p className="muted small">
              {kind === 'month'
                ? `Os 12 meses até ${formatMonth(month).toLowerCase()}`
                : `Ano de ${year}`}
            </p>
          </div>
          <ul className="report-legend" aria-hidden="true">
            <li>
              <span className="legend__dot report-dot--income" /> Entradas
            </li>
            <li>
              <span className="legend__dot report-dot--expense" /> Saídas
            </li>
          </ul>
        </div>
        <FlowChart series={series} />
      </Card>

      {report.entries.length === 0 ? (
        <Card>
          <EmptyState title={`Nenhum lançamento em ${label.toLowerCase()}`} />
        </Card>
      ) : (
        <div className="report-grid">
          <Card>
            <h2>Saídas por categoria</h2>
            <CategoryTable
              slices={report.byCategory}
              previous={before.byCategory}
              total={t.expenseCents}
              colorOf={colorOf}
              previousLabel={periodLabel(previousPeriod(period)).toLowerCase()}
            />
          </Card>
          <div className="report-side">
            <Card>
              <h2>Por cartão</h2>
              <SliceList slices={report.byCard} empty="Nenhuma compra no cartão." />
            </Card>
            <Card>
              <h2>Entradas por tipo</h2>
              <SliceList slices={report.byIncomeType} empty="Nenhuma entrada." />
            </Card>
          </div>
        </div>
      )}

      <Card className="report-chart">
        <div className="card-head">
          <div>
            <h2>Patrimônio investido</h2>
            <p className="muted small">
              Quanto estava aplicado no fim de cada mês, pelo custo (sem cotação histórica).
            </p>
          </div>
          <p className="card-head__value">{formatBRL(invested[invested.length - 1]?.cents ?? 0)}</p>
        </div>
        <InvestedChart points={invested} />
      </Card>
    </div>
  )
}

function FlowChart({ series }: { series: MonthPoint[] }): React.JSX.Element {
  const data = series.map((p) => ({ ...p, label: formatMonthShort(p.month) }))
  return (
    <div className="chart-box" role="img" aria-label="Entradas e saídas mês a mês">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} barGap={4}>
          <XAxis dataKey="label" axisLine={false} tickLine={false} className="chart-axis" />
          <YAxis
            axisLine={false}
            tickLine={false}
            width={80}
            className="chart-axis"
            tickFormatter={(v: number) => compact.format(v / 100)}
          />
          <Tooltip
            cursor={{ className: 'chart-cursor' }}
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as MonthPoint | undefined
              return active && point ? (
                <div className="chart-tooltip">
                  <span>{formatMonth(point.month)}</span>
                  <strong>Entradas {formatBRL(point.incomeCents)}</strong>
                  <strong>Saídas {formatBRL(point.expenseCents)}</strong>
                </div>
              ) : null
            }}
          />
          <Bar
            dataKey="incomeCents"
            className="report-bar--income"
            radius={[8, 8, 8, 8]}
            maxBarSize={22}
            isAnimationActive={false}
          />
          <Bar
            dataKey="expenseCents"
            className="report-bar--expense"
            radius={[8, 8, 8, 8]}
            maxBarSize={22}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function InvestedChart({
  points
}: {
  points: { month: string; cents: number }[]
}): React.JSX.Element {
  if (points.every((p) => p.cents === 0)) return <EmptyState title="Nada investido nesse período" />
  const data = points.map((p) => ({ ...p, label: formatMonthShort(p.month) }))
  return (
    <div className="chart-box" role="img" aria-label="Patrimônio investido mês a mês">
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
          <XAxis dataKey="label" axisLine={false} tickLine={false} className="chart-axis" />
          <YAxis
            axisLine={false}
            tickLine={false}
            width={80}
            className="chart-axis"
            tickFormatter={(v: number) => compact.format(v / 100)}
          />
          <Tooltip
            cursor={{ className: 'chart-cursor' }}
            content={({ active, payload }) =>
              active && payload?.[0] ? (
                <div className="chart-tooltip">
                  <span>{formatMonth((payload[0].payload as { month: string }).month)}</span>
                  <strong>{formatBRL(payload[0].value as number)}</strong>
                </div>
              ) : null
            }
          />
          <Area
            dataKey="cents"
            type="monotone"
            className="report-area"
            strokeWidth={2}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function CategoryTable({
  slices,
  previous,
  total,
  colorOf,
  previousLabel
}: {
  slices: Slice[]
  previous: Slice[]
  total: number
  colorOf: (name: string) => string
  previousLabel: string
}): React.JSX.Element {
  if (!slices.length) return <EmptyState title="Nenhuma saída" />
  return (
    <table className="data-table data-table--compact">
      <thead>
        <tr>
          <th>Categoria</th>
          <th className="num">Valor</th>
          <th className="num">%</th>
          <th className="num">vs. {previousLabel}</th>
        </tr>
      </thead>
      <tbody>
        {slices.map((s) => {
          const change = percentChange(
            s.cents,
            previous.find((prev) => prev.name === s.name)?.cents ?? 0
          )
          const tone =
            change == null || change === 0 ? 'muted' : change > 0 ? 'negative' : 'positive'
          return (
            <tr key={s.name}>
              <td>
                <span className="report-cat">
                  <span className="legend__dot" style={{ background: colorOf(s.name) }} />
                  {s.name}
                </span>
              </td>
              <td className="num">{formatBRL(s.cents)}</td>
              <td className="num">{share(s.cents, total)}</td>
              <td className={`num ${tone}`}>{change == null ? 'novo' : formatPercent(change)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function SliceList({ slices, empty }: { slices: Slice[]; empty: string }): React.JSX.Element {
  if (!slices.length) return <p className="muted small">{empty}</p>
  return (
    <ul className="mini-list report-list">
      {slices.map((s) => (
        <li key={s.name}>
          <span>{s.name}</span>
          <strong>{formatBRL(s.cents)}</strong>
        </li>
      ))}
    </ul>
  )
}
