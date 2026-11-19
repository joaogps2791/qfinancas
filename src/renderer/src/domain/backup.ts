// Backup completo em JSON (exportar e restaurar). Funções puras.

/** Coleções em users/{uid}/ que entram no backup, além de settings/main e profile/main. */
export const BACKUP_COLLECTIONS = [
  'transactions',
  'investmentTransactions',
  'fixedIncome',
  'dividends',
  'budgets',
  'goals'
] as const
export type BackupCollection = (typeof BACKUP_COLLECTIONS)[number]

export type BackupDoc = { id: string } & Record<string, unknown>

export type Backup = {
  app: 'QFinanças'
  version: 1
  exportedAt: string
  settings: Record<string, unknown> | null
  profile: Record<string, unknown> | null
  collections: Record<BackupCollection, BackupDoc[]>
}

// Carimbos de data do Firestore viram objetos estranhos no JSON; o app não depende deles.
const STAMPS = new Set(['createdAt', 'updatedAt'])
const clean = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([k]) => !STAMPS.has(k))) as T

export function makeBackup(
  data: {
    settings: object | null
    profile: object | null
    collections: Record<BackupCollection, { id: string }[]>
  },
  now: Date
): Backup {
  return {
    app: 'QFinanças',
    version: 1,
    exportedAt: now.toISOString(),
    settings: data.settings ? clean(data.settings as Record<string, unknown>) : null,
    profile: data.profile ? clean(data.profile as Record<string, unknown>) : null,
    collections: Object.fromEntries(
      BACKUP_COLLECTIONS.map((name) => [
        name,
        data.collections[name].map((d) => clean(d as BackupDoc))
      ])
    ) as Record<BackupCollection, BackupDoc[]>
  }
}

export const backupFileName = (now: Date): string =>
  `qfinancas-backup-${now.toISOString().slice(0, 10)}.json`

const DOC_ID = /^[A-Za-z0-9_-]{1,128}$/
const ISO = /^\d{4}-\d{2}-\d{2}$/
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Confere o mínimo de cada lançamento para não gravar lixo por cima dos dados. */
function checkTransaction(d: BackupDoc): boolean {
  return (
    ['income', 'cash', 'card'].includes(d.kind as string) &&
    typeof d.description === 'string' &&
    Number.isInteger(d.amountCents) &&
    typeof d.date === 'string' &&
    ISO.test(d.date)
  )
}

/** Lê e valida o arquivo. Erros em português, prontos para mostrar. */
export function parseBackup(text: string): Backup {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('Esse arquivo não é um JSON válido.')
  }
  if (!isObject(raw) || raw.app !== 'QFinanças') {
    throw new Error('Esse arquivo não é um backup do QFinanças.')
  }
  if (raw.version !== 1) {
    throw new Error('Esse backup é de uma versão do app que esta não conhece.')
  }
  if (!isObject(raw.collections)) throw new Error('O backup está incompleto (sem coleções).')
  if (
    raw.settings !== null &&
    !(isObject(raw.settings) && Array.isArray(raw.settings.categories))
  ) {
    throw new Error('As configurações do backup estão danificadas.')
  }
  if (raw.profile !== null && !isObject(raw.profile)) {
    throw new Error('O perfil do backup está danificado.')
  }
  const collections = raw.collections
  for (const name of BACKUP_COLLECTIONS) {
    const list = collections[name] ?? []
    if (!Array.isArray(list)) throw new Error(`A lista "${name}" do backup está danificada.`)
    for (const d of list) {
      if (!isObject(d) || typeof d.id !== 'string' || !DOC_ID.test(d.id)) {
        throw new Error(`Há um item sem identificador válido em "${name}".`)
      }
      if (name === 'transactions' && !checkTransaction(d as BackupDoc)) {
        throw new Error(
          `O lançamento "${String(d.description ?? d.id)}" do backup está danificado.`
        )
      }
    }
    collections[name] = list
  }
  return raw as unknown as Backup
}

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/** "1.234 lançamentos, 12 registros de investimento..." para o aviso antes de restaurar. */
export function backupSummary(backup: Backup): string {
  const c = backup.collections
  const invest = c.investmentTransactions.length + c.fixedIncome.length + c.dividends.length
  return [
    count(c.transactions.length, 'lançamento', 'lançamentos'),
    count(invest, 'registro de investimento', 'registros de investimento'),
    count(c.goals.length, 'meta', 'metas'),
    count(c.budgets.length, 'mês de orçamento', 'meses de orçamento')
  ].join(', ')
}
