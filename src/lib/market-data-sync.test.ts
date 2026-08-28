import { afterEach, describe, expect, it, vi } from "vitest";
import type { Asset } from "./types";

const repository = vi.hoisted(() => ({
  insertPrice: vi.fn(),
  latestPriceDate: vi.fn(),
  listAssets: vi.fn(),
}));

vi.mock("./repository", () => repository);

import { syncAllPrices } from "./market-data";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("price synchronization", () => {
  it("continues importing remaining assets after one asset fails", async () => {
    const unavailable: Asset = {
      id: 1,
      name: "Nicht verfügbarer ETF",
      ticker: "MISSING:XETR",
      isin: null,
      type: "ETF",
      currency: "EUR",
    };
    const available: Asset = {
      id: 2,
      name: "Verfügbarer ETF",
      ticker: "AVAILABLE:XETR",
      isin: null,
      type: "ETF",
      currency: "EUR",
    };
    repository.listAssets.mockReturnValue([unavailable, available]);
    vi.stubEnv("PORTFOLIO_PERFORMANCE_TOKEN_PATH", "");
    vi.stubEnv("TWELVE_DATA_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        if (url.searchParams.get("symbol") === unavailable.ticker) {
          return Response.json({ status: "error", message: "Not found" }, { status: 404 });
        }
        return Response.json({ values: [{ datetime: "2024-01-01", close: "123.45" }] });
      }),
    );

    await expect(syncAllPrices()).rejects.toThrow("Nicht verfügbarer ETF");
    expect(repository.insertPrice).toHaveBeenCalledWith(available.id, "2024-01-01", 123.45, "Twelve Data");
  });
});
