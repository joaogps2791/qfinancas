// Atualização automática pelos Releases do GitHub (electron-updater).
// Só roda no app instalado: em desenvolvimento o estado fica "disabled".
import { app, ipcMain, type BrowserWindow } from 'electron'
import log from 'electron-log/main'
import { autoUpdater, type UpdateInfo } from 'electron-updater'

export type UpdateState =
  | { status: 'disabled' }
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'none' }
  /** há versão nova e a atualização automática está desligada: espera o "Baixar e instalar" */
  | { status: 'available'; version: string }
  | { status: 'downloading'; version: string; percent: number }
  | { status: 'ready'; version: string }
  | { status: 'error'; message: string }

type Prefs = { auto: boolean; notes?: { version: string; notes: string } }

type Storage = {
  read: <T>(name: string, fallback: T) => T
  write: (name: string, data: unknown) => void
}

const PREFS_FILE = 'updates.json'
const FIRST_CHECK = 10_000
const CHECK_EVERY = 6 * 60 * 60 * 1000

/** As notas do GitHub vêm em HTML ou como lista por versão; guarda só o texto. */
function notesText(info: UpdateInfo): string {
  const raw = Array.isArray(info.releaseNotes)
    ? info.releaseNotes.map((n) => n.note ?? '').join('\n')
    : (info.releaseNotes ?? '')
  return raw
    .replace(/<h\d[^>]*>/gi, '\n## ')
    .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h\d>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function setupUpdater(getWindow: () => BrowserWindow | null, storage: Storage): void {
  const readPrefs = (): Prefs => storage.read<Prefs>(PREFS_FILE, { auto: true })
  let state: UpdateState = app.isPackaged ? { status: 'idle' } : { status: 'disabled' }
  // Erro só aparece para o João quando ele mesmo clicou em "Procurar atualizações".
  let manual = false

  const setState = (next: UpdateState): void => {
    state = next
    getWindow()?.webContents.send('updates:changed', state)
  }

  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('updates:state', () => state)
  ipcMain.handle('updates:get-auto', () => readPrefs().auto)
  ipcMain.handle('updates:notes', () => {
    const notes = readPrefs().notes
    return notes && notes.version === app.getVersion() ? notes.notes : null
  })

  if (!app.isPackaged) {
    ipcMain.handle('updates:set-auto', () => undefined)
    ipcMain.handle('updates:check', () => state)
    ipcMain.handle('updates:download', () => undefined)
    ipcMain.handle('updates:install', () => undefined)
    return
  }

  log.initialize()
  log.transports.file.level = 'info'
  autoUpdater.logger = log
  autoUpdater.autoDownload = readPrefs().auto
  // "Depois" = instala sozinho quando o app fechar.
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => setState({ status: 'checking' }))
  autoUpdater.on('update-not-available', () => setState({ status: 'none' }))
  autoUpdater.on('update-available', (info) =>
    setState(
      autoUpdater.autoDownload
        ? { status: 'downloading', version: info.version, percent: 0 }
        : { status: 'available', version: info.version }
    )
  )
  autoUpdater.on('download-progress', (p) => {
    if (state.status === 'downloading') {
      setState({ ...state, percent: Math.round(p.percent) })
    }
  })
  autoUpdater.on('update-downloaded', (info) => {
    storage.write(PREFS_FILE, {
      ...readPrefs(),
      notes: { version: info.version, notes: notesText(info) }
    } satisfies Prefs)
    setState({ status: 'ready', version: info.version })
  })
  autoUpdater.on('error', (error) => {
    log.warn('Atualização falhou:', error)
    // Download pela metade ou sem internet: volta ao normal e tenta de novo na próxima verificação.
    setState(
      manual
        ? {
            status: 'error',
            // 404: o repositório ainda não tem nenhuma versão publicada (ou é privado).
            message: /\b404\b/.test(String(error))
              ? 'Ainda não há versões publicadas no GitHub.'
              : 'Não deu para procurar atualizações. Confira a internet e tente de novo.'
          }
        : { status: 'idle' }
    )
  })

  const check = async (byUser: boolean): Promise<UpdateState> => {
    // Já baixando ou pronta: não procura de novo por cima.
    if (state.status === 'downloading' || state.status === 'ready') return state
    manual = byUser
    try {
      await autoUpdater.checkForUpdates()
    } catch (error) {
      log.warn('Verificação falhou:', error)
    } finally {
      manual = false
    }
    return state
  }

  ipcMain.handle('updates:check', () => check(true))
  ipcMain.handle('updates:set-auto', (_e, on: unknown) => {
    const auto = on === true
    storage.write(PREFS_FILE, { ...readPrefs(), auto } satisfies Prefs)
    autoUpdater.autoDownload = auto
  })
  ipcMain.handle('updates:download', async () => {
    if (state.status !== 'available') return
    setState({ status: 'downloading', version: state.version, percent: 0 })
    await autoUpdater.downloadUpdate().catch((error) => log.warn('Download falhou:', error))
  })
  // Fecha (inclusive com a bandeja ligada: o before-quit libera o fechamento) e instala em silêncio.
  ipcMain.handle('updates:install', () => {
    if (state.status === 'ready') autoUpdater.quitAndInstall(true, true)
  })

  setTimeout(() => void check(false), FIRST_CHECK)
  setInterval(() => void check(false), CHECK_EVERY)
}
