import { afterEach, describe, expect, it, vi } from "vitest";
import type { Asset } from "./types";
import { fetchDailyPricesEur } from "./market-data";

const asset: Asset = {
  id: 1,
  name: "Nicht verfügbarer ETF",
  ticker: "TEST:XETR",
  isin: null,
  type: "ETF",
  currency: "EUR",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("market data errors", () => {
  it("reports the asset, symbol and Twelve Data reason", async () => {
    vi.stubEnv("TWELVE_DATA_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "error",
            code: 404,
            message: "This symbol is not available with your plan.",
          }),
          { status: 404 },
        ),
      ),
    );

    await expect(fetchDailyPricesEur(asset)).rejects.toThrow(
      "Kursimport für ETF „Nicht verfügbarer ETF“ (TEST:XETR) fehlgeschlagen: " +
        "Twelve Data für TEST:XETR: This symbol is not available with your plan. (HTTP 404)",
    );
  });
});
