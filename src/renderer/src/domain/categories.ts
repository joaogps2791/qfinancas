// Categorias, cartões padrão e categorização automática (portados do legacy/script.js).

export type ThemeSource = 'system' | 'light' | 'dark'
export type Category = { name: string; color: string; icon: string }
export type Card = { name: string; color: string }

export type Settings = {
  schemaVersion: 2
  theme: ThemeSource
  categories: Category[]
  cards: Card[]
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

// shortcut: paleta do site antigo; a Fase 2 troca pelos tokens do tema novo.
const PALETTE = [
  '#4c1d95',
  '#0f8b8d',
  '#7c3aed',
  '#b4235a',
  '#c58a1d',
  '#5b6470',
  '#6d28d9',
  '#2c7a7b'
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
const RULE_PATTERNS = CATEGORY_RULES.map(({ category, terms }) => ({
  category,
  pattern: new RegExp(
    `(^|[^a-z0-9])(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})s?(?=$|[^a-z0-9])`
  )
}))

/** Sugere a categoria pela descrição; sem regra que bata, fica a primeira categoria do usuário. */
export function classifyCategory(description: string, categories: string[]): string {
  const text = normalizeText(description)
  const match = RULE_PATTERNS.find(
    ({ category, pattern }) => categories.includes(category) && pattern.test(text)
  )
  return match?.category ?? categories[0] ?? DEFAULT_CATEGORIES[0]
}
