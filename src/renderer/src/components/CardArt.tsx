// Cartão desenhado como o físico (Fase 11): proporção 85,6 × 54 mm e camadas
// fundo → acabamento → reflexo → chip → aproximação → banco → apelido → final → bandeira.
import {
  siAmericanexpress,
  siMastercard,
  siMercadopago,
  siNeon,
  siNubank,
  siPicpay,
  siVisa,
  type SimpleIcon
} from 'simple-icons'
import type { Card } from '../domain/categories'
import { issuerOf, NETWORKS, resolveSkin, skinBackground } from '../domain/cardSkins'
import './CardArt.css'

const ICONS: Record<string, SimpleIcon> = {
  siAmericanexpress,
  siMastercard,
  siMercadopago,
  siNeon,
  siNubank,
  siPicpay,
  siVisa
}

function Mark({ icon, label }: { icon?: string; label: string }): React.JSX.Element {
  const art = icon ? ICONS[icon] : undefined
  if (!art) return <span className="card-art__wordmark">{label}</span>
  return (
    <svg className="card-art__logo" viewBox="0 0 24 24" role="img" aria-label={label}>
      <path d={art.path} fill="currentColor" />
    </svg>
  )
}

function Chip(): React.JSX.Element {
  return (
    <svg className="card-art__chip" viewBox="0 0 50 38" aria-hidden="true">
      <rect x="0.5" y="0.5" width="49" height="37" rx="7" className="card-art__chip-base" />
      <path
        d="M17 0.5v12M33 0.5v12M17 25.5v12M33 25.5v12M0.5 13h16.5M33 13h16.5M0.5 25h16.5M33 25h16.5M17 12.5h16v13H17z"
        className="card-art__chip-lines"
      />
    </svg>
  )
}

function Contactless(): React.JSX.Element {
  return (
    <svg className="card-art__nfc" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.5 7.5a6.5 6.5 0 0 1 0 9M12 5a10 10 0 0 1 0 14M15.5 2.5a13.5 13.5 0 0 1 0 19" />
    </svg>
  )
}

/** lg: aba Cartões · md: carrossel · thumb: escolha de modelo · sm: listas e formulários */
type Size = 'lg' | 'md' | 'thumb' | 'sm'

export default function CardArt({
  card,
  size = 'md',
  interactive = false
}: {
  card: Card
  size?: Size
  /** inclinação 3D e reflexo ao passar o mouse (cartão grande e seletor) */
  interactive?: boolean
}): React.JSX.Element {
  const skin = resolveSkin(card)
  const issuer = issuerOf({ issuer: skin.issuer })
  const network = NETWORKS.find((n) => n.id === card.network)
  const bankLabel = card.issuer ? issuer.label : card.name
  const label = [
    'Cartão',
    bankLabel,
    skin.id !== 'generic' ? skin.label : null,
    network?.label,
    card.last4 ? `final ${card.last4}` : null
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={`card-art card-art--${size} card-art--${skin.finish} card-art--chip-${skin.chip}${interactive ? ' card-art--interactive' : ''}`}
      style={
        {
          '--card-bg': skinBackground(skin.colors),
          '--card-text': skin.text
        } as React.CSSProperties
      }
      role="img"
      aria-label={label}
    >
      <div className="card-art__texture" aria-hidden="true" />
      <div className="card-art__sheen" aria-hidden="true" />
      <div className={`card-art__bank card-art__bank--${skin.bankPosition}`}>
        <Mark icon={card.issuer ? issuer.icon : undefined} label={bankLabel} />
      </div>
      {size !== 'sm' && (
        <>
          <Chip />
          <Contactless />
          <div className="card-art__bottom">
            <span className="card-art__nickname">{card.nickname || card.name}</span>
            {card.last4 && <span className="card-art__number">•••• {card.last4}</span>}
          </div>
        </>
      )}
      {network && (
        <div className="card-art__network">
          <Mark icon={network.icon} label={network.label} />
        </div>
      )}
    </div>
  )
}
