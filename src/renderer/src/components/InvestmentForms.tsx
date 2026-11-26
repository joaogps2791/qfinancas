import { useState } from 'react'
import { addInvestmentDoc, addInvestmentToStatement, friendlyError, useApp } from '../data/store'
import { centsToInput, formatBRL, parseAmountToCents, todayISO } from '../domain/finance'
import {
  ASSET_TYPE_LABELS,
  DIVIDEND_TYPE_LABELS,
  FIXED_TYPES,
  INDEXER_LABELS,
  lastDividend,
  parseQuantity,
  VARIABLE_TYPES,
  type AssetType,
  type Dividend,
  type FixedIncome,
  type Indexer,
  type InvestmentTransaction
} from '../domain/investments'
import { Button, Input, Pills, Select, Toggle } from './ui'

const optionsOf = (types: AssetType[]): { value: string; label: string }[] =>
  types.map((t) => ({ value: t, label: ASSET_TYPE_LABELS[t] }))

function Actions({
  onCancel,
  saving
}: {
  onCancel: () => void
  saving: boolean
}): React.JSX.Element {
  return (
    <div className="tx-form__actions">
      <Button onClick={onCancel}>Cancelar</Button>
      <Button variant="primary" type="submit" disabled={saving}>
        Salvar
      </Button>
    </div>
  )
}

function ErrorText({ error }: { error: string | null }): React.JSX.Element | null {
  return error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : null
}

function useSave(onDone: () => void): {
  error: string | null
  saving: boolean
  setError: (e: string | null) => void
  run: (action: () => Promise<void>) => Promise<void>
} {
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const run = async (action: () => Promise<void>): Promise<void> => {
    setSaving(true)
    setError(null)
    try {
      await action()
      onDone()
    } catch (e) {
      setError(friendlyError(e))
      setSaving(false)
    }
  }
  return { error, saving, setError, run }
}

// ---------- Compra / venda ----------

/** `initial`: vem preenchido (ex.: posição do Open Finance); aí não lança no extrato por padrão. */
export function OperationForm({
  onDone,
  initial
}: {
  onDone: () => void
  initial?: Omit<InvestmentTransaction, 'id'>
}): React.JSX.Element {
  const [type, setType] = useState<'compra' | 'venda'>('compra')
  const [assetType, setAssetType] = useState<AssetType>(initial?.assetType ?? 'acao')
  const [ticker, setTicker] = useState(initial?.ticker ?? '')
  const [quantity, setQuantity] = useState(
    initial ? initial.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 8 }) : ''
  )
  const [price, setPrice] = useState(initial ? centsToInput(initial.unitPriceCents) : '')
  const [fees, setFees] = useState('')
  const [date, setDate] = useState(initial?.date ?? todayISO())
  const [broker, setBroker] = useState(initial?.broker ?? '')
  const [toStatement, setToStatement] = useState(!initial)
  const { error, saving, setError, run } = useSave(onDone)

  const qty = parseQuantity(quantity)
  const priceCents = parseAmountToCents(price)
  const feesCents = fees.trim() ? parseAmountToCents(fees) : 0
  const totalCents = qty && priceCents ? Math.round(qty * priceCents) + (feesCents ?? 0) : null

  const submit = (event: React.FormEvent): void => {
    event.preventDefault()
    const name = ticker.trim().toUpperCase()
    if (!name) return setError('Escreva o ticker (ex.: PETR4) ou o nome do ativo.')
    if (!qty) return setError('Quantidade inválida.')
    if (!priceCents) return setError('Preço inválido. Use o formato 1.234,56.')
    if (feesCents === null) return setError('Taxas inválidas.')
    const data: Omit<InvestmentTransaction, 'id'> = {
      type,
      assetType,
      ticker: name,
      quantity: qty,
      unitPriceCents: priceCents,
      feesCents,
      date,
      broker: broker.trim() || undefined
    }
    run(async () => {
      await addInvestmentDoc('investmentTransactions', data)
      if (type === 'compra' && toStatement && totalCents) {
        await addInvestmentToStatement(`Aporte ${name}`, totalCents, date)
      }
    })
  }

  return (
    <form className="tx-form" onSubmit={submit} noValidate>
      <Pills
        label="Tipo de operação"
        options={[
          { value: 'compra', label: 'Compra' },
          { value: 'venda', label: 'Venda' }
        ]}
        value={type}
        onChange={setType}
      />
      <div className="form-grid">
        <Select
          label="Classe"
          options={optionsOf(VARIABLE_TYPES)}
          value={assetType}
          onChange={(e) => setAssetType(e.target.value as AssetType)}
        />
        <Input
          label="Ticker ou nome"
          value={ticker}
          placeholder="PETR4, HGLG11…"
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          autoComplete="off"
        />
      </div>
      <div className="form-grid">
        <Input
          label="Quantidade"
          inputMode="decimal"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
        <Input
          label="Preço por cota (R$)"
          inputMode="decimal"
          placeholder="0,00"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </div>
      <div className="form-grid">
        <Input
          label="Taxas (R$)"
          inputMode="decimal"
          placeholder="0,00"
          value={fees}
          onChange={(e) => setFees(e.target.value)}
        />
        <Input label="Data" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <Input
        label="Corretora (opcional)"
        value={broker}
        onChange={(e) => setBroker(e.target.value)}
      />
      {type === 'compra' && (
        <Toggle
          label="Lançar no extrato"
          description={`Cria uma saída "Investimentos"${totalCents ? ` de ${formatBRL(totalCents)}` : ''} no mês, para o saldo bater.`}
          checked={toStatement}
          onChange={setToStatement}
        />
      )}
      <ErrorText error={error} />
      <Actions onCancel={onDone} saving={saving} />
    </form>
  )
}

