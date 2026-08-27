import type { Asset } from "./types";
import { insertPrice, latestPriceDate, listAssets } from "./repository";
import { fetchPortfolioPerformancePrices, portfolioPerformanceConfigured } from "./portfolio-performance";

type TwelveDataResponse = {
  status?: "error";
  message?: string;
  values?: { datetime: string; close: string }[];
};

export async function fetchDailyPricesEur(
  asset: Asset,
  latestDate?: string,
): Promise<{ date: string; closeEur: number }[]> {
  if (portfolioPerformanceConfigured()) {
    try {
      return await fetchPortfolioPerformancePrices(asset, latestDate);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unbekannter Fehler";
      throw new Error(`Kursimport für ${asset.type} „${asset.name}“ (${asset.ticker}) fehlgeschlagen: ${reason}`);
    }
  }

  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) throw new Error("TWELVE_DATA_API_KEY ist nicht konfiguriert.");

  try {
    const prices = await fetchSeries(asset.ticker, apiKey);
    if (asset.currency === "EUR") return prices.map((price) => ({ date: price.date, closeEur: price.value }));

    const exchangeRates = await fetchSeries(`${asset.currency}/EUR`, apiKey);
    const sortedRates = exchangeRates.sort((a, b) => a.date.localeCompare(b.date));
    let rateIndex = 0;
    let currentRate: number | undefined;
    return prices
      .sort((a, b) => a.date.localeCompare(b.date))
      .flatMap((price) => {
        while (rateIndex < sortedRates.length && sortedRates[rateIndex].date <= price.date) {
          currentRate = sortedRates[rateIndex].value;
          rateIndex += 1;
        }
        return currentRate ? [{ date: price.date, closeEur: price.value * currentRate }] : [];
      });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unbekannter Fehler";
    throw new Error(`Kursimport für ${asset.type} „${asset.name}“ (${asset.ticker}) fehlgeschlagen: ${reason}`);
  }
}

export async function syncAllPrices(): Promise<number> {
  let imported = 0;
  const source = portfolioPerformanceConfigured() ? "Portfolio Performance" : "Twelve Data";
  for (const asset of listAssets()) {
    const prices = await fetchDailyPricesEur(asset, source === "Portfolio Performance" ? latestPriceDate(asset.id) : undefined);
    for (const price of prices) insertPrice(asset.id, price.date, price.closeEur, source);
    imported += prices.length;
  }
  return imported;
}

async function fetchSeries(symbol: string, apiKey: string): Promise<{ date: string; value: number }[]> {
  const url = new URL("https://api.twelvedata.com/time_series");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", "1day");
  url.searchParams.set("outputsize", "5000");
  url.searchParams.set("order", "ASC");
  url.searchParams.set("apikey", apiKey);
  const response = await fetch(url, { cache: "no-store" });
  const payload = (await response.json().catch(() => undefined)) as TwelveDataResponse | undefined;
  if (!response.ok) {
    const reason = payload?.message ? `${payload.message} (HTTP ${response.status})` : `HTTP ${response.status}`;
    throw new Error(`Twelve Data für ${symbol}: ${reason}`);
  }
  if (!payload || payload.status === "error" || !payload.values) {
    throw new Error(`Twelve Data für ${symbol}: ${payload?.message || "Keine Kursdaten erhalten."}`);
  }
  return payload.values.map((row) => ({ date: row.datetime.slice(0, 10), value: Number(row.close) }));
}
