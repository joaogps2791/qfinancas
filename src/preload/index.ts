import { contextBridge, ipcRenderer } from 'electron'
import type { QuotesResult, Rates } from '../main/market'
import type { UpdateState } from '../main/updater'
import type { PluggyCards, PluggyData, PluggyInvestments, PluggyItemStatus } from '../main/pluggy'

type FileFilter = { name: string; extensions: string[] }
/** Mesmo formato de AlertTarget em src/renderer/src/domain/alerts.ts. */
type AlertTarget = { to: '/cartoes'; card: string; month: string } | { to: '/contas'; bill: string }

// A única ponte entre a tela e o processo principal. Mantenha pequena.
const api = {
  theme: {
    isDark: (): boolean => ipcRenderer.sendSync('theme:is-dark'),
    getSource: (): 'system' | 'light' | 'dark' => ipcRenderer.sendSync('theme:source'),
    setSource: (source: 'system' | 'light' | 'dark'): Promise<void> =>
      ipcRenderer.invoke('theme:set-source', source),
    onChange: (callback: (isDark: boolean) => void): (() => void) => {
      const listener = (_e: unknown, isDark: boolean): void => callback(isDark)
      ipcRenderer.on('theme:changed', listener)
      return () => ipcRenderer.removeListener('theme:changed', listener)
    }
  },
  /** Notificação do Windows; o clique abre o app em `target` (veja onNavigate). */
  notify: (title: string, body: string, target?: AlertTarget): Promise<void> =>
    ipcRenderer.invoke('notify', title, body, target),
  /** Pedido para abrir uma tela (clique numa notificação). Devolve a função para parar de ouvir. */
  onNavigate: (callback: (target: AlertTarget) => void): (() => void) => {
    const listener = (_e: unknown, target: AlertTarget): void => callback(target)
    ipcRenderer.on('app:navigate', listener)
    return () => ipcRenderer.removeListener('app:navigate', listener)
  },
  /** Open Finance pelo Meu Pluggy (só leitura; as credenciais ficam no processo principal). */
  pluggy: {
    test: (): Promise<PluggyItemStatus[]> => ipcRenderer.invoke('pluggy:test'),
    /** Contas e transações de todos os itens desde `dateFrom` (YYYY-MM-DD). */
    fetch: (dateFrom: string): Promise<PluggyData> => ipcRenderer.invoke('pluggy:fetch', dateFrom),
    /** Posições de investimento de todos os itens. */
    investments: (): Promise<PluggyInvestments> => ipcRenderer.invoke('pluggy:investments'),
    /** Cartões de crédito de todos os itens (só os 4 últimos dígitos). */
    cards: (): Promise<PluggyCards> => ipcRenderer.invoke('pluggy:cards')
  },
  /** Versão instalada (ex.: "1.0.0"). */
  appVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  /** Atualização automática (só no app instalado; em desenvolvimento o estado é "disabled"). */
  updates: {
    state: (): Promise<UpdateState> => ipcRenderer.invoke('updates:state'),
    /** Procura agora; erros aparecem só nesta chamada (as automáticas falham em silêncio). */
    check: (): Promise<UpdateState> => ipcRenderer.invoke('updates:check'),
    download: (): Promise<void> => ipcRenderer.invoke('updates:download'),
    install: (): Promise<void> => ipcRenderer.invoke('updates:install'),
    getAuto: (): Promise<boolean> => ipcRenderer.invoke('updates:get-auto'),
    setAuto: (on: boolean): Promise<void> => ipcRenderer.invoke('updates:set-auto', on),
    /** Notas da versão instalada, se ela veio por atualização. */
    notes: (): Promise<string | null> => ipcRenderer.invoke('updates:notes'),
    onChange: (callback: (state: UpdateState) => void): (() => void) => {
      const listener = (_e: unknown, state: UpdateState): void => callback(state)
      ipcRenderer.on('updates:changed', listener)
      return () => ipcRenderer.removeListener('updates:changed', listener)
    }
  },
  /** Bandeja + fechar para a bandeja + iniciar com o Windows (minimizado). */
  background: {
    get: (): Promise<boolean> => ipcRenderer.invoke('background:get'),
    set: (on: boolean): Promise<void> => ipcRenderer.invoke('background:set', on)
  },
  secrets: {
    get: (key: string): Promise<string | null> => ipcRenderer.invoke('secrets:get', key),
    has: (key: string): Promise<boolean> => ipcRenderer.invoke('secrets:has', key),
    set: (key: string, value: string): Promise<void> =>
      ipcRenderer.invoke('secrets:set', key, value),
    remove: (key: string): Promise<void> => ipcRenderer.invoke('secrets:remove', key)
  },
  files: {
    open: (filters?: FileFilter[]): Promise<{ name: string; data: Uint8Array } | null> =>
      ipcRenderer.invoke('file:open', filters),
    save: (
      defaultName: string,
      content: string | Uint8Array,
      filters?: FileFilter[]
    ): Promise<string | null> => ipcRenderer.invoke('file:save', defaultName, content, filters)
  },
  /** Salva a janela como PDF (a tela deve estar no layout de impressão). */
  savePdf: (defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke('report:pdf', defaultName),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('open-external', url),
  auth: {
    googleSignIn: (): Promise<string> => ipcRenderer.invoke('auth:google')
  },
  market: {
    /** Cotações da brapi (cache de 15 min; `force` ignora o cache). */
    quotes: (tickers: string[], force = false): Promise<QuotesResult> =>
      ipcRenderer.invoke('market:quotes', tickers, force),
    /** Selic e CDI diários e IPCA mensal do Banco Central, desde `from` (YYYY-MM-DD). */
    rates: (from: string): Promise<Rates> => ipcRenderer.invoke('market:rates', from)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