// ---------- Renda fixa ----------

const RATE_HINTS: Record<Indexer, string> = {
  cdi: 'Ex.: 110 para 110% do CDI',
  selic: 'Ex.: 100 para 100% da Selic',
  ipca: 'Ex.: 6,5 para IPCA + 6,5% ao ano',
  prefixado: 'Ex.: 12,5 para 12,5% ao ano',
  poupanca: ''
}

export function FixedIncomeForm({
  onDone,
  initial
}: {
  onDone: () => void
  initial?: Omit<FixedIncome, 'id'>
}): React.JSX.Element {
  const [name, setName] = useState(initial?.name ?? '')
  const [assetType, setAssetType] = useState<AssetType>(initial?.assetType ?? 'cdb')
  const [indexer, setIndexer] = useState<Indexer>(initial?.indexer ?? 'cdi')
  const [rate, setRate] = useState(initial ? initial.rate.toLocaleString('pt-BR') : '100')
  const [invested, setInvested] = useState(initial ? centsToInput(initial.investedCents) : '')
  const [startDate, setStartDate] = useState(initial?.startDate ?? todayISO())
  const [maturityDate, setMaturityDate] = useState(initial?.maturityDate ?? '')
  const [liquidity, setLiquidity] = useState(initial?.liquidity ?? '')
  const [toStatement, setToStatement] = useState(!initial)
  const { error, saving, setError, run } = useSave(onDone)

  const submit = (event: React.FormEvent): void => {
    event.preventDefault()
    const investedCents = parseAmountToCents(invested)
    const rateValue = indexer === 'poupanca' ? 0 : parseQuantity(rate)
    if (!name.trim()) return setError('Dê um nome (ex.: CDB Banco X 2028).')
    if (!investedCents) return setError('Valor aplicado inválido.')
    if (rateValue === null) return setError('Taxa inválida.')
    if (maturityDate && maturityDate <= startDate) {
      return setError('O vencimento precisa ser depois da aplicação.')
    }
    run(async () => {
      await addInvestmentDoc('fixedIncome', {
        name: name.trim(),
        assetType,
        indexer,
        rate: rateValue,
        investedCents,
        startDate,
        maturityDate: maturityDate || undefined,
        liquidity: liquidity.trim() || undefined
      })
      if (toStatement) {
        await addInvestmentToStatement(`Aplicação ${name.trim()}`, investedCents, startDate)
      }
    })
  }

  return (
    <form className="tx-form" onSubmit={submit} noValidate>
      <Input
        label="Nome"
        value={name}
        placeholder="CDB Banco X 2028"
        onChange={(e) => setName(e.target.value)}
      />
      <div className="form-grid">
        <Select
          label="Tipo"
          options={optionsOf(FIXED_TYPES)}
          value={assetType}
          onChange={(e) => {
            const value = e.target.value as AssetType
            setAssetType(value)
            if (value === 'poupanca') setIndexer('poupanca')
          }}
        />
        <Select
          label="Rentabilidade"
          options={Object.entries(INDEXER_LABELS).map(([value, label]) => ({ value, label }))}
          value={indexer}
          onChange={(e) => setIndexer(e.target.value as Indexer)}
        />
      </div>
      <div className="form-grid">
        {indexer !== 'poupanca' && (
          <Input
            label={indexer === 'cdi' || indexer === 'selic' ? '% do índice' : 'Taxa (% ao ano)'}
            inputMode="decimal"
            value={rate}
            hint={RATE_HINTS[indexer]}
            onChange={(e) => setRate(e.target.value)}
          />
        )}
        <Input
          label="Valor aplicado (R$)"
          inputMode="decimal"
          placeholder="0,00"
          value={invested}
          onChange={(e) => setInvested(e.target.value)}
        />
      </div>
      <div className="form-grid">
        <Input
          label="Data da aplicação"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <Input
          label="Vencimento (opcional)"
          type="date"
          value={maturityDate}
          onChange={(e) => setMaturityDate(e.target.value)}
        />
      </div>
      <Input
        label="Liquidez (opcional)"
        placeholder="Diária, no vencimento…"
        value={liquidity}
        onChange={(e) => setLiquidity(e.target.value)}
      />
      <Toggle
        label="Lançar no extrato"
        description='Cria uma saída "Investimentos" na data da aplicação.'
        checked={toStatement}
        onChange={setToStatement}
      />
      <ErrorText error={error} />
      <Actions onCancel={onDone} saving={saving} />
    </form>
  )
}

