import { DatabaseSync } from 'node:sqlite';
import { ShopStore } from './shop-store.mjs';

export { initialSettings } from './shop-store.mjs';

export class Store extends ShopStore {
  constructor(filename = ':memory:', owner = '', notify = false) {
    const database = new DatabaseSync(filename);
    database.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    super({
      exec: sql => database.exec(sql),
      run: (sql, ...args) => database.prepare(sql).run(...args),
      get: (sql, ...args) => database.prepare(sql).get(...args),
      all: (sql, ...args) => database.prepare(sql).all(...args),
      transaction(action) {
        database.exec('BEGIN IMMEDIATE');
        try {
          const result = action();
          database.exec('COMMIT');
          return result;
        } catch (error) {
          database.exec('ROLLBACK');
          throw error;
        }
      },
      close: () => database.close(),
    }, owner, notify);
  }

  close() { this.db.close(); }
}
