export type AssetType = "STOCK" | "ETF";
export type AccountType = "BROKERAGE" | "SAVINGS";
export type TransactionType =
  | "BUY"
  | "SELL"
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "DIVIDEND"
  | "INTEREST"
  | "FEE";

export interface Account {
  id: number;
  name: string;
  type: AccountType;
}

export interface Asset {
  id: number;
  name: string;
  ticker: string;
  isin: string | null;
  type: AssetType;
  currency: string;
}

export interface Transaction {
  id: number;
  accountId: number;
  assetId: number | null;
  type: TransactionType;
  date: string;
  quantity: number;
  amountEur: number;
  feesEur: number;
  note: string | null;
}

export interface Price {
  assetId: number;
  date: string;
  closeEur: number;
  source: string;
}

export interface MissingPricePeriod {
  asset: Asset;
  startDate: string;
  endDate: string;
  days: number;
  suggestedDate: string;
}

export interface HoldingRow {
  asset: Asset;
  quantity: number;
  priceEur: number;
  priceDate: string | null;
  priceSource: string | null;
  valueEur: number;
  costEur: number;
  gainEur: number;
  gainPercent: number | null;
  allocation: number;
}

export interface PortfolioPoint {
  date: string;
  valueEur: number;
  totalQuantity: number;
  netFlowEur: number;
  twr: number;
}

export interface PerformancePoint extends PortfolioPoint {
  gainEur: number;
  periodTwr: number;
  periodMwr: number | null;
}
