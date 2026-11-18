import { createServer } from 'http'
import { createHash, randomBytes } from 'crypto'
import type { AddressInfo } from 'net'

// Login com Google pelo navegador padrão: OAuth "app de computador" com PKCE e
// redirecionamento para 127.0.0.1. Devolve o id_token para o renderer entrar no
// Firebase com signInWithCredential.
// O "client secret" de um cliente OAuth do tipo Desktop não é tratado como segredo pelo
// Google (vai dentro de todo app instalado), por isso pode vir do .env no build.

const CLIENT_ID = import.meta.env.MAIN_VITE_GOOGLE_CLIENT_ID
const CLIENT_SECRET = import.meta.env.MAIN_VITE_GOOGLE_CLIENT_SECRET
const TIMEOUT_MS = 5 * 60 * 1000

const base64url = (buffer: Buffer): string => buffer.toString('base64url')

const page = (message: string): string =>
  `<!doctype html><meta charset="utf-8"><title>QFinanças</title>` +
  `<body style="font-family:system-ui;padding:48px;text-align:center">` +
  `<h2>${message}</h2><p>Pode fechar esta aba e voltar para o QFinanças.</p></body>`

let pending: Promise<string> | null = null

export function googleSignIn(openExternal: (url: string) => void): Promise<string> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return Promise.reject(
      new Error(
        'O login com Google ainda não foi configurado (faltam MAIN_VITE_GOOGLE_CLIENT_ID e MAIN_VITE_GOOGLE_CLIENT_SECRET no .env).'
      )
    )
  }
  // Um clique a mais no botão reaproveita o fluxo que já está aberto.
  pending ??= run(CLIENT_ID, CLIENT_SECRET, openExternal).finally(() => (pending = null))
  return pending
}

function run(
  clientId: string,
  clientSecret: string,
  openExternal: (url: string) => void
): Promise<string> {
  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  const state = base64url(randomBytes(16))

  return new Promise<string>((resolve, reject) => {
    let redirectUri = ''

    const finish = (error: Error | null, idToken?: string): void => {
      clearTimeout(timer)
      server.close()
      if (error) reject(error)
      else resolve(idToken!)
    }

    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', redirectUri)
      if (url.pathname !== '/') {
        res.writeHead(404).end()
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })

      const code = url.searchParams.get('code')
      if (url.searchParams.get('state') !== state || !code) {
        res.end(page('Não foi possível entrar com o Google.'))
        finish(new Error('O login com Google foi cancelado ou não pôde ser concluído.'))
        return
      }

      try {
        const response = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
            code_verifier: verifier
          })
        })
        const body = (await response.json()) as { id_token?: string; error_description?: string }
        if (!response.ok || !body.id_token) {
          throw new Error(body.error_description || 'O Google recusou o login.')
        }
        res.end(page('Pronto, você entrou.'))
        finish(null, body.id_token)
      } catch (error) {
        res.end(page('Não foi possível entrar com o Google.'))
        finish(error instanceof Error ? error : new Error(String(error)))
      }
    })

    const timer = setTimeout(
      () => finish(new Error('O login com Google demorou demais. Tente de novo.')),
      TIMEOUT_MS
    )

    server.on('error', (error) => finish(error))
    server.listen(0, '127.0.0.1', () => {
      redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
      const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      auth.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        prompt: 'select_account'
      }).toString()
      openExternal(auth.toString())
    })
  })
}
