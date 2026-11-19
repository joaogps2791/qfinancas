// Propostas de logo (Fase 2). Depois que o João escolher, fica só a escolhida.
// Desenhadas numa grade de 32 px, com traços grossos para continuarem legíveis em 16 px.

export type LogoOption = 'anel' | 'bloco' | 'donut'

// Rosca da opção 3: três arcos com folga entre eles (circunferência de r=10 ≈ 62,83).
const SEGMENT = 62.83 / 3
const GAP = 3.2

export function LogoMark({
  option,
  size = 32
}: {
  option: LogoOption
  size?: number
}): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className="logo-mark"
      role="img"
      aria-label="QFinanças"
    >
      {option === 'anel' && (
        <g stroke="var(--brand)" strokeWidth="5" strokeLinecap="round">
          <circle cx="15" cy="15" r="10" />
          <path d="M20.5 20.5 27 27" />
        </g>
      )}
      {option === 'bloco' && (
        <>
          <rect width="32" height="32" rx="9" fill="var(--brand)" />
          <g stroke="var(--brand-contrast)" strokeWidth="3.6" strokeLinecap="round">
            <circle cx="15" cy="15" r="7" />
            <path d="M18.8 18.8 24 24" />
          </g>
        </>
      )}
      {option === 'donut' && (
        <g stroke="var(--brand)" strokeWidth="5">
          <g transform="rotate(-90 15 15)">
            {[1, 0.68, 0.42].map((opacity, i) => (
              <circle
                key={i}
                cx="15"
                cy="15"
                r="10"
                opacity={opacity}
                strokeDasharray={`${SEGMENT - GAP} ${62.83 - SEGMENT + GAP}`}
                strokeDashoffset={-i * SEGMENT}
              />
            ))}
          </g>
          <path d="M20.5 20.5 27 27" strokeLinecap="round" />
        </g>
      )}
    </svg>
  )
}

/** Símbolo + nome. O nome usa a fonte do app e a cor do texto, então serve nos dois temas. */
export function Logo({
  option,
  size = 28
}: {
  option: LogoOption
  size?: number
}): React.JSX.Element {
  return (
    <span className="logo" style={{ gap: size * 0.32 }}>
      <LogoMark option={option} size={size} />
      <span className="logo__word" style={{ fontSize: size * 0.72 }}>
        QFinanças
      </span>
    </span>
  )
}
