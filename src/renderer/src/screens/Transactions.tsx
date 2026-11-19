import { useEffect, useMemo, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { openComposer, useApp } from '../data/store'
import { formatBRL, monthEntries, summarizeEntries } from '../domain/finance'
import { Button, Card } from '../components/ui'
import MonthPicker from '../components/MonthPicker'
import Statement from '../components/Statement'

export default function Transactions(): React.JSX.Element {
  const transactions = useApp((s) => s.transactions)
  const month = useApp((s) => s.month)
  const entries = useMemo(() => monthEntries(transactions, month), [transactions, month])
  const summary = summarizeEntries(entries)
  const searchRef = useRef<HTMLInputElement>(null)
  const location = useLocation()
  const focusSearch = (location.state as { focusSearch?: number } | null)?.focusSearch

  // Ctrl+K em qualquer tela traz para cá com a busca focada.
  useEffect(() => {
    if (focusSearch) searchRef.current?.focus()
  }, [focusSearch])

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Transações</h1>
          <p className="muted">Entradas, gastos à vista e compras no cartão do mês.</p>
        </div>
        <div className="page-head__actions">
          <MonthPicker />
          <Button variant="primary" icon={<Plus size={18} />} onClick={() => openComposer()}>
            Nova transação
          </Button>
        </div>
      </header>

      <div className="mini-stats">
        <span>
          Entradas <strong className="positive">{formatBRL(summary.incomeCents)}</strong>
        </span>
        <span>
          À vista <strong>{formatBRL(summary.cashCents)}</strong>
        </span>
        <span>
          Cartões <strong>{formatBRL(summary.cardCents)}</strong>
        </span>
        <span>
          Saldo{' '}
          <strong className={summary.balanceCents < 0 ? 'negative' : undefined}>
            {formatBRL(summary.balanceCents)}
          </strong>
        </span>
      </div>

      <Card>
        <Statement entries={entries} withFilters searchRef={searchRef} />
      </Card>
    </div>
  )
}
