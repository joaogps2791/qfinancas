import { describe, expect, it } from 'vitest'
import { budgetLevel, budgetRows, goalProgress, monthsUntil, previousBudget } from './planning'

describe('budgetLevel', () => {
  it('fica verde abaixo de 80%, amarelo a partir de 80% e vermelho a partir de 100%', () => {
    expect(budgetLevel(79_99, 100_00)).toBe('ok')
    expect(budgetLevel(80_00, 100_00)).toBe('warning')
    expect(budgetLevel(99_99, 100_00)).toBe('warning')
    expect(budgetLevel(100_00, 100_00)).toBe('over')
    expect(budgetLevel(150_00, 100_00)).toBe('over')
  })
})

describe('budgetRows', () => {
  it('ignora limites zerados e ordena da categoria mais apertada para a mais folgada', () => {
    const rows = budgetRows(
      { Mercado: 1000_00, Lazer: 200_00, Saúde: 0 },
      { Mercado: 500_00, Lazer: 190_00, Transporte: 80_00 }
    )
    expect(rows.map((r) => [r.category, r.level])).toEqual([
      ['Lazer', 'warning'],
      ['Mercado', 'ok']
    ])
  })

  it('conta zero de gasto para categoria sem lançamentos', () => {
    expect(budgetRows({ Pets: 100_00 }, {})[0].spentCents).toBe(0)
  })
})

describe('previousBudget', () => {
  it('pega o mês anterior mais recente que tenha limite, pulando meses vazios', () => {
    const budgets = {
      '2026-08': { Mercado: 900_00 },
      '2026-09': { Mercado: 1000_00 },
      '2026-10': { Mercado: 0 },
      '2026-12': { Mercado: 1200_00 }
    }
    expect(previousBudget(budgets, '2026-11')).toEqual({
      month: '2026-09',
      limits: { Mercado: 1000_00 }
    })
    expect(previousBudget(budgets, '2026-08')).toBeNull()
  })
})

describe('metas de economia', () => {
  it('conta os meses entre hoje e a data-alvo', () => {
    expect(monthsUntil('2026-11-19', '2027-06-30')).toBe(7)
    expect(monthsUntil('2026-11-19', '2026-11-30')).toBe(0)
    expect(monthsUntil('2026-11-19', '2025-01-01')).toBe(0)
  })

  it('divide o que falta pelos meses que restam, arredondando para cima', () => {
    const p = goalProgress(
      { targetCents: 10_000_00, targetDate: '2027-06-30' },
      3_000_00,
      '2026-11-19'
    )
    expect(p.remainingCents).toBe(7_000_00)
    expect(p.months).toBe(7)
    expect(p.monthlyCents).toBe(1_000_00)
    expect(p.ratio).toBeCloseTo(0.3)

    const odd = goalProgress({ targetCents: 100_00, targetDate: '2027-02-10' }, 0, '2026-11-19')
    expect(odd.monthlyCents).toBe(33_34)
  })

  it('no mês da data-alvo, pede o que falta de uma vez', () => {
    const p = goalProgress({ targetCents: 500_00, targetDate: '2026-11-30' }, 200_00, '2026-11-19')
    expect(p.months).toBe(1)
    expect(p.monthlyCents).toBe(300_00)
  })

  it('marca meta batida e prazo vencido', () => {
    const done = goalProgress(
      { targetCents: 500_00, targetDate: '2026-01-01' },
      600_00,
      '2026-11-19'
    )
    expect(done).toMatchObject({ done: true, ratio: 1, remainingCents: 0, monthlyCents: 0 })

    const late = goalProgress(
      { targetCents: 500_00, targetDate: '2026-11-18' },
      100_00,
      '2026-11-19'
    )
    expect(late.monthlyCents).toBeNull()
    expect(late.done).toBe(false)
  })
})
