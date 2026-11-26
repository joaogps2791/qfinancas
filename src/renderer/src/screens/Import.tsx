import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CloudDownload, FileUp, Save } from 'lucide-react'
import { addTransactions, friendlyError, saveCard, updateSettings, useApp } from '../data/store'
import {
  formatBRL,
  formatDateShort,
  splitCents,
  INCOME_TYPES,
  monthKey,
  PAYMENT_METHODS,
  addMonths,
  suggestInvoiceDate,
  todayISO
} from '../domain/finance'
import { OPEN_FINANCE, pluggyRows } from '../domain/openFinance'
import type { PluggyData } from '../../../main/pluggy'
import {
  applyMapping,
  buildPreview,
  decodeText,
  guessMapping,
  isOfx,
  parseCsv,
  parseOfx,
  toTransaction,
  type CsvMapping,
  type Destination,
  type ImportRow,
  type ImportTarget,
  type PreviewRow
} from '../domain/importer'
import { Badge, Button, Card, EmptyState, Input, Pills, Select, Toggle } from '../components/ui'
import './import.css'

type LoadedFile = { name: string; ofx: ImportRow[] | null; cells: string[][] | null }
type Override = { include?: boolean; category?: string }

const DESTINATIONS: { value: Destination; label: string }[] = [
  { value: 'account', label: 'Conta' },
  { value: 'card', label: 'Cartão' }
]

