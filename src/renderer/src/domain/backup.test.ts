import { describe, expect, it } from 'vitest'
import {
  backupFileName,
  backupSummary,
  makeBackup,
  parseBackup,
  type BackupCollection
} from './backup'

const empty = (): Record<BackupCollection, { id: string }[]> => ({
  transactions: [],
  investmentTransactions: [],
  fixedIncome: [],
  dividends: [],
  budgets: [],
  goals: []
})

const sample = (): string => {
  const collections = empty()
  collections.transactions = [
    {
      id: 'abc',
      kind: 'cash',
      description: 'Mercado',
      amountCents: 1000,
      date: '2026-11-10',
      category: 'Alimentação',
      paymentMethod: 'Pix',
      createdAt: { seconds: 1, nanoseconds: 0 }
    } as { id: string }
  ]
  collections.budgets = [{ id: '2026-11', limits: { Alimentação: 50000 } } as { id: string }]
  return JSON.stringify(
    makeBackup(
      {
        settings: { schemaVersion: 2, categories: [], cards: [], updatedAt: 'x' },
        profile: { displayName: 'João' },
        collections
      },
      new Date('2026-11-19T12:00:00Z')
    )
  )
}

describe('backup', () => {
  it('monta o arquivo sem os carimbos do Firestore e lê de volta', () => {
    const backup = parseBackup(sample())
    expect(backup.exportedAt).toBe('2026-11-19T12:00:00.000Z')
    expect(backup.collections.transactions[0]).not.toHaveProperty('createdAt')
    expect(backup.settings).not.toHaveProperty('updatedAt')
    expect(backup.collections.budgets[0]).toEqual({ id: '2026-11', limits: { Alimentação: 50000 } })
    expect(backupSummary(backup)).toBe(
      '1 lançamento, 0 registros de investimento, 0 metas, 1 mês de orçamento'
    )
    expect(backupFileName(new Date('2026-11-19T12:00:00Z'))).toBe(
      'qfinancas-backup-2026-11-19.json'
    )
  })

  it('aceita coleção que faltar no arquivo (backup mais antigo)', () => {
    const raw = JSON.parse(sample())
    delete raw.collections.goals
    expect(parseBackup(JSON.stringify(raw)).collections.goals).toEqual([])
  })

  it('recusa arquivos que não são backup ou estão danificados', () => {
    expect(() => parseBackup('não é json')).toThrow('JSON válido')
    expect(() => parseBackup('{"app":"Outro"}')).toThrow('não é um backup do QFinanças')
    const raw = JSON.parse(sample())
    expect(() => parseBackup(JSON.stringify({ ...raw, version: 2 }))).toThrow('versão')

    const badId = structuredClone(raw)
    badId.collections.transactions[0].id = '../settings/main'
    expect(() => parseBackup(JSON.stringify(badId))).toThrow('identificador')

    const badTx = structuredClone(raw)
    badTx.collections.transactions[0].amountCents = 10.5
    expect(() => parseBackup(JSON.stringify(badTx))).toThrow('Mercado')

    const badSettings = structuredClone(raw)
    badSettings.settings = { theme: 'dark' }
    expect(() => parseBackup(JSON.stringify(badSettings))).toThrow('configurações')
  })
})
