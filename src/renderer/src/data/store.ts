import { create } from 'zustand'
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  type User
} from 'firebase/auth'
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  FieldPath,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch
} from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { defaultSettings, PALETTE, type Settings, type ThemeSource } from '../domain/categories'
import {
  monthKey,
  shiftMonthKey,
  todayISO,
  type Transaction,
  type TransactionInput
} from '../domain/finance'
import type { Dividend, FixedIncome, InvestmentTransaction } from '../domain/investments'
import type { BudgetLimits, Goal } from '../domain/planning'
import { billDueDate, type Bill } from '../domain/alerts'
import { BACKUP_COLLECTIONS, type Backup, type BackupCollection } from '../domain/backup'

export type Profile = { displayName: string; photoURL: string; photoDataUrl?: string }

/** Coleções de investimentos em users/{uid}/ (as posições são calculadas, não gravadas). */
export const INVESTMENT_COLLECTIONS = [
  'investmentTransactions',
  'fixedIncome',
  'dividends'
] as const
type InvestmentCollection = (typeof INVESTMENT_COLLECTIONS)[number]
type Investments = {
  investmentTransactions: InvestmentTransaction[]
  fixedIncome: FixedIncome[]
  dividends: Dividend[]
}
const EMPTY_INVESTMENTS: Investments = {
  investmentTransactions: [],
  fixedIncome: [],
  dividends: []
}

type AppState = {
  /** undefined enquanto o Firebase ainda não respondeu se há alguém logado */
  user: User | null | undefined
  settings: Settings | null
  profile: Profile | null
  transactions: Transaction[]
  investments: Investments
  /** limites por mês (YYYY-MM), de users/{uid}/budgets */
  budgets: Record<string, BudgetLimits>
  goals: Goal[]
  bills: Bill[]
  error: string | null
  /** escolha de tema em uso (vem do PC ao abrir e de settings/main.theme depois do login) */
  theme: ThemeSource
  /** mês que as telas mostram (YYYY-MM), compartilhado entre Dashboard, Transações e Cartões */
  month: string
  /** formulário de lançamento aberto (null = fechado; com `editing` = edição) */
  composer: { editing?: Transaction } | null
}

export const useApp = create<AppState>(() => ({
  user: undefined,
  settings: null,
  profile: null,
  transactions: [],
  investments: EMPTY_INVESTMENTS,
  budgets: {},
  goals: [],
  bills: [],
  error: null,
  theme: window.api.theme.getSource(),
  month: monthKey(todayISO()),
  composer: null
}))

// ---------- Estado da interface ----------

export const shiftMonth = (months: number): void =>
  useApp.setState((s) => ({ month: shiftMonthKey(s.month, months) }))
export const goToToday = (): void => useApp.setState({ month: monthKey(todayISO()) })
export const openComposer = (editing?: Transaction): void =>
  useApp.setState({ composer: { editing } })
export const closeComposer = (): void => useApp.setState({ composer: null })

const userPath = (uid: string, ...segments: string[]): [string, ...string[]] => [
  'users',
  uid,
  ...segments
]

// ---------- Sessão e leitura em tempo real ----------

let unsubscribers: (() => void)[] = []

