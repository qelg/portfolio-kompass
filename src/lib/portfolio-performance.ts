import { promises as fs } from "node:fs";
import type { Asset } from "./types";

const apiBaseUrl = "https://api.portfolio-performance.info";
const tokenUrl = "https://accounts.portfolio-performance.info/oidc/token";
const defaultClientId = "d6d0voq1w081sxty0qq7a";

type SearchResult = {
  description: string;
  isin?: string;
  markets: { currency: string; exchange: string; symbol: string }[];
};

type CandleResponse = {
  s?: "ok" | "no_data";
  t?: number[];
  c?: number[];
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

let cachedAccessToken: { value: string; expiresAt: number } | undefined;

export async function fetchPortfolioPerformancePrices(
  asset: Asset,
  latestDate?: string,
): Promise<{ date: string; closeEur: number }[]> {
  const tokenPath = process.env.PORTFOLIO_PERFORMANCE_TOKEN_PATH;
  if (!tokenPath) throw new Error("PORTFOLIO_PERFORMANCE_TOKEN_PATH ist nicht konfiguriert.");

  const searchUrl = new URL("/v1/search", apiBaseUrl);
  if (asset.isin) searchUrl.searchParams.set("isin", asset.isin);
  else searchUrl.searchParams.set("symbol", asset.ticker);

  const searchResponse = await fetch(searchUrl, { cache: "no-store" });
  const results = (await searchResponse.json().catch(() => undefined)) as SearchResult[] | undefined;
  if (!searchResponse.ok || !results?.length) {
    throw new Error(`Portfolio Performance findet keine Notierung für ${asset.isin || asset.ticker}.`);
  }

  const markets = results.flatMap((result) => result.markets);
  const market =
    markets.find((candidate) => candidate.exchange === "XETR" && candidate.currency === "EUR") ??
    markets.find((candidate) => candidate.currency === "EUR");
  if (!market) {
    throw new Error(`Portfolio Performance findet keine EUR-Notierung für ${asset.isin || asset.ticker}.`);
  }

  const now = new Date();
  const fromDate = latestDate ? new Date(`${latestDate}T00:00:00Z`) : new Date(Date.UTC(now.getUTCFullYear() - 10, 0, 1));
  if (latestDate) fromDate.setUTCDate(fromDate.getUTCDate() - 7);
  const candleUrl = new URL("/v1/candle", apiBaseUrl);
  candleUrl.searchParams.set("symbol", market.symbol);
  candleUrl.searchParams.set("from", String(Math.floor(fromDate.getTime() / 1000)));
  candleUrl.searchParams.set("to", String(Math.floor(Date.now() / 1000)));

  const accessToken = await getAccessToken(tokenPath);
  const candleResponse = await fetch(candleUrl, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "PortfolioKompass/0.1" },
  });
  const candles = (await candleResponse.json().catch(() => undefined)) as CandleResponse | undefined;
  if (!candleResponse.ok) {
    throw new Error(`Portfolio Performance für ${market.symbol}: HTTP ${candleResponse.status}`);
  }
  if (candles?.s === "no_data") return [];
  if (candles?.s !== "ok" || !candles.t || !candles.c || candles.t.length !== candles.c.length) {
    throw new Error(`Portfolio Performance liefert keine gültigen Kursdaten für ${market.symbol}.`);
  }

  return candles.t.flatMap((timestamp, index) => {
    const value = candles.c![index];
    return Number.isFinite(value)
      ? [{ date: new Date(timestamp * 1000).toISOString().slice(0, 10), closeEur: value }]
      : [];
  });
}

async function getAccessToken(tokenPath: string): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now()) return cachedAccessToken.value;

  const refreshToken = (await fs.readFile(tokenPath, "utf8")).trim();
  if (!refreshToken) throw new Error("Das Portfolio-Performance-Refresh-Token ist leer.");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: process.env.PORTFOLIO_PERFORMANCE_CLIENT_ID || defaultClientId,
    refresh_token: refreshToken,
    resource: apiBaseUrl,
  });
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const token = (await response.json().catch(() => undefined)) as TokenResponse | undefined;
  if (!response.ok || !token?.access_token) {
    throw new Error(`Portfolio-Performance-Anmeldung fehlgeschlagen (HTTP ${response.status}).`);
  }

  if (token.refresh_token && token.refresh_token !== refreshToken) {
    const temporaryPath = `${tokenPath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, `${token.refresh_token}\n`, { mode: 0o600 });
    await fs.rename(temporaryPath, tokenPath);
  }

  cachedAccessToken = {
    value: token.access_token,
    expiresAt: Date.now() + Math.max(0, (token.expires_in ?? 300) - 60) * 1000,
  };
  return cachedAccessToken.value;
}
