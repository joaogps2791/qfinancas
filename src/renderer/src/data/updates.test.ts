import { describe, expect, it } from 'vitest'
import { parseNotes } from './updates'

describe('parseNotes', () => {
  it('títulos e tópicos do GitHub', () => {
    expect(parseNotes('## Novidades\n- Open Finance\n• Cartões\n\nObrigado!')).toEqual([
      { type: 'heading', text: 'Novidades' },
      { type: 'list', items: ['Open Finance', 'Cartões'] },
      { type: 'text', text: 'Obrigado!' }
    ])
  })

  it('parágrafo único com vírgulas vira lista', () => {
    expect(
      parseNotes(
        'Cartões com cara de cartão físico (banco, modelo, bandeira e personalizado), Open Finance pelo Meu Pluggy, Dashboard com caixas alinhadas e rolagem, e mensagens de erro mais claras.'
      )
    ).toEqual([
      {
        type: 'list',
        items: [
          'Cartões com cara de cartão físico (banco, modelo, bandeira e personalizado).',
          'Open Finance pelo Meu Pluggy.',
          'Dashboard com caixas alinhadas e rolagem.',
          'Mensagens de erro mais claras.'
        ]
      }
    ])
  })
})

it('frase curta continua parágrafo', () => {
  expect(parseNotes('Correções e melhorias.')).toEqual([
    { type: 'text', text: 'Correções e melhorias.' }
  ])
})
