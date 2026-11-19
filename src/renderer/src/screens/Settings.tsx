import { useEffect, useState } from 'react'
import { ImagePlus, KeyRound, Plus, Trash2 } from 'lucide-react'
import { friendlyError, updateSettings, updateUserProfile, useApp } from '../data/store'
import { iconKeyForCategoryName, PALETTE, type Card, type Category } from '../domain/categories'
import { Avatar, Badge, Button, Card as Panel, Input } from '../components/ui'
import ThemePicker from '../components/ThemePicker'
import { IconPicker, IconBadge } from '../components/TxIcon'

// ---------- Perfil ----------

/** Reduz a foto para 256 px (JPEG) antes de guardar no perfil: fica com dezenas de KB. */
function resizePhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const size = 256
      const scale = Math.max(size / img.width, size / img.height)
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Não foi possível ler a imagem.'))
      // Corta no centro para ficar quadrada.
      ctx.drawImage(
        img,
        (size - img.width * scale) / 2,
        (size - img.height * scale) / 2,
        img.width * scale,
        img.height * scale
      )
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Esse arquivo não é uma imagem que o app consiga abrir.'))
    }
    img.src = url
  })
}

function ProfileSection(): React.JSX.Element {
  const user = useApp((s) => s.user)
  const profile = useApp((s) => s.profile)
  const [name, setName] = useState(profile?.displayName || user?.displayName || '')
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)
  const photo = profile?.photoDataUrl || profile?.photoURL || user?.photoURL || undefined

  const run = (action: Promise<void>, ok: string): void => {
    setMessage(null)
    action
      .then(() => setMessage({ text: ok }))
      .catch((e) => setMessage({ text: friendlyError(e), error: true }))
  }

  const onPhoto = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > 15 * 1024 * 1024)
      return setMessage({ text: 'A imagem tem mais de 15 MB.', error: true })
    run(
      resizePhoto(file).then((photoDataUrl) => updateUserProfile({ photoDataUrl })),
      'Foto atualizada.'
    )
  }

  return (
    <Panel className="settings-section">
      <h2>Perfil</h2>
      <div className="profile-edit">
        <Avatar name={name || 'Você'} src={photo} size={88} />
        <div className="profile-edit__fields">
          <Input
            label="Nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
          />
          <div className="row wrap">
            <Button
              variant="primary"
              disabled={!name.trim()}
              onClick={() => run(updateUserProfile({ displayName: name.trim() }), 'Nome salvo.')}
            >
              Salvar nome
            </Button>
            <label className="ui-button ui-button--secondary ui-button--md file-button">
              <ImagePlus size={16} aria-hidden />
              Trocar foto
              <input type="file" accept="image/*" onChange={onPhoto} />
            </label>
            {profile?.photoDataUrl && (
              <Button
                variant="ghost"
                onClick={() => run(updateUserProfile({ photoDataUrl: '' }), 'Foto removida.')}
              >
                Remover foto
              </Button>
            )}
          </div>
          {message && (
            <p className={message.error ? 'error' : 'success'} role="status">
              {message.text}
            </p>
          )}
        </div>
      </div>
    </Panel>
  )
}

// ---------- Categorias ----------

