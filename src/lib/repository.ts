import { all, db } from "./db";
import {
  buildPortfolioSeries,
  moneyWeightedReturn,
  periodPerformance,
  portfolioSnapshot,
} from "./calculations";
import type { Account, Asset, Price, Transaction } from "./types";

type DbTransaction = {
  id: number;
  account_id: number;
  asset_id: number | null;
  type: Transaction["type"];
  date: string;
  quantity: number;
  amount_eur: number;
  fees_eur: number;
  note: string | null;
};

export function listAccounts(): Account[] {
  return all<Account>("SELECT id, name, type FROM accounts ORDER BY type, name");
}

export function listAssets(): Asset[] {
  return all<Asset>("SELECT id, name, ticker, isin, type, currency FROM assets ORDER BY name");
}

export function listTransactions(): Transaction[] {
  return all<DbTransaction>("SELECT * FROM transactions ORDER BY date, id").map((row) => ({
    id: row.id,
    accountId: row.account_id,
    assetId: row.asset_id,
    type: row.type,
    date: row.date,
    quantity: row.quantity,
    amountEur: row.amount_eur,
    feesEur: row.fees_eur,
    note: row.note,
  }));
}

export function listPrices(): Price[] {
  return all<{ asset_id: number; date: string; close_eur: number; source: string }>(
    "SELECT asset_id, date, close_eur, source FROM prices ORDER BY date",
  ).map((row) => ({ assetId: row.asset_id, date: row.date, closeEur: row.close_eur, source: row.source }));
}

export function latestPriceDate(assetId: number): string | undefined {
  const row = db.prepare("SELECT MAX(date) AS date FROM prices WHERE asset_id = ?").get(assetId) as
    | { date: string | null }
    | undefined;
  return row?.date ?? undefined;
}

export function dashboardData() {
  const assets = listAssets();
  const transactions = listTransactions();
  const prices = listPrices();
  const { holdings, totalValueEur, cashEur } = portfolioSnapshot(assets, transactions, prices);
  const series = buildPortfolioSeries(transactions, prices);
  const twr = series.at(-1)?.twr ?? 0;
  const mwr = moneyWeightedReturn(series, transactions);
  const incomeEur = transactions
    .filter((transaction) => transaction.type === "DIVIDEND" || transaction.type === "INTEREST")
    .reduce((sum, transaction) => sum + transaction.amountEur, 0);

  return { assets, transactions, holdings, series, totalValueEur, cashEur, twr, mwr, incomeEur };
}

export function dashboardPeriod(period: string, requestedStart?: string, requestedEnd?: string, requestedPoint?: string, today = new Date()) {
  const assets = listAssets();
  const transactions = listTransactions();
  const prices = listPrices();
  const series = buildPortfolioSeries(transactions, prices);
  const currentYear = today.getUTCFullYear();
  const firstDate = transactions[0]?.date;
  const firstYear = firstDate ? Number(firstDate.slice(0, 4)) : currentYear;
  const years = Array.from(
    { length: Math.max(0, currentYear - firstYear) },
    (_, index) => currentYear - index - 1,
  );
  const customStart = validDate(requestedStart);
  const customEnd = validDate(requestedEnd);
  const validCustomRange = (customStart || customEnd) && (!customStart || !customEnd || customStart <= customEnd);
  const validPeriod = validCustomRange
    ? "custom"
    : period === "ytd" || period === "all" || years.includes(Number(period)) ? period : "all";
  const startDate = validCustomRange
    ? customStart
    : validPeriod === "ytd"
      ? `${currentYear}-01-01`
      : /^\d{4}$/.test(validPeriod) ? `${validPeriod}-01-01` : firstDate;
  const endDate = validCustomRange
    ? customEnd
    : validPeriod === "ytd"
      ? today.toISOString().slice(0, 10)
      : /^\d{4}$/.test(validPeriod) ? `${validPeriod}-12-31` : undefined;
  const label = validPeriod === "custom"
    ? dateRangeLabel(startDate, endDate)
    : validPeriod === "ytd" ? "YTD" : validPeriod === "all" ? "Seit Beginn" : validPeriod;
  const performance = periodPerformance(series, transactions, startDate, endDate);
  const validPoint = validDate(requestedPoint);
  const selectedPointDate = validPoint && performance.series.some((point) => point.date === validPoint) ? validPoint : undefined;
  const snapshotDate = selectedPointDate ?? endDate;
  const snapshotTransactions = snapshotDate ? transactions.filter((transaction) => transaction.date <= snapshotDate) : transactions;
  const snapshotPrices = snapshotDate ? prices.filter((price) => price.date <= snapshotDate) : prices;

  return {
    ...performance,
    ...portfolioSnapshot(assets, snapshotTransactions, snapshotPrices),
    selected: validPeriod,
    selectedPointDate,
    startDate,
    endDate,
    label,
    holdingsLabel: selectedPointDate ? `Stand ${formatDate(selectedPointDate)}` : label,
    options: [
      { value: "all", label: "Seit Beginn" },
      { value: "ytd", label: "YTD" },
      ...years.map((year) => ({ value: String(year), label: String(year) })),
    ],
  };
}

function validDate(value?: string): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? undefined : value;
}

function dateRangeLabel(startDate?: string, endDate?: string): string {
  if (startDate && endDate) return `${formatDate(startDate)}–${formatDate(endDate)}`;
  if (startDate) return `Ab ${formatDate(startDate)}`;
  return `Bis ${formatDate(endDate!)}`;
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("de-DE").format(new Date(`${date}T12:00:00Z`));
}

export function lookThroughAllocation() {
  const { holdings, totalValueEur } = dashboardData();
  const exposure = new Map<number, number>();
  let unclassifiedEur = 0;
  for (const holding of holdings) {
    if (holding.asset.type === "STOCK") {
      exposure.set(holding.asset.id, (exposure.get(holding.asset.id) ?? 0) + holding.valueEur);
      continue;
    }
    const rows = all<{ underlying_asset_id: number; weight: number }>(
      `SELECT h.underlying_asset_id, h.weight
       FROM etf_holdings h
       WHERE h.etf_asset_id = ?
         AND h.as_of = (SELECT MAX(as_of) FROM etf_holdings WHERE etf_asset_id = ?)`,
      holding.asset.id,
      holding.asset.id,
    );
    const classifiedWeight = rows.reduce((sum, row) => sum + row.weight, 0);
    for (const row of rows) {
      exposure.set(row.underlying_asset_id, (exposure.get(row.underlying_asset_id) ?? 0) + holding.valueEur * row.weight);
    }
    unclassifiedEur += holding.valueEur * Math.max(0, 1 - classifiedWeight);
  }
  const assets = listAssets();
  return {
    rows: [...exposure.entries()]
      .map(([assetId, valueEur]) => ({
        asset: assets.find((asset) => asset.id === assetId)!,
        valueEur,
        allocation: totalValueEur ? valueEur / totalValueEur : 0,
      }))
      .filter((row) => row.asset)
      .sort((a, b) => b.valueEur - a.valueEur),
    unclassifiedEur,
  };
}

export function insertPrice(assetId: number, date: string, closeEur: number, source: string) {
  db.prepare(
    `INSERT INTO prices(asset_id, date, close_eur, source) VALUES (?, ?, ?, ?)
     ON CONFLICT(asset_id, date) DO UPDATE SET close_eur = excluded.close_eur, source = excluded.source`,
  ).run(assetId, date, closeEur, source);
}