onAuthStateChanged(auth, (user) => {
  unsubscribers.forEach((stop) => stop())
  unsubscribers = []
  useApp.setState({
    user,
    settings: null,
    profile: null,
    transactions: [],
    investments: EMPTY_INVESTMENTS,
    budgets: {},
    goals: [],
    bills: [],
    error: null
  })
  if (!user) return

  const onError = (error: Error): void => useApp.setState({ error: friendlyError(error) })

  ensureUserDocs(user).catch(onError)

  unsubscribers.push(
    onSnapshot(
      doc(db, ...userPath(user.uid, 'settings', 'main')),
      (snap) => {
        if (!snap.exists()) return
        const settings = snap.data() as Settings
        const theme = settings.theme ?? 'system'
        useApp.setState({ settings, theme })
        // O processo principal guarda o tema no PC para abrir já na cor certa, sem piscar.
        window.api.theme.setSource(theme)
      },
      onError
    ),
    onSnapshot(
      doc(db, ...userPath(user.uid, 'profile', 'main')),
      (snap) => snap.exists() && useApp.setState({ profile: snap.data() as Profile }),
      onError
    ),
    onSnapshot(
      collection(db, ...userPath(user.uid, 'transactions')),
      (snap) =>
        useApp.setState({
          transactions: snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Transaction)
        }),
      onError
    ),
    ...INVESTMENT_COLLECTIONS.map((name) =>
      onSnapshot(
        collection(db, ...userPath(user.uid, name)),
        (snap) =>
          useApp.setState((s) => ({
            investments: {
              ...s.investments,
              [name]: snap.docs.map((d) => ({ ...d.data(), id: d.id }))
            }
          })),
        onError
      )
    ),
    onSnapshot(
      collection(db, ...userPath(user.uid, 'budgets')),
      (snap) =>
        useApp.setState({
          budgets: Object.fromEntries(
            snap.docs.map((d) => [d.id, (d.data().limits ?? {}) as BudgetLimits])
          )
        }),
      onError
    ),
    onSnapshot(
      collection(db, ...userPath(user.uid, 'goals')),
      (snap) =>
        useApp.setState({ goals: snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Goal) }),
      onError
    ),
    onSnapshot(
      collection(db, ...userPath(user.uid, 'bills')),
      (snap) =>
        useApp.setState({ bills: snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Bill) }),
      onError
    )
  )
})

/** No primeiro login cria settings/main e profile/main. Nunca sobrescreve o que já existe. */
async function ensureUserDocs(user: User): Promise<void> {
  const create = async (path: string[], data: object): Promise<void> => {
    const ref = doc(db, ...userPath(user.uid, ...path))
    const snap = await getDoc(ref)
    // Só cria com a confirmação do servidor: offline, "não existe no cache" não quer dizer nada.
    if (!snap.exists() && !snap.metadata.fromCache) await setDoc(ref, data)
  }
  await Promise.all([
    create(['settings', 'main'], defaultSettings()),
    create(['profile', 'main'], {
      displayName: user.displayName ?? '',
      photoURL: user.photoURL ?? ''
    })
  ])
}

// ---------- Transações ----------

function requireUid(): string {
  const uid = useApp.getState().user?.uid
  if (!uid) throw new Error('Você precisa entrar na sua conta.')
  return uid
}

/** Grava vários lançamentos de uma vez (ex.: uma série recorrente ou um extrato importado). */
export async function addTransactions(inputs: TransactionInput[]): Promise<void> {
  const uid = requireUid()
  const transactions = collection(db, ...userPath(uid, 'transactions'))
  // Um lote do Firestore aceita até 500 gravações (um extrato importado pode passar disso).
  for (let start = 0; start < inputs.length; start += 450) {
    const batch = writeBatch(db)
    for (const input of inputs.slice(start, start + 450)) {
      batch.set(doc(transactions), { ...input, createdAt: serverTimestamp() })
    }
    await batch.commit()
  }
}

/** Substitui o lançamento inteiro (assim, trocar de tipo não deixa campos do tipo antigo). */
export async function updateTransaction(id: string, input: TransactionInput): Promise<void> {
  await setDoc(doc(db, ...userPath(requireUid(), 'transactions', id)), {
    ...input,
    updatedAt: serverTimestamp()
  })
}

export async function deleteTransaction(id: string): Promise<void> {
  await deleteDoc(doc(db, ...userPath(requireUid(), 'transactions', id)))
}

// ---------- Investimentos ----------

type WithoutId<T> = Omit<T, 'id'>

/** Grava uma operação, aplicação de renda fixa ou provento. */
export async function addInvestmentDoc<C extends InvestmentCollection>(
  name: C,
  data: WithoutId<Investments[C][number]>
): Promise<void> {
  const ref = doc(collection(db, ...userPath(requireUid(), name)))
  await setDoc(ref, { ...data, createdAt: serverTimestamp() })
}

