import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CreditCard, Plus } from 'lucide-react'
import { openComposer, useApp } from '../data/store'
import { formatBRL, formatDayMonth, monthEntries } from '../domain/finance'
import { Button, Card, EmptyState, Pills } from '../components/ui'
import MonthPicker from '../components/MonthPicker'
import Statement from '../components/Statement'
import { inkOn } from '../components/iconData'

const pad = (n: number): string => String(n).padStart(2, '0')

export default function Cards(): React.JSX.Element {
  const transactions = useApp((s) => s.transactions)
  const month = useApp((s) => s.month)
  const cards = useApp((s) => s.settings?.cards) ?? []
  // A escolha vale para a navegação em que foi feita; um clique numa notificação
  // (nova navegação com { card }) passa na frente.
  const location = useLocation()
  const [pick, setPick] = useState<{ name: string; at: string } | null>(null)
  const fromAlert = (location.state as { card?: string } | null)?.card
  const selected =
    pick && (pick.at === location.key || !fromAlert) ? pick.name : (fromAlert ?? null)
  const setSelected = (name: string): void => setPick({ name, at: location.key })
  const card = cards.find((c) => c.name === selected) ?? cards[0]

  const entries = useMemo(
    () =>
      monthEntries(transactions, month).filter(
        (e) => e.transaction.kind === 'card' && e.transaction.card === card?.name
      ),
    [transactions, month, card?.name]
  )
  const total = entries.reduce((sum, e) => sum + e.amountCents, 0)

  if (!card) {
    return (
      <div className="page">
        <header className="page-head">
          <h1>Cartões</h1>
        </header>
        <Card>
          <EmptyState
            icon={<CreditCard size={24} />}
            title="Nenhum cartão cadastrado"
            action={
              <Link className="text-link" to="/configuracoes">
                Cadastrar em Configurações
              </Link>
            }
          />
        </Card>
      </div>
    )
  }

  const [year, monthNumber] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  const dueDate = card.dueDay ? `${month}-${pad(Math.min(card.dueDay, lastDay))}` : null
  const ink = inkOn(card.color)

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Cartões</h1>
          <p className="muted">A fatura de cada cartão no mês escolhido.</p>
        </div>
        <div className="page-head__actions">
          <MonthPicker />
          <Button variant="primary" icon={<Plus size={18} />} onClick={() => openComposer()}>
            Nova compra
          </Button>
        </div>
      </header>

      <Pills
        label="Cartão"
        options={cards.map((c) => ({ value: c.name, label: c.name }))}
        value={card.name}
        onChange={setSelected}
      />

      <div className="card-overview">
        <div
          className="credit-card"
          style={{
            color: ink,
            background: `linear-gradient(135deg, ${card.color}, color-mix(in srgb, ${card.color} 70%, black))`
          }}
        >
          <CreditCard size={26} aria-hidden />
          <strong className="credit-card__name">{card.name}</strong>
          <span className="credit-card__days">
            {card.closingDay ? `Fecha dia ${card.closingDay}` : 'Sem dia de fechamento'}
            {' · '}
            {card.dueDay ? `vence dia ${card.dueDay}` : 'sem vencimento'}
          </span>
        </div>
        <Card className="invoice-total">
          <span className="muted">Fatura do mês</span>
          <strong>{formatBRL(total)}</strong>
          <span className="muted">
            {entries.length} {entries.length === 1 ? 'lançamento' : 'lançamentos'}
            {dueDate && ` · vence ${formatDayMonth(dueDate)}`}
          </span>
          {(!card.closingDay || !card.dueDay) && (
            <Link className="text-link" to="/configuracoes">
              Cadastrar fechamento e vencimento
            </Link>
          )}
        </Card>
      </div>

      <Card>
        <Statement entries={entries} emptyText="Nenhuma compra nesta fatura." />
      </Card>
    </div>
  )
}
