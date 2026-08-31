import { describe, expect, it } from "vitest";
import { buildPortfolioSeries, periodPerformance, portfolioSnapshot, remainingCostBasis, xirr } from "./calculations";
import type { Asset, Transaction } from "./types";

function transaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: 1,
    accountId: 1,
    assetId: null,
    type: "DEPOSIT",
    date: "2025-01-01",
    quantity: 0,
    amountEur: 0,
    feesEur: 0,
    note: null,
    ...overrides,
  };
}

describe("portfolio calculations", () => {
  it("neutralizes deposits in time-weighted return but includes interest", () => {
    const series = buildPortfolioSeries(
      [
        transaction({ date: "2025-01-01", type: "DEPOSIT", amountEur: 100 }),
        transaction({ date: "2025-01-02", type: "INTEREST", amountEur: 10 }),
        transaction({ date: "2025-01-03", type: "DEPOSIT", amountEur: 100 }),
      ],
      [],
    );
    expect(series.at(-1)?.valueEur).toBe(210);
    expect(series.at(-1)?.twr).toBeCloseTo(0.1, 10);
  });

  it("tracks the total number of held shares at every point", () => {
    const series = buildPortfolioSeries([
      transaction({ date: "2025-01-01", assetId: 1, type: "BUY", quantity: 2, amountEur: 100 }),
      transaction({ date: "2025-02-01", assetId: 2, type: "BUY", quantity: 1.5, amountEur: 100 }),
      transaction({ date: "2025-03-01", assetId: 1, type: "SELL", quantity: 0.5, amountEur: 25 }),
    ], []);

    expect(series.map((point) => point.totalQuantity)).toEqual([2, 3.5, 3]);
  });

  it("calculates annualized money-weighted return", () => {
    const result = xirr([
      { date: "2024-01-01", amount: -100 },
      { date: "2025-01-01", amount: 110 },
    ]);
    expect(result).toBeCloseTo(0.1, 3);
  });

  it("keeps TWR and MWR cumulative for periods shorter than one year", () => {
    const transactions = [
      transaction({ date: "2025-01-01", type: "DEPOSIT", amountEur: 100 }),
      transaction({ date: "2025-07-01", type: "INTEREST", amountEur: 10 }),
    ];
    const result = periodPerformance(buildPortfolioSeries(transactions, []), transactions);

    expect(result.returnsAnnualized).toBe(false);
    expect(result.twr).toBeCloseTo(0.1, 10);
    expect(result.mwr).toBeCloseTo(0.1, 7);
  });

  it("annualizes TWR and MWR for periods longer than one year", () => {
    const transactions = [
      transaction({ date: "2023-01-01", type: "DEPOSIT", amountEur: 100 }),
      transaction({ date: "2025-01-01", type: "INTEREST", amountEur: 21 }),
    ];
    const result = periodPerformance(buildPortfolioSeries(transactions, []), transactions);
    const years = 731 / 365.2425;
    const expectedAnnualReturn = 1.21 ** (1 / years) - 1;

    expect(result.returnsAnnualized).toBe(true);
    expect(result.twr).toBeCloseTo(expectedAnnualReturn, 10);
    expect(result.mwr).toBeCloseTo(expectedAnnualReturn, 7);
  });

  it("keeps a moving-average cost basis through partial sales and later buys", () => {
    const transactions = [
      transaction({ assetId: 2, type: "BUY", quantity: 10, amountEur: 1000 }),
      transaction({ assetId: 2, type: "SELL", quantity: 5, amountEur: 600 }),
      transaction({ assetId: 2, type: "BUY", quantity: 5, amountEur: 700 }),
    ];
    expect(remainingCostBasis(transactions, 2)).toBe(1200);
  });

  it("rebases performance and cash flows to a calendar-year period", () => {
    const transactions = [
      transaction({ date: "2023-01-01", type: "DEPOSIT", amountEur: 100 }),
      transaction({ date: "2024-06-01", type: "INTEREST", amountEur: 10 }),
      transaction({ date: "2024-07-01", type: "DEPOSIT", amountEur: 100 }),
    ];
    const series = buildPortfolioSeries(transactions, []);
    const result = periodPerformance(series, transactions, "2024-01-01", "2024-12-31");

    expect(result.series[0]).toMatchObject({ date: "2024-01-01", valueEur: 100 });
    expect(result.series.at(-1)).toMatchObject({ date: "2024-12-31", valueEur: 210 });
    expect(result.twr).toBeCloseTo(0.1, 10);
    expect(result.gainEur).toBe(10);
    expect(result.incomeEur).toBe(10);
  });

  it("supports arbitrary date boundaries", () => {
    const transactions = [
      transaction({ date: "2025-01-01", type: "DEPOSIT", amountEur: 100 }),
      transaction({ date: "2025-03-15", type: "INTEREST", amountEur: 5 }),
      transaction({ date: "2025-08-01", type: "INTEREST", amountEur: 10 }),
    ];
    const result = periodPerformance(buildPortfolioSeries(transactions, []), transactions, "2025-02-10", "2025-06-20");

    expect(result.series[0]).toMatchObject({ date: "2025-02-10", valueEur: 100 });
    expect(result.series.at(-1)).toMatchObject({ date: "2025-06-20", valueEur: 105 });
    expect(result.gainEur).toBe(5);
    expect(result.transactions.map((item) => item.date)).toEqual(["2025-03-15"]);
  });

  it("builds holdings from transactions and prices through a selected date", () => {
    const asset: Asset = { id: 1, name: "Test ETF", ticker: "TEST", isin: null, type: "ETF", currency: "EUR" };
    const transactions = [
      transaction({ date: "2024-01-02", assetId: 1, type: "BUY", quantity: 2, amountEur: 100 }),
      transaction({ date: "2025-01-02", assetId: 1, type: "BUY", quantity: 1, amountEur: 60 }),
    ];
    const prices = [
      { assetId: 1, date: "2024-12-31", closeEur: 55, source: "Test" },
      { assetId: 1, date: "2025-12-31", closeEur: 70, source: "Test" },
    ];
    const snapshot = portfolioSnapshot(
      [asset],
      transactions.filter((item) => item.date <= "2024-12-31"),
      prices.filter((item) => item.date <= "2024-12-31"),
    );

    expect(snapshot.holdings[0]).toMatchObject({ quantity: 2, priceEur: 55, valueEur: 110, gainEur: 10 });
  });

  it("derives a price from a transaction when no market price exists", () => {
    const asset: Asset = { id: 1, name: "Test Aktie", ticker: "TEST", isin: null, type: "STOCK", currency: "EUR" };
    const transactions = [
      transaction({ assetId: 1, type: "BUY", quantity: 2, amountEur: 100 }),
    ];

    const snapshot = portfolioSnapshot([asset], transactions, []);

    expect(snapshot.holdings[0]).toMatchObject({ priceEur: 50, priceDate: "2025-01-01", priceSource: "Kauf/Verkauf", valueEur: 100 });
  });

  it("reports the date of the latest available price", () => {
    const asset: Asset = { id: 1, name: "Test ETF", ticker: "TEST", isin: null, type: "ETF", currency: "EUR" };
    const transactions = [
      transaction({ assetId: 1, type: "BUY", quantity: 2, amountEur: 100 }),
    ];
    const prices = [
      { assetId: 1, date: "2025-01-03", closeEur: 50, source: "Test" },
      { assetId: 1, date: "2025-01-06", closeEur: 52, source: "Test" },
    ];

    const snapshot = portfolioSnapshot([asset], transactions, prices);

    expect(snapshot.holdings[0]).toMatchObject({ priceEur: 52, priceDate: "2025-01-06", priceSource: "Test" });
  });

  it("uses the quantity-weighted transaction price after the latest market price", () => {
    const asset: Asset = { id: 1, name: "Test Aktie", ticker: "TEST", isin: null, type: "STOCK", currency: "EUR" };
    const transactions = [
      transaction({ id: 1, date: "2025-01-04", assetId: 1, type: "BUY", quantity: 2, amountEur: 220 }),
      transaction({ id: 2, date: "2025-01-04", assetId: 1, type: "BUY", quantity: 1, amountEur: 130 }),
    ];
    const prices = [
      { assetId: 1, date: "2025-01-03", closeEur: 100, source: "Test" },
    ];

    const snapshot = portfolioSnapshot([asset], transactions, prices);

    expect(snapshot.holdings[0]).toMatchObject({
      priceEur: 350 / 3,
      priceDate: "2025-01-04",
      priceSource: "Kauf/Verkauf",
      valueEur: 350,
    });
    expect(buildPortfolioSeries(transactions, prices).at(-1)?.valueEur).toBe(0);
  });

  it("prefers a market price on the same day as a transaction", () => {
    const asset: Asset = { id: 1, name: "Test ETF", ticker: "TEST", isin: null, type: "ETF", currency: "EUR" };
    const transactions = [
      transaction({ date: "2025-01-03", assetId: 1, type: "BUY", quantity: 2, amountEur: 220 }),
    ];
    const prices = [
      { assetId: 1, date: "2025-01-03", closeEur: 105, source: "Test" },
    ];

    const snapshot = portfolioSnapshot([asset], transactions, prices);

    expect(snapshot.holdings[0]).toMatchObject({ priceEur: 105, priceDate: "2025-01-03", priceSource: "Test" });
  });
});
