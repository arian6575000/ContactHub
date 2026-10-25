// Pure merge logic for syncing two snapshots (this phone vs. the copy in Google Drive).
// No I/O here, so it is fully unit-testable.
//
// Rules
//  - Rows are matched by UUID. The row with the newer `updatedAt` wins (last-write-wins).
//  - A deletion is just a row with `deletedAt` set, so it wins like any other edit.
//  - Ties are broken deterministically so two phones always converge on the same result.
//  - If two phones created different contracts with the same number (offline), the older
//    contract keeps the number and the other is renumbered.
//  - Tombstones older than TOMBSTONE_TTL_MS are dropped.

import type { Client, Contract, Settings, Snapshot } from '../db/types';
import { nextNumber, parseNumber } from './numbering';

export const TOMBSTONE_TTL_MS = 90 * 24 * 3600 * 1000;

interface Row {
  id: string;
  updatedAt: number;
  deletedAt: number | null;
}

function pickRow<T extends Row>(a: T | undefined, b: T | undefined): T | undefined {
  if (!a) return b;
  if (!b) return a;
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  const aDel = a.deletedAt != null;
  const bDel = b.deletedAt != null;
  if (aDel !== bDel) return aDel ? a : b; // delete wins a tie
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b; // deterministic tiebreak
}

function mergeRows<T extends Row>(local: T[], remote: T[], now: number): T[] {
  const byId = new Map<string, { l?: T; r?: T }>();
  for (const l of local) byId.set(l.id, { l });
  for (const r of remote) byId.set(r.id, { ...(byId.get(r.id) ?? {}), r });
  const out: T[] = [];
  for (const { l, r } of byId.values()) {
    const win = pickRow(l, r)!;
    if (win.deletedAt != null && now - win.deletedAt > TOMBSTONE_TTL_MS) continue;
    out.push(win);
  }
  return out;
}

function mergeSettings(a: Settings | null, b: Settings | null): Settings | null {
  if (!a) return b;
  if (!b) return a;
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
}

/** Make live contract numbers unique. Returns the (possibly renumbered) contracts. */
export function resolveNumberCollisions(contracts: Contract[], now: number): Contract[] {
  const live = contracts.filter((c) => c.deletedAt == null);
  const groups = new Map<string, Contract[]>();
  for (const c of live) {
    const g = groups.get(c.contractNumber) ?? [];
    g.push(c);
    groups.set(c.contractNumber, g);
  }
  const used = new Set(contracts.map((c) => c.contractNumber));
  const renumbered = new Map<string, Contract>();
  const dupGroups = [...groups.entries()]
    .filter(([, g]) => g.length > 1)
    .sort(([a], [b]) => (a < b ? -1 : 1)); // fixed order => same result on every phone
  for (const [num, group] of dupGroups) {
    group.sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
    const parsed = parseNumber(num);
    for (const loser of group.slice(1)) {
      const prefix = parsed?.prefix ?? 'CN';
      const year = parsed?.year ?? new Date(loser.createdAt).getFullYear();
      const fresh = nextNumber(used, prefix, year);
      used.add(fresh);
      renumbered.set(loser.id, { ...loser, contractNumber: fresh, updatedAt: Math.max(loser.updatedAt + 1, now) });
    }
  }
  return contracts.map((c) => renumbered.get(c.id) ?? c);
}

export function mergeSnapshots(local: Snapshot, remote: Snapshot | null, now = Date.now()): Snapshot {
  if (!remote) {
    return { ...local, exportedAt: now };
  }
  const clients = mergeRows<Client>(local.clients, remote.clients, now);
  const contracts = resolveNumberCollisions(mergeRows<Contract>(local.contracts, remote.contracts, now), now);
  return {
    app: 'ContractHub',
    version: 2,
    exportedAt: now,
    clients,
    contracts,
    settings: mergeSettings(local.settings, remote.settings),
  };
}

/** True when two snapshots hold the same rows (used to skip needless uploads/writes). */
export function sameData(a: Snapshot, b: Snapshot): boolean {
  const norm = (s: Snapshot) =>
    JSON.stringify({
      c: [...s.clients].sort((x, y) => (x.id < y.id ? -1 : 1)),
      k: [...s.contracts].sort((x, y) => (x.id < y.id ? -1 : 1)),
      s: s.settings,
    });
  return norm(a) === norm(b);
}
