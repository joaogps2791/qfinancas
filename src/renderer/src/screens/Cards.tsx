import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ChevronLeft, ChevronRight, CreditCard, Link2, Pencil, Plus, RefreshCw } from 'lucide-react'
import { friendlyError, openComposer, useApp } from '../data/store'
import { formatBRL, formatDayMonth, monthEntries } from '../domain/finance'
import { accentOf } from '../domain/cardSkins'
import type { Card as CardData } from '../domain/categories'
import { compareCards, OPEN_FINANCE } from '../domain/openFinance'
import type { PluggyCards } from '../../../main/pluggy'
import { Badge, Button, Card, EmptyState, Modal } from '../components/ui'
import MonthPicker from '../components/MonthPicker'
import Statement from '../components/Statement'
import CardArt from '../components/CardArt'
import CardForm from '../components/CardForm'

const pad = (n: number): string => String(n).padStart(2, '0')

export default function Cards(): React.JSX.Element {
  const transactions = useApp((s) => s.transactions)
  const month = useApp((s) => s.month)
  const cards = useApp((s) => s.settings?.cards) ?? []
  const [editing, setEditing] = useState<
    'new' | 'current' | 'openFinance' | { prefill: CardData } | null
  >(null)
  const [pluggy, setPluggy] = useState<PluggyCards | null>(null)
  // A escolha vale para a navegação em que foi feita; um clique numa notificação
  // (nova navegação com { card }) passa na frente.
  const location = useLocation()
  const [pick, setPick] = useState<{ name: string; at: string } | null>(null)
  const fromAlert = (location.state as { card?: string } | null)?.card
  const selected =
    pick && (pick.at === location.key || !fromAlert) ? pick.name : (fromAlert ?? null)
  const setSelected = (name: string): void => setPick({ name, at: location.key })
  const card = cards.find((c) => c.name === selected) ?? cards[0]
  const index = card ? cards.indexOf(card) : -1
  const scroller = useRef<HTMLDivElement>(null)

  // Mantém o cartão escolhido à vista no carrossel.
  useEffect(() => {
    scroller.current
      ?.querySelector('[aria-current="true"]')
      ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [card?.name])

  const entries = useMemo(
    () =>
      monthEntries(transactions, month).filter(
        (e) => e.transaction.kind === 'card' && e.transaction.card === card?.name
      ),
    [transactions, month, card?.name]
  )
  const total = entries.reduce((sum, e) => sum + e.amountCents, 0)

  const prefill = editing && typeof editing === 'object' ? editing.prefill : undefined
  const form = (
    <Modal
      open={editing !== null}
      onClose={() => setEditing(null)}
      title={
        editing === 'openFinance'
          ? 'Cartões no Open Finance'
          : editing === 'current'
            ? 'Editar cartão'
            : 'Novo cartão'
      }
    >
      {editing === 'openFinance' && (
        <OpenFinanceCards
          data={pluggy}
          onData={setPluggy}
          cards={cards}
          onCreate={(next) => setEditing({ prefill: next })}
        />
      )}
      {editing !== null && editing !== 'openFinance' && (
        <CardForm
          key={editing === 'new' ? 'new' : prefill ? `of:${prefill.name}` : card?.name}
          card={editing === 'current' ? card : undefined}
          prefill={prefill}
          onDone={() => setEditing(prefill ? 'openFinance' : null)}
        />
      )}
    </Modal>
  )
  const fromOpenFinance = OPEN_FINANCE && (
    <Button icon={<Link2 size={16} />} onClick={() => setEditing('openFinance')}>
      Do Open Finance
    </Button>
  )

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
              <div className="row">
                {fromOpenFinance}
                <Button variant="primary" onClick={() => setEditing('new')}>
                  Cadastrar cartão
                </Button>
              </div>
            }
          />
        </Card>
        {form}
      </div>
    )
  }

  const [year, monthNumber] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  const dueDate = card.dueDay ? `${month}-${pad(Math.min(card.dueDay, lastDay))}` : null
  // shortcut: "usado" é a fatura deste mês; parcelas futuras não entram, até haver o limite real do banco
  const used = Math.min(total, card.limitCents ?? 0)
  const go = (step: number): void =>
    setSelected(cards[(index + step + cards.length) % cards.length].name)

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Cartões</h1>
          <p className="muted">A fatura de cada cartão no mês escolhido.</p>
        </div>
        <div className="page-head__actions">
          <MonthPicker />
          {fromOpenFinance}
          <Button icon={<Plus size={16} />} onClick={() => setEditing('new')}>
            Novo cartão
          </Button>
          <Button variant="primary" icon={<Plus size={18} />} onClick={() => openComposer()}>
            Nova compra
          </Button>
        </div>
      </header>

      <div className="card-carousel">
        {cards.length > 1 && (
          <Button
            variant="ghost"
            aria-label="Cartão anterior"
            icon={<ChevronLeft size={20} />}
            onClick={() => go(-1)}
          />
        )}
        <div
          className="card-carousel__track"
          ref={scroller}
          role="listbox"
          aria-label="Cartões"
          // Roda do mouse anda para os lados.
          onWheel={(e) => {
            if (scroller.current && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
              scroller.current.scrollLeft += e.deltaY
            }
          }}
        >
          {cards.map((c) => (
            <button
              key={c.name}
              type="button"
              role="option"
              aria-selected={c.name === card.name}
              aria-current={c.name === card.name}
              className="card-carousel__item"
              onClick={() => setSelected(c.name)}
            >
              <CardArt card={c} size={c.name === card.name ? 'lg' : 'md'} interactive />
            </button>
          ))}
        </div>
        {cards.length > 1 && (
          <Button
            variant="ghost"
            aria-label="Próximo cartão"
            icon={<ChevronRight size={20} />}
            onClick={() => go(1)}
          />
        )}
      </div>

      <Card
        className="invoice-summary"
        style={{ '--card-accent': accentOf(card) } as React.CSSProperties}
      >
        <div className="invoice-summary__head">
          <div>
            <span className="muted">Fatura de {card.name}</span>
            <strong className="invoice-summary__total">{formatBRL(total)}</strong>
            <span className="muted small">
              {entries.length} {entries.length === 1 ? 'lançamento' : 'lançamentos'}
              {dueDate && ` · vence ${formatDayMonth(dueDate)}`}
              {card.closingDay ? ` · fecha dia ${card.closingDay}` : ''}
            </span>
          </div>
          <Button size="sm" icon={<Pencil size={14} />} onClick={() => setEditing('current')}>
            Editar cartão
          </Button>
        </div>
        {card.limitCents ? (
          <div className="invoice-summary__limit">
            <div
              className="progress"
              role="progressbar"
              aria-label="Limite usado nesta fatura"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round((used / card.limitCents) * 100)}
            >
              <span style={{ width: `${(used / card.limitCents) * 100}%` }} />
            </div>
            <span className="muted small">
              {formatBRL(used)} usados · {formatBRL(card.limitCents - used)} disponíveis de{' '}
              {formatBRL(card.limitCents)}
            </span>
          </div>
        ) : null}
        {(!card.closingDay || !card.dueDay) && (
          <button type="button" className="text-link" onClick={() => setEditing('current')}>
            Cadastrar fechamento e vencimento
          </button>
        )}
      </Card>

      <Card>
        <Statement entries={entries} emptyText="Nenhuma compra nesta fatura." />
      </Card>
      {form}
    </div>
  )
}