export default function Import(): React.JSX.Element {
  const navigate = useNavigate()
  const transactions = useApp((s) => s.transactions)
  const settings = useApp((s) => s.settings)
  const categories = useMemo(() => settings?.categories.map((c) => c.name) ?? [], [settings])
  const cards = settings?.cards ?? []
  const profiles = settings?.importProfiles ?? []

  const [file, setFile] = useState<LoadedFile | null>(null)
  const [destination, setDestination] = useState<Destination>('account')
  const [mapping, setMapping] = useState<CsvMapping | null>(null)
  const [paymentMethod, setPaymentMethod] = useState('Débito')
  const [cardChoice, setCardChoice] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [overrides, setOverrides] = useState<Record<number, Override>>({})
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)
  const [saving, setSaving] = useState(false)
  const [openFinance, setOpenFinance] = useState<{ data: PluggyData; accountId: string } | null>(
    null
  )
  const [fetching, setFetching] = useState(false)

  const card = cardChoice || cards[0]?.name || ''
  const cardInfo = cards.find((c) => c.name === card)

  const parsed = useMemo(() => {
    if (openFinance) {
      const rows = pluggyRows(
        openFinance.data,
        openFinance.accountId,
        destination === 'card' ? cardInfo : undefined
      )
      return { rows, skipped: 0 }
    }
    if (!file) return { rows: [] as ImportRow[], skipped: 0 }
    if (file.ofx) return { rows: file.ofx, skipped: 0 }
    return file.cells && mapping ? applyMapping(file.cells, mapping) : { rows: [], skipped: 0 }
  }, [file, mapping, openFinance, destination, cardInfo])

  const preview: PreviewRow[] = useMemo(
    () =>
      buildPreview(parsed.rows, transactions, destination, categories).map((row) => ({
        ...row,
        ...overrides[row.key]
      })),
    [parsed, transactions, destination, categories, overrides]
  )
  const chosen = preview.filter((r) => r.include)
  const totalIn = chosen.filter((r) => r.amountCents > 0).reduce((s, r) => s + r.amountCents, 0)
  // Compra que entrou no meio pesa só nas parcelas que faltam.
  const toPay = (r: ImportRow): number =>
    r.installments && r.firstInstallment
      ? splitCents(-r.amountCents, r.installments)
          .slice(r.firstInstallment - 1)
          .reduce((s, c) => s + c, 0)
      : -r.amountCents
  const totalOut = chosen.filter((r) => r.amountCents < 0).reduce((s, r) => s + toPay(r), 0)

  // Dias de fechamento e vencimento: os que o banco informa (Open Finance) ou os do cartão.
  const ofAccount = openFinance?.data.accounts.find((a) => a.id === openFinance.accountId)
  const bankDays =
    destination === 'card' && ofAccount?.closingDay && ofAccount.dueDay
      ? { closingDay: ofAccount.closingDay, dueDay: ofAccount.dueDay }
      : null
  const days = bankDays ?? { closingDay: cardInfo?.closingDay, dueDay: cardInfo?.dueDay }
  const daysChanged =
    !!bankDays &&
    !!cardInfo &&
    (cardInfo.closingDay !== bankDays.closingDay || cardInfo.dueDay !== bankDays.dueDay)

  // Fatura sugerida pela compra mais recente e pelo fechamento do cartão.
  const latest = parsed.rows.reduce((max, r) => (r.date > max ? r.date : max), '')
  const suggestedInvoice =
    days.closingDay && days.dueDay && latest
      ? suggestInvoiceDate(latest, days.closingDay, days.dueDay)
      : ''
  const invoice = invoiceDate || suggestedInvoice

  const open = async (): Promise<void> => {
    setMessage(null)
    try {
      const picked = await window.api.files.open([
        { name: 'Extratos (OFX, CSV)', extensions: ['ofx', 'csv', 'txt'] }
      ])
      if (!picked) return
      const text = decodeText(picked.data)
      setOpenFinance(null)
      setOverrides({})
      setInvoiceDate('')
      if (isOfx(text)) {
        const result = parseOfx(text)
        if (!result.rows.length) throw new Error('Não achei lançamentos nesse OFX.')
        setFile({ name: picked.name, ofx: result.rows, cells: null })
        setMapping(null)
        setDestination(result.isCard ? 'card' : 'account')
      } else {
        const cells = parseCsv(text)
        if (cells.length === 0) throw new Error('O arquivo está vazio.')
        setFile({ name: picked.name, ofx: null, cells })
        setMapping(guessMapping(cells))
      }
    } catch (error) {
      setFile(null)
      setMessage({ text: friendlyError(error), error: true })
    }
  }

  /**
   * Busca no Meu Pluggy desde a última importação de cada conta (3 dias de folga para lançamento
   * atrasado; os repetidos a prévia já desmarca). Na primeira vez, os últimos 60 dias.
   */
  const fetchOpenFinance = async (): Promise<void> => {
    setMessage(null)
    setFetching(true)
    try {
      const synced = Object.values(settings?.openFinanceSync ?? {}).sort()[0]
      const from = synced
        ? new Date(Date.parse(`${synced}T12:00:00Z`) - 3 * 86_400_000).toISOString().slice(0, 10)
        : addMonths(todayISO(), -2)
      const data = await window.api.pluggy.fetch(from)
      const withRows = data.accounts.find((a) =>
        data.transactions.some((t) => t.accountId === a.id)
      )
      if (!data.accounts.length) {
        throw new Error(data.errors[0] ?? 'Nenhuma conta encontrada nos itens da Pluggy.')
      }
      const account = withRows ?? data.accounts[0]
      setOpenFinance({ data, accountId: account.id })
      setFile({ name: 'Open Finance (Meu Pluggy)', ofx: [], cells: null })
      setMapping(null)
      setDestination(account.type === 'CREDIT' ? 'card' : 'account')
      setOverrides({})
      setInvoiceDate('')
      if (data.errors.length) setMessage({ text: data.errors.join(' · '), error: true })
    } catch (error) {
      setMessage({ text: friendlyError(error), error: true })
    } finally {
      setFetching(false)
    }
  }

  const chooseAccount = (accountId: string): void => {
    if (!openFinance) return
    const account = openFinance.data.accounts.find((a) => a.id === accountId)
    setOpenFinance({ ...openFinance, accountId })
    setDestination(account?.type === 'CREDIT' ? 'card' : 'account')
    setOverrides({})
    setInvoiceDate('')
  }

  const changeMapping = (next: CsvMapping): void => {
    setMapping(next)
    setOverrides({})
  }
  const changeDestination = (next: Destination): void => {
    setDestination(next)
    setOverrides({})
  }
  const override = (key: number, patch: Override): void =>
    setOverrides((all) => ({ ...all, [key]: { ...all[key], ...patch } }))

  const save = async (): Promise<void> => {
    if (!chosen.length) return
    if (destination === 'card' && (!card || !invoice)) {
      return setMessage({ text: 'Escolha o cartão e o vencimento da fatura.', error: true })
    }
    setSaving(true)
    setMessage(null)
    try {
      const target: ImportTarget =
        destination === 'card'
          ? { destination, card, invoiceDate: invoice }
          : { destination, paymentMethod }
      await addTransactions(chosen.map((row) => toTransaction(row, target)))
      // O cartão passa a ter o fechamento e o vencimento que o banco informa.
      if (daysChanged && cardInfo && bankDays)
        await saveCard({ ...cardInfo, ...bankDays }, cardInfo.name)
      // Próxima busca do Open Finance começa daqui (merge: as outras contas ficam como estão).
      if (openFinance) {
        await updateSettings({ openFinanceSync: { [openFinance.accountId]: todayISO() } })
      }
      // Abre Transações no mês do que foi importado.
      useApp.setState({ month: monthKey(destination === 'card' ? invoice : latest || todayISO()) })
      navigate('/transacoes')
    } catch (error) {
      setMessage({ text: friendlyError(error), error: true })
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Importar extrato</h1>
          <p className="muted">
            Arquivo OFX ou CSV do banco{OPEN_FINANCE ? ', ou direto do Open Finance' : ''}. Nada é
            salvo antes de você conferir a prévia.
          </p>
        </div>
        <div className="page-head__actions">
          <Button onClick={() => navigate('/transacoes')}>Voltar</Button>
          {OPEN_FINANCE && (
            <Button
              icon={<CloudDownload size={16} />}
              disabled={fetching}
              onClick={fetchOpenFinance}
            >
              {fetching ? 'Buscando…' : 'Buscar do Open Finance'}
            </Button>
          )}
          <Button variant="primary" icon={<FileUp size={18} />} onClick={open}>
            {file && !openFinance ? 'Trocar arquivo' : 'Escolher arquivo'}
          </Button>
        </div>
      </header>

      {message && (
        <p className={message.error ? 'error' : 'muted'} role={message.error ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}

      {!file ? (
        <Card>
          <EmptyState
            icon={<FileUp size={24} />}
            title="Escolha o arquivo do extrato"
            description="A maioria dos bancos exporta OFX (Money/Quicken) ou CSV na área de extrato ou de fatura."
            action={
              <Button variant="primary" onClick={open}>
                Escolher arquivo
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <Card className="import-setup">
            <div className="import-setup__file">
              <Badge tone="accent">{openFinance ? 'Open Finance' : file.ofx ? 'OFX' : 'CSV'}</Badge>
              <strong>{file.name}</strong>
              <span className="muted small">
                {parsed.rows.length} {parsed.rows.length === 1 ? 'lançamento' : 'lançamentos'}
                {parsed.skipped > 0 &&
                  ` · ${parsed.skipped} ${parsed.skipped === 1 ? 'linha sem data ou valor ficou' : 'linhas sem data ou valor ficaram'} de fora`}
              </span>
            </div>
            <div className="import-setup__grid">
              {openFinance && (
                <Select
                  label="Conta no Open Finance"
                  options={openFinance.data.accounts.map((a) => ({
                    value: a.id,
                    label: `${a.bank} · ${a.name} (${openFinance.data.transactions.filter((t) => t.accountId === a.id).length})`
                  }))}
                  value={openFinance.accountId}
                  onChange={(e) => chooseAccount(e.target.value)}
                />
              )}
              <div className="ui-field">
                <span className="import-label">O arquivo é de</span>
                <Pills
                  label="O arquivo é de"
                  options={DESTINATIONS}
                  value={destination}
                  onChange={changeDestination}
                />
              </div>
              {destination === 'account' ? (
                <Select
                  label="Forma de pagamento das saídas"
                  options={PAYMENT_METHODS}
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                />
              ) : cards.length === 0 ? (
                <p className="muted small">Cadastre um cartão em Configurações primeiro.</p>
              ) : (
                <>
                  <Select
                    label="Cartão"
                    options={cards.map((c) => c.name)}
                    value={card}
                    onChange={(e) => {
                      setCardChoice(e.target.value)
                      setInvoiceDate('')
                    }}
                  />
                  {openFinance && days.closingDay && days.dueDay ? (
                    <p className="muted small">
                      Cada lançamento vai para a fatura em que o banco o colocou; parcelas já pagas
                      não entram. Fechamento dia {days.closingDay} e vencimento dia {days.dueDay}
                      {bankDays ? ', informados pelo banco' : ` do ${card}`}
                      {daysChanged ? ` (o ${card} será atualizado com esses dias)` : ''}.
                    </p>
                  ) : (
                    <Input
                      label="Vencimento da fatura"
                      type="date"
                      value={invoice}
                      hint={
                        suggestedInvoice && invoice === suggestedInvoice
                          ? 'Sugerido pelo fechamento do cartão.'
                          : undefined
                      }
                      onChange={(e) => setInvoiceDate(e.target.value)}
                    />
                  )}
                </>
              )}
            </div>
          </Card>

          {file.cells && mapping && (
            <ColumnMapping
              cells={file.cells}
              mapping={mapping}
              onChange={changeMapping}
              profiles={profiles}
            />
          )}

          <Card className="table-card">
            <div className="card-head">
              <div>
                <h2>Prévia</h2>
                <p className="muted small">
                  {chosen.length} de {preview.length} selecionados
                  {totalIn > 0 && ` · entradas ${formatBRL(totalIn)}`}
                  {totalOut > 0 && ` · saídas ${formatBRL(totalOut)}`}
                </p>
              </div>
              <Button variant="primary" disabled={!chosen.length || saving} onClick={save}>
                {saving
                  ? 'Importando…'
                  : `Importar ${chosen.length} ${chosen.length === 1 ? 'lançamento' : 'lançamentos'}`}
              </Button>
            </div>
            {preview.length === 0 ? (
              <EmptyState
                title="Nenhum lançamento lido"
                description="Confira as colunas de data e valor acima."
              />
            ) : (
              <div className="table-scroll">
                <table className="data-table data-table--compact import-table">
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          aria-label="Selecionar todos"
                          checked={chosen.length === preview.length}
                          onChange={(e) =>
                            setOverrides((all) =>
                              Object.fromEntries(
                                preview.map((r) => [
                                  r.key,
                                  { ...all[r.key], include: e.target.checked }
                                ])
                              )
                            )
                          }
                        />
                      </th>
                      <th>Data</th>
                      <th>Descrição</th>
                      <th>Categoria</th>
                      <th className="num">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row) => {
                      const isIncome = destination === 'account' && row.amountCents > 0
                      return (
                        <tr key={row.key} className={row.include ? undefined : 'is-off'}>
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`Importar ${row.description}`}
                              checked={row.include}
                              onChange={(e) => override(row.key, { include: e.target.checked })}
                            />
                          </td>
                          <td className="nowrap">{formatDateShort(row.date)}</td>
                          <td>
                            <strong className="import-table__desc">{row.description || '—'}</strong>
                            {row.duplicate && (
                              <small className="level-text--warning">
                                Parece repetido: já existe “{row.duplicate.description}” em{' '}
                                {formatDateShort(row.duplicate.date)}
                              </small>
                            )}
                            {row.ignored && (
                              <small>Pagamento ou estorno: fica de fora da fatura</small>
                            )}
                            {row.opening && !row.ignored && (
                              <small>
                                O que a conta tinha antes do extrato, para o saldo bater com o banco
                              </small>
                            )}
                          </td>
                          <td>
                            {row.ignored ? (
                              '—'
                            ) : (
                              <select
                                className="ui-input ui-select cell-select"
                                aria-label={`Categoria de ${row.description}`}
                                value={row.category}
                                onChange={(e) => override(row.key, { category: e.target.value })}
                              >
                                {(isIncome ? INCOME_TYPES : categories).map((c) => (
                                  <option key={c}>{c}</option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className={`num ${row.amountCents > 0 ? 'positive' : ''}`}>
                            {row.amountCents > 0 ? '+ ' : '− '}
                            {formatBRL(Math.abs(row.amountCents))}
                            {row.installments && (
                              <small>
                                {row.firstInstallment
                                  ? `parcelas ${row.firstInstallment} a ${row.installments} de ${row.installments}`
                                  : `em ${row.installments}x`}{' '}
                                ·{' '}
                                {formatBRL(
                                  Math.round(Math.abs(row.amountCents) / row.installments)
                                )}{' '}
                                cada
                              </small>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

// ---------- Colunas do CSV ----------

type ColumnKey = 'date' | 'description' | 'amount' | 'credit' | 'type' | 'balance'

function ColumnMapping({
  cells,
  mapping,
  onChange,
  profiles
}: {
  cells: string[][]
  mapping: CsvMapping
  onChange: (mapping: CsvMapping) => void
  profiles: { name: string; mapping: CsvMapping }[]
}): React.JSX.Element {
  const [profileName, setProfileName] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const width = Math.max(...cells.slice(0, 20).map((r) => r.length))
  const sample = cells[mapping.hasHeader ? 1 : 0] ?? []
  const columns = Array.from({ length: width }, (_, i) => {
    const name = (mapping.hasHeader && cells[0][i]) || `Coluna ${i + 1}`
    const example = sample[i] ? ` (ex.: ${sample[i].slice(0, 24)})` : ''
    return { value: String(i), label: `${name}${example}` }
  })
  const optional = [{ value: '-1', label: 'Não usar' }, ...columns]
  const pick = (key: ColumnKey, value: string): void =>
    onChange({ ...mapping, [key]: Number(value) })

  const saveProfile = (): void => {
    const name = profileName.trim()
    if (!name) return setStatus('Dê um nome ao perfil (ex.: Nubank conta).')
    const list = [...profiles.filter((p) => p.name !== name), { name, mapping }]
    updateSettings({ importProfiles: list })
      .then(() => setStatus(`Perfil "${name}" salvo.`))
      .catch((e) => setStatus(friendlyError(e)))
  }

  return (
    <Card className="import-mapping">
      <div className="card-head">
        <div>
          <h2>Colunas do CSV</h2>
          <p className="muted small">
            O app tentou adivinhar pelo cabeçalho. Confira na prévia se entradas e saídas estão
            certas.
          </p>
        </div>
        {profiles.length > 0 && (
          <Select
            label="Usar perfil"
            options={[
              { value: '', label: 'Escolher…' },
              ...profiles.map((p) => ({ value: p.name, label: p.name }))
            ]}
            value=""
            onChange={(e) => {
              const profile = profiles.find((p) => p.name === e.target.value)
              if (!profile) return
              onChange(profile.mapping)
              setProfileName(profile.name)
              setStatus(`Usando o perfil "${profile.name}".`)
            }}
          />
        )}
      </div>
      <div className="import-mapping__grid">
        <Select
          label="Data"
          options={columns}
          value={String(mapping.date)}
          onChange={(e) => pick('date', e.target.value)}
        />
        <Select
          label="Descrição"
          options={columns}
          value={String(mapping.description)}
          onChange={(e) => pick('description', e.target.value)}
        />
        <Select
          label={mapping.credit >= 0 ? 'Débitos (saídas)' : 'Valor'}
          options={columns}
          value={String(mapping.amount)}
          onChange={(e) => pick('amount', e.target.value)}
        />
        <Select
          label="Créditos em outra coluna"
          options={optional}
          value={String(mapping.credit)}
          onChange={(e) => pick('credit', e.target.value)}
        />
        <Select
          label="Tipo débito/crédito (D/C)"
          options={optional}
          value={String(mapping.type)}
          onChange={(e) => pick('type', e.target.value)}
        />
        <Select
          label="Saldo (acha o saldo anterior)"
          options={optional}
          value={String(mapping.balance ?? -1)}
          onChange={(e) => pick('balance', e.target.value)}
        />
      </div>
      <div className="import-mapping__toggles">
        <Toggle
          label="A primeira linha é o cabeçalho"
          checked={mapping.hasHeader}
          onChange={(hasHeader) => onChange({ ...mapping, hasHeader })}
        />
        <Toggle
          label="Inverter sinal"
          description="Para faturas em que a compra vem como valor positivo."
          checked={mapping.invert}
          onChange={(invert) => onChange({ ...mapping, invert })}
        />
      </div>
      <div className="add-row">
        <Input
          label="Salvar estas colunas como perfil"
          placeholder="Ex.: Nubank cartão"
          value={profileName}
          onChange={(e) => setProfileName(e.target.value)}
        />
        <Button icon={<Save size={16} />} onClick={saveProfile}>
          Salvar perfil
        </Button>
      </div>
      {status && (
        <p className="muted small" role="status">
          {status}
        </p>
      )}
    </Card>
  )
}
