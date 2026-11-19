// Aviso de versão nova no topo do app (atualização automática da Fase 9B).
import { useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { useUpdateState } from '../data/updates'
import { Button } from './ui'

export default function UpdateBanner(): React.JSX.Element | null {
  const [state] = useUpdateState()
  // "Depois" esconde o aviso desta versão até o app abrir de novo (e ela instala ao fechar).
  const [later, setLater] = useState<string | null>(null)

  if (state.status === 'ready' && later !== state.version) {
    return (
      <div className="banner banner--update" role="status">
        <RefreshCw size={16} aria-hidden />
        <span>
          Versão <strong>{state.version}</strong> pronta.
        </span>
        <div className="banner__actions">
          <Button size="sm" variant="primary" onClick={() => window.api.updates.install()}>
            Reiniciar agora
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setLater(state.version)}>
            Depois
          </Button>
        </div>
      </div>
    )
  }
  if (state.status === 'available' && later !== state.version) {
    return (
      <div className="banner banner--update" role="status">
        <Download size={16} aria-hidden />
        <span>
          Versão <strong>{state.version}</strong> disponível.
        </span>
        <div className="banner__actions">
          <Button size="sm" variant="primary" onClick={() => window.api.updates.download()}>
            Baixar e instalar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setLater(state.version)}>
            Depois
          </Button>
        </div>
      </div>
    )
  }
  return null
}
