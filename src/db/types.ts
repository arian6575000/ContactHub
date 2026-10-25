export type ContractStatus = 'draft' | 'sent' | 'signed' | 'active' | 'completed' | 'cancelled';
export const STATUSES: ContractStatus[] = ['draft', 'sent', 'signed', 'active', 'completed', 'cancelled'];

/** Every synced row carries these three fields. */
export interface SyncFields {
  createdAt: number;
  updatedAt: number;
  /** Soft delete (tombstone) so deletions propagate to other phones. */
  deletedAt: number | null;
}

export interface Client extends SyncFields {
  id: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  notes: string;
}

export interface Installment {
  label: string;
  amount: number;
  dueDate: number | null;
  /** Epoch ms when the installment was marked paid, null while pending. */
  paidAt: number | null;
}

export interface Contract extends SyncFields {
  id: string;
  clientId: string;
  contractNumber: string;
  softwareName: string;
  scopeDescription: string;
  amount: number;
  currency: string;
  paymentType: 'full' | 'installments';
  schedule: Installment[];
  startDate: number | null;
  deliveryDate: number | null;
  supportPeriodMonths: number;
  status: ContractStatus;
  /** null = use the default terms from Settings. */
  termsAndConditions: string | null;
  notes: string;
}

export interface Settings {
  companyName: string;
  companyTagline: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyWebsite: string;
  /** Small PNG/JPEG as a data URL. */
  companyLogo: string | null;
  contractPrefix: string;
  currency: string;
  defaultTerms: string;
  /** 0 until the user saves once, so a fresh phone never overwrites synced settings. */
  updatedAt: number;
}

export type ClientInput = Partial<Client> & { companyName: string };
export type ContractInput = Partial<Contract> & { clientId: string };

/** The full dataset, including tombstones. Used for sync and backups. */
export interface Snapshot {
  app: 'ContractHub';
  version: 2;
  exportedAt: number;
  clients: Client[];
  contracts: Contract[];
  settings: Settings | null;
}
