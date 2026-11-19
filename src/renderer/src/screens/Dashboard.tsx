import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import {
  CalendarClock,
  CreditCard,
  PiggyBank,
  Plus,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet
} from 'lucide-react'
import { openComposer, useApp } from '../data/store'
import {
  daysUntil,
  formatBRL,
  formatDayMonth,
  formatMonth,
  formatMonthShort,
  monthEntries,
  monthlySeries,
  percentChange,
  todayISO,
  totalsByCategory,
  upcomingInvoices,
  type MonthEntry,
  type MonthPoint
} from '../domain/finance'
import { Badge, Button, Card, EmptyState, Pills, StatCard } from '../components/ui'
import MonthPicker from '../components/MonthPicker'
import Statement from '../components/Statement'
import { contributionsInMonth } from '../domain/investments'
import { budgetRows } from '../domain/planning'
import { useGoals } from '../data/portfolio'
import { BudgetList, GoalItem } from '../components/Planning'

type Metric = 'expenseCents' | 'incomeCents' | 'balanceCents'

const METRICS: { value: Metric; label: string }[] = [
  { value: 'expenseCents', label: 'Saídas' },
  { value: 'incomeCents', label: 'Entradas' },
  { value: 'balanceCents', label: 'Saldo' }
]

const compact = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1
})

/** Aportes do mês na carteira (compras e aplicações de renda fixa). */
function useInvestedCents(month: string): number {
  const { investmentTransactions, fixedIncome } = useApp((s) => s.investments)
  return contributionsInMonth(investmentTransactions, fixedIncome, month).reduce(
    (sum, c) => sum + c.cents,
    0
  )
}

