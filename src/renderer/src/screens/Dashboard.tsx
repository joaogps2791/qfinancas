import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
  formatBRL,
  formatDayMonth,
  formatMonth,
  formatMonthShort,
  monthEntries,
  monthlySeries,
  percentChange,
  todayISO,
  totalsByCategory,
  type MonthEntry,
  type MonthPoint
} from '../domain/finance'
import { Badge, Button, Card, EmptyState, Pills, StatCard } from '../components/ui'
import { IconBadge } from '../components/TxIcon'
import { billIcon } from '../components/iconData'
import MonthPicker from '../components/MonthPicker'
import Statement from '../components/Statement'
import { contributionsInMonth } from '../domain/investments'
import { budgetRows } from '../domain/planning'
import { dueItems, type DueItem } from '../domain/alerts'
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
  const categories = useApp((s) => s.settings?.categories) ?? []
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
            {totals.map((t) => (
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
  const navigate = useNavigate()
  const transactions = useApp((s) => s.transactions)
  const cards = useApp((s) => s.settings?.cards) ?? []
  const bills = useApp((s) => s.bills)
  const categories = useApp((s) => s.settings?.categories) ?? []
  const items = dueItems(transactions, cards, bills, todayISO())
  const open = (item: DueItem): void => {
    if (item.target.to === '/cartoes') {
      useApp.setState({ month: item.target.month })
      navigate('/cartoes', { state: { card: item.target.card } })
    } else navigate('/contas', { state: { bill: item.target.bill } })
  }

  return (
    <Card className="dash-card">
      <div className="card-head">
        <h2>Próximos vencimentos</h2>
        <Link className="text-link" to="/contas">
          Contas fixas
        </Link>
      </div>
      <div className="dash-card__body">
        {items.length === 0 ? (
          <EmptyState
            icon={<CalendarClock size={22} />}
            title="Nada vencendo"
            description={
              cards.some((c) => c.dueDay) || bills.length
                ? 'Nenhuma fatura ou conta em aberto para os próximos dias.'
                : 'Cadastre o vencimento dos cartões em Configurações e as contas fixas em Contas.'
            }
          />
        ) : (
          <ul className="bills">
            {items.map((item) => {
              const bill = bills.find((b) => b.id === item.billId)
              const { target } = item
              const color =
                target.to === '/cartoes'
                  ? (cards.find((c) => c.name === target.card)?.color ?? 'var(--accent)')
                  : 'var(--text-muted)'
              return (
                <li key={item.key}>
                  <button type="button" className="bills__row" onClick={() => open(item)}>
                    {bill ? (
                      <IconBadge icon={billIcon(bill, categories)} size={40} />
                    ) : (
                      <span
                        className="bills__icon"
                        style={{
                          color,
                          background: `color-mix(in srgb, ${color} 16%, transparent)`
                        }}
                      >
                        <CreditCard size={18} />
                      </span>
                    )}
                    <div>
                      <strong>{item.title}</strong>
                      <small>
                        {formatDayMonth(item.dueDate)} ·{' '}
                        {item.kind === 'card' ? 'fatura' : 'conta fixa'}
                      </small>
                    </div>
                    <div className="bills__right">
                      <strong>{formatBRL(item.amountCents)}</strong>
                      <Badge
                        tone={item.days < 0 ? 'danger' : item.days <= 3 ? 'warning' : 'neutral'}
                      >
                        {item.days < 0
                          ? 'atrasada'
                          : item.days === 0
                            ? 'hoje'
                            : item.days === 1
                              ? 'amanhã'
                              : `em ${item.days} dias`}
                      </Badge>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
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
    <Card className="dash-card">
      <div className="card-head">
        <h2>Orçamento</h2>
        <Link className="text-link" to="/metas">
          {rows.length ? 'Ver tudo' : 'Montar'}
        </Link>
      </div>
      <div className="dash-card__body">
        {rows.length === 0 ? (
          <p className="muted small">Sem limites para {formatMonth(month).toLowerCase()}.</p>
        ) : (
          <>
            {over > 0 && (
              <p className="small level-text--over budget-total">
                {over === 1 ? '1 categoria chegou' : `${over} categorias chegaram`} ao limite.
              </p>
            )}
            <BudgetList rows={rows} />
          </>
        )}
      </div>
    </Card>
  )
}

function GoalsCard(): React.JSX.Element {
  const goals = useGoals().filter((g) => !g.progress.done)
  return (
    <Card className="dash-card">
      <div className="card-head">
        <h2>Metas</h2>
        <Link className="text-link" to="/metas">
          {goals.length ? 'Ver todas' : 'Criar'}
        </Link>
      </div>
      <div className="dash-card__body">
        {goals.length === 0 ? (
          <EmptyState icon={<Target size={22} />} title="Nenhuma meta em andamento" />
        ) : (
          <div className="goals goals--compact">
            {goals.map((view) => (
              <GoalItem key={view.goal.id} view={view} />
            ))}
          </div>
        )}
      </div>
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

      {/* Grade em 3 linhas de altura fixa: caixas da mesma linha têm o mesmo tamanho e o
          conteúdo que não cabe rola dentro delas. */}
      <div className="dash-grid">
        <CashFlow series={series} month={month} />
        <Upcoming />
        <CategoryDonut entries={entries} />
        <Card className="dash-card dash-card--recent">
          <div className="card-head">
            <h2>Lançamentos recentes</h2>
            <Link className="text-link" to="/transacoes">
              Ver todos
            </Link>
          </div>
          <div className="dash-card__body">
            <Statement entries={entries} />
          </div>
        </Card>
        <div className="dash-pair">
          <BudgetCard entries={entries} month={month} />
          <GoalsCard />
        </div>
      </div>
    </div>
  )
}
