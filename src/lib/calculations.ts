import type { Asset, PortfolioPoint, Price, Transaction } from "./types";

export function cashChange(transaction: Transaction): number {
  switch (transaction.type) {
    case "DEPOSIT":
    case "DIVIDEND":
    case "INTEREST":
      return transaction.amountEur;
    case "WITHDRAWAL":
    case "FEE":
      return -transaction.amountEur;
    case "BUY":
      return -transaction.amountEur - transaction.feesEur;
    case "SELL":
      return transaction.amountEur - transaction.feesEur;
  }
}

export function externalFlow(transaction: Transaction): number {
  if (transaction.type === "DEPOSIT") return transaction.amountEur;
  if (transaction.type === "WITHDRAWAL") return -transaction.amountEur;
  return 0;
}

export function buildPortfolioSeries(
  transactions: Transaction[],
  prices: Price[],
): PortfolioPoint[] {
  const dates = [...new Set([...transactions.map((item) => item.date), ...prices.map((item) => item.date)])].sort();
  const transactionsByDate = groupBy(transactions, (item) => item.date);
  const pricesByDate = groupBy(prices, (item) => item.date);
  const quantity = new Map<number, number>();
  const latestPrice = new Map<number, number>();
  let cash = 0;
  let cumulativeTwr = 1;
  let previousValue = 0;

  return dates.map((date, index) => {
    for (const price of pricesByDate.get(date) ?? []) latestPrice.set(price.assetId, price.closeEur);

    let flow = 0;
    for (const transaction of transactionsByDate.get(date) ?? []) {
      cash += cashChange(transaction);
      flow += externalFlow(transaction);
      if (transaction.assetId !== null) {
        const direction = transaction.type === "BUY" ? 1 : transaction.type === "SELL" ? -1 : 0;
        quantity.set(
          transaction.assetId,
          (quantity.get(transaction.assetId) ?? 0) + direction * transaction.quantity,
        );
      }
    }

    let value = cash;
    for (const [assetId, units] of quantity) value += units * (latestPrice.get(assetId) ?? 0);

    if (index > 0 && previousValue !== 0) {
      cumulativeTwr *= 1 + (value - flow) / previousValue - 1;
    }
    previousValue = value;

    return { date, valueEur: value, netFlowEur: flow, twr: cumulativeTwr - 1 };
  });
}

export function xirr(cashFlows: { date: string; amount: number }[]): number | null {
  if (cashFlows.length < 2) return null;
  const sorted = [...cashFlows].sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.some((flow) => flow.amount < 0) || !sorted.some((flow) => flow.amount > 0)) return null;
  const start = new Date(`${sorted[0].date}T00:00:00Z`).getTime();
  const yearMs = 365.2425 * 24 * 60 * 60 * 1000;
  const npv = (rate: number) =>
    sorted.reduce((sum, flow) => {
      const years = (new Date(`${flow.date}T00:00:00Z`).getTime() - start) / yearMs;
      return sum + flow.amount / (1 + rate) ** years;
    }, 0);

  let low = -0.9999;
  let high = 1;
  let lowValue = npv(low);
  let highValue = npv(high);
  while (Math.sign(lowValue) === Math.sign(highValue) && high < 1_000_000) {
    high *= 10;
    highValue = npv(high);
  }
  if (!Number.isFinite(lowValue) || !Number.isFinite(highValue) || Math.sign(lowValue) === Math.sign(highValue)) {
    return null;
  }

  for (let iteration = 0; iteration < 200; iteration += 1) {
    const middle = (low + high) / 2;
    const value = npv(middle);
    if (Math.abs(value) < 0.000001) return middle;
    if (Math.sign(value) === Math.sign(lowValue)) {
      low = middle;
      lowValue = value;
    } else {
      high = middle;
      highValue = value;
    }
  }
  return (low + high) / 2;
}

export function moneyWeightedReturn(series: PortfolioPoint[], transactions: Transaction[]): number | null {
  const last = series.at(-1);
  if (!last || last.valueEur <= 0) return null;
  const flows = transactions
    .filter((transaction) => transaction.type === "DEPOSIT" || transaction.type === "WITHDRAWAL")
    .map((transaction) => ({ date: transaction.date, amount: -externalFlow(transaction) }));
  flows.push({ date: last.date, amount: last.valueEur });
  return xirr(flows);
}

export function latestPrices(prices: Price[]): Map<number, number> {
  const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date));
  return new Map(sorted.map((price) => [price.assetId, price.closeEur]));
}

export function quantities(transactions: Transaction[]): Map<number, number> {
  const result = new Map<number, number>();
  for (const transaction of transactions) {
    if (transaction.assetId === null) continue;
    const change = transaction.type === "BUY" ? transaction.quantity : transaction.type === "SELL" ? -transaction.quantity : 0;
    result.set(transaction.assetId, (result.get(transaction.assetId) ?? 0) + change);
  }
  return result;
}

export function remainingCostBasis(transactions: Transaction[], assetId: number): number {
  let quantity = 0;
  let cost = 0;
  for (const transaction of transactions) {
    if (transaction.assetId !== assetId) continue;
    if (transaction.type === "BUY") {
      quantity += transaction.quantity;
      cost += transaction.amountEur + transaction.feesEur;
    } else if (transaction.type === "SELL" && quantity > 0) {
      const soldQuantity = Math.min(quantity, transaction.quantity);
      cost -= (cost / quantity) * soldQuantity;
      quantity -= soldQuantity;
    }
  }
  return Math.max(0, cost);
}

export function totalCash(transactions: Transaction[]): number {
  return transactions.reduce((sum, transaction) => sum + cashChange(transaction), 0);
}

export function findAsset(assets: Asset[], id: number): Asset {
  const asset = assets.find((item) => item.id === id);
  if (!asset) throw new Error(`Asset ${id} nicht gefunden`);
  return asset;
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const result = new Map<K, T[]>();
  for (const item of items) result.set(key(item), [...(result.get(key(item)) ?? []), item]);
  return result;
}