function CategoriesSection({ saved }: { saved: Category[] }): React.JSX.Element {
  const transactions = useApp((s) => s.transactions)
  const [draft, setDraft] = useState(saved)
  const [newName, setNewName] = useState('')
  const [picking, setPicking] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)

  const changed = JSON.stringify(draft) !== JSON.stringify(saved)
  const patch = (name: string, change: Partial<Category>): void =>
    setDraft((list) => list.map((c) => (c.name === name ? { ...c, ...change } : c)))

  const add = (): void => {
    const name = newName.trim()
    if (!name) return
    if (draft.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      return setMessage({ text: 'Já existe uma categoria com esse nome.', error: true })
    }
    setDraft([
      ...draft,
      { name, color: PALETTE[draft.length % PALETTE.length], icon: iconKeyForCategoryName(name) }
    ])
    setNewName('')
    setMessage(null)
  }

  const remove = (name: string): void => {
    const used = transactions.filter((t) => t.kind !== 'income' && t.category === name).length
    const note = used ? ` ${used} lançamento(s) usam essa categoria e continuam com esse nome.` : ''
    if (confirm(`Remover a categoria "${name}"?${note}`))
      setDraft(draft.filter((c) => c.name !== name))
  }

  const save = (): void => {
    if (!draft.length) return setMessage({ text: 'Deixe pelo menos uma categoria.', error: true })
    updateSettings({ categories: draft })
      .then(() => setMessage({ text: 'Categorias salvas.' }))
      .catch((e) => setMessage({ text: friendlyError(e), error: true }))
  }

  return (
    <Panel className="settings-section">
      <div className="card-head">
        <h2>Categorias</h2>
        <Button variant="primary" disabled={!changed} onClick={save}>
          Salvar categorias
        </Button>
      </div>
      <ul className="edit-list">
        {draft.map((c) => (
          <li key={c.name}>
            <div className="edit-list__row">
              <button
                type="button"
                className="icon-button"
                aria-label={`Trocar ícone de ${c.name}`}
                aria-expanded={picking === c.name}
                onClick={() => setPicking(picking === c.name ? null : c.name)}
              >
                <IconBadge icon={{ kind: 'category', key: c.icon, color: c.color }} size={36} />
              </button>
              <span className="edit-list__name">{c.name}</span>
              <input
                type="color"
                className="color-input"
                value={c.color}
                aria-label={`Cor de ${c.name}`}
                onChange={(e) => patch(c.name, { color: e.target.value })}
              />
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remover ${c.name}`}
                onClick={() => remove(c.name)}
                icon={<Trash2 size={16} />}
              />
            </div>
            {picking === c.name && (
              <IconPicker
                categoriesOnly
                color={c.color}
                value={`cat:${c.icon}`}
                onChange={(value) => {
                  patch(c.name, { icon: value.slice(4) })
                  setPicking(null)
                }}
              />
            )}
          </li>
        ))}
      </ul>
      <div className="add-row">
        <Input
          label="Nova categoria"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          maxLength={40}
        />
        <Button icon={<Plus size={16} />} onClick={add} disabled={!newName.trim()}>
          Adicionar
        </Button>
      </div>
      {message && (
        <p className={message.error ? 'error' : 'success'} role="status">
          {message.text}
        </p>
      )}
    </Panel>
  )
}

// ---------- Cartões ----------

const parseDay = (value: string): number | undefined => {
  const day = Number(value)
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : undefined
}

function CardsSection({ saved }: { saved: Card[] }): React.JSX.Element {
  const [draft, setDraft] = useState(saved)
  const [newName, setNewName] = useState('')
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)

  const changed = JSON.stringify(draft) !== JSON.stringify(saved)
  const patch = (name: string, change: Partial<Card>): void =>
    setDraft((list) => list.map((c) => (c.name === name ? { ...c, ...change } : c)))

  const add = (): void => {
    const name = newName.trim()
    if (!name) return
    if (draft.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      return setMessage({ text: 'Já existe um cartão com esse nome.', error: true })
    }
    setDraft([...draft, { name, color: PALETTE[(draft.length + 3) % PALETTE.length] }])
    setNewName('')
    setMessage(null)
  }

  const save = (): void => {
    // Sem dia preenchido o campo some do documento (o Firestore não aceita "undefined").
    const cards = draft.map(({ closingDay, dueDay, ...c }) => ({
      ...c,
      ...(closingDay ? { closingDay } : {}),
      ...(dueDay ? { dueDay } : {})
    }))
    updateSettings({ cards })
      .then(() => setMessage({ text: 'Cartões salvos.' }))
      .catch((e) => setMessage({ text: friendlyError(e), error: true }))
  }

  return (
    <Panel className="settings-section">
      <div className="card-head">
        <h2>Cartões</h2>
        <Button variant="primary" disabled={!changed} onClick={save}>
          Salvar cartões
        </Button>
      </div>
      <p className="muted">
        Com o dia de fechamento e o de vencimento, o app sugere a fatura de cada compra e avisa dos
        vencimentos.
      </p>
      <ul className="edit-list">
        {draft.map((c) => (
          <li key={c.name} className="edit-list__row edit-list__row--card">
            <input
              type="color"
              className="color-input"
              value={c.color}
              aria-label={`Cor do ${c.name}`}
              onChange={(e) => patch(c.name, { color: e.target.value })}
            />
            <span className="edit-list__name">{c.name}</span>
            <Input
              label="Fecha dia"
              type="number"
              min={1}
              max={31}
              value={c.closingDay ?? ''}
              onChange={(e) => patch(c.name, { closingDay: parseDay(e.target.value) })}
            />
            <Input
              label="Vence dia"
              type="number"
              min={1}
              max={31}
              value={c.dueDay ?? ''}
              onChange={(e) => patch(c.name, { dueDay: parseDay(e.target.value) })}
            />
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Remover ${c.name}`}
              onClick={() =>
                confirm(`Remover o cartão "${c.name}"? As compras já lançadas continuam.`) &&
                setDraft(draft.filter((x) => x.name !== c.name))
              }
              icon={<Trash2 size={16} />}
            />
          </li>
        ))}
      </ul>
      <div className="add-row">
        <Input
          label="Novo cartão"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          maxLength={40}
        />
        <Button icon={<Plus size={16} />} onClick={add} disabled={!newName.trim()}>
          Adicionar
        </Button>
      </div>
      {message && (
        <p className={message.error ? 'error' : 'success'} role="status">
          {message.text}
        </p>
      )}
    </Panel>
  )
}

