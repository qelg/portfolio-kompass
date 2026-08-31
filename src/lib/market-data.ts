import type { Asset } from "./types";
import { findAsset } from "./calculations";
import { insertPrice, latestPriceDate, listAssets } from "./repository";
import { fetchPortfolioPerformancePrices, portfolioPerformanceConfigured } from "./portfolio-performance";

type PriceRange = { fromDate?: string; toDate?: string };

type TwelveDataResponse = {
  status?: "error";
  message?: string;
  values?: { datetime: string; close: string }[];
};

export async function fetchDailyPricesEur(
  asset: Asset,
  range?: PriceRange,
): Promise<{ date: string; closeEur: number }[]> {
  if (portfolioPerformanceConfigured()) {
    try {
      return await fetchPortfolioPerformancePrices(asset, range);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unbekannter Fehler";
      throw new Error(`Kursimport für ${asset.type} „${asset.name}“ (${asset.ticker}) fehlgeschlagen: ${reason}`);
    }
  }

  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) throw new Error("TWELVE_DATA_API_KEY ist nicht konfiguriert.");

  try {
    const prices = await fetchSeries(asset.ticker, apiKey, range);
    if (asset.currency === "EUR") return prices.map((price) => ({ date: price.date, closeEur: price.value }));

    const exchangeRates = await fetchSeries(`${asset.currency}/EUR`, apiKey, range);
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
  const errors: string[] = [];
  const source = portfolioPerformanceConfigured() ? "Portfolio Performance" : "Twelve Data";
  for (const asset of listAssets()) {
    try {
      const prices = await fetchDailyPricesEur(
        asset,
        source === "Portfolio Performance" ? incrementalRange(latestPriceDate(asset.id)) : undefined,
      );
      for (const price of prices) insertPrice(asset.id, price.date, price.closeEur, source);
      imported += prices.length;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Kursimport für „${asset.name}“ fehlgeschlagen.`);
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
  return imported;
}

export async function syncPricesNearDate(assetId: number, date: string): Promise<number> {
  const asset = findAsset(listAssets(), assetId);
  const source = portfolioPerformanceConfigured() ? "Portfolio Performance" : "Twelve Data";
  const prices = await fetchDailyPricesEur(asset, {
    fromDate: shiftDate(date, -7),
    toDate: shiftDate(date, 7) < today() ? shiftDate(date, 7) : today(),
  });
  for (const price of prices) insertPrice(asset.id, price.date, price.closeEur, source);
  if (!prices.length) throw new Error(`Rund um den ${date} wurde kein Kurs für „${asset.name}“ gefunden.`);
  return prices.length;
}

function incrementalRange(latestDate?: string): PriceRange | undefined {
  return latestDate ? { fromDate: shiftDate(latestDate, -7) } : undefined;
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function fetchSeries(symbol: string, apiKey: string, range?: PriceRange): Promise<{ date: string; value: number }[]> {
  const url = new URL("https://api.twelvedata.com/time_series");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", "1day");
  url.searchParams.set("outputsize", "5000");
  url.searchParams.set("order", "ASC");
  url.searchParams.set("apikey", apiKey);
  if (range?.fromDate) url.searchParams.set("start_date", range.fromDate);
  if (range?.toDate) url.searchParams.set("end_date", range.toDate);
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
