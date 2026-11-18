import { useState } from 'react'
import {
  friendlyError,
  resetPassword,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail
} from '../data/store'

export default function Login(): React.JSX.Element {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  const run = async (action: () => Promise<void>, success?: string): Promise<void> => {
    setBusy(true)
    setMessage(null)
    try {
      await action()
      if (success) setMessage({ text: success, error: false })
    } catch (error) {
      setMessage({ text: friendlyError(error), error: true })
    } finally {
      setBusy(false)
    }
  }

  const submit = (event: React.FormEvent): void => {
    event.preventDefault()
    run(() =>
      mode === 'signin' ? signInWithEmail(email, password) : signUpWithEmail(name, email, password)
    )
  }

  return (
    <main className="center">
      <form className="card login" onSubmit={submit}>
        <h1>QFinanças</h1>
        <p className="muted">
          {mode === 'signin' ? 'Entre na sua conta.' : 'Crie sua conta para começar.'}
        </p>

        {mode === 'signup' && (
          <label>
            Nome
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
        )}
        <label>
          E-mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label>
          Senha
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            minLength={6}
            required
          />
        </label>

        {message && (
          <p className={message.error ? 'error' : 'success'} role="status">
            {message.text}
          </p>
        )}

        <button className="primary" type="submit" disabled={busy}>
          {mode === 'signin' ? 'Entrar' : 'Criar conta'}
        </button>
        <button type="button" disabled={busy} onClick={() => run(signInWithGoogle)}>
          Entrar com Google
        </button>

        <div className="row between">
          <button
            type="button"
            className="link"
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          >
            {mode === 'signin' ? 'Criar uma conta' : 'Já tenho conta'}
          </button>
          {mode === 'signin' && (
            <button
              type="button"
              className="link"
              disabled={busy}
              onClick={() =>
                email
                  ? run(() => resetPassword(email), 'Enviamos um e-mail para você trocar a senha.')
                  : setMessage({ text: 'Digite seu e-mail primeiro.', error: true })
              }
            >
              Esqueci a senha
            </button>
          )}
        </div>
      </form>
    </main>
  )
}
