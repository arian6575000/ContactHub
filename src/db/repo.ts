// All queries live here. Screens never write SQL.
import type { Db } from './schema';
import { migrate } from './schema';
import type {
  Client, ClientInput, Contract, ContractInput, ContractStatus, Installment, Settings, Snapshot,
} from './types';
import { DEFAULT_SETTINGS } from '../lib/defaults';
import { nextNumber } from '../lib/numbering';

let db: Db;
let newId: () => string = fallbackId;

function fallbackId(): string {
  const c: any = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ---- change notifications -------------------------------------------------
// 'local' = the user edited something (should trigger a sync); 'sync' = data was
// replaced by a merge (screens should just refresh).
export type ChangeSource = 'local' | 'sync';
type Listener = (source: ChangeSource) => void;
const listeners = new Set<Listener>();
export function subscribe(cb: Listener): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
function emit(source: ChangeSource) {
  listeners.forEach((cb) => { try { cb(source); } catch { /* listener errors must not break writes */ } });
}

export async function initRepo(d: Db, idGenerator?: () => string): Promise<void> {
  db = d;
  if (idGenerator) newId = idGenerator;
  await migrate(db);
}

// ---- row mapping -----------------------------------------------------------

interface ClientRow {
  id: string; company_name: string; contact_person: string; phone: string; email: string;
  address: string; city: string; notes: string; created_at: number; updated_at: number; deleted_at: number | null;
}
interface ContractRow {
  id: string; client_id: string; contract_number: string; software_name: string; scope_description: string;
  amount: number; currency: string; payment_type: string; schedule: string; start_date: number | null;
  delivery_date: number | null; support_period_months: number; status: string; terms: string | null;
  notes: string; created_at: number; updated_at: number; deleted_at: number | null;
}

const mapClient = (r: ClientRow): Client => ({
  id: r.id, companyName: r.company_name, contactPerson: r.contact_person, phone: r.phone, email: r.email,
  address: r.address, city: r.city, notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at,
});

function parseSchedule(s: string): Installment[] {
  try {
    const arr = JSON.parse(s);
    return Array.isArray(arr)
      ? arr.map((i: any) => ({
          label: String(i.label ?? ''), amount: Number(i.amount) || 0,
          dueDate: i.dueDate ?? null, paidAt: i.paidAt ?? null,
        }))
      : [];
  } catch { return []; }
}

const mapContract = (r: ContractRow): Contract => ({
  id: r.id, clientId: r.client_id, contractNumber: r.contract_number, softwareName: r.software_name,
  scopeDescription: r.scope_description, amount: r.amount, currency: r.currency,
  paymentType: r.payment_type === 'installments' ? 'installments' : 'full',
  schedule: parseSchedule(r.schedule), startDate: r.start_date, deliveryDate: r.delivery_date,
  supportPeriodMonths: r.support_period_months, status: r.status as ContractStatus, termsAndConditions: r.terms,
  notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at,
});

async function upsertClient(c: Client) {
  await db.runAsync(
    `INSERT INTO clients (id, company_name, contact_person, phone, email, address, city, notes, created_at, updated_at, deleted_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET company_name=excluded.company_name, contact_person=excluded.contact_person,
       phone=excluded.phone, email=excluded.email, address=excluded.address, city=excluded.city, notes=excluded.notes,
       created_at=excluded.created_at, updated_at=excluded.updated_at, deleted_at=excluded.deleted_at`,
    [c.id, c.companyName, c.contactPerson, c.phone, c.email, c.address, c.city, c.notes, c.createdAt, c.updatedAt, c.deletedAt],
  );
}

async function upsertContract(c: Contract) {
  await db.runAsync(
    `INSERT INTO contracts (id, client_id, contract_number, software_name, scope_description, amount, currency, payment_type,
       schedule, start_date, delivery_date, support_period_months, status, terms, notes, created_at, updated_at, deleted_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET client_id=excluded.client_id, contract_number=excluded.contract_number,
       software_name=excluded.software_name, scope_description=excluded.scope_description, amount=excluded.amount,
       currency=excluded.currency, payment_type=excluded.payment_type, schedule=excluded.schedule,
       start_date=excluded.start_date, delivery_date=excluded.delivery_date,
       support_period_months=excluded.support_period_months, status=excluded.status, terms=excluded.terms,
       notes=excluded.notes, created_at=excluded.created_at, updated_at=excluded.updated_at, deleted_at=excluded.deleted_at`,
    [c.id, c.clientId, c.contractNumber, c.softwareName, c.scopeDescription, c.amount, c.currency, c.paymentType,
      JSON.stringify(c.schedule), c.startDate, c.deliveryDate, c.supportPeriodMonths, c.status, c.termsAndConditions,
      c.notes, c.createdAt, c.updatedAt, c.deletedAt],
  );
}

// ---- settings --------------------------------------------------------------

export async function getSettings(): Promise<Settings> {
  const row = await db.getFirstAsync<{ data: string; updated_at: number }>(
    `SELECT data, updated_at FROM settings WHERE id = 'main'`,
  );
  if (!row) return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...JSON.parse(row.data), updatedAt: row.updated_at };
}

