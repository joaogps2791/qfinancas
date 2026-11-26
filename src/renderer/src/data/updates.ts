// Estado da atualização automática, vindo do processo principal, e as notas da versão.
import { useEffect, useState } from 'react'
import type { UpdateState } from '../../../main/updater'

/** Estado da atualização, sempre em dia com o processo principal. */
export function useUpdateState(): [UpdateState, (state: UpdateState) => void] {
  const [state, setState] = useState<UpdateState>({ status: 'idle' })
  useEffect(() => {
    let alive = true
    window.api.updates.state().then((s) => alive && setState(s))
    const stop = window.api.updates.onChange(setState)
    return () => {
      alive = false
      stop()
    }
  }, [])
  return [state, setState]
}

export type NotesBlock =
  | { type: 'heading'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'text'; text: string }

/**
 * Texto das notas (do GitHub, já sem HTML) → blocos. "## título" vira título, "- " / "• " / "* "
 * vira tópico e tópicos seguidos ficam na mesma lista. Um parágrafo único com vírgulas
 * ("A, B e C.") vira lista também, para ler melhor.
 */
export function parseNotes(text: string): NotesBlock[] {
  const blocks: NotesBlock[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    const item = /^[-•*]\s+(.*)$/.exec(line)
    const last = blocks[blocks.length - 1]
    if (heading) blocks.push({ type: 'heading', text: heading[1] })
    else if (item && last?.type === 'list') last.items.push(item[1])
    else if (item) blocks.push({ type: 'list', items: [item[1]] })
    else blocks.push({ type: 'text', text: line })
  }
  const only = blocks.length === 1 && blocks[0].type === 'text' ? blocks[0].text : null
  const parts = only ? splitTopLevel(only.replace(/\.$/, '')) : []
  if (parts.length > 2) {
    return [{ type: 'list', items: parts.map((p) => p[0].toUpperCase() + p.slice(1) + '.') }]
  }
  return blocks
}

/** "A (x, y), B, e C" → ["A (x, y)", "B", "C"]: só corta nas vírgulas fora dos parênteses. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')') depth = Math.max(0, depth - 1)
    else if (text[i] === ',' && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts.map((p) => p.trim().replace(/^e\s+/, '')).filter(Boolean)
}
