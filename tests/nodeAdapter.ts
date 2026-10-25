// Runs the data layer against a real SQLite engine (node:sqlite) in tests.
import { DatabaseSync } from 'node:sqlite';
import type { Db } from '../src/db/schema';

export function nodeDb(): Db {
  const raw = new DatabaseSync(':memory:');
  return {
    execAsync: async (sql) => { raw.exec(sql); },
    runAsync: async (sql, params = []) => {
      const r = raw.prepare(sql).run(...params);
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    getAllAsync: async <T,>(sql: string, params: any[] = []) => raw.prepare(sql).all(...params) as T[],
    getFirstAsync: async <T,>(sql: string, params: any[] = []) => ((raw.prepare(sql).get(...params) as T) ?? null),
    withTransactionAsync: async (task) => {
      raw.exec('BEGIN');
      try { await task(); raw.exec('COMMIT'); } catch (e) { raw.exec('ROLLBACK'); throw e; }
    },
  };
}

let passed = 0;
let failed = 0;
export async function test(name: string, fn: () => Promise<void> | void) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e: any) { failed++; console.log(`  ✗ ${name}\n      ${e?.stack || e}`); }
}
export function done() {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}