function CashFlow({ series, month }: { series: MonthPoint[]; month: string }): React.JSX.Element {
  const [metric, setMetric] = useState<Metric>('expenseCents')
  const current = series.find((p) => p.month === month)
  const data = series.map((p) => ({ ...p, label: formatMonthShort(p.month), value: p[metric] }))

  return (
    <Card className="chart-card">
      <div className="card-head">
        <div>
          <h2>Fluxo de caixa</h2>
          <p className="card-head__value">{formatBRL(current?.[metric] ?? 0)}</p>
        </div>
        <Pills label="Mostrar no gráfico" options={METRICS} value={metric} onChange={setMetric} />
      </div>
      <div
        className="chart-box"
        role="img"
        aria-label={`Gráfico de ${METRICS.find((m) => m.value === metric)?.label.toLowerCase()} dos últimos 6 meses`}
      >
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="bar-active-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style={{ stopColor: 'var(--accent-hover)' }} />
                <stop offset="100%" style={{ stopColor: 'var(--accent)' }} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" axisLine={false} tickLine={false} className="chart-axis" />
            <YAxis
              axisLine={false}
              tickLine={false}
              width={64}
              className="chart-axis"
              tickFormatter={(v: number) => compact.format(v / 100)}
            />
            <Tooltip
              cursor={{ className: 'chart-cursor' }}
              content={({ active, payload }) =>
                active && payload?.[0] ? (
                  <div className="chart-tooltip">
                    <span>{formatMonth((payload[0].payload as MonthPoint).month)}</span>
                    <strong>{formatBRL(payload[0].value as number)}</strong>
                  </div>
                ) : null
              }
            />
            <Bar
              dataKey="value"
              radius={[12, 12, 12, 12]}
              maxBarSize={48}
              isAnimationActive={false}
            >
              {data.map((p) => (
                <Cell key={p.month} className={p.month === month ? 'bar bar--active' : 'bar'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

function CategoryDonut({ entries }: { entries: MonthEntry[] }): React.JSX.Element {
  const categories = useApp((s) => s.settings?.categories ?? [])
  const totals = Object.entries(totalsByCategory(entries))
    .map(([name, cents]) => ({
      name,
      cents,
      color: categories.find((c) => c.name === name)?.color ?? 'var(--text-muted)'
    }))
    .sort((a, b) => b.cents - a.cents)
  const total = totals.reduce((sum, t) => sum + t.cents, 0)

  return (
    <Card className="donut-card">
      <h2>Gastos por categoria</h2>
      {total === 0 ? (
        <EmptyState title="Sem gastos neste mês" />
      ) : (
        <>
          <div className="donut">
            <ResponsiveContainer width="100%" height={190}>
              <PieChart>
                <Pie
                  data={totals}
                  dataKey="cents"
                  nameKey="name"
                  innerRadius="74%"
                  outerRadius="100%"
                  paddingAngle={2}
                  cornerRadius={6}
                  stroke="none"
                  isAnimationActive={false}
                >
                  {totals.map((t) => (
                    <Cell key={t.name} fill={t.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="donut__center">
              <span>Total</span>
              <strong>{formatBRL(total)}</strong>
            </div>
          </div>
          <ul className="legend">
            {totals.slice(0, 6).map((t) => (
              <li key={t.name}>
                <span className="legend__dot" style={{ background: t.color }} />
                <span>{t.name}</span>
                <strong>{Math.round((t.cents / total) * 100)}%</strong>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}

function Upcoming(): React.JSX.Element {
  const transactions = useApp((s) => s.transactions)
  const cards = useApp((s) => s.settings?.cards ?? [])
  const today = todayISO()
  const invoices = upcomingInvoices(transactions, cards, today)

  return (
    <Card>
      <div className="card-head">
        <h2>Próximos vencimentos</h2>
      </div>
      {invoices.length === 0 ? (
        <EmptyState
          icon={<CalendarClock size={22} />}
          title="Nada vencendo"
          description={
            cards.some((c) => c.dueDay)
              ? 'Nenhuma fatura aberta para os próximos dias.'
              : 'Cadastre o dia de vencimento dos cartões em Configurações.'
          }
          action={
            cards.some((c) => c.dueDay) ? undefined : (
              <Link className="text-link" to="/configuracoes">
                Abrir Configurações
              </Link>
            )
          }
        />
      ) : (
        <ul className="bills">
          {invoices.map((inv) => {
            const days = daysUntil(inv.dueDate, today)
            const color = cards.find((c) => c.name === inv.card)?.color ?? 'var(--accent)'
            return (
              <li key={inv.card}>
                <span
                  className="bills__icon"
                  style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}
                >
                  <CreditCard size={18} />
                </span>
                <div>
                  <strong>Fatura {inv.card}</strong>
                  <small>
                    {formatDayMonth(inv.dueDate)} · {inv.count}{' '}
                    {inv.count === 1 ? 'lançamento' : 'lançamentos'}
                  </small>
                </div>
                <div className="bills__right">
                  <strong>{formatBRL(inv.totalCents)}</strong>
                  <Badge tone={days <= 3 ? 'warning' : 'neutral'}>
                    {days === 0 ? 'hoje' : days === 1 ? 'amanhã' : `em ${days} dias`}
                  </Badge>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function BudgetCard({
  entries,
  month
}: {
  entries: MonthEntry[]
  month: string
}): React.JSX.Element {
  const limits = useApp((s) => s.budgets[month])
  const rows = budgetRows(limits ?? {}, totalsByCategory(entries))
  const over = rows.filter((r) => r.level === 'over').length

  return (
    <Card>
      <div className="card-head">
        <h2>Orçamento</h2>
        <Link className="text-link" to="/metas">
          {rows.length ? 'Ver tudo' : 'Montar'}
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="muted small">Sem limites para {formatMonth(month).toLowerCase()}.</p>
      ) : (
        <>
          {over > 0 && (
            <p className="small level-text--over budget-total">
              {over === 1 ? '1 categoria chegou' : `${over} categorias chegaram`} ao limite.
            </p>
          )}
          <BudgetList rows={rows.slice(0, 4)} />
        </>
      )}
    </Card>
  )
}

function GoalsCard(): React.JSX.Element {
  const goals = useGoals().filter((g) => !g.progress.done)
  return (
    <Card>
      <div className="card-head">
        <h2>Metas</h2>
        <Link className="text-link" to="/metas">
          {goals.length ? 'Ver todas' : 'Criar'}
        </Link>
      </div>
      {goals.length === 0 ? (
        <EmptyState icon={<Target size={22} />} title="Nenhuma meta em andamento" />
      ) : (
        <div className="goals goals--compact">
          {goals.slice(0, 3).map((view) => (
            <GoalItem key={view.goal.id} view={view} />
          ))}
        </div>
      )}
    </Card>
  )
}

export default function Dashboard(): React.JSX.Element {
  const transactions = useApp((s) => s.transactions)
  const month = useApp((s) => s.month)

  const series = useMemo(() => monthlySeries(transactions, month, 6), [transactions, month])
  const entries = useMemo(() => monthEntries(transactions, month), [transactions, month])
  const now = series[series.length - 1]
  const before = series[series.length - 2]
  const invested = useInvestedCents(month)
  const investedBefore = useInvestedCents(before.month)
  const goal = useApp((s) =>
    (s.settings?.contributionTargets ?? []).reduce((sum, t) => sum + t.monthlyCents, 0)
  )
  const spark = (key: Metric): number[] => series.map((p) => p[key])

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">Como está o mês.</p>
        </div>
        <div className="page-head__actions">
          <MonthPicker />
          <Button variant="primary" icon={<Plus size={18} />} onClick={() => openComposer()}>
            Nova transação
          </Button>
        </div>
      </header>

      <section className="stat-row">
        <StatCard
          label="Saldo do mês"
          tone="sage"
          icon={<Wallet size={16} />}
          valueCents={now.balanceCents}
          change={percentChange(now.balanceCents, before.balanceCents)}
          spark={spark('balanceCents')}
        />
        <StatCard
          label="Entradas"
          tone="butter"
          icon={<TrendingUp size={16} />}
          valueCents={now.incomeCents}
          change={percentChange(now.incomeCents, before.incomeCents)}
          spark={spark('incomeCents')}
        />
        <StatCard
          label="Saídas"
          tone="lilac"
          icon={<TrendingDown size={16} />}
          higherIsWorse
          valueCents={now.expenseCents}
          change={percentChange(now.expenseCents, before.expenseCents)}
          spark={spark('expenseCents')}
        />
        <StatCard
          label="Investido"
          icon={<PiggyBank size={16} />}
          valueCents={invested}
          change={percentChange(invested, investedBefore)}
          note={goal ? `de ${formatBRL(goal)} planejados` : undefined}
        />
      </section>

      <div className="dash-grid">
        <div className="dash-grid__main">
          <CashFlow series={series} month={month} />
          <CategoryDonut entries={entries} />
          <div className="dash-pair">
            <BudgetCard entries={entries} month={month} />
            <GoalsCard />
          </div>
        </div>
        <div className="dash-grid__side">
          <Upcoming />
          <Card>
            <div className="card-head">
              <h2>Lançamentos recentes</h2>
              <Link className="text-link" to="/transacoes">
                Ver todos
              </Link>
            </div>
            <Statement entries={entries} limit={6} />
          </Card>
        </div>
      </div>
    </div>
  )
}
