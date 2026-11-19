import { useEffect, useState } from 'react'
import { BellRing, DatabaseBackup, ImagePlus, Info, KeyRound, Plus, Trash2 } from 'lucide-react'
import {
  currentBackupData,
  friendlyError,
  restoreBackup,
  updateSettings,
  updateUserProfile,
  useApp
} from '../data/store'
import {
  backupFileName,
  backupSummary,
  makeBackup,
  parseBackup,
  type Backup
} from '../domain/backup'
import { iconKeyForCategoryName, PALETTE, type Card, type Category } from '../domain/categories'
import {
  Avatar,
  Badge,
  Button,
  Card as Panel,
  Input,
  Modal,
  Select,
  Toggle
} from '../components/ui'
import { DEFAULT_NOTIFICATIONS, type NotificationSettings } from '../domain/alerts'
import ThemePicker from '../components/ThemePicker'
import { useUpdateState } from '../data/updates'
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
  },
  {
    key: 'pluggy.itemIds',
    label: 'Pluggy: Item IDs',
    hint: 'Um por banco, separados por vírgula ou espaço (no Dashboard da Pluggy: Demo → Connected Items).'
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
      <PluggyTest />
    </Panel>
  )
}

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo'
})
const shortStamp = (iso?: string): string => (iso ? dateTime.format(new Date(iso)) : '—')

