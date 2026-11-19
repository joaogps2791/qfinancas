// Categorias, cartões padrão e categorização automática (portados do legacy/script.js).
import type { CsvMapping } from './importer'

export type ThemeSource = 'system' | 'light' | 'dark'
export type Category = { name: string; color: string; icon: string }
/** closingDay/dueDay: dia de fechamento e de vencimento da fatura (1 a 31). */
export type Card = { name: string; color: string; closingDay?: number; dueDay?: number }

export type Settings = {
  schemaVersion: 2
  theme: ThemeSource
  categories: Category[]
  cards: Card[]
  /** meta de aporte por mês; `key` é "class:<tipo>" (ex.: class:fii) ou "ticker:<TICKER>" */
  contributionTargets?: { key: string; monthlyCents: number }[]
  /** P/VP e dividend yield (%) preenchidos à mão: o plano grátis da brapi não traz esses campos */
  assetInfo?: Record<string, { pvp?: number; dy?: number }>
  /** perfis de leitura de CSV por banco ("Nubank conta", "Itaú"...) */
  importProfiles?: { name: string; mapping: CsvMapping }[]
}

export const DEFAULT_CATEGORIES = [
  'Alimentação',
  'Transporte',
  'Saúde',
  'Lazer',
  'Moradia',
  'Educação',
  'Vestuário',
  'Assinaturas'
]
export const DEFAULT_CARDS = ['Nubank', 'Itaú', 'Santander']

// Cores iniciais de categorias e cartões (o usuário troca em Configurações).
// Tons médios, que aparecem bem no tema claro e no escuro.
export const PALETTE = [
  '#e07a3f',
  '#3f8f7a',
  '#7a6ee0',
  '#d1497b',
  '#c9a227',
  '#4f86c6',
  '#8a5cc2',
  '#5a9a4a'
]

export const normalizeText = (value: string): string =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Chave do ícone (categoryIconLibrary do legacy) pelo nome da categoria.
const ICON_BY_NAME: Record<string, string> = {
  alimentacao: 'food',
  transporte: 'transport',
  saude: 'health',
  lazer: 'leisure',
  moradia: 'home',
  educacao: 'education',
  vestuario: 'clothing',
  assinaturas: 'subscription',
  mercado: 'market',
  pets: 'pets',
  viagem: 'travel',
  presentes: 'gift',
  impostos: 'taxes',
  investimentos: 'invest'
}

export const iconKeyForCategoryName = (name: string): string =>
  ICON_BY_NAME[normalizeText(name).replace(/[^a-z0-9]/g, '')] ?? 'outros'

export function defaultSettings(): Settings {
  return {
    schemaVersion: 2,
    theme: 'system',
    categories: DEFAULT_CATEGORIES.map((name, i) => ({
      name,
      color: PALETTE[i % PALETTE.length],
      icon: iconKeyForCategoryName(name)
    })),
    cards: DEFAULT_CARDS.map((name, i) => ({ name, color: PALETTE[i % PALETTE.length] }))
  }
}

