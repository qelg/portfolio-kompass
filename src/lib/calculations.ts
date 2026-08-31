import type { Asset, HoldingRow, MissingPricePeriod, PortfolioPoint, Price, Transaction } from "./types";

const yearMs = 365.2425 * 24 * 60 * 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;

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
  const valuationPrices = pricesWithTransactionFallback(transactions, prices);
  const dates = [...new Set([...transactions.map((item) => item.date), ...valuationPrices.map((item) => item.date)])].sort();
  const transactionsByDate = groupBy(transactions, (item) => item.date);
  const pricesByDate = groupBy(valuationPrices, (item) => item.date);
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
    const totalQuantity = [...quantity.values()].reduce((sum, units) => sum + units, 0);

    if (index > 0 && previousValue !== 0) {
      cumulativeTwr *= 1 + (value - flow) / previousValue - 1;
    }
    previousValue = value;

    return { date, valueEur: value, totalQuantity, netFlowEur: flow, twr: cumulativeTwr - 1 };
  });
}

export function portfolioSnapshot(assets: Asset[], transactions: Transaction[], prices: Price[]) {
  const priceByAsset = latestPrices(pricesWithTransactionFallback(transactions, prices));
  const quantityByAsset = quantities(transactions);
  const cashEur = totalCash(transactions);
  const holdings: HoldingRow[] = assets
    .map((asset) => {
      const quantity = quantityByAsset.get(asset.id) ?? 0;
      const price = priceByAsset.get(asset.id);
      const priceEur = price?.closeEur ?? 0;
      const costEur = remainingCostBasis(transactions, asset.id);
      const valueEur = quantity * priceEur;
      const gainEur = valueEur - costEur;
      return {
        asset,
        quantity,
        priceEur,
        priceDate: price?.date ?? null,
        priceSource: price?.source ?? null,
        valueEur,
        costEur,
        gainEur,
        gainPercent: costEur ? gainEur / costEur : null,
        allocation: 0,
      };
    })
    .filter((holding) => Math.abs(holding.quantity) > 0.00000001);

  const totalValueEur = holdings.reduce((sum, holding) => sum + holding.valueEur, cashEur);
  for (const holding of holdings) holding.allocation = totalValueEur ? holding.valueEur / totalValueEur : 0;
  return { holdings, totalValueEur, cashEur };
}

export function missingPricePeriods(
  assets: Asset[],
  transactions: Transaction[],
  prices: Price[],
  today: string,
  minimumDays = 7,
): MissingPricePeriod[] {
  const periods: MissingPricePeriod[] = [];

  for (const asset of assets) {
    const assetTransactions = transactions
      .filter((transaction) => transaction.assetId === asset.id && (transaction.type === "BUY" || transaction.type === "SELL"))
      .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
    const holdingPeriods: { startDate: string; endDate: string }[] = [];
    let quantity = 0;
    let startDate: string | undefined;

    for (const transaction of assetTransactions) {
      const previousQuantity = quantity;
      quantity += transaction.type === "BUY" ? transaction.quantity : -transaction.quantity;
      if (previousQuantity <= 0.00000001 && quantity > 0.00000001) startDate = transaction.date;
      if (previousQuantity > 0.00000001 && quantity <= 0.00000001 && startDate) {
        holdingPeriods.push({ startDate, endDate: transaction.date });
        startDate = undefined;
      }
    }
    if (startDate && startDate <= today) holdingPeriods.push({ startDate, endDate: today });

    const knownDates = new Set(
      prices.filter((price) => price.assetId === asset.id).map((price) => price.date),
    );
    for (const transaction of assetTransactions) {
      if (transaction.quantity > 0) knownDates.add(transaction.date);
    }

    for (const holdingPeriod of holdingPeriods) {
      const endDate = holdingPeriod.endDate < today ? holdingPeriod.endDate : today;
      if (holdingPeriod.startDate > endDate) continue;
      const anchors = [...knownDates]
        .filter((date) => date >= holdingPeriod.startDate && date <= endDate)
        .sort();
      let previousDate = addDays(holdingPeriod.startDate, -1);

      for (const anchor of anchors) {
        addMissingPeriod(periods, asset, addDays(previousDate, 1), addDays(anchor, -1), minimumDays);
        previousDate = anchor;
      }
      addMissingPeriod(periods, asset, addDays(previousDate, 1), endDate, minimumDays);
    }
  }

  return periods.sort((a, b) => b.days - a.days || a.startDate.localeCompare(b.startDate));
}

function addMissingPeriod(
  periods: MissingPricePeriod[],
  asset: Asset,
  startDate: string,
  endDate: string,
  minimumDays: number,
) {
  const days = daysBetween(startDate, endDate) + 1;
  if (days < minimumDays) return;
  periods.push({
    asset,
    startDate,
    endDate,
    days,
    suggestedDate: addDays(startDate, Math.floor((days - 1) / 2)),
  });
}

function addDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * dayMs).toISOString().slice(0, 10);
}

function daysBetween(startDate: string, endDate: string): number {
  return Math.round(
    (new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime()) / dayMs,
  );
}

