import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Inbox, PiggyBank, Wallet } from 'lucide-react'
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Pills,
  Select,
  Skeleton,
  StatCard,
  Toggle,
  Tooltip
} from '../components/ui'
import { Logo, LogoMark } from '../components/Logo'
import ThemePicker from '../components/ThemePicker'
import './DevUi.css'

// Página escondida (#/dev/ui, atalho Ctrl+Shift+U) para revisar o design system nos dois temas.

const SWATCHES = [
  'bg',
  'surface',
  'surface-2',
  'border',
  'text',
  'text-muted',
  'accent',
  'accent-soft',
  'success',
  'danger',
  'warning',
  'card-1',
  'card-2',
  'card-3',
  'sidebar-bg',
  'brand'
]

function Showcase(): React.JSX.Element {
  const [pill, setPill] = useState<'all' | 'income' | 'cash' | 'card'>('all')
  const [toggle, setToggle] = useState(true)
  const [modal, setModal] = useState(false)

  return (
    <div className="devui-stack">
      <section>
        <h2>Logo</h2>
        <Card className="devui-logo">
          <div className="row devui-sizes">
            {[64, 32, 24, 16].map((s) => (
              <LogoMark key={s} size={s} />
            ))}
          </div>
          <Logo />
          <div className="devui-onsidebar">
            <Logo size={22} />
          </div>
        </Card>
      </section>

      <section>
        <h2>Cores</h2>
        <div className="devui-swatches">
          {SWATCHES.map((name) => (
            <div key={name} className="devui-swatch">
              <span style={{ background: `var(--${name})` }} />
              <small>--{name}</small>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>StatCard</h2>
        <div className="devui-grid3">
          <StatCard
            label="Saldo do mês"
            valueCents={5687400}
            change={0.17}
            tone="sage"
            spark={[3, 5, 4, 6, 5, 8, 7, 9]}
            icon={<Wallet size={16} />}
          />
          <StatCard
            label="Saídas"
            valueCents={2457500}
            change={0.23}
            higherIsWorse
            tone="butter"
            spark={[6, 4, 5, 3, 6, 5, 7, 8]}
          />
          <StatCard
            label="Investido"
            valueCents={1200000}
            change={-0.04}
            tone="lilac"
            icon={<PiggyBank size={16} />}
          />
          <StatCard label="Entradas" valueCents={6859099} change={0.025} />
          <StatCard label="Sem comparação" valueCents={0} change={null} />
        </div>
      </section>

      <section>
        <h2>Botões</h2>
        <div className="row wrap">
          <Button variant="primary">Nova transação</Button>
          <Button>Cancelar</Button>
          <Button variant="ghost">Ver todos</Button>
          <Button variant="danger">Excluir</Button>
          <Button variant="primary" disabled>
            Desativado
          </Button>
          <Button size="sm">Pequeno</Button>
        </div>
      </section>

      <section>
        <h2>Pills, badges e toggle</h2>
        <Pills
          label="Filtro"
          value={pill}
          onChange={setPill}
          options={[
            { value: 'all', label: 'Todas' },
            { value: 'income', label: 'Entradas' },
            { value: 'cash', label: 'À vista' },
            { value: 'card', label: 'Cartões' }
          ]}
        />
        <div className="row wrap">
          <Badge>Neutro</Badge>
          <Badge tone="success">+12,5%</Badge>
          <Badge tone="danger">-4%</Badge>
          <Badge tone="warning">Vence em 3 dias</Badge>
          <Badge tone="accent">Novo</Badge>
        </div>
        <Card>
          <Toggle
            label="Avisos de vencimento"
            description="Notifica 3 dias antes e no dia."
            checked={toggle}
            onChange={setToggle}
          />
        </Card>
      </section>

      <section>
        <h2>Formulário</h2>
        <Card className="devui-form">
          <Input label="Descrição" placeholder="Ex.: Mercado" />
          <Input
            label="Valor (R$)"
            defaultValue="12,3,4"
            error="Valor inválido. Use o formato 1.234,56."
          />
          <Select
            label="Categoria"
            options={['Alimentação', 'Transporte', 'Lazer']}
            hint="Pode deixar automática."
          />
        </Card>
      </section>

      <section>
        <h2>Avatar, tooltip, modal</h2>
        <div className="row wrap">
          <Avatar name="João Silva" size={56} />
          <Avatar name="Maria" />
          <Avatar name="Foto quebrada" src="https://lh3.googleusercontent.com/invalido" />
          <Tooltip content="R$ 33.567,00">
            <Button size="sm">Passe o mouse</Button>
          </Tooltip>
          <Button onClick={() => setModal(true)}>Abrir modal</Button>
        </div>
        <Modal
          open={modal}
          onClose={() => setModal(false)}
          title="Excluir lançamento?"
          footer={
            <>
              <Button onClick={() => setModal(false)}>Cancelar</Button>
              <Button variant="danger" onClick={() => setModal(false)}>
                Excluir
              </Button>
            </>
          }
        >
          <p>&quot;Mercado&quot; vai sumir do extrato deste mês. Isso não pode ser desfeito.</p>
        </Modal>
      </section>

      <section>
        <h2>Vazio e carregando</h2>
        <div className="devui-grid2">
          <Card>
            <EmptyState
              icon={<Inbox size={24} />}
              title="Nenhum lançamento"
              description="Os lançamentos do mês aparecem aqui."
              action={<Button variant="primary">Nova transação</Button>}
            />
          </Card>
          <Card className="devui-skeletons">
            <Skeleton width="40%" />
            <Skeleton height={32} />
            <Skeleton width="70%" />
            <Skeleton height={80} radius="var(--radius-md)" />
          </Card>
        </div>
      </section>
    </div>
  )
}

export default function DevUi(): React.JSX.Element {
  return (
    <main className="devui">
      <header className="row between devui-header">
        <div>
          <h1>Design system</h1>
          <p className="muted">Todos os componentes nos dois temas. Página só para revisão.</p>
        </div>
        <div className="row">
          <ThemePicker />
          <Link to="/">Voltar</Link>
        </div>
      </header>
      <div className="devui-columns">
        <div data-theme="light" className="devui-panel">
          <p className="devui-label">Tema claro</p>
          <Showcase />
        </div>
        <div data-theme="dark" className="devui-panel">
          <p className="devui-label">Tema escuro</p>
          <Showcase />
        </div>
      </div>
    </main>
  )
}
