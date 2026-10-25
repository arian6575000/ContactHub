// JSON backup / restore. Understands both the new format (version 2) and backups
// exported by the old ContractHub web app (version 1, numeric ids).
import { applySnapshot, getSnapshot } from './repo';
import type { Client, Contract, ContractStatus, Installment, Settings, Snapshot } from './types';
import { STATUSES } from './types';
import { DEFAULT_SETTINGS } from '../lib/defaults';
import { mergeSnapshots } from '../lib/syncCore';

export async function exportBackup(): Promise<Snapshot> {
  return getSnapshot();
}

export interface ImportResult { clients: number; contracts: number; legacy: boolean }

const str = (v: unknown) => (v == null ? '' : String(v));
const num = (v: unknown) => Number(v) || 0;
const tsOrNull = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Date.parse(String(v));
  return Number.isFinite(n) ? n : null;
};

/** Convert a backup from the old web app into a version-2 snapshot. Ids are deterministic so re-importing is idempotent. */
export function convertLegacy(payload: any, now = Date.now()): Snapshot {
  const d = payload?.data ?? {};
  const clients: Client[] = (d.clients ?? []).map((c: any): Client => ({
    id: `legacy-client-${c.id}`,
    companyName: str(c.companyName) || 'Unnamed client',
    contactPerson: str(c.contactPerson), phone: str(c.phone), email: str(c.email),
    address: str(c.address), city: str(c.city), notes: str(c.notes),
    createdAt: num(c.createdAt) || now, updatedAt: num(c.updatedAt) || num(c.createdAt) || now, deletedAt: null,
  }));
  const contracts: Contract[] = (d.contracts ?? []).map((c: any): Contract => {
    const schedule: Installment[] = (c.paymentSchedule ?? []).map((i: any) => ({
      label: str(i.label), amount: num(i.amount), dueDate: tsOrNull(i.dueDate), paidAt: null,
    }));
    const status: ContractStatus = STATUSES.includes(c.status) ? c.status : 'draft';
    return {
      id: `legacy-contract-${c.id}`,
      clientId: `legacy-client-${c.clientId}`,
      contractNumber: str(c.contractNumber) || `CN-${new Date(num(c.createdAt) || now).getFullYear()}-${String(c.id).padStart(3, '0')}`,
      softwareName: str(c.softwareName) || str(c.title),
      scopeDescription: str(c.scopeDescription),
      amount: num(c.amount), currency: str(c.currency) || 'PKR',
      paymentType: c.paymentType === 'installments' ? 'installments' : 'full',
      schedule, startDate: tsOrNull(c.startDate), deliveryDate: tsOrNull(c.deliveryDate),
      supportPeriodMonths: num(c.supportPeriodMonths), status,
      termsAndConditions: c.termsAndConditions == null ? null : String(c.termsAndConditions),
      notes: str(c.notes), createdAt: num(c.createdAt) || now, updatedAt: num(c.updatedAt) || num(c.createdAt) || now, deletedAt: null,
    };
  });
  const s = (d.settings ?? []).find((x: any) => x.id === 'main') ?? (d.settings ?? [])[0];
  const settings: Settings | null = s
    ? {
        ...DEFAULT_SETTINGS,
        companyName: str(s.companyName) || DEFAULT_SETTINGS.companyName,
        companyTagline: str(s.companyTagline), companyAddress: str(s.companyAddress),
        companyPhone: str(s.companyPhone), companyEmail: str(s.companyEmail), companyWebsite: str(s.companyWebsite),
        companyLogo: s.companyLogo || null,
        contractPrefix: str(s.contractPrefix) || 'CN', currency: str(s.currency) || 'PKR',
        defaultTerms: str(s.defaultTerms) || DEFAULT_SETTINGS.defaultTerms,
        updatedAt: num(s.updatedAt) || now,
      }
    : null;
  return { app: 'ContractHub', version: 2, exportedAt: now, clients, contracts, settings };
}

export function validatePayload(payload: any): 'legacy' | 'v2' {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid backup file.');
  if (payload.version === 2 && Array.isArray(payload.clients) && Array.isArray(payload.contracts)) return 'v2';
  if (payload.data && (Array.isArray(payload.data.clients) || Array.isArray(payload.data.contracts))) return 'legacy';
  throw new Error('This file is not a ContractHub backup.');
}

/**
 * merge   — add/update records from the file, newest edit wins.
 * replace — the file becomes the full dataset; everything else is marked deleted (and that syncs).
 */
export async function importBackup(payload: any, mode: 'merge' | 'replace' = 'merge', now = Date.now()): Promise<ImportResult> {
  const kind = validatePayload(payload);
  const incoming: Snapshot = kind === 'legacy' ? convertLegacy(payload, now) : (payload as Snapshot);
  const local = await getSnapshot();

  let result: Snapshot;
  if (mode === 'replace') {
    const keepIds = new Set([...incoming.clients.map((c) => c.id), ...incoming.contracts.map((c) => c.id)]);
    const touch = <T extends { id: string; updatedAt: number; deletedAt: number | null }>(r: T): T =>
      ({ ...r, updatedAt: now, deletedAt: r.deletedAt == null ? null : now });
    const gone = <T extends { id: string; updatedAt: number; deletedAt: number | null }>(r: T): T =>
      (keepIds.has(r.id) || r.deletedAt != null ? r : { ...r, deletedAt: now, updatedAt: now });
    result = {
      app: 'ContractHub', version: 2, exportedAt: now,
      clients: [...incoming.clients.map(touch), ...local.clients.filter((c) => !keepIds.has(c.id)).map(gone)],
      contracts: [...incoming.contracts.map(touch), ...local.contracts.filter((c) => !keepIds.has(c.id)).map(gone)],
      settings: incoming.settings ? { ...incoming.settings, updatedAt: now } : local.settings,
    };
  } else {
    result = mergeSnapshots(local, incoming, now);
  }
  await applySnapshot(result, 'local');
  return {
    clients: incoming.clients.filter((c) => c.deletedAt == null).length,
    contracts: incoming.contracts.filter((c) => c.deletedAt == null).length,
    legacy: kind === 'legacy',
  };
}
