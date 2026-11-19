// Logo do QFinanças: um Q feito de um gráfico de rosca em três partes (escolhido na Fase 2).
// Grade de 32 px, traço grosso para continuar legível em 16 px.
// A mesma forma, com cor fixa, está em resources/logo.svg (de onde saem os ícones do Windows).

// Três arcos com folga entre eles (circunferência de r=10 ≈ 62,83).
const CIRCUMFERENCE = 62.83
const SEGMENT = CIRCUMFERENCE / 3
const GAP = 3.2
const SEGMENT_OPACITY = [1, 0.68, 0.42]
// Até 32 px as partes claras quase somem; o mesmo ajuste vale para os ícones (scripts/build-icons.mts).
const SMALL_SEGMENT_OPACITY = [1, 0.85, 0.66]

/** `decorative` quando o nome "QFinanças" já aparece escrito ao lado (o leitor de tela não repete). */
export function LogoMark({
  size = 32,
  decorative = false
}: {
  size?: number
  decorative?: boolean
}): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className="logo-mark"
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': 'QFinanças' })}
    >
      <g stroke="var(--brand)" strokeWidth="5">
        <g transform="rotate(-90 15 15)">
          {(size <= 32 ? SMALL_SEGMENT_OPACITY : SEGMENT_OPACITY).map((opacity, i) => (
            <circle
              key={i}
              cx="15"
              cy="15"
              r="10"
              opacity={opacity}
              strokeDasharray={`${SEGMENT - GAP} ${CIRCUMFERENCE - SEGMENT + GAP}`}
              strokeDashoffset={-i * SEGMENT}
            />
          ))}
        </g>
        <path d="M20.5 20.5 27 27" strokeLinecap="round" />
      </g>
    </svg>
  )
}

/** Símbolo + nome. O nome usa a fonte do app e a cor do texto, então serve nos dois temas. */
export function Logo({ size = 28 }: { size?: number }): React.JSX.Element {
  return (
    <span className="logo" style={{ gap: size * 0.32 }}>
      <LogoMark size={size} decorative />
      <span className="logo__word" style={{ fontSize: size * 0.72 }}>
        QFinanças
      </span>
    </span>
  )
}