const CATEGORY_RULES: { category: string; terms: string[] }[] = [
  {
    category: 'Alimentação',
    terms: [
      'mercado',
      'supermercado',
      'restaurante',
      'ifood',
      'rappi',
      'padaria',
      'acougue',
      'hortifruti',
      'lanchonete',
      'pizzaria',
      'hamburgueria',
      'sorveteria',
      'cafeteria',
      'feira',
      'atacadao',
      'atacadista',
      'carrefour',
      'pao de acucar',
      'extra',
      'assai',
      'big',
      'delivery',
      'marmita',
      'lanche',
      'sushi'
    ]
  },
  {
    category: 'Transporte',
    terms: [
      'uber',
      '99',
      'taxi',
      'combustivel',
      'gasolina',
      'etanol',
      'posto',
      'metro',
      'onibus',
      'estacionamento',
      'pedagio',
      'ipva',
      'oficina',
      'mecanico',
      'revisao',
      'seguro auto',
      'bilhete unico',
      'cabify',
      'blablacar',
      'patinete',
      'bicicleta',
      'moto taxi'
    ]
  },
  {
    category: 'Saúde',
    terms: [
      'farmacia',
      'drogaria',
      'medico',
      'consulta',
      'exame',
      'plano de saude',
      'dentista',
      'psicologo',
      'psiquiatra',
      'hospital',
      'clinica',
      'laboratorio',
      'fisioterapia',
      'academia',
      'personal trainer',
      'nutricionista',
      'vacina',
      'oculos',
      'otica'
    ]
  },
  {
    category: 'Lazer',
    terms: [
      'cinema',
      'bar',
      'show',
      'viagem',
      'restaurantes',
      'netflix',
      'ingresso',
      'balada',
      'parque',
      'teatro',
      'evento',
      'festa',
      'clube',
      'boliche',
      'jogo',
      'playstation',
      'xbox',
      'steam'
    ]
  },
  {
    category: 'Moradia',
    terms: [
      'aluguel',
      'condominio',
      'luz',
      'energia',
      'agua',
      'internet',
      'iptu',
      'gas',
      'manutencao',
      'reforma',
      'moveis',
      'eletrodomestico',
      'faxina',
      'diarista',
      'seguro residencial',
      'porteiro'
    ]
  },
  {
    category: 'Educação',
    terms: [
      'curso',
      'faculdade',
      'livro',
      'escola',
      'mentoria',
      'material escolar',
      'pos graduacao',
      'idiomas',
      'workshop'
    ]
  },
  {
    category: 'Vestuário',
    terms: [
      'roupa',
      'calcado',
      'tenis',
      'camisa',
      'loja',
      'shopping',
      'calca',
      'vestido',
      'sapato',
      'bolsa',
      'acessorio'
    ]
  },
  {
    category: 'Assinaturas',
    terms: [
      'assinatura',
      'spotify',
      'streaming',
      'software',
      'mensalidade',
      'amazon prime',
      'disney',
      'hbo',
      'youtube premium',
      'icloud',
      'google one',
      'office 365',
      'chatgpt',
      'claude'
    ]
  }
]

// O site procurava o termo em qualquer parte do texto ("bar" pegava "barbearia").
// Aqui o termo precisa ser uma palavra inteira (aceitando plural com "s").
const wordPattern = (terms: string[]): RegExp =>
  new RegExp(
    `(^|[^a-z0-9])(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})s?(?=$|[^a-z0-9])`
  )

const RULE_PATTERNS = CATEGORY_RULES.map(({ category, terms }) => ({
  category,
  pattern: wordPattern(terms)
}))

// ---------- Marcas conhecidas (assinaturas e apps) ----------

/**
 * `icon` é o slug do Simple Icons. Marcas que o Simple Icons não traz mais (Disney+, Prime,
 * ChatGPT...) usam `monogram` com a cor da marca. Mais específicas primeiro ("uber eats" antes de "uber").
 */
export type Brand = {
  id: string
  name: string
  terms: string[]
  category: string
  icon?: string
  monogram?: string
  color?: string
}

