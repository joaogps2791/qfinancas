import './app.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

// Tema aplicado antes do primeiro desenho, para a tela não piscar.
const applyTheme = (isDark: boolean): void => {
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light'
}
applyTheme(window.api.theme.isDark())
window.api.theme.onChange(applyTheme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