/** "Testar conexão" do Open Finance: a chave funciona e cada banco (item) responde. */
function PluggyTest(): React.JSX.Element {
  const [items, setItems] = useState<Awaited<ReturnType<typeof window.api.pluggy.test>> | null>(
    null
  )
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  const test = (): void => {
    setTesting(true)
    setError(null)
    setItems(null)
    window.api.pluggy
      .test()
      .then(setItems)
      .catch((e) => setError(friendlyError(e)))
      .finally(() => setTesting(false))
  }

  return (
    <div className="pluggy-test">
      <div className="row">
        <Button size="sm" disabled={testing} onClick={test}>
          {testing ? 'Testando…' : 'Testar conexão com a Pluggy'}
        </Button>
        <span className="muted small">
          Só leitura: o app nunca faz Pix, transferência ou pagamento.
        </span>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {items && (
        <ul className="pluggy-test__list">
          {items.map((item) => (
            <li key={item.id}>
              <span>
                <strong>{item.bank}</strong>
                <small>
                  {item.error
                    ? item.error
                    : `Atualizado pela Pluggy em ${shortStamp(item.lastUpdatedAt)} · consentimento até ${shortStamp(item.consentExpiresAt)}`}
                </small>
              </span>
              <Badge tone={item.error || item.status !== 'UPDATED' ? 'warning' : 'success'}>
                {item.error ? 'Erro' : item.status === 'UPDATED' ? 'OK' : item.status}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------- Notificações ----------

const DAY_OPTIONS = [
  { value: '0', label: 'Só no dia' },
  { value: '1', label: '1 dia antes e no dia' },
  { value: '2', label: '2 dias antes e no dia' },
  { value: '3', label: '3 dias antes e no dia' },
  { value: '5', label: '5 dias antes e no dia' },
  { value: '7', label: '7 dias antes e no dia' }
]

function NotificationsSection({ saved }: { saved?: NotificationSettings }): React.JSX.Element {
  const prefs = { ...DEFAULT_NOTIFICATIONS, ...saved }
  const [background, setBackground] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    window.api.background.get().then((on) => alive && setBackground(on))
    return () => {
      alive = false
    }
  }, [])

  const change = (patch: Partial<NotificationSettings>): void => {
    setError(null)
    updateSettings({ notifications: { ...prefs, ...patch } }).catch((e) =>
      setError(friendlyError(e))
    )
  }
  const toggleBackground = (on: boolean): void => {
    setBackground(on)
    window.api.background.set(on).catch((e) => {
      setBackground(!on)
      setError(friendlyError(e))
    })
  }

  return (
    <Panel className="settings-section">
      <h2>Notificações</h2>
      <p className="muted">
        <BellRing size={14} aria-hidden /> Avisos do Windows antes do vencimento das faturas e das
        contas fixas. Clicar no aviso abre a fatura ou a conta.
      </p>
      <Toggle
        label="Avisos de vencimento"
        description="Desligado, nenhum aviso é mandado."
        checked={prefs.enabled}
        onChange={(enabled) => change({ enabled })}
      />
      {prefs.enabled && (
        <div className="settings-sub">
          <Toggle
            label="Faturas de cartão"
            description="Pelo dia de vencimento de cada cartão."
            checked={prefs.cards}
            onChange={(cards) => change({ cards })}
          />
          <Toggle
            label="Contas fixas"
            description="As contas ativas ainda não pagas."
            checked={prefs.bills}
            onChange={(bills) => change({ bills })}
          />
          <Select
            label="Quando avisar"
            options={DAY_OPTIONS}
            value={String(prefs.daysBefore)}
            onChange={(e) => change({ daysBefore: Number(e.target.value) })}
          />
        </div>
      )}
      <Toggle
        label="Iniciar com o Windows (minimizado na bandeja)"
        description="Fechar a janela deixa o app na bandeja, e ele abre sozinho quando o Windows liga. Assim os avisos chegam mesmo com a janela fechada. Fica salvo só neste PC."
        checked={!!background}
        disabled={background === null}
        onChange={toggleBackground}
      />
      <div className="row">
        <Button
          size="sm"
          onClick={() =>
            window.api.notify('Teste do QFinanças', 'É assim que os avisos de vencimento aparecem.')
          }
        >
          Mandar um aviso de teste
        </Button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </Panel>
  )
}

// ---------- Backup ----------

const stamp = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo'
})
const exportedAt = (iso: string): string => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? 'data desconhecida' : stamp.format(date)
}

const JSON_FILTER = [{ name: 'Backup do QFinanças', extensions: ['json'] }]

/** Salva o que está no app agora; devolve o caminho, ou null se a pessoa cancelou. */
function saveCurrentBackup(): Promise<string | null> {
  const now = new Date()
  const text = JSON.stringify(makeBackup(currentBackupData(), now), null, 2)
  return window.api.files.save(backupFileName(now), text, JSON_FILTER)
}

function BackupSection(): React.JSX.Element {
  const [pending, setPending] = useState<Backup | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)

  const exportNow = (): void => {
    setMessage(null)
    saveCurrentBackup()
      .then((path) => path && setMessage({ text: `Backup salvo em ${path}` }))
      .catch((e) => setMessage({ text: friendlyError(e), error: true }))
  }

  const pick = async (): Promise<void> => {
    setMessage(null)
    try {
      const file = await window.api.files.open(JSON_FILTER)
      if (!file) return
      setPending(parseBackup(new TextDecoder().decode(file.data)))
    } catch (e) {
      setMessage({ text: friendlyError(e), error: true })
    }
  }

  // Regra do projeto: nada é sobrescrito sem antes guardar um backup do que existe.
  const restore = async (): Promise<void> => {
    if (!pending) return
    setBusy(true)
    try {
      const safety = await saveCurrentBackup()
      if (!safety) {
        setMessage({ text: 'Restauração cancelada: o backup do estado atual não foi salvo.' })
        return
      }
      await restoreBackup(pending)
      setMessage({ text: `Backup restaurado. O estado anterior ficou salvo em ${safety}` })
      setPending(null)
    } catch (e) {
      setMessage({ text: friendlyError(e), error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel className="settings-section">
      <h2>Backup</h2>
      <p className="muted">
        <DatabaseBackup size={14} aria-hidden /> Um arquivo JSON com tudo: lançamentos,
        investimentos, metas, orçamento, categorias e cartões. As chaves de integração não entram.
      </p>
      <div className="row">
        <Button variant="primary" onClick={exportNow}>
          Salvar backup
        </Button>
        <Button onClick={pick}>Restaurar backup…</Button>
      </div>
      {message && (
        <p
          className={message.error ? 'error' : 'muted small'}
          role={message.error ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      )}
      <Modal open={!!pending} onClose={() => !busy && setPending(null)} title="Restaurar backup">
        {pending && (
          <div className="tx-form">
            <p>
              Backup de <strong>{exportedAt(pending.exportedAt)}</strong> com{' '}
              {backupSummary(pending)}.
            </p>
            <p className="muted small">
              Os itens do backup substituem os que têm o mesmo identificador no app, e as
              configurações e o perfil voltam como estavam no backup. O que foi criado depois e não
              está no backup continua. Antes de gravar, o app pede para você salvar um backup do que
              está aqui agora.
            </p>
            <div className="tx-form__actions">
              <Button disabled={busy} onClick={() => setPending(null)}>
                Cancelar
              </Button>
              <Button variant="primary" disabled={busy} onClick={restore}>
                {busy ? 'Restaurando…' : 'Salvar o atual e restaurar'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Panel>
  )
}

// ---------- Sobre e atualizações ----------

function AboutSection(): React.JSX.Element {
  const [state, setState] = useUpdateState()
  const [version, setVersion] = useState('')
  const [auto, setAuto] = useState<boolean | null>(null)
  const [notes, setNotes] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([
      window.api.appVersion(),
      window.api.updates.getAuto(),
      window.api.updates.notes()
    ]).then(([v, a, n]) => {
      if (!alive) return
      setVersion(v)
      setAuto(a)
      setNotes(n)
    })
    return () => {
      alive = false
    }
  }, [])

  const check = (): void => {
    setChecking(true)
    window.api.updates
      .check()
      .then(setState)
      .finally(() => setChecking(false))
  }
  const toggleAuto = (on: boolean): void => {
    setAuto(on)
    void window.api.updates.setAuto(on)
  }

  const status =
    state.status === 'disabled'
      ? 'Em modo de desenvolvimento o app não procura atualizações.'
      : state.status === 'checking' || checking
        ? 'Procurando…'
        : state.status === 'none'
          ? 'Você está na versão mais recente.'
          : state.status === 'available'
            ? `Versão ${state.version} disponível.`
            : state.status === 'downloading'
              ? `Baixando a versão ${state.version}… ${state.percent}%`
              : state.status === 'ready'
                ? `Versão ${state.version} pronta. Reinicie para instalar.`
                : state.status === 'error'
                  ? state.message
                  : null

  return (
    <Panel className="settings-section">
      <h2>Sobre</h2>
      <p className="muted">
        <Info size={14} aria-hidden /> QFinanças <strong>{version || '…'}</strong>. As versões novas
        chegam sozinhas pelo GitHub (joaogps2791/qfinancas).
      </p>
      <Toggle
        label="Atualizar automaticamente"
        description="Baixa a versão nova em segundo plano e avisa quando estiver pronta. Desligado, o app só avisa que existe versão nova."
        checked={!!auto}
        disabled={auto === null || state.status === 'disabled'}
        onChange={toggleAuto}
      />
      <div className="row">
        <Button
          size="sm"
          disabled={checking || state.status === 'disabled' || state.status === 'downloading'}
          onClick={check}
        >
          Procurar atualizações
        </Button>
        {state.status === 'available' && (
          <Button size="sm" variant="primary" onClick={() => window.api.updates.download()}>
            Baixar e instalar
          </Button>
        )}
        {state.status === 'ready' && (
          <Button size="sm" variant="primary" onClick={() => window.api.updates.install()}>
            Reiniciar agora
          </Button>
        )}
      </div>
      {status && (
        <p className={state.status === 'error' ? 'error' : 'muted small'} role="status">
          {status}
        </p>
      )}
      {notes && (
        <div className="release-notes">
          <h3>Novidades da versão {version}</h3>
          <p>{notes}</p>
        </div>
      )}
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
          <p className="muted">
            Perfil, aparência, categorias, cartões, notificações, integrações e backup.
          </p>
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
      {settings && <NotificationsSection saved={settings.notifications} />}
      <IntegrationsSection />
      <BackupSection />
      <AboutSection />
    </div>
  )
}
