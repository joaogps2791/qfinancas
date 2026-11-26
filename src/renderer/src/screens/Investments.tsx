import { useEffect, useState } from 'react'
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
  Coins,
  Landmark,
  Link2,
  PiggyBank,
  Plus,
  RefreshCw,
  Target,
  TrendingUp,
  Wallet
} from 'lucide-react'
import { deleteInvestmentDoc, friendlyError, updateSettings, useApp } from '../data/store'
import { usePortfolio, type AssetRow, type FixedRow } from '../data/portfolio'
import {
  centsToInput,
  formatBRL,
  formatDayMonth,
  formatMonth,
  formatMonthShort,
  formatPercent,
  monthKey,
  parseAmountToCents,
  todayISO
} from '../domain/finance'
import {
  ASSET_TYPE_LABELS,
  contributionsInMonth,
  DIVIDEND_TYPE_LABELS,
  dividendsByMonth,
  FIXED_TYPES,
  INDEXER_LABELS,
  parseQuantity,
  VARIABLE_TYPES,
  yieldOnCost,
  type AssetType,
  type FixedIncome,
  type Position
} from '../domain/investments'
import type { QuotesResult } from '../../../main/market'
import type { PluggyInvestments } from '../../../main/pluggy'
import { compareHoldings, OPEN_FINANCE, type HoldingDraft } from '../domain/openFinance'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Menu,
  Modal,
  Select,
  StatCard
} from '../components/ui'
import { DividendForm, FixedIncomeForm, OperationForm } from '../components/InvestmentForms'
import MonthPicker from '../components/MonthPicker'
import './investments.css'

type Dialog = 'operation' | 'fixed' | 'dividend' | 'openFinance' | { draft: HoldingDraft } | null

const CLASS_ORDER: AssetType[] = [
  'acao',
  'fii',
  'etf',
  'tesouro',
  'cdb',
  'lci_lca',
  'poupanca',
  'outro'
]
const classColor = (t: AssetType): string => `var(--chart-${CLASS_ORDER.indexOf(t) + 1})`
const shortDate = (iso: string): string => `${formatDayMonth(iso)}/${iso.slice(2, 4)}`
const isSale = (type: string): boolean => type === 'venda' || type === 'resgate'

// ---------- Tela ----------