export async function saveSettings(s: Omit<Settings, 'updatedAt'>): Promise<Settings> {
  const saved: Settings = { ...DEFAULT_SETTINGS, ...s, updatedAt: Date.now() };
  const { updatedAt, ...rest } = saved;
  await db.runAsync(
    `INSERT INTO settings (id, data, updated_at) VALUES ('main', ?, ?)
     ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`,
    [JSON.stringify(rest), updatedAt],
  );
  emit('local');
  return saved;
}

// ---- clients -----------------------------------------------------------------

export interface ClientWithStats extends Client { contractCount: number; totalValue: number }

export async function listClients(): Promise<ClientWithStats[]> {
  const rows = await db.getAllAsync<ClientRow & { cnt: number; total: number }>(
    `SELECT c.*,
       (SELECT COUNT(*) FROM contracts k WHERE k.client_id = c.id AND k.deleted_at IS NULL) AS cnt,
       (SELECT COALESCE(SUM(k.amount), 0) FROM contracts k WHERE k.client_id = c.id AND k.deleted_at IS NULL) AS total
     FROM clients c WHERE c.deleted_at IS NULL ORDER BY c.company_name COLLATE NOCASE`,
  );
  return rows.map((r) => ({ ...mapClient(r), contractCount: r.cnt, totalValue: r.total }));
}

export async function getClient(id: string): Promise<Client | null> {
  const r = await db.getFirstAsync<ClientRow>(`SELECT * FROM clients WHERE id = ? AND deleted_at IS NULL`, [id]);
  return r ? mapClient(r) : null;
}

