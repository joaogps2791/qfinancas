import { useMemo, useState } from 'react'
import { Inbox, Pencil, Search, Trash2 } from 'lucide-react'
import { deleteTransaction, friendlyError, openComposer, useApp } from '../data/store'
import { normalizeText } from '../domain/categories'
import { formatBRL, formatDayMonth, type MonthEntry, type Transaction } from '../domain/finance'
import { Button, EmptyState, Menu, Modal, Pills } from './ui'
import { IconBadge } from './TxIcon'
import { resolveTxIcon } from './iconData'

type Filter = 'all' | Transaction['kind']

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'income', label: 'Entradas' },
  { value: 'cash', label: 'À vista' },
  { value: 'card', label: 'Cartões' }
]

function detail(entry: MonthEntry): string {
  const t = entry.transaction
  const series =
    'occurrenceTotal' in t && t.occurrenceTotal
      ? ` · ${t.occurrenceNumber}/${t.occurrenceTotal}`
      : ''
  if (t.kind === 'income') return t.incomeType
  if (t.kind === 'cash') return `${t.category} · ${t.paymentMethod}${series}`
  const installment = t.installments > 1 ? ` · ${entry.installmentNumber}/${t.installments}` : ''
  return `${t.category} · ${t.card}${installment}${series}`
}

const matches = (entry: MonthEntry, query: string): boolean => {
  const t = entry.transaction
  const haystack = [
    t.description,
    'category' in t ? t.category : t.incomeType,
    t.kind === 'card' ? t.card : ''
  ]
    .map(normalizeText)
    .join(' ')
  return haystack.includes(normalizeText(query.trim()))
}

type StatementProps = {
  entries: MonthEntry[]
  /** extrato completo, com filtros e busca */
  withFilters?: boolean
  limit?: number
  searchRef?: React.Ref<HTMLInputElement>
  emptyText?: string
}

/** Lista de lançamentos: ícone, nome, categoria/pagamento, data, valor e o menu "…". */
export default function Statement({
  entries,
  withFilters = false,
  limit,
  searchRef,
  emptyText = 'Nenhum lançamento neste mês.'
}: StatementProps): React.JSX.Element {
  const categories = useApp((s) => s.settings?.categories) ?? []
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [deleting, setDeleting] = useState<Transaction | null>(null)

  const visible = useMemo(() => {
    const list = entries.filter(
      (e) => (filter === 'all' || e.transaction.kind === filter) && (!query || matches(e, query))
    )
    return limit ? list.slice(0, limit) : list
  }, [entries, filter, query, limit])

  const confirmDelete = (): void => {
    if (!deleting) return
    deleteTransaction(deleting.id).catch((e) => alert(friendlyError(e)))
    setDeleting(null)
  }

  return (
    <div className="statement">
      {withFilters && (
        <div className="statement__tools">
          <Pills
            label="Filtrar lançamentos"
            options={FILTERS}
            value={filter}
            onChange={setFilter}
          />
          <label className="search">
            <Search size={16} aria-hidden />
            <input
              ref={searchRef}
              type="search"
              placeholder="Buscar (Ctrl+K)"
              aria-label="Buscar lançamentos"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon={<Inbox size={24} />}
          title={query || filter !== 'all' ? 'Nada encontrado' : emptyText}
          description={
            query || filter !== 'all'
              ? 'Tente outra busca ou outro filtro.'
              : 'Use Ctrl+N para lançar.'
          }
        />
      ) : (
        <ul className="statement__list">
          {visible.map((entry) => {
            const t = entry.transaction
            const income = t.kind === 'income'
            return (
              <li key={`${t.id}-${entry.installmentNumber ?? 0}`} className="statement__row">
                <IconBadge icon={resolveTxIcon(t, categories)} />
                <div className="statement__main">
                  <strong>{t.description}</strong>
                  <small>{detail(entry)}</small>
                </div>
                <span className="statement__date">{formatDayMonth(entry.date)}</span>
                <span className={income ? 'statement__value positive' : 'statement__value'}>
                  {income ? '+' : '−'} {formatBRL(entry.amountCents)}
                </span>
                <Menu
                  label={`Ações de ${t.description}`}
                  items={[
                    {
                      label: 'Editar',
                      icon: <Pencil size={16} />,
                      onSelect: () => openComposer(t)
                    },
                    {
                      label: 'Excluir',
                      icon: <Trash2 size={16} />,
                      danger: true,
                      onSelect: () => setDeleting(t)
                    }
                  ]}
                />
              </li>
            )
          })}
        </ul>
      )}

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Excluir lançamento?"
        footer={
          <>
            <Button onClick={() => setDeleting(null)}>Cancelar</Button>
            <Button variant="danger" onClick={confirmDelete}>
              Excluir
            </Button>
          </>
        }
      >
        {deleting && (
          <p>
            &quot;{deleting.description}&quot; ({formatBRL(deleting.amountCents)}) vai ser apagado.
            {'occurrenceTotal' in deleting && deleting.occurrenceTotal
              ? ' Só este mês da série; os outros continuam.'
              : ''}
            {deleting.kind === 'card' && deleting.installments > 1
              ? ' Todas as parcelas somem junto, porque são uma compra só.'
              : ''}{' '}
            Isso não pode ser desfeito.
          </p>
        )}
      </Modal>
    </div>
  )
}
