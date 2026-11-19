import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

// Confere o contraste WCAG dos pares de cor que a interface usa para texto.

const css = readFileSync(join(__dirname, 'tokens.css'), 'utf8')

function themeColors(selector: string): Record<string, string> {
  const start = css.indexOf(selector)
  const block = css.slice(start, css.indexOf('}', start))
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/gi)].map((m) => [m[1], m[2]])
  )
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// [texto, fundo, mínimo] — 4.5 para texto (AA), 3 para elementos gráficos.
const PAIRS: [string, string, number][] = [
  ['text', 'bg', 4.5],
  ['text', 'surface', 4.5],
  ['text', 'surface-2', 4.5],
  ['text-muted', 'bg', 4.5],
  ['text-muted', 'surface', 4.5],
  ['text-muted', 'surface-2', 4.5],
  ['accent-contrast', 'accent', 4.5],
  ['success', 'surface', 4.5],
  ['danger', 'surface', 4.5],
  ['warning', 'surface', 4.5],
  ['success', 'success-soft', 4.5],
  ['danger', 'danger-soft', 4.5],
  ['warning', 'warning-soft', 4.5],
  ['card-text', 'card-1', 4.5],
  ['card-text', 'card-2', 4.5],
  ['card-text', 'card-3', 4.5],
  ['sidebar-text', 'sidebar-bg', 4.5],
  ['sidebar-muted', 'sidebar-bg', 4.5],
  ['sidebar-text', 'sidebar-active', 4.5],
  ['brand', 'bg', 3],
  ['brand', 'sidebar-bg', 3],
  ['brand-contrast', 'brand', 3]
]

describe.each([
  ['claro', "[data-theme='light']"],
  ['escuro', "[data-theme='dark']"]
])('tema %s', (_name, selector) => {
  const colors = themeColors(selector)

  it.each(PAIRS)('%s sobre %s', (fg, bg, min) => {
    expect(colors[fg], `--${fg} não definido`).toBeDefined()
    expect(colors[bg], `--${bg} não definido`).toBeDefined()
    expect(contrast(colors[fg], colors[bg])).toBeGreaterThanOrEqual(min)
  })
})
