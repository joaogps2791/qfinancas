import { contextBridge, ipcRenderer } from 'electron'

type FileFilter = { name: string; extensions: string[] }

// A única ponte entre a tela e o processo principal. Mantenha pequena.
const api = {
  theme: {
    isDark: (): boolean => ipcRenderer.sendSync('theme:is-dark'),
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
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
