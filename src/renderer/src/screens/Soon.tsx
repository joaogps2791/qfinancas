import { Hourglass } from 'lucide-react'
import { Card, EmptyState } from '../components/ui'

/** Telas que ainda vão ser feitas (Investimentos, Metas, Relatórios). */
export default function Soon({
  title,
  phase
}: {
  title: string
  phase: string
}): React.JSX.Element {
  return (
    <div className="page">
      <header className="page-head">
        <h1>{title}</h1>
      </header>
      <Card>
        <EmptyState
          icon={<Hourglass size={24} />}
          title="Em breve"
          description={`Esta tela chega na ${phase}.`}
        />
      </Card>
    </div>
  )
}
