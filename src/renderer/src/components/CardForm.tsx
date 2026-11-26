// Cadastro e edição de cartão em 3 passos (Fase 11): banco → modelo → dados.
// A prévia grande no topo acompanha cada escolha.
import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { friendlyError, saveCard } from '../data/store'
import type { Card } from '../domain/categories'
import {
  CUSTOM_SKIN,
  FINISHES,
  ISSUERS,
  issuerOf,
  NETWORKS,
  readableText,
  resolveSkin,
  SKINS,
  type CustomSkin,
  type Finish,
  type Issuer,
  type Network
} from '../domain/cardSkins'
import { centsToInput, parseAmountToCents } from '../domain/finance'
import CardArt from './CardArt'
import { Button, Input, Pills, Select, Toggle } from './ui'

type Step = 1 | 2 | 3

const parseDay = (value: string): number | undefined => {
  const day = Number(value)
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : undefined
}

export default function CardForm({
  card,
  prefill,
  onDone
}: {
  /** sem cartão = novo */
  card?: Card
  /** cartão novo já preenchido (ex.: vindo do Open Finance); começa na escolha do modelo */
  prefill?: Card
  onDone: () => void
}): React.JSX.Element {
  const start = card ?? prefill
  const [step, setStep] = useState<Step>(card ? 3 : prefill ? 2 : 1)
  const [issuer, setIssuer] = useState<Issuer>(start?.issuer ?? 'outro')
  const [skin, setSkin] = useState<string>(
    start?.skin ?? SKINS.find((s) => s.issuer === start?.issuer)?.id ?? CUSTOM_SKIN
  )
  const [custom, setCustom] = useState<CustomSkin>(
    start?.custom ?? {
      colors: [start?.color ?? issuerOf({ issuer: 'outro' }).color],
      finish: 'fosco'
    }
  )
  const [form, setForm] = useState({
    name: start?.name ?? '',
    nickname: start?.nickname ?? '',
    network: start?.network ?? ('' as Network | ''),
    last4: start?.last4 ?? '',
    closingDay: start?.closingDay ? String(start.closingDay) : '',
    dueDay: start?.dueDay ? String(start.dueDay) : '',
    limit: start?.limitCents ? centsToInput(start.limitCents) : ''
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<typeof form>): void => setForm({ ...form, ...patch })

  const models = SKINS.filter((s) => s.issuer === issuer)
  const draft: Card = {
    name: form.name.trim() || issuerOf({ issuer }).label,
    color: custom.colors[0],
    issuer,
    skin,
    ...(skin === CUSTOM_SKIN ? { custom } : {}),
    ...(form.network ? { network: form.network } : {}),
    ...(/^\d{4}$/.test(form.last4) ? { last4: form.last4 } : {}),
    ...(form.nickname.trim() ? { nickname: form.nickname.trim() } : {})
  }
  const preview = resolveSkin(draft)
  const autoText = skin === CUSTOM_SKIN && custom.text && preview.text !== custom.text

  const pickIssuer = (id: Issuer): void => {
    setIssuer(id)
    const first = SKINS.find((s) => s.issuer === id)
    setSkin(first?.id ?? CUSTOM_SKIN)
    if (!first) setCustom({ ...custom, colors: [issuerOf({ issuer: id }).color] })
    // Nome sugerido pelo banco, se ainda não foi escrito outro (só em cartão novo).
    if (!card && (!form.name || ISSUERS.some((i) => i.label === form.name))) {
      set({ name: issuerOf({ issuer: id }).label })
    }
    setStep(2)
  }

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    const name = form.name.trim()
    const limitCents = form.limit.trim() ? parseAmountToCents(form.limit) : undefined
    if (!name) return setError('Dê um nome para o cartão.')
    if (form.last4 && !/^\d{4}$/.test(form.last4)) {
      return setError('Os últimos dígitos são 4 números (ou deixe em branco).')
    }
    if (form.limit.trim() && !limitCents) return setError('Confira o limite (formato 1.234,56).')
    const closingDay = parseDay(form.closingDay)
    const dueDay = parseDay(form.dueDay)
    if ((form.closingDay && !closingDay) || (form.dueDay && !dueDay)) {
      return setError('Os dias de fechamento e vencimento vão de 1 a 31.')
    }
    const next: Card = {
      ...draft,
      name,
      color: preview.colors[0],
      ...(closingDay ? { closingDay } : {}),
      ...(dueDay ? { dueDay } : {}),
      ...(limitCents ? { limitCents } : {}),
      ...(card?.paidInvoices ? { paidInvoices: card.paidInvoices } : {})
    }
    setSaving(true)
    setError(null)
    saveCard(next, card?.name)
      .then(onDone)
      .catch((err) => {
        setError(friendlyError(err))
        setSaving(false)
      })
  }

  return (
    <form className="card-form" onSubmit={submit} noValidate>
      <div className="card-form__preview">
        <CardArt card={draft} size="lg" interactive />
      </div>

      <ol className="card-form__steps" aria-label="Passos">
        {(['Banco', 'Modelo', 'Dados'] as const).map((label, i) => (
          <li key={label}>
            <button
              type="button"
              className={step === i + 1 ? 'is-current' : undefined}
              aria-current={step === i + 1 ? 'step' : undefined}
              onClick={() => setStep((i + 1) as Step)}
            >
              <span>{i + 1}</span> {label}
            </button>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <div className="card-form__issuers" role="radiogroup" aria-label="Banco">
          {ISSUERS.map((i) => (
            <button
              key={i.id}
              type="button"
              role="radio"
              aria-checked={issuer === i.id}
              className="card-form__issuer"
              onClick={() => pickIssuer(i.id)}
            >
              <span className="card-form__issuer-dot" style={{ background: i.color }} />
              {i.label}
            </button>
          ))}
        </div>
      )}

      {step === 2 && (
        <div className="card-form__models">
          <div className="card-form__thumbs" role="radiogroup" aria-label="Modelo">
            {models.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={skin === m.id}
                className="card-form__thumb"
                onClick={() => setSkin(m.id)}
              >
                <CardArt card={{ ...draft, skin: m.id }} size="thumb" />
                <span>{m.name}</span>
              </button>
            ))}
            <button
              type="button"
              role="radio"
              aria-checked={skin === CUSTOM_SKIN}
              className="card-form__thumb"
              onClick={() => setSkin(CUSTOM_SKIN)}
            >
              <CardArt card={{ ...draft, skin: CUSTOM_SKIN, custom }} size="thumb" />
              <span>Personalizado</span>
            </button>
          </div>
          {models.length === 0 && (
            <p className="muted small">
              Ainda não há modelos prontos de {issuerOf({ issuer }).label}. Monte o seu no
              Personalizado.
            </p>
          )}
          {skin === CUSTOM_SKIN && (
            <div className="card-form__custom">
              <label className="card-form__color">
                Cor principal
                <input
                  type="color"
                  className="color-input"
                  value={custom.colors[0]}
                  onChange={(e) =>
                    setCustom({
                      ...custom,
                      colors: custom.colors[1]
                        ? [e.target.value, custom.colors[1]]
                        : [e.target.value]
                    })
                  }
                />
              </label>
              <Toggle
                label="Degradê com uma segunda cor"
                checked={!!custom.colors[1]}
                onChange={(on) =>
                  setCustom({
                    ...custom,
                    colors: on
                      ? [custom.colors[0], readableText([custom.colors[0]])]
                      : [custom.colors[0]]
                  })
                }
              />
              {custom.colors[1] && (
                <label className="card-form__color">
                  Segunda cor
                  <input
                    type="color"
                    className="color-input"
                    value={custom.colors[1]}
                    onChange={(e) =>
                      setCustom({ ...custom, colors: [custom.colors[0], e.target.value] })
                    }
                  />
                </label>
              )}
              <div className="ui-field">
                <span className="card-form__label">Acabamento</span>
                <Pills
                  label="Acabamento"
                  options={FINISHES.map((f) => ({ value: f.id, label: f.label }))}
                  value={custom.finish}
                  onChange={(finish: Finish) => setCustom({ ...custom, finish })}
                />
              </div>
              <label className="card-form__color">
                Cor do texto
                <input
                  type="color"
                  className="color-input"
                  value={custom.text ?? preview.text}
                  onChange={(e) => setCustom({ ...custom, text: e.target.value })}
                />
              </label>
              {autoText && (
                <p className="muted small">
                  Essa cor de texto ficaria difícil de ler nesse fundo; o cartão usa{' '}
                  {preview.text === '#ffffff' ? 'branco' : 'preto'} no lugar.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="card-form__fields">
          <Input
            label="Nome no app"
            hint={
              card
                ? 'É assim que as compras se ligam ao cartão, por isso não muda.'
                : 'Aparece no extrato e nas faturas.'
            }
            value={form.name}
            disabled={!!card}
            maxLength={40}
            onChange={(e) => set({ name: e.target.value })}
          />
          <Input
            label="Apelido no cartão (opcional)"
            placeholder="Ex.: Pessoal"
            value={form.nickname}
            maxLength={24}
            onChange={(e) => set({ nickname: e.target.value })}
          />
          <Select
            label="Bandeira"
            options={[
              { value: '', label: 'Sem bandeira' },
              ...NETWORKS.map((n) => ({ value: n.id, label: n.label }))
            ]}
            value={form.network}
            onChange={(e) => set({ network: e.target.value as Network | '' })}
          />
          <Input
            label="Últimos 4 dígitos (opcional)"
            hint="O app nunca pede o número completo, a validade nem o código de segurança."
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={form.last4}
            onChange={(e) => set({ last4: e.target.value.replace(/\D/g, '').slice(0, 4) })}
          />
          <Input
            label="Fecha dia"
            type="number"
            min={1}
            max={31}
            value={form.closingDay}
            onChange={(e) => set({ closingDay: e.target.value })}
          />
          <Input
            label="Vence dia"
            type="number"
            min={1}
            max={31}
            value={form.dueDay}
            onChange={(e) => set({ dueDay: e.target.value })}
          />
          <Input
            label="Limite (opcional)"
            inputMode="decimal"
            placeholder="0,00"
            value={form.limit}
            onChange={(e) => set({ limit: e.target.value })}
          />
        </div>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="tx-form__actions">
        {step > 1 && (
          <Button icon={<ChevronLeft size={16} />} onClick={() => setStep((step - 1) as Step)}>
            Voltar
          </Button>
        )}
        <Button onClick={onDone}>Cancelar</Button>
        {step < 3 ? (
          <Button variant="primary" onClick={() => setStep((step + 1) as Step)}>
            Próximo <ChevronRight size={16} />
          </Button>
        ) : (
          <Button type="submit" variant="primary" disabled={saving}>
            {card ? 'Salvar cartão' : 'Criar cartão'}
          </Button>
        )}
      </div>
    </form>
  )
}
