import { contextBridge, ipcRenderer } from 'electron'
import type { QuotesResult, Rates } from '../main/market'

type FileFilter = { name: string; extensions: string[] }

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
  notify: (title: string, body: string): Promise<void> => ipcRenderer.invoke('notify', title, body),
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
