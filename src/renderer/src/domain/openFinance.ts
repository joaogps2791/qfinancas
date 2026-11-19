// Transações do Open Finance (Meu Pluggy) → linhas da prévia da importação (Fase 6).
import type { PluggyData } from '../../../main/pluggy'
import { suggestInvoiceDate } from './finance'
import type { ImportRow } from './importer'

/**
 * Converte as transações de uma conta da Pluggy. Negativo = saída, como no resto da importação.
 * - Conta: `type` DEBIT é saída e CREDIT é entrada.
 * - Cartão: valor positivo é gasto e negativo é pagamento/estorno (documentação da Pluggy).
 *   A data da linha é a da compra (bate com o que foi lançado à mão, parcelas inclusive) e a
 *   fatura sai da data de lançamento e do fechamento do cartão, quando ele está configurado.
 */
export function pluggyRows(
  data: PluggyData,
  accountId: string,
  card?: { closingDay?: number; dueDay?: number }
): ImportRow[] {
  const account = data.accounts.find((a) => a.id === accountId)
  if (!account) return []
  return data.transactions
    .filter((t) => t.accountId === accountId)
    .map((t) => {
      // A Pluggy manda reais com casas decimais; só aqui vira centavo inteiro.
      const cents = Math.round(Math.abs(t.amount) * 100)
      const parcel =
        t.totalInstallments && t.totalInstallments > 1
          ? ` (${t.installmentNumber}/${t.totalInstallments})`
          : ''
      const description = `${t.description || 'Sem descrição'}${parcel}`
      if (account.type === 'BANK') {
        return { date: t.date, description, amountCents: t.type === 'DEBIT' ? -cents : cents }
      }
      return {
        date: t.purchaseDate ?? t.date,
        description,
        amountCents: t.amount > 0 ? -cents : cents,
        invoiceDate:
          card?.closingDay && card.dueDay
            ? suggestInvoiceDate(t.date, card.closingDay, card.dueDay)
            : undefined
      }
    })
    .filter((row) => row.amountCents !== 0)
    .sort((a, b) => a.date.localeCompare(b.date))
}