// ---------- Integrações ----------

const SECRETS = [
  { key: 'brapi.token', label: 'Token da brapi.dev', hint: 'Cotações de ações e FIIs (Fase 4).' },
  {
    key: 'pluggy.clientId',
    label: 'Pluggy: Client ID',
    hint: 'Open Finance pelo Meu Pluggy (Fase 10).'
  },
  {
    key: 'pluggy.clientSecret',
    label: 'Pluggy: Client Secret',
    hint: 'Open Finance pelo Meu Pluggy (Fase 10).'
  }
]

function SecretField({
  secretKey,
  label,
  hint
}: {
  secretKey: string
  label: string
  hint: string
}): React.JSX.Element {
  const [saved, setSaved] = useState<boolean | null>(null)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Só pergunta se existe: o valor da chave não precisa vir para a tela.
    window.api.secrets
      .has(secretKey)
      .then(setSaved)
      .catch(() => setSaved(false))
  }, [secretKey])

  const save = (): void => {
    setError(null)
    window.api.secrets
      .set(secretKey, value.trim())
      .then(() => {
        setSaved(true)
        setValue('')
      })
      .catch((e) => setError(friendlyError(e)))
  }
  const remove = (): void => {
    window.api.secrets
      .remove(secretKey)
      .then(() => setSaved(false))
      .catch((e) => setError(friendlyError(e)))
  }

  return (
    <div className="secret-field">
      <div className="secret-field__input">
        <Input
          label={label}
          type="password"
          autoComplete="off"
          placeholder={saved ? '•••••••• (guardada)' : 'Cole aqui'}
          hint={hint}
          error={error ?? undefined}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <div className="row">
        {saved && <Badge tone="success">Guardada</Badge>}
        <Button disabled={!value.trim()} onClick={save}>
          Salvar
        </Button>
        {saved && (
          <Button variant="ghost" onClick={remove}>
            Remover
          </Button>
        )}
      </div>
    </div>
  )
}

function IntegrationsSection(): React.JSX.Element {
  return (
    <Panel className="settings-section">
      <h2>Integrações</h2>
      <p className="muted">
        <KeyRound size={14} aria-hidden /> As chaves ficam só neste PC, criptografadas pelo Windows.
        Não vão para a nuvem.
      </p>
      {SECRETS.map((s) => (
        <SecretField key={s.key} secretKey={s.key} label={s.label} hint={s.hint} />
      ))}
    </Panel>
  )
}

export default function Settings(): React.JSX.Element {
  const settings = useApp((s) => s.settings)
  const profileLoaded = useApp((s) => !!s.profile)

  return (
    <div className="page settings">
      <header className="page-head">
        <div>
          <h1>Configurações</h1>
          <p className="muted">Perfil, aparência, categorias, cartões e integrações.</p>
        </div>
      </header>
      {/* Recria a seção quando o perfil chega do Firestore, para o nome aparecer. */}
      <ProfileSection key={profileLoaded ? 'loaded' : 'loading'} />
      <Panel className="settings-section">
        <h2>Aparência</h2>
        <div className="row between">
          <span>Tema</span>
          <ThemePicker />
        </div>
      </Panel>
      {settings ? (
        <>
          {/* key: quando o salvo muda (outra janela, nuvem), o rascunho recomeça dele. */}
          <CategoriesSection
            key={JSON.stringify(settings.categories)}
            saved={settings.categories}
          />
          <CardsSection key={JSON.stringify(settings.cards)} saved={settings.cards} />
        </>
      ) : (
        <Panel>
          <p className="muted">Carregando suas configurações…</p>
        </Panel>
      )}
      <IntegrationsSection />
    </div>
  )
}
