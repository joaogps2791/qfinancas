import { BRANDS } from '../domain/categories'
import {
  brandArt,
  CATEGORY_ICON_LABELS,
  CATEGORY_ICONS,
  inkOn,
  type ResolvedIcon
} from './iconData'

/** Só o desenho do ícone de categoria (traço na cor do texto em volta). */
export function CategoryGlyph({
  iconKey,
  size = 20
}: {
  iconKey: string
  size?: number
}): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      // Conteúdo fixo do próprio app (CATEGORY_ICONS), nunca vindo do usuário.
      dangerouslySetInnerHTML={{ __html: CATEGORY_ICONS[iconKey] ?? CATEGORY_ICONS.outros }}
    />
  )
}

/** Quadrado arredondado: logo da marca na cor dela, ou ícone da categoria em tom suave. */
export function IconBadge({
  icon,
  size = 40
}: {
  icon: ResolvedIcon
  size?: number
}): React.JSX.Element {
  const box = { width: size, height: size }
  if (icon.kind === 'brand') {
    const art = brandArt(icon.brand)
    const ink = inkOn(art.color)
    return (
      <span
        className="icon-badge"
        style={{ ...box, background: art.color, color: ink }}
        title={icon.brand.name}
      >
        {art.path ? (
          <svg
            width={size * 0.5}
            height={size * 0.5}
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
          >
            <path d={art.path} />
          </svg>
        ) : (
          <span className="icon-badge__monogram" style={{ fontSize: size * 0.34 }}>
            {art.monogram}
          </span>
        )}
      </span>
    )
  }
  return (
    <span
      className="icon-badge"
      style={{
        ...box,
        color: icon.color,
        background: `color-mix(in srgb, ${icon.color} 16%, transparent)`
      }}
    >
      <CategoryGlyph iconKey={icon.key} size={size * 0.5} />
    </span>
  )
}

/**
 * Escolha manual do ícone de um lançamento: "Automático", ícones de categoria ou logos.
 * O valor é "" (automático), "cat:<chave>" ou "brand:<id>".
 */
export function IconPicker({
  value,
  onChange,
  color = 'var(--text-muted)',
  categoriesOnly = false
}: {
  value: string
  onChange: (value: string) => void
  color?: string
  /** só os ícones de categoria, sem "Automático" e sem logos (tela de categorias) */
  categoriesOnly?: boolean
}): React.JSX.Element {
  const option = (key: string, label: string, content: React.ReactNode): React.JSX.Element => (
    <button
      key={key}
      type="button"
      role="radio"
      aria-checked={value === key}
      aria-label={label}
      title={label}
      className="icon-picker__option"
      onClick={() => onChange(key)}
    >
      {content}
    </button>
  )

  return (
    <div className="icon-picker" role="radiogroup" aria-label="Ícone do lançamento">
      {!categoriesOnly && option('', 'Automático', <span className="icon-picker__auto">Auto</span>)}
      {Object.keys(CATEGORY_ICONS).map((key) =>
        option(
          `cat:${key}`,
          CATEGORY_ICON_LABELS[key] ?? key,
          <IconBadge icon={{ kind: 'category', key, color }} size={32} />
        )
      )}
      {!categoriesOnly &&
        BRANDS.map((brand) =>
          option(
            `brand:${brand.id}`,
            brand.name,
            <IconBadge icon={{ kind: 'brand', brand }} size={32} />
          )
        )}
    </div>
  )
}