// ---------- Proventos ----------

export function DividendForm({
  tickers,
  onDone
}: {
  /** ativos da carteira, sugeridos no campo */
  tickers: string[]
  onDone: () => void
}): React.JSX.Element {
  const dividends = useApp((s) => s.investments.dividends)
  const [ticker, setTicker] = useState(tickers[0] ?? '')
  const [type, setType] = useState<Dividend['type']>('rendimento')
  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(todayISO())
  const [exDate, setExDate] = useState('')
  const { error, saving, setError, run } = useSave(onDone)
  const last = lastDividend(dividends, ticker.trim().toUpperCase())

  const submit = (event: React.FormEvent): void => {
    event.preventDefault()
    const amountCents = parseAmountToCents(amount)
    if (!ticker.trim()) return setError('Escolha o ativo.')
    if (!amountCents) return setError('Valor inválido. Use o formato 1.234,56.')
    run(() =>
      addInvestmentDoc('dividends', {
        ticker: ticker.trim().toUpperCase(),
        type,
        amountCents,
        paymentDate,
        exDate: exDate || undefined
      })
    )
  }

  return (
    <form className="tx-form" onSubmit={submit} noValidate>
      <div className="form-grid">
        <Input
          label="Ativo"
          list="dividend-tickers"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          autoComplete="off"
        />
        <datalist id="dividend-tickers">
          {tickers.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <Select
          label="Tipo"
          options={Object.entries(DIVIDEND_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
          value={type}
          onChange={(e) => setType(e.target.value as Dividend['type'])}
        />
      </div>
      <div className="form-grid">
        <Input
          label="Valor total recebido (R$)"
          inputMode="decimal"
          placeholder="0,00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Input
          label="Data do pagamento"
          type="date"
          value={paymentDate}
          onChange={(e) => setPaymentDate(e.target.value)}
        />
      </div>
      <Input
        label="Data com (opcional)"
        type="date"
        value={exDate}
        onChange={(e) => setExDate(e.target.value)}
      />
      {last && (
        <Button
          size="sm"
          onClick={() => {
            setAmount(centsToInput(last.amountCents))
            setType(last.type)
          }}
        >
          Repetir o último valor ({formatBRL(last.amountCents)})
        </Button>
      )}
      <ErrorText error={error} />
      <Actions onCancel={onDone} saving={saving} />
    </form>
  )
}
