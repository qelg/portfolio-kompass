import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
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
  vi.unstubAllGlobals();
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

  it("resolves an ISIN to a EUR Xetra listing through Portfolio Performance", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "portfolio-kompass-"));
    const tokenPath = path.join(directory, "refresh-token");
    await fs.writeFile(tokenPath, "refresh-token\n");
    vi.stubEnv("PORTFOLIO_PERFORMANCE_TOKEN_PATH", tokenPath);

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.pathname === "/v1/search") {
        expect(url.searchParams.get("isin")).toBe("LU0000000001");
        return Response.json([
          {
            description: asset.name,
            isin: asset.isin,
            markets: [
              { currency: "EUR", exchange: "XFRA", symbol: "TEST.F" },
              { currency: "EUR", exchange: "XETR", symbol: "TEST.DE" },
            ],
          },
        ]);
      }
      if (url.pathname === "/oidc/token") {
        return Response.json({ access_token: "access-token", expires_in: 3600 });
      }
      if (url.pathname === "/v1/candle") {
        expect(url.searchParams.get("symbol")).toBe("TEST.DE");
        return Response.json({ s: "ok", t: [1704067200], c: [123.45] });
      }
      throw new Error(`Unerwarteter Testaufruf: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchDailyPricesEur({ ...asset, isin: "LU0000000001" })).resolves.toEqual([
      { date: "2024-01-01", closeEur: 123.45 },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await fs.rm(directory, { recursive: true });
  });
});