export async function deleteInvestmentDoc(name: InvestmentCollection, id: string): Promise<void> {
  await deleteDoc(doc(db, ...userPath(requireUid(), name, id)))
}

const INVEST_CATEGORY = 'Investimentos'

/** Lança o aporte também como saída "Investimentos" no extrato, para o saldo do mês bater. */
export async function addInvestmentToStatement(
  description: string,
  amountCents: number,
  date: string
): Promise<void> {
  const settings = useApp.getState().settings
  if (settings && !settings.categories.some((c) => c.name === INVEST_CATEGORY)) {
    await updateSettings({
      categories: [
        ...settings.categories,
        {
          name: INVEST_CATEGORY,
          color: PALETTE[settings.categories.length % PALETTE.length],
          icon: 'invest'
        }
      ]
    })
  }
  await addTransactions([
    {
      kind: 'cash',
      description,
      amountCents,
      date,
      category: INVEST_CATEGORY,
      paymentMethod: 'Transferência'
    }
  ])
}

// ---------- Orçamento e metas ----------

/** Substitui os limites do mês inteiro (assim, tirar uma categoria apaga o limite dela). */
export async function setBudget(month: string, limits: BudgetLimits): Promise<void> {
  await setDoc(doc(db, ...userPath(requireUid(), 'budgets', month)), {
    limits,
    updatedAt: serverTimestamp()
  })
}

/** Cria (sem id) ou substitui (com id) uma meta de economia. */
export async function saveGoal(goal: WithoutId<Goal>, id?: string): Promise<void> {
  const goals = collection(db, ...userPath(requireUid(), 'goals'))
  await setDoc(id ? doc(goals, id) : doc(goals), { ...goal, updatedAt: serverTimestamp() })
}

export async function deleteGoal(id: string): Promise<void> {
  await deleteDoc(doc(db, ...userPath(requireUid(), 'goals', id)))
}

// ---------- Contas fixas ----------

/** Cria (sem id) ou atualiza (com id) uma conta fixa, mantendo os meses já pagos. */
export async function saveBill(bill: Omit<Bill, 'id' | 'paid'>, id?: string): Promise<void> {
  const bills = collection(db, ...userPath(requireUid(), 'bills'))
  await setDoc(
    id ? doc(bills, id) : doc(bills),
    { ...bill, updatedAt: serverTimestamp() },
    {
      merge: true
    }
  )
}

export async function deleteBill(id: string): Promise<void> {
  await deleteDoc(doc(db, ...userPath(requireUid(), 'bills', id)))
}

/**
 * Marca o mês como pago: cria a saída à vista no extrato e guarda o id dela na conta.
 * A data é hoje quando o mês é o atual; pagando adiantado, é o dia do vencimento.
 */
export async function markBillPaid(bill: Bill, month: string): Promise<void> {
  const uid = requireUid()
  const today = todayISO()
  const tx = doc(collection(db, ...userPath(uid, 'transactions')))
  const batch = writeBatch(db)
  batch.set(tx, {
    kind: 'cash',
    description: bill.name,
    amountCents: bill.amountCents,
    date: monthKey(today) === month ? today : billDueDate(bill, month),
    category: bill.category,
    paymentMethod: bill.paymentMethod,
    createdAt: serverTimestamp()
  })
  batch.set(
    doc(db, ...userPath(uid, 'bills', bill.id)),
    { paid: { [month]: tx.id } },
    { merge: true }
  )
  await batch.commit()
}

/** Desfaz o "paga": apaga a saída criada e tira o mês da lista de pagos. */
export async function unmarkBillPaid(bill: Bill, month: string): Promise<void> {
  const uid = requireUid()
  const batch = writeBatch(db)
  const txId = bill.paid?.[month]
  if (txId) batch.delete(doc(db, ...userPath(uid, 'transactions', txId)))
  batch.update(
    doc(db, ...userPath(uid, 'bills', bill.id)),
    new FieldPath('paid', month),
    deleteField()
  )
  await batch.commit()
}

// ---------- Backup ----------

