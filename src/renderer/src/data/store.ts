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
import { defaultSettings, type Settings } from '../domain/categories'
import type { Transaction, TransactionInput } from '../domain/finance'

type AppState = {
  /** undefined enquanto o Firebase ainda não respondeu se há alguém logado */
  user: User | null | undefined
  settings: Settings | null
  transactions: Transaction[]
  error: string | null
}

export const useApp = create<AppState>(() => ({
  user: undefined,
  settings: null,
  transactions: [],
  error: null
}))

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
  useApp.setState({ user, settings: null, transactions: [], error: null })
  if (!user) return

  const onError = (error: Error): void => useApp.setState({ error: friendlyError(error) })

  ensureUserDocs(user).catch(onError)

  unsubscribers.push(
    onSnapshot(
      doc(db, ...userPath(user.uid, 'settings', 'main')),
      (snap) => snap.exists() && useApp.setState({ settings: snap.data() as Settings }),
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

export async function deleteTransaction(id: string): Promise<void> {
  await deleteDoc(doc(db, ...userPath(requireUid(), 'transactions', id)))
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
