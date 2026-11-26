import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  nativeTheme,
  Notification,
  dialog,
  Menu,
  nativeImage,
  safeStorage,
  screen,
  Tray
} from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { googleSignIn } from './googleAuth'
import { fetchQuotes, fetchRates } from './market'
import { setupUpdater } from './updater'
import {
  fetchPluggy,
  fetchPluggyInvestments,
  parseItemIds,
  testPluggy,
  type PluggyCredentials
} from './pluggy'

type ThemeSource = 'system' | 'light' | 'dark'

// Cores só da moldura nativa (fundo antes do React carregar e barra de título).
// Ficam alinhadas com --bg / --text de src/renderer/src/styles/tokens.css.
const FRAME_COLORS = {
  light: { bg: '#f1ede4', symbol: '#1d1b18' },
  dark: { bg: '#0b0b0c', symbol: '#f4f4f5' }
}
const TITLE_BAR_HEIGHT = 40

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
// true quando o app vai sair de verdade (Sair na bandeja, desligar o PC); senão fechar só esconde.
let quitting = false
// Aberto pelo "Iniciar com o Windows": começa escondido na bandeja.
const startHidden = process.argv.includes('--hidden')

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

  mainWindow.on('ready-to-show', () => {
    if (!startHidden) mainWindow?.show()
  })

  mainWindow.on('close', (event) => {
    if (!mainWindow) return
    writeJson('window-state.json', {
      ...mainWindow.getNormalBounds(),
      maximized: mainWindow.isMaximized()
    })
    // Com a bandeja ligada, fechar só esconde: a tela continua rodando para mandar os avisos.
    if (tray && !quitting) {
      event.preventDefault()
      mainWindow.hide()
    }
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

function showWindow(): void {
  if (!mainWindow) createWindow()
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

// ---------- Bandeja e início com o Windows ----------

type Background = { enabled: boolean }
const BACKGROUND_FILE = 'background.json'

function setTray(on: boolean): void {
  if (on && !tray) {
    tray = new Tray(nativeImage.createFromPath(icon).resize({ width: 16, height: 16 }))
    tray.setToolTip('QFinanças')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Abrir o QFinanças', click: showWindow },
        { type: 'separator' },
        {
          label: 'Sair',
          click: () => {
            quitting = true
            app.quit()
          }
        }
      ])
    )
    tray.on('click', showWindow)
  } else if (!on && tray) {
    tray.destroy()
    tray = null
  }
}

/** Liga ou desliga junto: ícone na bandeja, fechar para a bandeja e abrir com o Windows. */
function setBackground(on: boolean): void {
  writeJson(BACKGROUND_FILE, { enabled: on } satisfies Background)
  setTray(on)
  // Em desenvolvimento o "app" é o electron.exe do projeto; só o instalado entra no início do Windows.
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: on, args: ['--hidden'] })
}

// ---------- Avisos ----------

type AlertTarget = { to: '/cartoes'; card: string; month: string } | { to: '/contas'; bill: string }

const shortText = (v: unknown): v is string => typeof v === 'string' && v.length <= 128
function validTarget(t: unknown): AlertTarget | null {
  if (typeof t !== 'object' || t === null) return null
  const o = t as Record<string, unknown>
  if (
    o.to === '/cartoes' &&
    shortText(o.card) &&
    shortText(o.month) &&
    /^\d{4}-\d{2}$/.test(o.month)
  ) {
    return { to: '/cartoes', card: o.card, month: o.month }
  }
  if (o.to === '/contas' && shortText(o.bill)) return { to: '/contas', bill: o.bill }
  return null
}

// Guarda as notificações abertas: sem referência, o coletor de lixo some com o clique.
const openNotifications = new Set<Notification>()

function openExternalSafe(url: string): void {
  if (/^(https?:|mailto:)/i.test(url)) shell.openExternal(url)
}

// ---------- Segredos (safeStorage) ----------

const SECRETS_FILE = 'secrets.json'
const validSecretKey = (key: unknown): key is string =>
  typeof key === 'string' && /^[a-z0-9._-]{1,64}$/i.test(key)

const readSecrets = (): Record<string, string> => readJson<Record<string, string>>(SECRETS_FILE, {})

