import { ChevronLeft, ChevronRight } from 'lucide-react'
import { goToToday, shiftMonth, useApp } from '../data/store'
import { formatMonth, monthKey, todayISO } from '../domain/finance'
import { Button } from './ui'

/** ‹ mês › compartilhado pelas telas (Ctrl+←/→ também troca). */
export default function MonthPicker(): React.JSX.Element {
  const month = useApp((s) => s.month)
  const isCurrent = month === monthKey(todayISO())
  return (
    <div className="month-picker">
      <Button
        variant="ghost"
        size="sm"
        aria-label="Mês anterior (Ctrl+←)"
        onClick={() => shiftMonth(-1)}
        icon={<ChevronLeft size={18} />}
      />
      <strong aria-live="polite">{formatMonth(month)}</strong>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Próximo mês (Ctrl+→)"
        onClick={() => shiftMonth(1)}
        icon={<ChevronRight size={18} />}
      />
      {!isCurrent && (
        <Button size="sm" onClick={goToToday}>
          Hoje
        </Button>
      )}
    </div>
  )
}
