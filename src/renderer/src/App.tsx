import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { useApp } from './data/store'
import { LogoMark } from './components/Logo'
import Shell from './components/Shell'
import Login from './screens/Login'
import Dashboard from './screens/Dashboard'
import Transactions from './screens/Transactions'
import Cards from './screens/Cards'
import Settings from './screens/Settings'
import Soon from './screens/Soon'
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

function Splash(): React.JSX.Element {
  return (
    <div className="center splash" role="status">
      <LogoMark size={64} />
      <span className="muted">Carregando…</span>
    </div>
  )
}

export default function App(): React.JSX.Element {
  const user = useApp((s) => s.user)

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
          {/* Não mostra dados do usuário, então abre mesmo sem login. */}
          <Route path="/dev/ui" element={<DevUi />} />
          {user === undefined ? (
            <Route path="*" element={<Splash />} />
          ) : !user ? (
            <Route path="*" element={<Login />} />
          ) : (
            <Route element={<Shell />}>
              <Route index element={<Dashboard />} />
              <Route path="transacoes" element={<Transactions />} />
              <Route path="cartoes" element={<Cards />} />
              <Route path="investimentos" element={<Soon title="Investimentos" phase="Fase 4" />} />
              <Route path="metas" element={<Soon title="Metas" phase="Fase 5" />} />
              <Route path="relatorios" element={<Soon title="Relatórios" phase="Fase 7" />} />
              <Route path="configuracoes" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          )}
        </Routes>
      </HashRouter>
    </>
  )
}
