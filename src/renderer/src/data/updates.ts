// Estado da atualização automática (Fase 9B), vindo do processo principal.
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
