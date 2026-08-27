import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "portfolio.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const globalForDb = globalThis as unknown as { portfolioDb?: DatabaseSync };

export const db = globalForDb.portfolioDb ?? new DatabaseSync(dbPath);
if (process.env.NODE_ENV !== "production") globalForDb.portfolioDb = db;

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('BROKERAGE', 'SAVINGS')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    ticker TEXT NOT NULL UNIQUE,
    isin TEXT,
    type TEXT NOT NULL CHECK(type IN ('STOCK', 'ETF')),
    currency TEXT NOT NULL DEFAULT 'EUR',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    asset_id INTEGER REFERENCES assets(id) ON DELETE RESTRICT,
    type TEXT NOT NULL CHECK(type IN ('BUY','SELL','DEPOSIT','WITHDRAWAL','DIVIDEND','INTEREST','FEE')),
    date TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 0,
    amount_eur REAL NOT NULL DEFAULT 0,
    fees_eur REAL NOT NULL DEFAULT 0,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS prices (
    asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    close_eur REAL NOT NULL CHECK(close_eur >= 0),
    source TEXT NOT NULL,
    PRIMARY KEY(asset_id, date)
  );

  CREATE TABLE IF NOT EXISTS etf_holdings (
    etf_asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    underlying_asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    as_of TEXT NOT NULL,
    weight REAL NOT NULL CHECK(weight >= 0 AND weight <= 1),
    PRIMARY KEY(etf_asset_id, underlying_asset_id, as_of)
  );
`);

export function all<T>(sql: string, ...params: SQLInputValue[]): T[] {
  return db.prepare(sql).all(...params) as unknown as T[];
}

export function get<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
  return db.prepare(sql).get(...params) as unknown as T | undefined;
}
