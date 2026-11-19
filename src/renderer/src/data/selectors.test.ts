import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Zustand 5: um seletor que devolve array/objeto novo a cada leitura (ex.: `s.settings?.x ?? []`
// com settings ainda null) faz o React redesenhar sem parar ("Maximum update depth", erro #185)
// e a tela fica preta. Use `useApp((s) => s.settings?.x) ?? []`, com o `??` fora do seletor.
const NEW_VALUE_IN_SELECTOR =
  /useApp\(\(s\) =>[^)]*(\?\? \[\]|\?\? \{\}|\.map\(|\.filter\(|\[\.\.\.)/

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) && !name.endsWith('.test.ts') ? [path] : []
  })
}

describe('seletores do useApp', () => {
  it('nenhum seletor cria array ou objeto novo a cada leitura', () => {
    const offenders = sourceFiles(join(__dirname, '..')).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => ({ file, line: i + 1, text: line.trim() }))
        .filter(({ text }) => NEW_VALUE_IN_SELECTOR.test(text))
        .map(({ file, line, text }) => `${file}:${line}  ${text}`)
    )
    expect(offenders).toEqual([])
  })
})