/** Cartões da Pluggy ao lado dos cadastrados; o que falta abre o cadastro já preenchido. */
function OpenFinanceCards({
  data,
  onData,
  cards,
  onCreate
}: {
  data: PluggyCards | null
  onData: (data: PluggyCards) => void
  cards: CardData[]
  onCreate: (card: CardData) => void
}): React.JSX.Element {
  const [loading, setLoading] = useState(!data)
  const [error, setError] = useState<string | null>(null)

  const load = (): Promise<void> =>
    window.api.pluggy
      .cards()
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

  const rows = data ? compareCards(data.cards, cards) : []

  return (
    <div className="of-cards">
      <p className="muted small">
        Cartões de crédito dos bancos conectados no Meu Pluggy. Em &quot;Criar&quot; o cadastro abre
        preenchido: escolha o modelo, confira e salve.
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
        <p className="muted">Nenhum cartão de crédito nos bancos conectados.</p>
      )}
      {rows.length > 0 && (
        <ul className="of-cards__list">
          {rows.map((r) => (
            <li key={r.source.id}>
              <CardArt card={r.draft} size="sm" />
              <div className="of-cards__info">
                <strong>{r.source.name || r.draft.name}</strong>
                <small>
                  {[
                    r.source.bank,
                    r.source.last4 && `final ${r.source.last4}`,
                    r.draft.closingDay &&
                      r.draft.dueDay &&
                      `fecha dia ${r.draft.closingDay}, vence dia ${r.draft.dueDay}`
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </small>
              </div>
              {r.existing ? (
                <Badge tone="success">Já cadastrado: {r.existing}</Badge>
              ) : (
                <Button size="sm" variant="primary" onClick={() => onCreate(r.draft)}>
                  Criar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="of-cards__actions">
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
