// Orçamento por categoria e metas de economia. Funções puras, valores em centavos.

/** Limites de um mês por nome de categoria. Fica em users/{uid}/budgets/{YYYY-MM}. */
export type BudgetLimits = Record<string, number>

export type BudgetLevel = 'ok' | 'warning' | 'over'

/** Verde até 80% do limite, amarelo a partir de 80%, vermelho a partir de 100%. */
export function budgetLevel(spentCents: number, limitCents: number): BudgetLevel {
  if (spentCents >= limitCents) return 'over'
  if (spentCents * 5 >= limitCents * 4) return 'warning'
  return 'ok'
}

export type BudgetRow = {
  category: string
  limitCents: number
  spentCents: number
  level: BudgetLevel
}

/** Uma linha por categoria com limite, das mais apertadas (maior % gasto) para as mais folgadas. */
export function budgetRows(limits: BudgetLimits, spent: Record<string, number>): BudgetRow[] {
  return Object.entries(limits)
    .filter(([, limitCents]) => limitCents > 0)
    .map(([category, limitCents]) => {
      const spentCents = spent[category] ?? 0
      return { category, limitCents, spentCents, level: budgetLevel(spentCents, limitCents) }
    })
    .sort((a, b) => b.spentCents / b.limitCents - a.spentCents / a.limitCents)
}

/** O orçamento mais recente antes de `month` que tenha algum limite (para "copiar do mês anterior"). */
export function previousBudget(
  budgets: Record<string, BudgetLimits>,
  month: string
): { month: string; limits: BudgetLimits } | null {
  const found = Object.keys(budgets)
    .filter((m) => m < month && Object.values(budgets[m]).some((v) => v > 0))
    .sort()
    .pop()
  return found ? { month: found, limits: budgets[found] } : null
}

// ---------- Metas de economia ----------

export type Goal = {
  id: string
  name: string
  targetCents: number
  /** YYYY-MM-DD */
  targetDate: string
  color: string
  /** chave de CATEGORY_ICONS */
  icon?: string
  /** quanto já foi guardado, quando não está ligada a um ativo */
  savedCents: number
  /** "ticker:HGLG11" ou "fixed:{id}": o valor guardado passa a ser o valor do ativo na carteira */
  link?: string
}

/** Meses inteiros entre o mês de hoje e o mês da data-alvo (0 se a data já passou ou é este mês). */
export function monthsUntil(today: string, targetDate: string): number {
  const index = (iso: string): number => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7))
  return Math.max(0, index(targetDate) - index(today))
}

export type GoalProgress = {
  savedCents: number
  remainingCents: number
  /** 0 a 1 */
  ratio: number
  /** quanto guardar por mês para chegar na data; null quando o prazo acabou e ainda falta */
  monthlyCents: number | null
  months: number
  done: boolean
}

export function goalProgress(
  goal: Pick<Goal, 'targetCents' | 'targetDate'>,
  savedCents: number,
  today: string
): GoalProgress {
  const remainingCents = Math.max(0, goal.targetCents - savedCents)
  const done = remainingCents === 0
  const late = goal.targetDate < today
  // Ainda dá para guardar no mês de hoje, então o mês corrente conta (mínimo 1).
  const months = late ? 0 : Math.max(1, monthsUntil(today, goal.targetDate))
  return {
    savedCents,
    remainingCents,
    ratio: goal.targetCents > 0 ? Math.min(1, savedCents / goal.targetCents) : 0,
    monthlyCents: done ? 0 : late ? null : Math.ceil(remainingCents / months),
    months,
    done
  }
}
