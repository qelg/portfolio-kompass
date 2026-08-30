"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { syncAllPrices } from "@/lib/market-data";

const nonEmpty = z.string().trim().min(1);
const positiveNumber = z.coerce.number().positive();

export async function createAccount(formData: FormData) {
  const input = z.object({ name: nonEmpty, type: z.enum(["BROKERAGE", "SAVINGS"]) }).parse(Object.fromEntries(formData));
  db.prepare("INSERT INTO accounts(name, type) VALUES (?, ?)").run(input.name, input.type);
  revalidatePath("/");
}

export async function createAsset(formData: FormData) {
  const input = z
    .object({
      name: nonEmpty,
      ticker: nonEmpty,
      isin: z.string().trim(),
      type: z.enum(["STOCK", "ETF"]),
      currency: z.string().trim().length(3),
    })
    .parse(Object.fromEntries(formData));
  db.prepare("INSERT INTO assets(name, ticker, isin, type, currency) VALUES (?, ?, ?, ?, ?)").run(
    input.name,
    input.ticker.toUpperCase(),
    input.isin || null,
    input.type,
    input.currency.toUpperCase(),
  );
  revalidatePath("/");
}

export async function createTransaction(formData: FormData) {
  const raw = Object.fromEntries(formData);
  const input = z
    .object({
      accountId: z.coerce.number().int().positive(),
      assetId: z.string(),
      type: z.enum(["BUY", "SELL", "DEPOSIT", "WITHDRAWAL", "DIVIDEND", "INTEREST", "FEE"]),
      date: z.iso.date(),
      quantity: z.coerce.number().min(0),
      amountEur: positiveNumber,
      feesEur: z.coerce.number().min(0),
      note: z.string().trim(),
    })
    .parse(raw);
  const needsAsset = input.type === "BUY" || input.type === "SELL" || input.type === "DIVIDEND";
  const assetId = input.assetId ? Number(input.assetId) : null;
  if (needsAsset && !assetId) throw new Error("Für diese Buchungsart ist ein Wertpapier erforderlich.");
  if ((input.type === "BUY" || input.type === "SELL") && input.quantity <= 0) {
    throw new Error("Käufe und Verkäufe benötigen eine positive Stückzahl.");
  }
  db.prepare(
    `INSERT INTO transactions(account_id, asset_id, type, date, quantity, amount_eur, fees_eur, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(input.accountId, assetId, input.type, input.date, input.quantity, input.amountEur, input.feesEur, input.note || null);
  revalidatePath("/");
}

export async function deleteTransaction(formData: FormData) {
  const { transactionId } = z
    .object({ transactionId: z.coerce.number().int().positive() })
    .parse(Object.fromEntries(formData));
  const result = db.prepare("DELETE FROM transactions WHERE id = ?").run(transactionId);
  if (result.changes === 0) throw new Error("Buchung nicht gefunden.");
  revalidatePath("/");
}

export async function createEtfHolding(formData: FormData) {
  const input = z
    .object({
      etfAssetId: z.coerce.number().int().positive(),
      underlyingAssetId: z.coerce.number().int().positive(),
      asOf: z.iso.date(),
      weightPercent: z.coerce.number().positive().max(100),
    })
    .parse(Object.fromEntries(formData));
  if (input.etfAssetId === input.underlyingAssetId) throw new Error("Ein ETF kann sich nicht selbst enthalten.");
  db.prepare(
    `INSERT INTO etf_holdings(etf_asset_id, underlying_asset_id, as_of, weight) VALUES (?, ?, ?, ?)
     ON CONFLICT(etf_asset_id, underlying_asset_id, as_of) DO UPDATE SET weight = excluded.weight`,
  ).run(input.etfAssetId, input.underlyingAssetId, input.asOf, input.weightPercent / 100);
  revalidatePath("/");
}

export async function syncPrices() {
  await syncAllPrices();
  revalidatePath("/");
}
