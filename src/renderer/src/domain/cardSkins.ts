// Catálogo de modelos de cartão (Fase 11) e a regra de contraste do texto.
// Os modelos são INSPIRADOS nos cartões reais (cor, acabamento, clima), feitos com CSS; nada de
// imagem dos bancos. As cores aqui são dados do catálogo, não do tema do app.
import type { Card } from './categories'

export type Issuer =
  | 'nubank'
  | 'itau'
  | 'inter'
  | 'c6'
  | 'santander'
  | 'bradesco'
  | 'bb'
  | 'caixa'
  | 'picpay'
  | 'mercadopago'
  | 'xp'
  | 'btg'
  | 'neon'
  | 'outro'

/** `icon`: chave do simple-icons, quando o banco tem logo lá; sem ela, o nome vai escrito. */
export const ISSUERS: { id: Issuer; label: string; icon?: string; color: string }[] = [
  { id: 'nubank', label: 'Nubank', icon: 'siNubank', color: '#820ad1' },
  { id: 'itau', label: 'Itaú', color: '#ec7000' },
  { id: 'inter', label: 'Inter', color: '#ff7a00' },
  { id: 'c6', label: 'C6 Bank', color: '#242424' },
  { id: 'santander', label: 'Santander', color: '#ec0000' },
  { id: 'bradesco', label: 'Bradesco', color: '#cc092f' },
  { id: 'bb', label: 'Banco do Brasil', color: '#fcfc30' },
  { id: 'caixa', label: 'Caixa', color: '#005ca9' },
  { id: 'picpay', label: 'PicPay', icon: 'siPicpay', color: '#21c25e' },
  { id: 'mercadopago', label: 'Mercado Pago', icon: 'siMercadopago', color: '#00b1ea' },
  { id: 'xp', label: 'XP', color: '#1d1d1b' },
  { id: 'btg', label: 'BTG Pactual', color: '#0a2240' },
  { id: 'neon', label: 'Neon', icon: 'siNeon', color: '#34d59a' },
  { id: 'outro', label: 'Outro banco', color: '#4b5563' }
]

export type Network = 'visa' | 'mastercard' | 'elo' | 'amex' | 'hipercard'

export const NETWORKS: { id: Network; label: string; icon?: string }[] = [
  { id: 'visa', label: 'Visa', icon: 'siVisa' },
  { id: 'mastercard', label: 'Mastercard', icon: 'siMastercard' },
  { id: 'elo', label: 'Elo' },
  { id: 'amex', label: 'American Express', icon: 'siAmericanexpress' },
  { id: 'hipercard', label: 'Hipercard' }
]

export type Finish = 'fosco' | 'metalico' | 'holografico' | 'brilho'

export const FINISHES: { id: Finish; label: string }[] = [
  { id: 'fosco', label: 'Fosco' },
  { id: 'metalico', label: 'Metálico' },
  { id: 'holografico', label: 'Holográfico' },
  { id: 'brilho', label: 'Brilho' }
]

export type Skin = {
  id: string
  issuer: Issuer
  /** "Ultravioleta" */
  name: string
  /** uma cor (sólido) ou duas (gradiente) */
  colors: [string] | [string, string]
  finish: Finish
  /** cor do texto pensada para o modelo (a regra de contraste ainda confere) */
  text: string
  chip: 'gold' | 'silver'
  bankPosition: 'top-left' | 'top-right'
}

/**
 * Modelos dos cartões do João, criados a partir das fotos/descrições dele.
 * Não inventar modelo que o banco não tem (regra da Fase 11).
 */
export const SKINS: Skin[] = []

/** Personalizado: para qualquer banco ou modelo que não está no catálogo. */
export type CustomSkin = { colors: [string] | [string, string]; finish: Finish; text?: string }

export const CUSTOM_SKIN = 'custom'

// ---------- Contraste ----------

const LIGHT_TEXT = '#ffffff'
const DARK_TEXT = '#141414'

/** Luminância relativa (WCAG) de "#rrggbb". */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const HEX = /^#[0-9a-f]{6}$/i

/**
 * Cor de texto legível sobre o fundo (todas as cores do gradiente). Usa a preferida se ela tiver
 * contraste ≥ 4,5 com cada cor; senão, branco ou quase preto, o que ficar melhor.
 */
export function readableText(background: string[], preferred?: string): string {
  const worst = (text: string): number => Math.min(...background.map((c) => contrastRatio(text, c)))
  if (preferred && HEX.test(preferred) && worst(preferred) >= 4.5) return preferred
  return worst(LIGHT_TEXT) >= worst(DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT
}

// ---------- Qual modelo um cartão usa ----------

export type ResolvedSkin = {
  id: string
  label: string
  issuer: Issuer
  colors: string[]
  finish: Finish
  text: string
  chip: 'gold' | 'silver'
  bankPosition: 'top-left' | 'top-right'
}

export const issuerOf = (card: Pick<Card, 'issuer'>): (typeof ISSUERS)[number] =>
  ISSUERS.find((i) => i.id === card.issuer) ?? ISSUERS[ISSUERS.length - 1]

/** Fundo CSS do cartão: sólido ou gradiente na diagonal. */
export const skinBackground = (colors: string[]): string =>
  colors.length > 1 ? `linear-gradient(135deg, ${colors[0]}, ${colors[1]})` : colors[0]

/**
 * Modelo do catálogo; o Personalizado do cartão; ou, para cartões antigos sem `skin`, um modelo
 * genérico fosco na cor que eles já tinham.
 */
export function resolveSkin(card: Card): ResolvedSkin {
  const catalog = SKINS.find((s) => s.id === card.skin)
  if (catalog) {
    return { ...catalog, label: catalog.name, text: readableText(catalog.colors, catalog.text) }
  }
  const custom = card.skin === CUSTOM_SKIN ? card.custom : undefined
  const colors: string[] = custom?.colors.filter((c) => HEX.test(c)) ?? []
  if (!colors.length) colors.push(HEX.test(card.color) ? card.color : issuerOf(card).color)
  return {
    id: custom ? CUSTOM_SKIN : 'generic',
    label: custom ? 'Personalizado' : 'Genérico',
    issuer: card.issuer ?? 'outro',
    colors,
    finish: custom?.finish ?? 'fosco',
    text: readableText(colors, custom?.text),
    chip: 'gold',
    bankPosition: 'top-left'
  }
}

/** Cor que representa o cartão em outras partes da tela (resumo da fatura, listas). */
export const accentOf = (card: Card): string => resolveSkin(card).colors[0]