export function xirr(cashFlows: { date: string; amount: number }[]): number | null {
  if (cashFlows.length < 2) return null;
  const sorted = [...cashFlows].sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.some((flow) => flow.amount < 0) || !sorted.some((flow) => flow.amount > 0)) return null;
  const start = new Date(`${sorted[0].date}T00:00:00Z`).getTime();
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
  const first = series[0];
  const last = series.at(-1);
  if (!first || !last || last.valueEur <= 0) return null;
  const flows = transactions
    .filter((transaction) => transaction.type === "DEPOSIT" || transaction.type === "WITHDRAWAL")
    .map((transaction) => ({ date: transaction.date, amount: -externalFlow(transaction) }));
  flows.push({ date: last.date, amount: last.valueEur });
  const annualRate = xirr(flows);
  if (annualRate === null) return null;
  return yearsBetween(first.date, last.date) > 1
    ? annualRate
    : returnForPeriod(annualRate, first.date, last.date);
}

export function periodPerformance(
  series: PortfolioPoint[],
  transactions: Transaction[],
  startDate?: string,
  endDate?: string,
) {
  const pointsThroughEnd = endDate ? series.filter((point) => point.date <= endDate) : series;
  const last = pointsThroughEnd.at(-1);
  if (!last) return { series: [], transactions: [], twr: 0, mwr: null, returnsAnnualized: false, gainEur: 0, incomeEur: 0 };

  const opening = startDate
    ? pointsThroughEnd.filter((point) => point.date < startDate).at(-1)
    : undefined;
  const periodTransactions = transactions.filter(
    (transaction) => (!startDate || transaction.date >= startDate) && (!endDate || transaction.date <= endDate),
  );
  const periodSeries = pointsThroughEnd.filter((point) => !startDate || point.date >= startDate);

  if (opening && startDate && opening.valueEur !== 0) {
    periodSeries.unshift({ ...opening, date: startDate, netFlowEur: 0 });
  }
  if (endDate && periodSeries.length && periodSeries.at(-1)!.date < endDate) {
    periodSeries.push({ ...last, date: endDate, netFlowEur: 0 });
  }

  const openingValue = opening?.valueEur ?? 0;
  const externalFlows = periodTransactions.reduce((sum, transaction) => sum + externalFlow(transaction), 0);
  const incomeEur = periodTransactions
    .filter((transaction) => transaction.type === "DIVIDEND" || transaction.type === "INTEREST")
    .reduce((sum, transaction) => sum + transaction.amountEur, 0);
  const openingFactor = opening ? 1 + opening.twr : 1;
  const periodTwr = openingFactor === 0 ? 0 : (1 + last.twr) / openingFactor - 1;

  const flows = periodTransactions
    .filter((transaction) => transaction.type === "DEPOSIT" || transaction.type === "WITHDRAWAL")
    .map((transaction) => ({ date: transaction.date, amount: -externalFlow(transaction) }));
  if (opening && startDate && openingValue > 0) flows.unshift({ date: startDate, amount: -openingValue });
  const closingDate = endDate ?? last.date;
  flows.push({ date: closingDate, amount: last.valueEur });
  const annualMwr = flows.length === 2 && flows[0].amount === -flows[1].amount ? 0 : xirr(flows);
  const periodStart = periodSeries[0]?.date ?? closingDate;
  const returnsAnnualized = yearsBetween(periodStart, closingDate) > 1;
  const twr = returnsAnnualized ? annualizeReturn(periodTwr, periodStart, closingDate) : periodTwr;
  const mwr = annualMwr === null || returnsAnnualized
    ? annualMwr
    : returnForPeriod(annualMwr, periodStart, closingDate);

  return {
    series: periodSeries,
    transactions: periodTransactions,
    twr,
    mwr,
    returnsAnnualized,
    gainEur: last.valueEur - openingValue - externalFlows,
    incomeEur,
  };
}

function yearsBetween(startDate: string, endDate: string): number {
  return (
    new Date(`${endDate}T00:00:00Z`).getTime()
    - new Date(`${startDate}T00:00:00Z`).getTime()
  ) / yearMs;
}

function annualizeReturn(periodReturn: number, startDate: string, endDate: string): number {
  const years = yearsBetween(startDate, endDate);
  return years > 0 && periodReturn > -1 ? (1 + periodReturn) ** (1 / years) - 1 : periodReturn;
}

function returnForPeriod(annualRate: number, startDate: string, endDate: string): number {
  const years = yearsBetween(startDate, endDate);
  return years > 0 ? (1 + annualRate) ** years - 1 : annualRate;
}

export function latestPrices(prices: Price[]): Map<number, Price> {
  const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date));
  return new Map(sorted.map((price) => [price.assetId, price]));
}

function pricesWithTransactionFallback(transactions: Transaction[], prices: Price[]): Price[] {
  const marketPriceDates = new Set(prices.map((price) => `${price.assetId}:${price.date}`));
  const trades = new Map<string, { assetId: number; date: string; amountEur: number; quantity: number }>();

  for (const transaction of transactions) {
    if (
      transaction.assetId === null
      || (transaction.type !== "BUY" && transaction.type !== "SELL")
      || transaction.quantity <= 0
    ) continue;
    const key = `${transaction.assetId}:${transaction.date}`;
    if (marketPriceDates.has(key)) continue;
    const trade = trades.get(key) ?? {
      assetId: transaction.assetId,
      date: transaction.date,
      amountEur: 0,
      quantity: 0,
    };
    trade.amountEur += transaction.amountEur;
    trade.quantity += transaction.quantity;
    trades.set(key, trade);
  }

  return [
    ...prices,
    ...[...trades.values()].map((trade) => ({
      assetId: trade.assetId,
      date: trade.date,
      closeEur: trade.amountEur / trade.quantity,
      source: "Kauf/Verkauf",
    })),
  ];
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
