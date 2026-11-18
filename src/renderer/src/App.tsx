import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useApp } from './data/store'
import Login from './screens/Login'
import Home from './screens/Home'

export default function App(): React.JSX.Element {
  const user = useApp((s) => s.user)

  return (
    <>
      <div className="titlebar">QFinanças</div>
      {user === undefined ? (
        <div className="center muted">Carregando…</div>
      ) : !user ? (
        <Login />
      ) : (
        // HashRouter porque o app roda de file:// no instalador.
        <HashRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      )}
    </>
  )
}