function getSecret(key: string): string | null {
  const stored = readSecrets()[key]
  return stored ? safeStorage.decryptString(Buffer.from(stored, 'base64')) : null
}

// Data de hoje em São Paulo (YYYY-MM-DD), como no renderer.
const todaySaoPaulo = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

const cacheStorage = { read: readJson, write: writeJson }

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

  ipcMain.handle('notify', (_e, title: unknown, body: unknown, target: unknown) => {
    if (!Notification.isSupported()) return
    const notification = new Notification({
      title: String(title).slice(0, 200),
      body: String(body).slice(0, 500),
      icon
    })
    const to = validTarget(target)
    openNotifications.add(notification)
    notification.on('click', () => {
      showWindow()
      if (to) mainWindow?.webContents.send('app:navigate', to)
      openNotifications.delete(notification)
    })
    notification.on('close', () => openNotifications.delete(notification))
    notification.show()
  })

  ipcMain.handle(
    'background:get',
    () => readJson<Background>(BACKGROUND_FILE, { enabled: false }).enabled
  )
  ipcMain.handle('background:set', (_e, on: unknown) => setBackground(on === true))

  ipcMain.handle('secrets:get', (_e, key: unknown) => {
    if (!validSecretKey(key)) throw new Error('Chave inválida.')
    return getSecret(key)
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

  // Relatório em PDF: a tela já está no layout de impressão quando chama.
  ipcMain.handle('report:pdf', async (event, defaultName: unknown) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return null
    const name =
      typeof defaultName === 'string' && /^[^\\/:*?"<>|]{1,120}\.pdf$/i.test(defaultName)
        ? defaultName
        : 'relatorio-qfinancas.pdf'
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: name,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (result.canceled || !result.filePath) return null
    // As margens da folha saem com a cor de fundo da janela (escura no tema escuro).
    const previous = mainWindow.getBackgroundColor()
    mainWindow.setBackgroundColor('#ffffff')
    let pdf: Buffer
    try {
      pdf = await event.sender.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }
      })
    } finally {
      mainWindow.setBackgroundColor(previous)
    }
    await writeFile(result.filePath, pdf)
    return result.filePath
  })

  ipcMain.handle('open-external', (_e, url: string) => openExternalSafe(String(url)))

  ipcMain.handle('auth:google', () => googleSignIn(openExternalSafe))

  // Open Finance (Meu Pluggy): as credenciais saem do safeStorage aqui mesmo, não da tela.
  const pluggyCredentials = (): PluggyCredentials => ({
    clientId: getSecret('pluggy.clientId')?.trim() ?? '',
    clientSecret: getSecret('pluggy.clientSecret')?.trim() ?? '',
    itemIds: parseItemIds(getSecret('pluggy.itemIds'))
  })
  ipcMain.handle('pluggy:test', () => testPluggy(pluggyCredentials()))
  ipcMain.handle('pluggy:fetch', (_e, dateFrom: unknown) =>
    fetchPluggy(pluggyCredentials(), dateFrom)
  )
  ipcMain.handle('pluggy:investments', () => fetchPluggyInvestments(pluggyCredentials()))

  ipcMain.handle('market:quotes', (_e, tickers: unknown, force: unknown) =>
    fetchQuotes(tickers, force === true, getSecret('brapi.token'), cacheStorage)
  )
  ipcMain.handle('market:rates', (_e, from: unknown) =>
    fetchRates(from, todaySaoPaulo(), cacheStorage)
  )
}

// ---------- Início ----------

if (!app.requestSingleInstanceLock()) app.quit()

app.on('second-instance', showWindow)
app.on('before-quit', () => {
  quitting = true
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.joao.qfinancas')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  nativeTheme.themeSource = readJson<{ source: ThemeSource }>('theme.json', {
    source: 'system'
  }).source
  nativeTheme.on('updated', applyFrameTheme)

  registerIpc()
  setupUpdater(() => mainWindow, cacheStorage)
  setTray(readJson<Background>(BACKGROUND_FILE, { enabled: false }).enabled)
  createWindow()
})

// Com a bandeja ligada a janela só se esconde, então isto só acontece com ela desligada.
app.on('window-all-closed', () => {
  if (!tray) app.quit()
})
