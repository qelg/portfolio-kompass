import { db } from "../src/lib/db";

db.exec(`
  DELETE FROM etf_holdings;
  DELETE FROM prices;
  DELETE FROM transactions;
  DELETE FROM assets;
  DELETE FROM accounts;

  INSERT INTO accounts(id, name, type) VALUES
    (1, 'Scalable Depot', 'BROKERAGE'),
    (2, 'ING Extra-Konto', 'SAVINGS');

  INSERT INTO assets(id, name, ticker, isin, type, currency) VALUES
    (1, 'Vanguard FTSE All-World', 'VWCE:XETR', 'IE00BK5BQT80', 'ETF', 'EUR'),
    (2, 'Apple', 'AAPL', 'US0378331005', 'STOCK', 'USD'),
    (3, 'Microsoft', 'MSFT', 'US5949181045', 'STOCK', 'USD'),
    (4, 'NVIDIA', 'NVDA', 'US67066G1040', 'STOCK', 'USD');

  INSERT INTO transactions(account_id, asset_id, type, date, quantity, amount_eur, fees_eur, note) VALUES
    (1, NULL, 'DEPOSIT', '2025-01-02', 0, 15000, 0, 'Startkapital'),
    (1, 1, 'BUY', '2025-01-03', 80, 10320, 1, 'Sparplan und Einmalkauf'),
    (1, 2, 'BUY', '2025-02-03', 10, 2200, 1, NULL),
    (2, NULL, 'DEPOSIT', '2025-01-02', 0, 10000, 0, 'Notgroschen'),
    (2, NULL, 'INTEREST', '2025-03-31', 0, 72.50, 0, 'Q1 Zinsen'),
    (1, 2, 'DIVIDEND', '2025-05-15', 0, 2.25, 0, 'Apple Dividende'),
    (2, NULL, 'INTEREST', '2025-06-30', 0, 75.10, 0, 'Q2 Zinsen');

  INSERT INTO prices(asset_id, date, close_eur, source) VALUES
    (1, '2025-01-03', 129.00, 'Demo'), (2, '2025-02-03', 220.00, 'Demo'),
    (1, '2025-03-31', 124.20, 'Demo'), (2, '2025-03-31', 205.50, 'Demo'),
    (1, '2025-05-15', 132.80, 'Demo'), (2, '2025-05-15', 214.00, 'Demo'),
    (1, '2025-06-30', 137.40, 'Demo'), (2, '2025-06-30', 228.50, 'Demo');

  INSERT INTO etf_holdings(etf_asset_id, underlying_asset_id, as_of, weight) VALUES
    (1, 2, '2025-06-30', 0.041),
    (1, 3, '2025-06-30', 0.038),
    (1, 4, '2025-06-30', 0.032);
`);

console.log("Demo-Portfolio wurde angelegt.");
