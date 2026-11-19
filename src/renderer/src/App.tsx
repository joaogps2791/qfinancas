import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { useApp } from './data/store'
import { LogoMark } from './components/Logo'
import Login from './screens/Login'
import Home from './screens/Home'
import DevUi from './screens/DevUi'

/** Ctrl+Shift+U abre a página escondida do design system. */
function DevShortcut(): null {
  const navigate = useNavigate()
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'u') navigate('/dev/ui')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])
  return null
}

export default function App(): React.JSX.Element {
  const user = useApp((s) => s.user)

  const home =
    user === undefined ? (
      <div className="center splash" role="status">
        <LogoMark size={64} />
        <span className="muted">Carregando…</span>
      </div>
    ) : user ? (
      <Home />
    ) : (
      <Login />
    )

  return (
    <>
      <div className="titlebar">
        <LogoMark size={18} decorative />
        QFinanças
      </div>
      {/* HashRouter porque o app roda de file:// no instalador. */}
      <HashRouter>
        <DevShortcut />
        <Routes>
          <Route path="/" element={home} />
          {/* Não mostra dados do usuário, então abre mesmo sem login. */}
          <Route path="/dev/ui" element={<DevUi />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </>
  )
}
