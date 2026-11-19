import { friendlyError, setThemeSource, useApp } from '../data/store'
import type { ThemeSource } from '../domain/categories'
import { Pills } from './ui'

const OPTIONS: { value: ThemeSource; label: string }[] = [
  { value: 'system', label: 'Sistema' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' }
]

/** Sistema / Claro / Escuro. Troca na hora e salva em settings/main.theme. */
export default function ThemePicker(): React.JSX.Element {
  const theme = useApp((s) => s.theme)
  return (
    <Pills
      label="Tema"
      options={OPTIONS}
      value={theme}
      onChange={(value) => setThemeSource(value).catch((e) => alert(friendlyError(e)))}
    />
  )
}
