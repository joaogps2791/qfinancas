import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { CalendarClock, Check, Plus, Undo2 } from 'lucide-react'
import {
  deleteBill,
  friendlyError,
  markBillPaid,
  saveBill,
  unmarkBillPaid,
  useApp
} from '../data/store'
import { billDueDate, billRunsIn, type Bill } from '../domain/alerts'
import {
  centsToInput,
  daysUntil,
  formatBRL,
  formatDayMonth,
  formatMonth,
  monthKey,
  parseAmountToCents,
  PAYMENT_METHODS,
  todayISO
} from '../domain/finance'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Menu,
  Modal,
  Select,
  Toggle
} from '../components/ui'
import { IconBadge } from '../components/TxIcon'
import { billIcon } from '../components/iconData'
import './bills.css'

type Status = { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

function statusOf(bill: Bill, month: string, today: string): Status {
  if (bill.endMonth && month > bill.endMonth) return { label: 'Encerrada', tone: 'neutral' }
  if (bill.paid?.[month]) return { label: 'Paga', tone: 'success' }
  const due = billDueDate(bill, month)
  const days = daysUntil(due, today)
  if (days < 0) return { label: `Atrasada há ${plural(-days, 'dia', 'dias')}`, tone: 'danger' }
  if (days === 0) return { label: 'Vence hoje', tone: 'warning' }
  if (days === 1) return { label: 'Vence amanhã', tone: 'warning' }
  if (days <= 3) return { label: `Vence em ${plural(days, 'dia', 'dias')}`, tone: 'warning' }
  return { label: `Vence ${formatDayMonth(due)}`, tone: 'neutral' }
}

const billFields = (bill: Bill): Omit<Bill, 'id' | 'paid'> => ({
  name: bill.name,
  amountCents: bill.amountCents,
  dueDay: bill.dueDay,
  category: bill.category,
  paymentMethod: bill.paymentMethod,
  active: bill.active,
  endMonth: bill.endMonth ?? null
})

/** Quantos meses ainda faltam pagar (o deste mês conta se não foi pago). */
const remaining = (bill: Bill, month: string): number => {
  if (!bill.endMonth || month > bill.endMonth) return 0
  const [y1, m1] = month.split('-').map(Number)
  const [y2, m2] = bill.endMonth.split('-').map(Number)
  return (y2 - y1) * 12 + (m2 - m1) + 1 - (bill.paid?.[month] ? 1 : 0)
}

export default function Bills(): React.JSX.Element {
  const bills = useApp((s) => s.bills)
  const categories = useApp((s) => s.settings?.categories) ?? []
  const location = useLocation()
  const highlight = (location.state as { bill?: string } | null)?.bill
  const [editing, setEditing] = useState<Bill | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const today = todayISO()
  const month = monthKey(today)

  // Veio de uma notificação: rola até a conta.
  useEffect(() => {
    if (!highlight) return
    listRef.current
      ?.querySelector(`[data-bill="${CSS.escape(highlight)}"]`)
      ?.scrollIntoView({ block: 'center' })
  }, [highlight, location.key])

  const sorted = [...bills].sort(
    (a, b) =>
      Number(billRunsIn(b, month)) - Number(billRunsIn(a, month)) ||
      a.dueDay - b.dueDay ||
      a.name.localeCompare(b.name)
  )
  const active = bills.filter((b) => billRunsIn(b, month))
  const total = active.reduce((s, b) => s + b.amountCents, 0)
  const paid = active.filter((b) => b.paid?.[month]).reduce((s, b) => s + b.amountCents, 0)

  const run = (id: string, job: () => Promise<void>): void => {
    setBusy(id)
    setError(null)
    job()
      .catch((e) => setError(friendlyError(e)))
      .finally(() => setBusy(null))
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Contas fixas</h1>
          <p className="muted">
            Aluguel, luz, internet, empréstimos: o que vence todo mês (com ou sem data para acabar).
          </p>
        </div>
        <div className="page-head__actions">
          <Button variant="primary" icon={<Plus size={18} />} onClick={() => setEditing('new')}>
            Nova conta
          </Button>
        </div>
      </header>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {bills.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarClock size={24} />}
            title="Nenhuma conta fixa"
            description="Cadastre as contas do mês para receber aviso antes do vencimento e marcar como paga com um clique."
            action={
              <Button variant="primary" onClick={() => setEditing('new')}>
                Nova conta
              </Button>
            }
          />
        </Card>
      ) : (
        <Card>
          <div className="card-head">
            <div>
              <h2>Este mês</h2>
              <p className="muted small">
                {formatBRL(paid)} pagos de {formatBRL(total)}
              </p>
            </div>
          </div>
          <ul className="bill-list" ref={listRef}>
            {sorted.map((bill) => {
              const status = statusOf(bill, month, today)
              const isPaid = !!bill.paid?.[month]
              return (
                <li
                  key={bill.id}
                  data-bill={bill.id}
                  className={[
                    billRunsIn(bill, month) ? '' : 'is-paused',
                    highlight === bill.id ? 'is-highlight' : ''
                  ]
                    .join(' ')
                    .trim()}
                >
                  <IconBadge icon={billIcon(bill, categories)} size={40} />
                  <div className="bill-list__main">
                    <strong>{bill.name}</strong>
                    <small>
                      Todo dia {bill.dueDay} · {bill.category} · {bill.paymentMethod}
                      {bill.endMonth &&
                        (month > bill.endMonth
                          ? ` · terminou em ${formatMonth(bill.endMonth).toLowerCase()}`
                          : ` · até ${formatMonth(bill.endMonth).toLowerCase()} (${remaining(bill, month) === 1 ? 'falta 1' : `faltam ${remaining(bill, month)}`})`)}
                    </small>
                  </div>
                  <strong className="bill-list__amount">{formatBRL(bill.amountCents)}</strong>
                  <span>
                    {bill.active ? (
                      <Badge tone={status.tone}>{status.label}</Badge>
                    ) : (
                      <Badge>Pausada</Badge>
                    )}
                  </span>
                  <div className="bill-list__action">
                    {billRunsIn(bill, month) &&
                      (isPaid ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Undo2 size={14} />}
                          disabled={busy === bill.id}
                          onClick={() => run(bill.id, () => unmarkBillPaid(bill, month))}
                        >
                          Desfazer
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          icon={<Check size={14} />}
                          disabled={busy === bill.id}
                          onClick={() => run(bill.id, () => markBillPaid(bill, month))}
                        >
                          Marcar como paga
                        </Button>
                      ))}
                  </div>
                  <Menu
                    label={`Ações de ${bill.name}`}
                    items={[
                      { label: 'Editar', onSelect: () => setEditing(bill) },
                      {
                        label: bill.active ? 'Pausar' : 'Reativar',
                        onSelect: () =>
                          run(bill.id, () =>
                            saveBill({ ...billFields(bill), active: !bill.active }, bill.id)
                          )
                      },
                      {
                        label: 'Excluir',
                        danger: true,
                        onSelect: () => {
                          const ok = confirm(
                            `Excluir a conta "${bill.name}"? Os lançamentos já criados continuam no extrato.`
                          )
                          if (ok) run(bill.id, () => deleteBill(bill.id))
                        }
                      }
                    ]}
                  />
                </li>
              )
            })}
          </ul>
          <p className="muted small">
            Marcar como paga cria a saída no extrato do mês. Desfazer apaga essa saída.
          </p>
        </Card>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Nova conta fixa' : 'Editar conta fixa'}
      >
        {editing !== null && (
          <BillForm
            key={editing === 'new' ? 'new' : editing.id}
            bill={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
    </div>
  )
}

function BillForm({ bill, onDone }: { bill?: Bill; onDone: () => void }): React.JSX.Element {
  const categories = useApp((s) => s.settings?.categories) ?? []
  const names = categories.map((c) => c.name)
  const [form, setForm] = useState({
    name: bill?.name ?? '',
    amount: bill ? centsToInput(bill.amountCents) : '',
    dueDay: bill ? String(bill.dueDay) : '10',
    category: bill?.category ?? (names.includes('Moradia') ? 'Moradia' : (names[0] ?? '')),
    paymentMethod: bill?.paymentMethod ?? 'Boleto',
    active: bill?.active ?? true,
    endMonth: bill?.endMonth ?? ''
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<typeof form>): void => setForm({ ...form, ...patch })

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    const amountCents = parseAmountToCents(form.amount)
    const dueDay = Number(form.dueDay)
    if (!form.name.trim()) return setError('Dê um nome para a conta.')
    if (!amountCents) return setError('Confira o valor (formato 1.234,56).')
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
      return setError('O dia de vencimento vai de 1 a 31.')
    }
    if (form.endMonth && !/^d{4}-d{2}$/.test(form.endMonth)) {
      return setError('Escolha o mês e o ano da última parcela.')
    }
    setSaving(true)
    saveBill(
      {
        name: form.name.trim(),
        amountCents,
        dueDay,
        category: form.category,
        paymentMethod: form.paymentMethod,
        active: form.active,
        // null apaga a data final de uma conta que tinha (o merge ignoraria undefined)
        endMonth: form.endMonth || null
      },
      bill?.id
    )
      .then(onDone)
      .catch((err) => {
        setError(friendlyError(err))
        setSaving(false)
      })
  }

  return (
    <form className="tx-form" onSubmit={submit} noValidate>
      <Input
        label="Nome"
        placeholder="Ex.: Conta de luz"
        value={form.name}
        onChange={(e) => set({ name: e.target.value })}
      />
      <div className="form-grid">
        <Input
          label="Valor (R$)"
          inputMode="decimal"
          placeholder="0,00"
          hint="Se varia todo mês, use um valor médio."
          value={form.amount}
          onChange={(e) => set({ amount: e.target.value })}
        />
        <Input
          label="Dia do vencimento"
          type="number"
          min={1}
          max={31}
          value={form.dueDay}
          onChange={(e) => set({ dueDay: e.target.value })}
        />
      </div>
      <div className="form-grid">
        <Select
          label="Categoria"
          options={names}
          value={form.category}
          onChange={(e) => set({ category: e.target.value })}
        />
        <Select
          label="Forma de pagamento"
          options={PAYMENT_METHODS}
          value={form.paymentMethod}
          onChange={(e) => set({ paymentMethod: e.target.value })}
        />
      </div>
      <Input
        label="Termina em (opcional)"
        type="month"
        hint="Empréstimo ou financiamento: o mês da última parcela. Depois dele a conta não vence mais."
        value={form.endMonth}
        onChange={(e) => set({ endMonth: e.target.value })}
      />
      <Toggle
        label="Ativa"
        description="Conta pausada não aparece nos vencimentos nem gera aviso."
        checked={form.active}
        onChange={(active) => set({ active })}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="tx-form__actions">
        <Button onClick={onDone}>Cancelar</Button>
        <Button type="submit" variant="primary" disabled={saving}>
          {bill ? 'Salvar conta' : 'Criar conta'}
        </Button>
      </div>
    </form>
  )
}
