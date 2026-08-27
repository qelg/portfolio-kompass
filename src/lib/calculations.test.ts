import { describe, expect, it } from "vitest";
import { buildPortfolioSeries, remainingCostBasis, xirr } from "./calculations";
import type { Transaction } from "./types";

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

  it("calculates annualized money-weighted return", () => {
    const result = xirr([
      { date: "2024-01-01", amount: -100 },
      { date: "2025-01-01", amount: 110 },
    ]);
    expect(result).toBeCloseTo(0.1, 3);
  });

  it("keeps a moving-average cost basis through partial sales and later buys", () => {
    const transactions = [
      transaction({ assetId: 2, type: "BUY", quantity: 10, amountEur: 1000 }),
      transaction({ assetId: 2, type: "SELL", quantity: 5, amountEur: 600 }),
      transaction({ assetId: 2, type: "BUY", quantity: 5, amountEur: 700 }),
    ];
    expect(remainingCostBasis(transactions, 2)).toBe(1200);
  });
});
