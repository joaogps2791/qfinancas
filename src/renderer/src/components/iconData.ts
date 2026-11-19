import {
  siAppletv,
  siClaude,
  siCrunchyroll,
  siDeezer,
  siDiscord,
  siDropbox,
  siDuolingo,
  siGithub,
  siGoogle,
  siGooglegemini,
  siHbomax,
  siIcloud,
  siIfood,
  siNetflix,
  siNotion,
  siParamountplus,
  siPerplexity,
  siPlaystation,
  siSpotify,
  siSteam,
  siTidal,
  siTwitch,
  siUber,
  siUbereats,
  siYoutube,
  siYoutubemusic,
  type SimpleIcon
} from 'simple-icons'
import {
  brandById,
  detectBrand,
  iconKeyForCategoryName,
  type Brand,
  type Category
} from '../domain/categories'
import type { Transaction } from '../domain/finance'

// Ícones de categoria (os SVG próprios do site antigo, categoryIconLibrary) + "income".
export const CATEGORY_ICONS: Record<string, string> = {
  food: '<path d="M7 3v6a2 2 0 0 0 4 0V3"/><path d="M9 9v12"/><path d="M17 3c-2.2 2-2.2 5.4 0 7.4V21"/>',
  transport:
    '<path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11"/><rect x="3" y="11" width="18" height="6" rx="2"/><circle cx="7.5" cy="18.5" r="1.4"/><circle cx="16.5" cy="18.5" r="1.4"/>',
  health: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  leisure:
    '<rect x="3" y="8" width="18" height="9" rx="4"/><path d="M8 11v3M6.5 12.5h3"/><circle cx="16" cy="11" r="1"/><circle cx="18" cy="13" r="1"/>',
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/>',
  education:
    '<path d="M12 3 1 9l11 6 9-4.9V15"/><path d="M5 11.5V17c0 1.5 3 3 7 3s7-1.5 7-3v-5.5"/>',
  clothing: '<path d="M9 3 5 6 3 9l3 2v10h12V11l3-2-2-3-4-3-1 2h-2Z"/>',
  subscription:
    '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  market:
    '<circle cx="9" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2 3h2l2.4 12.2a2 2 0 0 0 2 1.8h8.6a2 2 0 0 0 2-1.6L21 8H6"/>',
  pets: '<circle cx="6" cy="9" r="1.3"/><circle cx="10" cy="5.5" r="1.3"/><circle cx="14" cy="5.5" r="1.3"/><circle cx="18" cy="9" r="1.3"/><path d="M8.5 15c0-2.2 1.8-4 3.5-4s3.5 1.8 3.5 4-1.6 4-3.5 4-3.5-1.8-3.5-4Z"/>',
  travel: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7Z"/>',
  gift: '<rect x="3" y="8" width="18" height="13" rx="1"/><path d="M3 8h18M12 8v13"/><path d="M7.5 8a2.5 2.5 0 1 1 0-5C10 3 12 8 12 8"/><path d="M16.5 8a2.5 2.5 0 1 0 0-5C14 3 12 8 12 8"/>',
  taxes:
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/>',
  invest: '<path d="M3 17l6-6 4 4 8-8"/><path d="M17 7h4v4"/>',
  income: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  outros: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>'
}

export const CATEGORY_ICON_LABELS: Record<string, string> = {
  food: 'Alimentação',
  transport: 'Transporte',
  health: 'Saúde',
  leisure: 'Lazer',
  home: 'Moradia',
  education: 'Educação',
  clothing: 'Vestuário',
  subscription: 'Assinatura',
  market: 'Mercado',
  pets: 'Pets',
  travel: 'Viagem',
  gift: 'Presente',
  taxes: 'Impostos',
  invest: 'Investimentos',
  income: 'Entrada',
  outros: 'Outros'
}

// Logos do Simple Icons, empacotados com o app (nada é buscado na internet).
const SIMPLE_ICONS: Record<string, SimpleIcon> = Object.fromEntries(
  [
    siNetflix,
    siSpotify,
    siYoutubemusic,
    siYoutube,
    siHbomax,
    siParamountplus,
    siCrunchyroll,
    siAppletv,
    siIcloud,
    siGoogle,
    siDeezer,
    siTidal,
    siClaude,
    siGooglegemini,
    siPerplexity,
    siGithub,
    siNotion,
    siDropbox,
    siDuolingo,
    siPlaystation,
    siTwitch,
    siDiscord,
    siSteam,
    siIfood,
    siUbereats,
    siUber
  ].map((icon) => [icon.slug, icon])
)

export type BrandArt = { path?: string; monogram?: string; color: string }

export function brandArt(brand: Brand): BrandArt {
  const icon = brand.icon ? SIMPLE_ICONS[brand.icon] : undefined
  return icon
    ? { path: icon.path, color: `#${icon.hex}` }
    : { monogram: brand.monogram ?? brand.name[0], color: brand.color ?? '#555555' }
}

/** Branco ou preto, o que tiver mais contraste com a cor da marca. */
export function inkOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#111111' : '#ffffff'
}

export type ResolvedIcon =
  { kind: 'brand'; brand: Brand } | { kind: 'category'; key: string; color: string }

const FALLBACK_COLOR = 'var(--text-muted)'

/**
 * Qual ícone mostrar para um lançamento: o escolhido à mão; senão o logo da marca reconhecida
 * na descrição; senão o ícone da categoria.
 */
export function resolveTxIcon(tx: Transaction, categories: Category[]): ResolvedIcon {
  const category = tx.kind === 'income' ? undefined : categories.find((c) => c.name === tx.category)
  const color = category?.color ?? FALLBACK_COLOR

  if (tx.icon?.startsWith('brand:')) {
    const brand = brandById(tx.icon.slice(6))
    if (brand) return { kind: 'brand', brand }
  }
  if (tx.icon?.startsWith('cat:') && CATEGORY_ICONS[tx.icon.slice(4)]) {
    return { kind: 'category', key: tx.icon.slice(4), color }
  }
  const brand = detectBrand(tx.description)
  if (brand) return { kind: 'brand', brand }
  if (tx.kind === 'income') return { kind: 'category', key: 'income', color: 'var(--success)' }

  const key = category?.icon ?? iconKeyForCategoryName(tx.category)
  return { kind: 'category', key: CATEGORY_ICONS[key] ? key : 'outros', color }
}

/** Ícone de uma conta fixa: o mesmo de um lançamento à vista com esse nome e categoria. */
export const billIcon = (
  bill: { id: string; name: string; amountCents: number; category: string; paymentMethod: string },
  categories: Category[]
): ResolvedIcon =>
  resolveTxIcon(
    {
      id: bill.id,
      kind: 'cash',
      description: bill.name,
      amountCents: bill.amountCents,
      date: '',
      category: bill.category,
      paymentMethod: bill.paymentMethod
    },
    categories
  )