export const BRANDS: Brand[] = [
  { id: 'netflix', name: 'Netflix', terms: ['netflix'], category: 'Assinaturas', icon: 'netflix' },
  { id: 'spotify', name: 'Spotify', terms: ['spotify'], category: 'Assinaturas', icon: 'spotify' },
  {
    id: 'disneyplus',
    name: 'Disney+',
    terms: ['disney', 'disney plus', 'disneyplus'],
    category: 'Assinaturas',
    monogram: 'D+',
    color: '#113ccf'
  },
  {
    id: 'primevideo',
    name: 'Prime Video',
    terms: ['amazon prime', 'prime video', 'primevideo'],
    category: 'Assinaturas',
    monogram: 'P',
    color: '#00a8e1'
  },
  {
    id: 'youtubemusic',
    name: 'YouTube Music',
    terms: ['youtube music'],
    category: 'Assinaturas',
    icon: 'youtubemusic'
  },
  {
    id: 'youtube',
    name: 'YouTube Premium',
    terms: ['youtube premium', 'youtube'],
    category: 'Assinaturas',
    icon: 'youtube'
  },
  {
    id: 'max',
    name: 'Max',
    terms: ['hbo max', 'hbomax', 'hbo'],
    category: 'Assinaturas',
    icon: 'hbomax'
  },
  {
    id: 'paramountplus',
    name: 'Paramount+',
    terms: ['paramount'],
    category: 'Assinaturas',
    icon: 'paramountplus'
  },
  {
    id: 'globoplay',
    name: 'Globoplay',
    terms: ['globoplay'],
    category: 'Assinaturas',
    monogram: 'G',
    color: '#e8202a'
  },
  {
    id: 'crunchyroll',
    name: 'Crunchyroll',
    terms: ['crunchyroll'],
    category: 'Assinaturas',
    icon: 'crunchyroll'
  },
  {
    id: 'appletv',
    name: 'Apple TV+',
    terms: ['apple tv'],
    category: 'Assinaturas',
    icon: 'appletv'
  },
  { id: 'icloud', name: 'iCloud', terms: ['icloud'], category: 'Assinaturas', icon: 'icloud' },
  {
    id: 'googleone',
    name: 'Google One',
    terms: ['google one', 'google storage'],
    category: 'Assinaturas',
    icon: 'google'
  },
  { id: 'deezer', name: 'Deezer', terms: ['deezer'], category: 'Assinaturas', icon: 'deezer' },
  { id: 'tidal', name: 'Tidal', terms: ['tidal'], category: 'Assinaturas', icon: 'tidal' },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    terms: ['chatgpt', 'openai'],
    category: 'Assinaturas',
    monogram: 'AI',
    color: '#10a37f'
  },
  {
    id: 'claude',
    name: 'Claude',
    terms: ['claude', 'anthropic'],
    category: 'Assinaturas',
    icon: 'claude'
  },
  {
    id: 'gemini',
    name: 'Gemini',
    terms: ['gemini'],
    category: 'Assinaturas',
    icon: 'googlegemini'
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    terms: ['perplexity'],
    category: 'Assinaturas',
    icon: 'perplexity'
  },
  {
    id: 'microsoft365',
    name: 'Microsoft 365',
    terms: ['microsoft 365', 'office 365', 'office365'],
    category: 'Assinaturas',
    monogram: 'M',
    color: '#d83b01'
  },
  { id: 'github', name: 'GitHub', terms: ['github'], category: 'Assinaturas', icon: 'github' },
  { id: 'notion', name: 'Notion', terms: ['notion'], category: 'Assinaturas', icon: 'notion' },
  { id: 'dropbox', name: 'Dropbox', terms: ['dropbox'], category: 'Assinaturas', icon: 'dropbox' },
  {
    id: 'duolingo',
    name: 'Duolingo',
    terms: ['duolingo'],
    category: 'Assinaturas',
    icon: 'duolingo'
  },
  {
    id: 'playstation',
    name: 'PlayStation Plus',
    terms: ['playstation', 'psn'],
    category: 'Assinaturas',
    icon: 'playstation'
  },
  { id: 'twitch', name: 'Twitch', terms: ['twitch'], category: 'Assinaturas', icon: 'twitch' },
  {
    id: 'discord',
    name: 'Discord Nitro',
    terms: ['discord'],
    category: 'Assinaturas',
    icon: 'discord'
  },
  { id: 'steam', name: 'Steam', terms: ['steam'], category: 'Lazer', icon: 'steam' },
  { id: 'ifood', name: 'iFood', terms: ['ifood'], category: 'Alimentação', icon: 'ifood' },
  {
    id: 'ubereats',
    name: 'Uber Eats',
    terms: ['uber eats', 'ubereats'],
    category: 'Alimentação',
    icon: 'ubereats'
  },
  { id: 'uber', name: 'Uber', terms: ['uber'], category: 'Transporte', icon: 'uber' }
]

const BRAND_PATTERNS = BRANDS.map((brand) => ({ brand, pattern: wordPattern(brand.terms) }))

/** A marca conhecida citada na descrição, se houver ("Netflix Premium" → Netflix). */
export function detectBrand(description: string): Brand | null {
  const text = normalizeText(description)
  return BRAND_PATTERNS.find(({ pattern }) => pattern.test(text))?.brand ?? null
}

export const brandById = (id: string): Brand | undefined => BRANDS.find((b) => b.id === id)

/** Sugere a categoria pela descrição; sem regra que bata, fica `fallback` (se existir) ou a primeira. */
export function classifyCategory(
  description: string,
  categories: string[],
  fallback?: string
): string {
  const brand = detectBrand(description)
  if (brand && categories.includes(brand.category)) return brand.category
  const text = normalizeText(description)
  const match = RULE_PATTERNS.find(
    ({ category, pattern }) => categories.includes(category) && pattern.test(text)
  )
  if (match) return match.category
  if (fallback && categories.includes(fallback)) return fallback
  return categories[0] ?? DEFAULT_CATEGORIES[0]
}
