import { useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  ArrowLeftRight,
  CalendarClock,
  CreditCard,
  FileBarChart,
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  Settings as SettingsIcon,
  Sun,
  Target,
  Calculator,
  TrendingUp
} from 'lucide-react'
import {
  closeComposer,
  friendlyError,
  openComposer,
  setThemeSource,
  shiftMonth,
  signOut,
  useApp
} from '../data/store'
import { useAlertNavigation, useDueAlerts } from '../data/alerts'
import type { ThemeSource } from '../domain/categories'
import { Avatar, Modal } from './ui'
import TransactionForm from './TransactionForm'
import UpdateBanner from './UpdateBanner'
import '../screens/screens.css'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/transacoes', label: 'Transações', icon: ArrowLeftRight },
  { to: '/cartoes', label: 'Cartões', icon: CreditCard },
  { to: '/contas', label: 'Contas', icon: CalendarClock },
  { to: '/investimentos', label: 'Investimentos', icon: TrendingUp },
  { to: '/metas', label: 'Metas', icon: Target },
  { to: '/orcamento', label: 'Orçamento', icon: Calculator },
  { to: '/relatorios', label: 'Relatórios', icon: FileBarChart },
  { to: '/configuracoes', label: 'Configurações', icon: SettingsIcon }
]

const THEME_NEXT: Record<ThemeSource, { next: ThemeSource; label: string; icon: typeof Sun }> = {
  system: { next: 'light', label: 'Tema: sistema', icon: Monitor },
  light: { next: 'dark', label: 'Tema: claro', icon: Sun },
  dark: { next: 'system', label: 'Tema: escuro', icon: Moon }
}

const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

/** Atalhos: Ctrl+N nova transação, Ctrl+K busca, Ctrl+←/→ mês anterior/próximo. */
function useShortcuts(): void {
  const navigate = useNavigate()
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return
      const key = e.key.toLowerCase()
      if (key === 'n') {
        e.preventDefault()
        openComposer()
      } else if (key === 'k') {
        e.preventDefault()
        navigate('/transacoes', { state: { focusSearch: Date.now() } })
      } else if ((key === 'arrowleft' || key === 'arrowright') && !isTyping(e.target)) {
        e.preventDefault()
        shiftMonth(key === 'arrowleft' ? -1 : 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])
}

function Sidebar(): React.JSX.Element {
  const user = useApp((s) => s.user)
  const profile = useApp((s) => s.profile)
  const theme = useApp((s) => s.theme)
  const name = profile?.displayName || user?.displayName || user?.email?.split('@')[0] || ''
  const photo = profile?.photoDataUrl || profile?.photoURL || user?.photoURL || undefined
  const themeButton = THEME_NEXT[theme]
  const ThemeIcon = themeButton.icon

  return (
    <aside className="sidebar">
      <div className="sidebar__profile">
        <Avatar name={name || 'Você'} src={photo} size={88} />
        <span className="sidebar__welcome">Bem-vindo de volta,</span>
        <strong className="sidebar__name">{name}</strong>
      </div>
      <nav className="sidebar__nav" aria-label="Menu principal">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className="sidebar__link">
            <Icon size={18} aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar__footer">
        <button
          type="button"
          className="sidebar__link"
          onClick={() => setThemeSource(themeButton.next).catch((e) => alert(friendlyError(e)))}
          title="Trocar tema (sistema, claro, escuro)"
        >
          <ThemeIcon size={18} aria-hidden />
          {themeButton.label}
        </button>
        <button type="button" className="sidebar__link" onClick={signOut}>
          <LogOut size={18} aria-hidden />
          Sair
        </button>
      </div>
    </aside>
  )
}

/** Moldura das telas logadas: sidebar, conteúdo e o formulário de lançamento (Ctrl+N). */
export default function Shell(): React.JSX.Element {
  useShortcuts()
  useDueAlerts()
  useAlertNavigation()
  const composer = useApp((s) => s.composer)
  const error = useApp((s) => s.error)

  return (
    <div className="shell">
      <Sidebar />
      <main className="shell__main">
        <UpdateBanner />
        {error && (
          <p className="banner banner--danger" role="alert">
            {error}
          </p>
        )}
        <Outlet />
      </main>
      <Modal
        open={!!composer}
        onClose={closeComposer}
        title={composer?.editing ? 'Editar lançamento' : 'Novo lançamento'}
      >
        {composer && (
          <TransactionForm
            key={composer.editing?.id ?? 'new'}
            editing={composer.editing}
            onDone={closeComposer}
          />
        )}
      </Modal>
    </div>
  )
}
