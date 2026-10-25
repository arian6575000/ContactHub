import type { SQLiteDatabase } from 'expo-sqlite';
import type { Db } from './schema';

/** Thin wrapper so the repo only depends on the small `Db` interface. */
export function fromExpo(db: SQLiteDatabase): Db {
  return {
    execAsync: (sql) => db.execAsync(sql),
    runAsync: async (sql, params = []) => {
      const r = await db.runAsync(sql, params);
      return { lastInsertRowId: r.lastInsertRowId, changes: r.changes };
    },
    getAllAsync: <T,>(sql: string, params: any[] = []) => db.getAllAsync<T>(sql, params),
    getFirstAsync: <T,>(sql: string, params: any[] = []) => db.getFirstAsync<T>(sql, params),
    withTransactionAsync: (task) => db.withTransactionAsync(task),
  };
}