export default function Investments(): React.JSX.Element {
  const { investmentTransactions, fixedIncome, dividends } = useApp((s) => s.investments)
  const assetInfo = useApp((s) => s.settings?.assetInfo)
  const month = useApp((s) => s.month)
  const today = todayISO()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [pluggy, setPluggy] = useState<PluggyInvestments | null>(null)
  const {
    open,
    assets,
    fixed,
    quoteTickers,
    quotes,
    valueCents: totalValue,
    costCents: totalCost,
    loading,
    refresh,
    ratesError
  } = usePortfolio()

  const dividends12m = dividendsByMonth(dividends, monthKey(today), 12).reduce(
    (s, d) => s + d.cents,
    0
  )
  const contributions = contributionsInMonth(investmentTransactions, fixedIncome, month)

  const allocation = CLASS_ORDER.map((type) => ({
    type,
    cents:
      assets.filter((a) => a.assetType === type).reduce((s, a) => s + a.valueCents, 0) +
      fixed.filter((f) => f.assetType === type).reduce((s, f) => s + f.estimate.grossCents, 0)
  })).filter((a) => a.cents > 0)

  // Uma linha por mensagem, com os ativos que deram aquele erro ("HGLG11, KNRI11: ...").
  const quoteErrors = Object.entries(
    Object.entries(quotes.errors).reduce<Record<string, string[]>>((acc, [ticker, message]) => {
      ;(acc[message] ??= []).push(ticker)
      return acc
    }, {})
  ).map(([message, tickers]) =>
    tickers.filter(Boolean).length ? `${tickers.join(', ')}: ${message}` : message
  )
  const isEmpty = !investmentTransactions.length && !fixedIncome.length && !dividends.length
  const close = (): void => setDialog(null)
  const draft = dialog && typeof dialog === 'object' ? dialog.draft : null

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Investimentos</h1>
          <p className="muted">Carteira, renda fixa, proventos e aportes.</p>
        </div>
        <div className="page-head__actions">
          <Button
            icon={<RefreshCw size={16} className={loading ? 'spin' : undefined} />}
            disabled={loading || !quoteTickers.length}
            onClick={refresh}
          >
            Atualizar cotações
          </Button>
          {OPEN_FINANCE && (
            <Button icon={<Link2 size={16} />} onClick={() => setDialog('openFinance')}>
              Open Finance
            </Button>
          )}
          <Button icon={<Coins size={16} />} onClick={() => setDialog('dividend')}>
            Provento
          </Button>
          <Button icon={<Landmark size={16} />} onClick={() => setDialog('fixed')}>
            Renda fixa
          </Button>
          <Button
            variant="primary"
            icon={<Plus size={18} />}
            onClick={() => setDialog('operation')}
          >
            Nova operação
          </Button>
        </div>
      </header>

      {quoteErrors.length > 0 && (
        <div className="banner banner--warning" role="status">
          {quoteErrors.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      )}

      {isEmpty ? (
        <Card>
          <EmptyState
            icon={<TrendingUp size={24} />}
            title="Nenhum investimento ainda"
            description="Lance uma compra de ação, FII ou ETF, ou uma aplicação de renda fixa."
            action={
              <Button variant="primary" onClick={() => setDialog('operation')}>
                Nova operação
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <section className="stat-row">
            <StatCard
              label="Patrimônio"
              tone="sage"
              icon={<Wallet size={16} />}
              valueCents={totalValue}
              change={totalCost ? (totalValue - totalCost) / totalCost : null}
            />
            <StatCard
              label="Investido (custo)"
              tone="butter"
              icon={<PiggyBank size={16} />}
              valueCents={totalCost}
            />
            <StatCard
              label="Resultado"
              tone="lilac"
              icon={<TrendingUp size={16} />}
              valueCents={totalValue - totalCost}
            />
            <StatCard
              label="Proventos (12 meses)"
              icon={<Coins size={16} />}
              valueCents={dividends12m}
            />
          </section>

          <div className="invest-grid">
            <Allocation allocation={allocation} total={totalValue} />
            <AssetsTable assets={assets} />
          </div>

          {fixed.length > 0 && <FixedTable fixed={fixed} ratesError={ratesError} />}

          <div className="invest-grid invest-grid--even">
            <Dividends positions={open} today={today} assetInfo={assetInfo ?? {}} quotes={quotes} />
            <Contributions
              month={month}
              contributions={contributions}
              tickers={open.map((p) => p.ticker)}
            />
          </div>

          <History />
        </>
      )}

      <Modal
        open={dialog !== null}
        onClose={close}
        title={
          dialog === 'openFinance'
            ? 'Investimentos no Open Finance'
            : dialog === 'fixed' || draft?.kind === 'fixed'
              ? 'Nova aplicação de renda fixa'
              : dialog === 'dividend'
                ? 'Novo provento'
                : 'Nova operação'
        }
      >
        {dialog === 'openFinance' && (
          <OpenFinanceHoldings
            data={pluggy}
            onData={setPluggy}
            assets={assets}
            fixed={fixed}
            today={today}
            onAdd={(next) => setDialog({ draft: next })}
          />
        )}
        {draft?.kind === 'operation' && (
          <OperationForm initial={draft.data} onDone={() => setDialog('openFinance')} />
        )}
        {draft?.kind === 'fixed' && (
          <FixedIncomeForm initial={draft.data} onDone={() => setDialog('openFinance')} />
        )}
        {dialog === 'operation' && <OperationForm onDone={close} />}
        {dialog === 'fixed' && <FixedIncomeForm onDone={close} />}
        {dialog === 'dividend' && <DividendForm tickers={quoteTickers} onDone={close} />}
      </Modal>
    </div>
  )
}

// ---------- Open Finance ----------

/** Posições da Pluggy ao lado do que foi lançado à mão; o que falta abre o formulário preenchido. */
function OpenFinanceHoldings({
  data,
  onData,
  assets,
  fixed,
  today,
  onAdd
}: {
  data: PluggyInvestments | null
  onData: (data: PluggyInvestments) => void
  assets: AssetRow[]
  fixed: FixedRow[]
  today: string
  onAdd: (draft: HoldingDraft) => void
}): React.JSX.Element {
  const [loading, setLoading] = useState(!data)
  const [error, setError] = useState<string | null>(null)

  const load = (): Promise<void> =>
    window.api.pluggy
      .investments()
      .then(onData)
      .catch((e) => setError(friendlyError(e)))
      .finally(() => setLoading(false))
  const reload = (): void => {
    setLoading(true)
    setError(null)
    load()
  }
  // Busca sozinho só na primeira vez que abre; depois, pelo botão.
  useEffect(() => {
    if (!data) load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const rows = data
    ? compareHoldings(
        data.investments,
        {
          assets,
          fixed: fixed.map((f) => ({ id: f.id, name: f.name, grossCents: f.estimate.grossCents }))
        },
        today
      )
    : []
  const missing = rows.filter((r) => r.appCents === null).length

  return (
    <div className="of-holdings">
      <p className="muted small">
        Saldos que os bancos mandam pelo Meu Pluggy (atualizados uma vez por dia), ao lado da sua
        carteira. Nada é salvo sozinho: em &quot;Lançar&quot; você confere os dados antes.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {data?.errors.map((e) => (
        <p key={e} className="error">
          {e}
        </p>
      ))}
      {loading && <p className="muted">Buscando na Pluggy…</p>}
      {data && !loading && !rows.length && (
        <p className="muted">Nenhum investimento ativo nos bancos conectados.</p>
      )}
      {rows.length > 0 && (
        <>
          <p className="small">
            {missing
              ? `${missing} de ${rows.length} ainda não estão na carteira.`
              : 'Tudo o que está no Open Finance já está na carteira.'}
          </p>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Investimento</th>
                  <th className="num">No banco</th>
                  <th className="num">No app</th>
                  <th className="num">Diferença</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.investment.id}>
                    <td>
                      <strong>{r.investment.code ?? r.investment.name}</strong>
                      <small>
                        {r.investment.bank}
                        {r.investment.code && ` · ${r.investment.name}`}
                        {r.appName && r.appName !== r.investment.code && ` · ligado a ${r.appName}`}
                      </small>
                    </td>
                    <td className="num">{formatBRL(r.pluggyCents)}</td>
                    <td className="num">
                      {r.appCents === null ? (
                        <Badge tone="warning">Falta</Badge>
                      ) : (
                        formatBRL(r.appCents)
                      )}
                    </td>
                    <td className="num">
                      {r.appCents === null ? '—' : formatBRL(r.pluggyCents - r.appCents)}
                    </td>
                    <td>
                      {r.appCents === null && (
                        <Button size="sm" onClick={() => onAdd(r.draft)}>
                          Lançar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="of-holdings__actions">
        <Button
          icon={<RefreshCw size={16} className={loading ? 'spin' : undefined} />}
          disabled={loading}
          onClick={reload}
        >
          Buscar de novo
        </Button>
      </div>
    </div>
  )
}

// ---------- Por classe ----------

function Allocation({
  allocation,
  total
}: {
  allocation: { type: AssetType; cents: number }[]
  total: number
}): React.JSX.Element {
  return (
    <Card className="donut-card invest-box">
      <h2>Por classe</h2>
      <div className="donut">
        <ResponsiveContainer width="100%" height={190}>
          <PieChart>
            <Pie
              data={allocation}
              dataKey="cents"
              nameKey="type"
              innerRadius="74%"
              outerRadius="100%"
              paddingAngle={2}
              cornerRadius={6}
              stroke="none"
              isAnimationActive={false}
            >
              {allocation.map((a) => (
                <Cell key={a.type} className={`alloc alloc--${a.type}`} />
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
        {allocation.map((a) => (
          <li key={a.type}>
            <span className="legend__dot" style={{ background: classColor(a.type) }} />
            <span>{ASSET_TYPE_LABELS[a.type]}</span>
            <strong>{total ? Math.round((a.cents / total) * 100) : 0}%</strong>
          </li>
        ))}
      </ul>
    </Card>
  )
}

// ---------- Ativos ----------

function AssetsTable({ assets }: { assets: AssetRow[] }): React.JSX.Element {
  return (
    <Card className="table-card invest-box">
      <h2>Ativos</h2>
      {assets.length === 0 ? (
        <EmptyState title="Nenhuma ação, FII ou ETF na carteira" />
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ativo</th>
                <th className="num">Qtd.</th>
                <th className="num">Preço médio</th>
                <th className="num">Cotação</th>
                <th className="num">Valor</th>
                <th className="num">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.ticker}>
                  <td>
                    <strong>{a.ticker}</strong>
                    <small>
                      {ASSET_TYPE_LABELS[a.assetType]}
                      {a.oversold && ' · venda maior que a compra'}
                    </small>
                  </td>
                  <td className="num">{a.quantity.toLocaleString('pt-BR')}</td>
                  <td className="num">{formatBRL(a.avgPriceCents)}</td>
                  <td className="num">
                    {a.quote ? (
                      <>
                        {formatBRL(a.quote.priceCents)}
                        <small className={a.quote.changePercent < 0 ? 'negative' : 'positive'}>
                          {formatPercent(a.quote.changePercent / 100)} hoje
                        </small>
                      </>
                    ) : (
                      <small>sem cotação</small>
                    )}
                  </td>
                  <td className="num">{formatBRL(a.valueCents)}</td>
                  <td className={`num ${a.resultCents < 0 ? 'negative' : 'positive'}`}>
                    {formatBRL(a.resultCents)}
                    <small>
                      {a.totalCostCents ? formatPercent(a.resultCents / a.totalCostCents) : ''}
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

// ---------- Renda fixa ----------

const rateText = (f: FixedIncome): string =>
  f.indexer === 'poupanca'
    ? 'Poupança'
    : INDEXER_LABELS[f.indexer].replace('%', `${f.rate.toLocaleString('pt-BR')}%`)

function FixedTable({
  fixed,
  ratesError
}: {
  fixed: FixedRow[]
  ratesError: string | null
}): React.JSX.Element {
  const remove = (f: FixedIncome): void => {
    if (confirm(`Apagar a aplicação "${f.name}"? Isso não pode ser desfeito.`)) {
      deleteInvestmentDoc('fixedIncome', f.id).catch((e) => alert(friendlyError(e)))
    }
  }
  return (
    <Card className="table-card invest-box invest-box--wide">
      <div className="card-head">
        <h2>Tesouro e renda fixa</h2>
        <Badge tone="warning">Estimativa</Badge>
      </div>
      <p className="muted small">
        Valor aplicado corrigido pela taxa contratada, com Selic, CDI e IPCA do Banco Central. É uma
        estimativa: sem marcação a mercado (no Tesouro, o resgate antes do vencimento pode dar outro
        valor) e com o IR regressivo calculado pelo prazo.
      </p>
      {ratesError && <p className="error">{ratesError} Sem as taxas, o valor é aproximado.</p>}
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Aplicação</th>
              <th>Rentabilidade</th>
              <th className="num">Aplicado</th>
              <th className="num">Bruto hoje</th>
              <th className="num">IR estimado</th>
              <th className="num">Líquido</th>
              <th className="num">Vencimento</th>
              <th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {fixed.map((f) => (
              <tr key={f.id}>
                <td>
                  <strong>{f.name}</strong>
                  <small>
                    {ASSET_TYPE_LABELS[f.assetType]} · desde {shortDate(f.startDate)}
                    {f.liquidity && ` · ${f.liquidity}`}
                  </small>
                </td>
                <td>{rateText(f)}</td>
                <td className="num">{formatBRL(f.investedCents)}</td>
                <td className="num">
                  {formatBRL(f.estimate.grossCents)}
                  <small className="positive">+{formatBRL(f.estimate.gainCents)}</small>
                </td>
                <td className="num">
                  {formatBRL(f.estimate.irCents)}
                  <small>
                    {f.estimate.irRate
                      ? `${(f.estimate.irRate * 100).toLocaleString('pt-BR')}%`
                      : 'isento'}
                  </small>
                </td>
                <td className="num">{formatBRL(f.estimate.netCents)}</td>
                <td className="num">{f.maturityDate ? shortDate(f.maturityDate) : '—'}</td>
                <td>
                  <Menu
                    label={`Ações de ${f.name}`}
                    items={[{ label: 'Apagar', danger: true, onSelect: () => remove(f) }]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ---------- Proventos ----------

function Dividends({
  positions,
  today,
  assetInfo,
  quotes
}: {
  positions: Position[]
  today: string
  assetInfo: Record<string, { pvp?: number; dy?: number }>
  quotes: QuotesResult
}): React.JSX.Element {
  const dividends = useApp((s) => s.investments.dividends)
  const series = dividendsByMonth(dividends, monthKey(today), 12).map((d) => ({
    ...d,
    label: formatMonthShort(d.month)
  }))
  const fiis = positions.filter((p) => p.assetType === 'fii')
  const recent = [...dividends]
    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
    .slice(0, 6)

  const saveInfo = (ticker: string, field: 'pvp' | 'dy', text: string): void => {
    const value = text.trim() ? parseQuantity(text) : undefined
    if (value === null) return
    const current = useApp.getState().settings?.assetInfo ?? {}
    const info = { ...current[ticker] }
    if (value === undefined) delete info[field]
    else info[field] = value
    updateSettings({ assetInfo: { ...current, [ticker]: info } }).catch((e) =>
      alert(friendlyError(e))
    )
  }

  const remove = (id: string): void => {
    if (confirm('Apagar este provento?')) {
      deleteInvestmentDoc('dividends', id).catch((e) => alert(friendlyError(e)))
    }
  }

  return (
    <Card className="dividends-card invest-box">
      <h2>Proventos por mês</h2>
      <div className="chart-box">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={series} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="bar-active-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style={{ stopColor: 'var(--accent-hover)' }} />
                <stop offset="100%" style={{ stopColor: 'var(--accent)' }} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" axisLine={false} tickLine={false} className="chart-axis" />
            <YAxis hide />
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
            <Bar dataKey="cents" radius={[8, 8, 8, 8]} maxBarSize={28} isAnimationActive={false}>
              {series.map((d) => (
                <Cell
                  key={d.month}
                  className={d.month === monthKey(today) ? 'bar bar--active' : 'bar'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {fiis.length > 0 && (
        <>
          <h3>FIIs</h3>
          <p className="muted small">
            P/VP e dividend yield à mão: o plano grátis da brapi não traz esses números.
          </p>
          <table className="data-table data-table--compact">
            <thead>
              <tr>
                <th>FII</th>
                <th className="num">Cotação</th>
                <th className="num">P/VP</th>
                <th className="num">DY (%)</th>
                <th className="num">Yield s/ custo</th>
              </tr>
            </thead>
            <tbody>
              {fiis.map((p) => {
                const yoc = yieldOnCost(dividends, p, today)
                const quote = quotes.quotes[p.ticker]
                return (
                  <tr key={p.ticker}>
                    <td>
                      <strong>{p.ticker}</strong>
                    </td>
                    <td className="num">{quote ? formatBRL(quote.priceCents) : '—'}</td>
                    <td className="num">
                      <input
                        className="cell-input"
                        aria-label={`P/VP de ${p.ticker}`}
                        defaultValue={assetInfo[p.ticker]?.pvp?.toLocaleString('pt-BR') ?? ''}
                        onBlur={(e) => saveInfo(p.ticker, 'pvp', e.target.value)}
                      />
                    </td>
                    <td className="num">
                      <input
                        className="cell-input"
                        aria-label={`Dividend yield de ${p.ticker}`}
                        defaultValue={assetInfo[p.ticker]?.dy?.toLocaleString('pt-BR') ?? ''}
                        onBlur={(e) => saveInfo(p.ticker, 'dy', e.target.value)}
                      />
                    </td>
                    <td className="num">
                      {yoc === null
                        ? '—'
                        : `${(yoc * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}

      {recent.length > 0 && (
        <>
          <h3>Últimos recebidos</h3>
          <ul className="mini-list">
            {recent.map((d) => (
              <li key={d.id}>
                <span>
                  <strong>{d.ticker}</strong>{' '}
                  <small>
                    {DIVIDEND_TYPE_LABELS[d.type]} · {shortDate(d.paymentDate)}
                  </small>
                </span>
                <span className="positive">{formatBRL(d.amountCents)}</span>
                <Menu
                  label={`Ações do provento de ${d.ticker}`}
                  items={[{ label: 'Apagar', danger: true, onSelect: () => remove(d.id) }]}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}

// ---------- Aportes do mês e metas ----------

const targetLabel = (key: string): string =>
  key.startsWith('class:') ? (ASSET_TYPE_LABELS[key.slice(6) as AssetType] ?? key) : key.slice(7)

/** Quanto do mês foi para a meta: por classe ("class:fii") ou por ativo ("ticker:HGLG11"). */
const contributedTo = (key: string, items: ReturnType<typeof contributionsInMonth>): number =>
  items
    .filter((c) =>
      key.startsWith('class:') ? c.assetType === key.slice(6) : c.ticker === key.slice(7)
    )
    .reduce((s, c) => s + c.cents, 0)

function Contributions({
  month,
  contributions,
  tickers
}: {
  month: string
  contributions: ReturnType<typeof contributionsInMonth>
  tickers: string[]
}): React.JSX.Element {
  const targets = useApp((s) => s.settings?.contributionTargets) ?? []
  const [editing, setEditing] = useState(false)
  const total = contributions.reduce((s, c) => s + c.cents, 0)
  const goal = targets.reduce((s, t) => s + t.monthlyCents, 0)

  return (
    <Card className="invest-box">
      <div className="card-head">
        <div>
          <h2>Aportes do mês</h2>
          <p className="card-head__value">{formatBRL(total)}</p>
          {goal > 0 && (
            <p className="muted small">
              de {formatBRL(goal)} planejados para {formatMonth(month)}
            </p>
          )}
        </div>
        <MonthPicker />
      </div>

      {editing ? (
        <TargetsEditor tickers={tickers} onDone={() => setEditing(false)} />
      ) : targets.length === 0 ? (
        <EmptyState
          icon={<Target size={22} />}
          title="Sem meta de aporte"
          description="Planeje quanto aportar por mês em cada classe ou ativo."
          action={<Button onClick={() => setEditing(true)}>Criar metas</Button>}
        />
      ) : (
        <>
          <ul className="targets">
            {targets.map((t) => {
              const value = contributedTo(t.key, contributions)
              const ratio = t.monthlyCents ? Math.min(1, value / t.monthlyCents) : 0
              return (
                <li key={t.key}>
                  <div className="row between">
                    <strong>{targetLabel(t.key)}</strong>
                    <span className="muted small">
                      {formatBRL(value)} de {formatBRL(t.monthlyCents)}
                    </span>
                  </div>
                  <div
                    className="progress"
                    role="progressbar"
                    aria-label={`Aporte em ${targetLabel(t.key)}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(ratio * 100)}
                  >
                    <span
                      style={{ width: `${ratio * 100}%` }}
                      className={ratio >= 1 ? 'is-done' : undefined}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
          <Button size="sm" onClick={() => setEditing(true)}>
            Editar metas
          </Button>
        </>
      )}
    </Card>
  )
}

function TargetsEditor({
  tickers,
  onDone
}: {
  tickers: string[]
  onDone: () => void
}): React.JSX.Element {
  const saved = useApp((s) => s.settings?.contributionTargets) ?? []
  const [rows, setRows] = useState(
    saved.map((t) => ({ key: t.key, amount: centsToInput(t.monthlyCents) }))
  )
  const [error, setError] = useState<string | null>(null)
  const options = [
    ...[...new Set([...VARIABLE_TYPES, ...FIXED_TYPES])].map((t) => ({
      value: `class:${t}`,
      label: `Classe: ${ASSET_TYPE_LABELS[t]}`
    })),
    ...tickers.map((t) => ({ value: `ticker:${t}`, label: `Ativo: ${t}` }))
  ]
  const update = (i: number, patch: Partial<(typeof rows)[number]>): void =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  const save = (): void => {
    const parsed = rows.map((r) => ({
      key: r.key,
      monthlyCents: parseAmountToCents(r.amount) ?? 0
    }))
    if (parsed.some((r) => !r.monthlyCents))
      return setError('Confira os valores (formato 1.234,56).')
    if (new Set(parsed.map((r) => r.key)).size !== parsed.length) {
      return setError('Cada classe ou ativo só pode aparecer uma vez.')
    }
    updateSettings({ contributionTargets: parsed })
      .then(onDone)
      .catch((e) => setError(friendlyError(e)))
  }

  return (
    <div className="targets-editor">
      {rows.map((row, i) => (
        <div key={i} className="add-row add-row--3">
          <Select
            label="Classe ou ativo"
            options={options}
            value={row.key}
            onChange={(e) => update(i, { key: e.target.value })}
          />
          <Input
            label="Por mês (R$)"
            inputMode="decimal"
            value={row.amount}
            onChange={(e) => update(i, { amount: e.target.value })}
          />
          <Button variant="ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
            Tirar
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        icon={<Plus size={14} />}
        onClick={() => setRows([...rows, { key: options[0].value, amount: '' }])}
      >
        Adicionar meta
      </Button>
      {error && <p className="error">{error}</p>}
      <div className="tx-form__actions">
        <Button onClick={onDone}>Cancelar</Button>
        <Button variant="primary" onClick={save}>
          Salvar metas
        </Button>
      </div>
    </div>
  )
}

// ---------- Histórico ----------

function History(): React.JSX.Element {
  const { investmentTransactions, fixedIncome } = useApp((s) => s.investments)
  const rows = [
    ...investmentTransactions.map((t) => ({
      id: t.id,
      collection: 'investmentTransactions' as const,
      date: t.date,
      title: `${isSale(t.type) ? 'Venda' : 'Compra'} de ${t.quantity.toLocaleString('pt-BR')} ${t.ticker}`,
      detail: `${formatBRL(t.unitPriceCents)} cada${t.feesCents ? ` + ${formatBRL(t.feesCents)} de taxas` : ''}${t.broker ? ` · ${t.broker}` : ''}`,
      cents:
        Math.round(t.quantity * t.unitPriceCents) + (isSale(t.type) ? -t.feesCents : t.feesCents),
      sale: isSale(t.type)
    })),
    ...fixedIncome.map((f) => ({
      id: f.id,
      collection: 'fixedIncome' as const,
      date: f.startDate,
      title: `Aplicação em ${f.name}`,
      detail: ASSET_TYPE_LABELS[f.assetType],
      cents: f.investedCents,
      sale: false
    }))
  ].sort((a, b) => b.date.localeCompare(a.date))

  const remove = (row: (typeof rows)[number]): void => {
    if (confirm(`Apagar "${row.title}"? Se houver lançamento no extrato, ele continua lá.`)) {
      deleteInvestmentDoc(row.collection, row.id).catch((e) => alert(friendlyError(e)))
    }
  }

  return (
    <Card className="invest-box invest-box--wide">
      <h2>Histórico de aportes e vendas</h2>
      {rows.length === 0 ? (
        <EmptyState title="Nada lançado ainda" />
      ) : (
        <ul className="statement__list">
          {rows.map((r) => (
            <li key={r.id} className="statement__row statement__row--history">
              <div className="statement__main">
                <strong>{r.title}</strong>
                <small>{r.detail}</small>
              </div>
              <span className="statement__date">{shortDate(r.date)}</span>
              <span className={r.sale ? 'statement__value positive' : 'statement__value'}>
                {formatBRL(r.cents)}
              </span>
              <Menu
                label={`Ações de ${r.title}`}
                items={[{ label: 'Apagar', danger: true, onSelect: () => remove(r) }]}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
