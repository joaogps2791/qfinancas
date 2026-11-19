import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  nativeTheme,
  Notification,
  dialog,
  safeStorage,
  screen
} from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { googleSignIn } from './googleAuth'

type ThemeSource = 'system' | 'light' | 'dark'

// Cores só da moldura nativa (fundo antes do React carregar e barra de título).
// Ficam alinhadas com --bg / --text de src/renderer/src/styles/tokens.css.
const FRAME_COLORS = {
  light: { bg: '#f1ede4', symbol: '#1d1b18' },
  dark: { bg: '#0b0b0c', symbol: '#f4f4f5' }
}
const TITLE_BAR_HEIGHT = 40

let mainWindow: BrowserWindow | null = null

const userFile = (name: string): string => join(app.getPath('userData'), name)

function readJson<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(userFile(name), 'utf8')) as T
  } catch {
    return fallback
  }
}

const writeJson = (name: string, data: unknown): void =>
  writeFileSync(userFile(name), JSON.stringify(data))

// ---------- Tema ----------

const frameColors = (): (typeof FRAME_COLORS)['light'] =>
  nativeTheme.shouldUseDarkColors ? FRAME_COLORS.dark : FRAME_COLORS.light

function applyFrameTheme(): void {
  if (!mainWindow) return
  const colors = frameColors()
  mainWindow.setBackgroundColor(colors.bg)
  mainWindow.setTitleBarOverlay({
    color: colors.bg,
    symbolColor: colors.symbol,
    height: TITLE_BAR_HEIGHT
  })
  mainWindow.webContents.send('theme:changed', nativeTheme.shouldUseDarkColors)
}

// ---------- Janela ----------

type WindowState = { x?: number; y?: number; width: number; height: number; maximized?: boolean }

function loadWindowState(): WindowState {
  const state = readJson<WindowState>('window-state.json', { width: 1280, height: 800 })
  const { x, y } = state
  // Se o monitor onde a janela estava sumiu, deixa o Windows centralizar.
  const visible =
    x !== undefined &&
    y !== undefined &&
    screen
      .getAllDisplays()
      .some(
        ({ workArea: a }) =>
          x >= a.x - 50 && y >= a.y - 50 && x < a.x + a.width && y < a.y + a.height
      )
  return visible ? state : { width: state.width, height: state.height, maximized: state.maximized }
}

function createWindow(): void {
  const state = loadWindowState()
  const colors = frameColors()

  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: Math.max(state.width, 1100),
    height: Math.max(state.height, 700),
    minWidth: 1100,
    minHeight: 700,
    show: false,
    title: 'QFinanças',
    icon,
    backgroundColor: colors.bg,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: colors.bg, symbolColor: colors.symbol, height: TITLE_BAR_HEIGHT },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  if (state.maximized) mainWindow.maximize()

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.on('close', () => {
    if (!mainWindow) return
    writeJson('window-state.json', {
      ...mainWindow.getNormalBounds(),
      maximized: mainWindow.isMaximized()
    })
  })
  mainWindow.on('closed', () => (mainWindow = null))

  // Links externos abrem no navegador, nunca dentro do app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (!(devUrl && url.startsWith(devUrl)) && !url.startsWith('file://')) event.preventDefault()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function openExternalSafe(url: string): void {
  if (/^(https?:|mailto:)/i.test(url)) shell.openExternal(url)
}

// ---------- Segredos (safeStorage) ----------

const SECRETS_FILE = 'secrets.json'
const validSecretKey = (key: unknown): key is string =>
  typeof key === 'string' && /^[a-z0-9._-]{1,64}$/i.test(key)

const readSecrets = (): Record<string, string> => readJson<Record<string, string>>(SECRETS_FILE, {})

// ---------- IPC ----------

function registerIpc(): void {
  ipcMain.on('theme:is-dark', (event) => {
    event.returnValue = nativeTheme.shouldUseDarkColors
  })
  ipcMain.on('theme:source', (event) => {
    event.returnValue = nativeTheme.themeSource
  })
  ipcMain.handle('theme:set-source', (_e, source: ThemeSource) => {
    if (!['system', 'light', 'dark'].includes(source)) return
    nativeTheme.themeSource = source
    writeJson('theme.json', { source })
  })

  ipcMain.handle('notify', (_e, title: string, body: string) => {
    if (Notification.isSupported()) {
      new Notification({ title: String(title), body: String(body), icon }).show()
    }
  })

  ipcMain.handle('secrets:get', (_e, key: unknown) => {
    if (!validSecretKey(key)) throw new Error('Chave inválida.')
    const stored = readSecrets()[key]
    return stored ? safeStorage.decryptString(Buffer.from(stored, 'base64')) : null
  })
  ipcMain.handle('secrets:has', (_e, key: unknown) => {
    if (!validSecretKey(key)) throw new Error('Chave inválida.')
    return key in readSecrets()
  })
  ipcMain.handle('secrets:set', (_e, key: unknown, value: unknown) => {
    if (!validSecretKey(key) || typeof value !== 'string') throw new Error('Chave inválida.')
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('O Windows não liberou a criptografia para guardar a chave.')
    }
    const secrets = readSecrets()
    secrets[key] = safeStorage.encryptString(value).toString('base64')
    writeJson(SECRETS_FILE, secrets)
  })
  ipcMain.handle('secrets:remove', (_e, key: unknown) => {
    if (!validSecretKey(key)) throw new Error('Chave inválida.')
    const secrets = readSecrets()
    delete secrets[key]
    writeJson(SECRETS_FILE, secrets)
  })

  ipcMain.handle('file:open', async (_e, filters: Electron.FileFilter[] = []) => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters })
    const path = result.filePaths[0]
    if (result.canceled || !path) return null
    return { name: path.split(/[\\/]/).pop() ?? path, data: new Uint8Array(await readFile(path)) }
  })
  ipcMain.handle(
    'file:save',
    async (
      _e,
      defaultName: string,
      content: string | Uint8Array,
      filters: Electron.FileFilter[] = []
    ) => {
      if (!mainWindow) return null
      const result = await dialog.showSaveDialog(mainWindow, { defaultPath: defaultName, filters })
      if (result.canceled || !result.filePath) return null
      await writeFile(result.filePath, content)
      return result.filePath
    }
  )

  ipcMain.handle('open-external', (_e, url: string) => openExternalSafe(String(url)))

  ipcMain.handle('auth:google', () => googleSignIn(openExternalSafe))
}

// ---------- Início ----------

if (!app.requestSingleInstanceLock()) app.quit()

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.joao.qfinancas')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  nativeTheme.themeSource = readJson<{ source: ThemeSource }>('theme.json', {
    source: 'system'
  }).source
  nativeTheme.on('updated', applyFrameTheme)

  registerIpc()
  createWindow()
})

app.on('window-all-closed', () => app.quit())
