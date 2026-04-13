/**
 * In-memory credit ledger for audits. Replace with DB in production.
 */

export type LedgerKind = 'grant' | 'debit' | 'restore';

export interface LedgerEntry {
  id: string;
  userId: string;
  kind: LedgerKind;
  amount: number;
  reason: string;
  at: number;
  ref?: string;
}

const entries: LedgerEntry[] = [];
const MAX = 20_000;

let seq = 0;

export function appendLedger(e: Omit<LedgerEntry, 'id' | 'at'> & { at?: number }): LedgerEntry {
  const row: LedgerEntry = {
    ...e,
    id: `led_${++seq}`,
    at: e.at ?? Date.now(),
  };
  entries.push(row);
  if (entries.length > MAX) entries.splice(0, entries.length - MAX);
  return row;
}
