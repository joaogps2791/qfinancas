import { describe, expect, it } from 'vitest'
import {
  contrastRatio,
  luminance,
  readableText,
  resolveSkin,
  SKINS,
  skinBackground
} from './cardSkins'

describe('contraste', () => {
  it('calcula luminância e razão de contraste como o WCAG', () => {
    expect(luminance('#000000')).toBe(0)
    expect(luminance('#ffffff')).toBe(1)
    expect(contrastRatio('#ffffff', '#000000')).toBe(21)
    expect(contrastRatio('#777777', '#777777')).toBe(1)
  })

  it('mantém a cor preferida quando ela é legível em todas as cores do fundo', () => {
    expect(readableText(['#820ad1', '#4b0082'], '#ffffff')).toBe('#ffffff')
  })

  it('troca para claro ou escuro quando a preferida fica ilegível', () => {
    // amarelo com texto amarelo: ilegível → escuro
    expect(readableText(['#fcfc30'], '#ffff00')).toBe('#141414')
    // roxo escuro com texto quase preto: ilegível → branco
    expect(readableText(['#2b0a3d'], '#1a1a1a')).toBe('#ffffff')
    // sem preferida, escolhe o melhor para o pior pedaço do gradiente
    expect(readableText(['#ffffff', '#d4d4d4'])).toBe('#141414')
    // cor inválida é ignorada
    expect(readableText(['#000000'], 'vermelho')).toBe('#ffffff')
  })
})

describe('resolveSkin', () => {
  it('cartão antigo, sem skin: genérico fosco na cor que já tinha', () => {
    const skin = resolveSkin({ name: 'Itaú', color: '#ec7000' })
    expect(skin).toMatchObject({
      id: 'generic',
      colors: ['#ec7000'],
      finish: 'fosco',
      issuer: 'outro'
    })
    expect(skin.text).toBe(readableText(['#ec7000']))
  })

  it('cor salva inválida cai na cor do banco', () => {
    expect(resolveSkin({ name: 'X', color: 'roxo', issuer: 'nubank' }).colors).toEqual(['#820ad1'])
  })

  it('Personalizado usa as cores e o acabamento escolhidos, com texto legível garantido', () => {
    const skin = resolveSkin({
      name: 'Caixa',
      color: '#005ca9',
      issuer: 'caixa',
      skin: 'custom',
      custom: { colors: ['#d4af37', '#8a6d1d'], finish: 'metalico', text: '#d4af37' }
    })
    expect(skin).toMatchObject({ id: 'custom', finish: 'metalico', colors: ['#d4af37', '#8a6d1d'] })
    expect(skin.text).not.toBe('#d4af37')
    expect(skinBackground(skin.colors)).toBe('linear-gradient(135deg, #d4af37, #8a6d1d)')
  })

  it('skin que não existe mais no catálogo cai no genérico', () => {
    expect(resolveSkin({ name: 'N', color: '#820ad1', skin: 'nubank-sumiu' }).id).toBe('generic')
  })

  it('todos os modelos do catálogo têm id único e texto legível', () => {
    expect(new Set(SKINS.map((s) => s.id)).size).toBe(SKINS.length)
    for (const s of SKINS) {
      expect(readableText(s.colors, s.text), s.id).toBe(s.text)
    }
  })
})
