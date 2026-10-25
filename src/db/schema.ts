// SQLite schema + migrations (tracked with PRAGMA user_version).
// Anything that talks to SQLite goes through the small `Db` interface so the
// same code runs on expo-sqlite (app) and node:sqlite (tests).

export interface Db {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: any[]): Promise<{ lastInsertRowId: number; changes: number }>;
  getAllAsync<T>(sql: string, params?: any[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: any[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

const MIGRATIONS: string[] = [
  // v1 — sync-ready schema: UUID ids, updated_at on every row, soft deletes.
  `
  CREATE TABLE settings (
    id TEXT PRIMARY KEY NOT NULL,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE clients (
    id TEXT PRIMARY KEY NOT NULL,
    company_name TEXT NOT NULL,
    contact_person TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE INDEX idx_clients_name ON clients(company_name COLLATE NOCASE);
  CREATE INDEX idx_clients_updated ON clients(updated_at);

  CREATE TABLE contracts (
    id TEXT PRIMARY KEY NOT NULL,
    client_id TEXT NOT NULL,
    contract_number TEXT NOT NULL,
    software_name TEXT NOT NULL DEFAULT '',
    scope_description TEXT NOT NULL DEFAULT '',
    amount REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'PKR',
    payment_type TEXT NOT NULL DEFAULT 'full',
    schedule TEXT NOT NULL DEFAULT '[]',
    start_date INTEGER,
    delivery_date INTEGER,
    support_period_months INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft',
    terms TEXT,
    notes TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE INDEX idx_contracts_client ON contracts(client_id);
  CREATE INDEX idx_contracts_status ON contracts(status);
  CREATE INDEX idx_contracts_created ON contracts(created_at);
  CREATE INDEX idx_contracts_updated ON contracts(updated_at);

  CREATE TABLE sync_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
  `,
];

export async function migrate(db: Db): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let v = row?.user_version ?? 0;
  while (v < MIGRATIONS.length) {
    const sql = MIGRATIONS[v];
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
      await db.execAsync(`PRAGMA user_version = ${v + 1};`);
    });
    v++;
  }
}