export async function saveClient(input: ClientInput): Promise<string> {
  const name = input.companyName.trim();
  if (!name) throw new Error('Company name is required');
  const now = Date.now();
  const existing = input.id ? await getClient(input.id) : null;
  const client: Client = {
    id: existing?.id ?? input.id ?? newId(),
    companyName: name,
    contactPerson: (input.contactPerson ?? existing?.contactPerson ?? '').trim(),
    phone: (input.phone ?? existing?.phone ?? '').trim(),
    email: (input.email ?? existing?.email ?? '').trim(),
    address: (input.address ?? existing?.address ?? '').trim(),
    city: (input.city ?? existing?.city ?? '').trim(),
    notes: (input.notes ?? existing?.notes ?? '').trim(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    deletedAt: null,
  };
  await upsertClient(client);
  emit('local');
  return client.id;
}

export async function deleteClient(id: string): Promise<void> {
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM contracts WHERE client_id = ? AND deleted_at IS NULL`, [id]);
  if ((row?.n ?? 0) > 0) throw new Error(`This client has ${row!.n} contract(s). Delete or reassign them first.`);
  const now = Date.now();
  await db.runAsync(`UPDATE clients SET deleted_at = ?, updated_at = ? WHERE id = ?`, [now, now, id]);
  emit('local');
}

// ---- contracts ------------------------------------------------------------------

export async function listContracts(): Promise<Contract[]> {
  const rows = await db.getAllAsync<ContractRow>(
    `SELECT * FROM contracts WHERE deleted_at IS NULL ORDER BY created_at DESC`);
  return rows.map(mapContract);
}

export async function listContractsForClient(clientId: string): Promise<Contract[]> {
  const rows = await db.getAllAsync<ContractRow>(
    `SELECT * FROM contracts WHERE client_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`, [clientId]);
  return rows.map(mapContract);
}

export async function getContract(id: string): Promise<Contract | null> {
  const r = await db.getFirstAsync<ContractRow>(`SELECT * FROM contracts WHERE id = ? AND deleted_at IS NULL`, [id]);
  return r ? mapContract(r) : null;
}

/** Numbers of deleted contracts count as used, so a number is never handed out twice. */
export async function nextContractNumber(now = new Date()): Promise<string> {
  const settings = await getSettings();
  const rows = await db.getAllAsync<{ contract_number: string }>(`SELECT contract_number FROM contracts`);
  return nextNumber(rows.map((r) => r.contract_number), settings.contractPrefix || 'CN', now.getFullYear());
}

export async function saveContract(input: ContractInput): Promise<string> {
  if (!input.clientId) throw new Error('Please select a client');
  const now = Date.now();
  const existing = input.id ? await getContract(input.id) : null;
  const settings = await getSettings();
  const amount = Number(input.amount ?? existing?.amount ?? 0) || 0;
  if (amount < 0) throw new Error('Amount cannot be negative');
  const paymentType = (input.paymentType ?? existing?.paymentType ?? 'full') === 'installments' ? 'installments' : 'full';
  const schedule: Installment[] = paymentType === 'installments'
    ? (input.schedule ?? existing?.schedule ?? []).map((i) => ({
        label: i.label, amount: Number(i.amount) || 0, dueDate: i.dueDate ?? null, paidAt: i.paidAt ?? null,
      }))
    : [];
  const contract: Contract = {
    id: existing?.id ?? input.id ?? newId(),
    clientId: input.clientId,
    contractNumber: existing?.contractNumber ?? input.contractNumber ?? (await nextContractNumber()),
    softwareName: (input.softwareName ?? existing?.softwareName ?? '').trim(),
    scopeDescription: (input.scopeDescription ?? existing?.scopeDescription ?? '').trim(),
    amount,
    currency: (input.currency ?? existing?.currency ?? settings.currency ?? 'PKR').trim() || 'PKR',
    paymentType,
    schedule,
    startDate: input.startDate !== undefined ? input.startDate : existing?.startDate ?? null,
    deliveryDate: input.deliveryDate !== undefined ? input.deliveryDate : existing?.deliveryDate ?? null,
    supportPeriodMonths: Math.max(0, Math.round(Number(input.supportPeriodMonths ?? existing?.supportPeriodMonths ?? 0) || 0)),
    status: input.status ?? existing?.status ?? 'draft',
    termsAndConditions: input.termsAndConditions !== undefined ? input.termsAndConditions : existing?.termsAndConditions ?? null,
    notes: (input.notes ?? existing?.notes ?? '').trim(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    deletedAt: null,
  };
  await upsertContract(contract);
  emit('local');
  return contract.id;
}

export async function deleteContract(id: string): Promise<void> {
  const now = Date.now();
  await db.runAsync(`UPDATE contracts SET deleted_at = ?, updated_at = ? WHERE id = ?`, [now, now, id]);
  emit('local');
}

export async function setContractStatus(id: string, status: ContractStatus): Promise<void> {
  await db.runAsync(`UPDATE contracts SET status = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`, [status, Date.now(), id]);
  emit('local');
}

export async function setInstallmentPaid(contractId: string, index: number, paid: boolean): Promise<void> {
  const c = await getContract(contractId);
  if (!c || !c.schedule[index]) return;
  const schedule = c.schedule.map((i, n) => (n === index ? { ...i, paidAt: paid ? Date.now() : null } : i));
  await db.runAsync(`UPDATE contracts SET schedule = ?, updated_at = ? WHERE id = ?`, [JSON.stringify(schedule), Date.now(), contractId]);
  emit('local');
}

// ---- dashboard -------------------------------------------------------------------

export interface PaymentDue {
  contractId: string; contractNumber: string; softwareName: string; clientName: string;
  index: number; label: string; amount: number; currency: string; dueDate: number | null;
}

export interface DashboardStats {
  clientCount: number; contractCount: number; totalValue: number; active: number; thisMonth: number;
  byStatus: Record<string, number>; recent: Contract[];
  received: number; outstanding: number; overdue: PaymentDue[]; upcoming: PaymentDue[];
}

export async function dashboardStats(now = Date.now()): Promise<DashboardStats> {
  const [clients, contracts] = await Promise.all([listClients(), listContracts()]);
  const clientName = new Map(clients.map((c) => [c.id, c.companyName]));
  const byStatus: Record<string, number> = {};
  let received = 0; let outstanding = 0;
  const overdue: PaymentDue[] = []; const upcoming: PaymentDue[] = [];
  const nowDate = new Date(now);
  let thisMonth = 0;
  for (const c of contracts) {
    byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    const d = new Date(c.createdAt);
    if (d.getMonth() === nowDate.getMonth() && d.getFullYear() === nowDate.getFullYear()) thisMonth++;
    if (c.status === 'cancelled') continue;
    c.schedule.forEach((i, index) => {
      if (i.paidAt) { received += i.amount; return; }
      outstanding += i.amount;
      const due: PaymentDue = {
        contractId: c.id, contractNumber: c.contractNumber, softwareName: c.softwareName,
        clientName: clientName.get(c.clientId) ?? '', index, label: i.label, amount: i.amount,
        currency: c.currency, dueDate: i.dueDate,
      };
      if (i.dueDate != null && i.dueDate < now) overdue.push(due);
      else if (i.dueDate != null && i.dueDate - now <= 30 * 24 * 3600 * 1000) upcoming.push(due);
    });
  }
  const byDue = (a: PaymentDue, b: PaymentDue) => (a.dueDate ?? 0) - (b.dueDate ?? 0);
  overdue.sort(byDue); upcoming.sort(byDue);
  return {
    clientCount: clients.length,
    contractCount: contracts.length,
    totalValue: contracts.reduce((s, c) => s + c.amount, 0),
    active: contracts.filter((c) => c.status === 'active' || c.status === 'signed').length,
    thisMonth, byStatus, recent: contracts.slice(0, 6), received, outstanding, overdue, upcoming,
  };
}

// ---- snapshot (sync + backup) ----------------------------------------------------

export async function getSnapshot(): Promise<Snapshot> {
  const [clients, contracts, srow] = await Promise.all([
    db.getAllAsync<ClientRow>(`SELECT * FROM clients`),
    db.getAllAsync<ContractRow>(`SELECT * FROM contracts`),
    db.getFirstAsync<{ data: string; updated_at: number }>(`SELECT data, updated_at FROM settings WHERE id='main'`),
  ]);
  return {
    app: 'ContractHub', version: 2, exportedAt: Date.now(),
    clients: clients.map(mapClient), contracts: contracts.map(mapContract),
    settings: srow ? { ...DEFAULT_SETTINGS, ...JSON.parse(srow.data), updatedAt: srow.updated_at } : null,
  };
}

/** Writes a snapshot into the local database (rows are upserted by id). */
export async function applySnapshot(snap: Snapshot, source: ChangeSource = 'sync'): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const c of snap.clients) await upsertClient(c);
    for (const c of snap.contracts) await upsertContract(c);
    if (snap.settings) {
      const { updatedAt, ...rest } = snap.settings;
      await db.runAsync(
        `INSERT INTO settings (id, data, updated_at) VALUES ('main', ?, ?)
         ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`,
        [JSON.stringify(rest), updatedAt],
      );
    }
  });
  emit(source);
}

/** Marks every client and contract as deleted (so the deletion also syncs). Settings are kept. */
export async function eraseAll(): Promise<void> {
  const now = Date.now();
  await db.runAsync(`UPDATE clients SET deleted_at = ?, updated_at = ? WHERE deleted_at IS NULL`, [now, now]);
  await db.runAsync(`UPDATE contracts SET deleted_at = ?, updated_at = ? WHERE deleted_at IS NULL`, [now, now]);
  emit('local');
}

// ---- small key/value store for sync bookkeeping ------------------------------------

export async function getMeta(key: string): Promise<string | null> {
  const r = await db.getFirstAsync<{ value: string }>(`SELECT value FROM sync_meta WHERE key = ?`, [key]);
  return r?.value ?? null;
}
export async function setMeta(key: string, value: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, [key, value]);
}
