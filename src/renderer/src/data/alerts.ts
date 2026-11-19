// Agenda os avisos de vencimento e abre a tela certa quando alguém clica num deles.
// Roda na tela (que continua viva escondida quando o app está na bandeja).
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from './store'
import { alertsToSend, DEFAULT_NOTIFICATIONS, dueItems } from '../domain/alerts'
import { daysUntil, todayISO } from '../domain/finance'

const SENT_KEY = 'qf.alerts.sent'
const CHECK_EVERY = 15 * 60 * 1000

/** Avisos já mandados neste PC: chave → dia em que foi mandado. */
function readSent(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SENT_KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

function writeSent(sent: Record<string, string>, today: string): void {
  // Guarda só os últimos 60 dias: o resto já venceu faz tempo.
  const recent = Object.fromEntries(
    Object.entries(sent).filter(([, day]) => daysUntil(today, day) <= 60)
  )
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify(recent))
  } catch {
    // Sem localStorage o pior caso é repetir um aviso; não vale travar a tela.
  }
}

/** Confere os vencimentos quando os dados mudam e a cada 15 minutos (o dia pode virar). */
export function useDueAlerts(): void {
  const transactions = useApp((s) => s.transactions)
  const bills = useApp((s) => s.bills)
  const settings = useApp((s) => s.settings)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), CHECK_EVERY)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    // Sem as configurações ainda não dá para saber se os avisos estão ligados.
    if (!settings) return
    const today = todayISO()
    const preferences = { ...DEFAULT_NOTIFICATIONS, ...settings.notifications }
    const sent = readSent()
    const items = dueItems(transactions, settings.cards, bills, today)
    const alerts = alertsToSend(items, preferences, new Set(Object.keys(sent)))
    if (!alerts.length) return
    for (const alert of alerts) {
      window.api.notify(alert.title, alert.body, alert.target)
      sent[alert.key] = today
    }
    writeSent(sent, today)
  }, [transactions, bills, settings, tick])
}

/** Clique numa notificação: abre a fatura (cartão + mês) ou a conta fixa. */
export function useAlertNavigation(): void {
  const navigate = useNavigate()
  useEffect(
    () =>
      window.api.onNavigate((target) => {
        if (target.to === '/cartoes') {
          useApp.setState({ month: target.month })
          navigate('/cartoes', { state: { card: target.card } })
        } else {
          navigate('/contas', { state: { bill: target.bill } })
        }
      }),
    [navigate]
  )
}
