import { useMemo, useState } from 'react'
import { Inbox, Pencil, Search, Trash2 } from 'lucide-react'
import {
  deleteTransaction,
  deleteTransactions,
  friendlyError,
  openComposer,
  setTransactionsCategory,
  useApp
} from '../data/store'
import { normalizeText } from '../domain/categories'
import { formatBRL, formatDayMonth, type MonthEntry, type Transaction } from '../domain/finance'
import { Button, EmptyState, Menu, Modal, Pills, Select } from './ui'
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
  // Seleção só no extrato completo (aba Transações): editar ou excluir vários de uma vez.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const visible = useMemo(() => {
    const list = entries.filter(
      (e) => (filter === 'all' || e.transaction.kind === filter) && (!query || matches(e, query))
    )
    return limit ? list.slice(0, limit) : list
  }, [entries, filter, query, limit])

  // Só conta o que está à vista (mês, filtro e busca atuais).
  const visibleTx = [...new Map(visible.map((e) => [e.transaction.id, e.transaction])).values()]
  const chosen = visibleTx.filter((t) => selected.has(t.id))
  const allChosen = visibleTx.length > 0 && chosen.length === visibleTx.length
  const toggle = (id: string): void =>
    setSelected((s) => {
      const next = new Set(s)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const toggleAll = (): void =>
    setSelected(allChosen ? new Set() : new Set(visibleTx.map((t) => t.id)))
  const withCategory = chosen.filter((t) => t.kind !== 'income')
  const changeCategory = (category: string): void => {
    if (!category) return
    setTransactionsCategory(
      withCategory.map((t) => t.id),
      category
    )
      .then(() => setSelected(new Set()))
      .catch((e) => alert(friendlyError(e)))
  }
  const confirmBulkDelete = (): void => {
    deleteTransactions(chosen.map((t) => t.id))
      .then(() => setSelected(new Set()))
      .catch((e) => alert(friendlyError(e)))
    setBulkDeleting(false)
  }

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
          {visibleTx.length > 0 && (
            <label className="statement__select-all">
              <input
                type="checkbox"
                checked={allChosen}
                ref={(el) => {
                  if (el) el.indeterminate = chosen.length > 0 && !allChosen
                }}
                onChange={toggleAll}
              />
              Selecionar todos
            </label>
          )}
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

      {withFilters && chosen.length > 0 && (
        <div className="statement__bulk" role="region" aria-label="Ações da seleção">
          <strong>{chosen.length === 1 ? '1 selecionado' : `${chosen.length} selecionados`}</strong>
          <Select
            label="Mudar categoria"
            options={[
              { value: '', label: withCategory.length ? 'Escolha…' : 'Só entradas selecionadas' },
              ...categories.map((c) => c.name)
            ]}
            value=""
            disabled={!withCategory.length}
            onChange={(e) => changeCategory(e.target.value)}
          />
          <Button
            variant="danger"
            icon={<Trash2 size={16} />}
            onClick={() => setBulkDeleting(true)}
          >
            Excluir
          </Button>
          <Button variant="ghost" onClick={() => setSelected(new Set())}>
            Limpar seleção
          </Button>
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
              <li
                key={`${t.id}-${entry.installmentNumber ?? 0}`}
                className={withFilters ? 'statement__row statement__row--select' : 'statement__row'}
              >
                {withFilters && (
                  <input
                    type="checkbox"
                    className="statement__check"
                    aria-label={`Selecionar ${t.description}`}
                    checked={selected.has(t.id)}
                    onChange={() => toggle(t.id)}
                  />
                )}
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
        open={bulkDeleting}
        onClose={() => setBulkDeleting(false)}
        title={
          chosen.length === 1 ? 'Excluir 1 lançamento?' : `Excluir ${chosen.length} lançamentos?`
        }
        footer={
          <>
            <Button onClick={() => setBulkDeleting(false)}>Cancelar</Button>
            <Button variant="danger" onClick={confirmBulkDelete}>
              Excluir
            </Button>
          </>
        }
      >
        <p>
          {formatBRL(chosen.reduce((s, t) => s + t.amountCents, 0))} em lançamentos vão ser
          apagados.
          {chosen.some((t) => t.kind === 'card' && t.installments > 1)
            ? ' Compras parceladas somem com todas as parcelas.'
            : ''}
          {chosen.some((t) => 'occurrenceTotal' in t && t.occurrenceTotal)
            ? ' Nas séries, só os meses selecionados; os outros continuam.'
            : ''}{' '}
          Isso não pode ser desfeito.
        </p>
      </Modal>

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