/** O que está no app agora, no formato que `makeBackup` espera. */
export function currentBackupData(): {
  settings: Settings | null
  profile: Profile | null
  collections: Record<BackupCollection, { id: string }[]>
} {
  const s = useApp.getState()
  return {
    settings: s.settings,
    profile: s.profile,
    collections: {
      transactions: s.transactions,
      ...s.investments,
      budgets: Object.entries(s.budgets).map(([id, limits]) => ({ id, limits })),
      goals: s.goals,
      bills: s.bills
    }
  }
}

/**
 * Grava o backup por cima: cada item com o mesmo id é substituído, o que não está no backup
 * continua como está. Quem chama salva antes um backup do estado atual.
 */
export async function restoreBackup(backup: Backup): Promise<void> {
  const uid = requireUid()
  const writes: [string[], object][] = []
  if (backup.settings) writes.push([['settings', 'main'], backup.settings])
  if (backup.profile) writes.push([['profile', 'main'], backup.profile])
  for (const name of BACKUP_COLLECTIONS) {
    for (const { id, ...data } of backup.collections[name]) writes.push([[name, id], data])
  }
  for (let start = 0; start < writes.length; start += 450) {
    const batch = writeBatch(db)
    for (const [path, data] of writes.slice(start, start + 450)) {
      batch.set(doc(db, ...userPath(uid, ...path)), data)
    }
    await batch.commit()
  }
}

// ---------- Configurações e perfil ----------

/** Grava só os campos passados (listas como `categories` vão inteiras). */
export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  await setDoc(doc(db, ...userPath(requireUid(), 'settings', 'main')), patch, { merge: true })
}

export async function updateUserProfile(patch: Partial<Profile>): Promise<void> {
  const user = auth.currentUser
  if (!user) throw new Error('Você precisa entrar na sua conta.')
  if (patch.displayName !== undefined) await updateProfile(user, { displayName: patch.displayName })
  await setDoc(doc(db, ...userPath(user.uid, 'profile', 'main')), patch, { merge: true })
}

// ---------- Login ----------

export async function signInWithEmail(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email.trim(), password)
}

export async function signUpWithEmail(
  name: string,
  email: string,
  password: string
): Promise<void> {
  const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password)
  if (name.trim()) {
    await updateProfile(user, { displayName: name.trim() })
    // O onAuthStateChanged já disparou sem o nome; atualiza o perfil criado.
    await setDoc(
      doc(db, ...userPath(user.uid, 'profile', 'main')),
      { displayName: name.trim() },
      { merge: true }
    )
  }
}

export async function signInWithGoogle(): Promise<void> {
  const idToken = await window.api.auth.googleSignIn()
  await signInWithCredential(auth, GoogleAuthProvider.credential(idToken))
}

export const resetPassword = (email: string): Promise<void> =>
  sendPasswordResetEmail(auth, email.trim())

export const signOut = (): Promise<void> => firebaseSignOut(auth)

// ---------- Configurações ----------

/** Troca o tema na hora e, com alguém logado, salva em settings/main.theme. */
export async function setThemeSource(theme: ThemeSource): Promise<void> {
  useApp.setState({ theme })
  await window.api.theme.setSource(theme)
  const uid = useApp.getState().user?.uid
  if (uid) await setDoc(doc(db, ...userPath(uid, 'settings', 'main')), { theme }, { merge: true })
}

// ---------- Mensagens de erro ----------

const ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'E-mail inválido.',
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/email-already-in-use': 'Já existe uma conta com esse e-mail.',
  'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
  'auth/too-many-requests': 'Muitas tentativas. Espere um pouco e tente de novo.',
  'auth/network-request-failed': 'Sem conexão com a internet.',
  'auth/missing-password': 'Digite a senha.',
  'permission-denied': 'Sem permissão para acessar esses dados.',
  unavailable: 'Sem conexão com o servidor. Os dados aparecem assim que a internet voltar.'
}

export function friendlyError(error: unknown): string {
  const code = (error as { code?: string })?.code
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code]
  if (!(error instanceof Error)) return 'Algo deu errado. Tente de novo.'
  // Erro vindo do processo principal chega como "Error invoking remote method 'x': Error: ...".
  return error.message.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '')
}
