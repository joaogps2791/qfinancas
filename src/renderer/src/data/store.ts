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
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch
} from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { defaultSettings, type Settings, type ThemeSource } from '../domain/categories'
import {
  monthKey,
  shiftMonthKey,
  todayISO,
  type Transaction,
  type TransactionInput
} from '../domain/finance'

export type Profile = { displayName: string; photoURL: string; photoDataUrl?: string }

type AppState = {
  /** undefined enquanto o Firebase ainda não respondeu se há alguém logado */
  user: User | null | undefined
  settings: Settings | null
  profile: Profile | null
  transactions: Transaction[]
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
  useApp.setState({ user, settings: null, profile: null, transactions: [], error: null })
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

/** Grava vários lançamentos de uma vez (ex.: uma série recorrente). */
export async function addTransactions(inputs: TransactionInput[]): Promise<void> {
  const uid = requireUid()
  const batch = writeBatch(db)
  const transactions = collection(db, ...userPath(uid, 'transactions'))
  for (const input of inputs) {
    batch.set(doc(transactions), { ...input, createdAt: serverTimestamp() })
  }
  await batch.commit()
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
  return error instanceof Error ? error.message : 'Algo deu errado. Tente de novo.'
}
