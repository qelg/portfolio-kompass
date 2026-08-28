import { ArrowDownRight, ArrowUpRight, Landmark, Plus, RefreshCw, WalletCards } from "lucide-react";
import Link from "next/link";
import { createAccount, createAsset, createEtfHolding, createTransaction, syncPrices } from "./actions";
import { dashboardData, dashboardPeriod, listAccounts, lookThroughAllocation } from "@/lib/repository";
import { portfolioPerformanceConfigured } from "@/lib/portfolio-performance";
import type { PortfolioPoint, TransactionType } from "@/lib/types";

export const dynamic = "force-dynamic";

const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const percent = new Intl.NumberFormat("de-DE", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
const number = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 4 });
const transactionNames: Record<TransactionType, string> = {
  BUY: "Kauf",
  SELL: "Verkauf",
  DEPOSIT: "Einzahlung",
  WITHDRAWAL: "Auszahlung",
  DIVIDEND: "Dividende",
  INTEREST: "Zinsen",
  FEE: "Gebühr",
};

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period = "all" } = await searchParams;
  const data = dashboardData();
  const performance = dashboardPeriod(period);
  const accounts = listAccounts();
  const lookThrough = lookThroughAllocation();
  const marketDataConfigured = portfolioPerformanceConfigured() || Boolean(process.env.TWELVE_DATA_API_KEY);
  const etfs = data.assets.filter((asset) => asset.type === "ETF");
  const stocks = data.assets.filter((asset) => asset.type === "STOCK");
  const periodLabel = performance.options.find((option) => option.value === performance.selected)!.label;

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top"><span className="brandmark">K</span><span>Portfolio Kompass</span></a>
        <nav><a href="#portfolio">Portfolio</a><a href="#exposure">Durchleuchtung</a><a href="#activity">Aktivitäten</a></nav>
        <details className="action-menu">
          <summary className="button primary"><Plus size={17} /> Hinzufügen</summary>
          <div className="popover"><EntryForms accounts={accounts} assets={data.assets} etfs={etfs} stocks={stocks} /></div>
        </details>
      </header>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">Gesamtvermögen</p>
          <h1>{eur.format(data.totalValueEur)}</h1>
          <div className={`change ${performance.gainEur >= 0 ? "positive" : "negative"}`}>
            {performance.gainEur >= 0 ? <ArrowUpRight size={17} /> : <ArrowDownRight size={17} />}
            {eur.format(performance.gainEur)} Wertentwicklung · {periodLabel}
          </div>
        </div>
        <form action={syncPrices}>
          <button className="button ghost" type="submit" disabled={!marketDataConfigured}>
            <RefreshCw size={16} /> Kurse aktualisieren
          </button>
          {!marketDataConfigured && <small>Kursdaten-Zugang konfigurieren</small>}
        </form>
      </section>

      {accounts.length === 0 ? <EmptyState /> : (
        <>
          <nav className="period-picker" aria-label="Zeitraum">
            {performance.options.map((option) => (
              <Link
                className={option.value === performance.selected ? "active" : undefined}
                href={option.value === "all" ? "/#portfolio" : `/?period=${option.value}#portfolio`}
                key={option.value}
              >{option.label}</Link>
            ))}
          </nav>
          <section className="metric-grid">
            <Metric label="Zeitgewichtet (TWR)" value={percent.format(performance.twr)} hint={`Ein- und Auszahlungen neutralisiert · ${periodLabel}`} tone={performance.twr >= 0 ? "good" : "bad"} />
            <Metric label="Kapitalgewichtet (MWR)" value={performance.mwr === null ? "–" : percent.format(performance.mwr)} hint={`XIRR p. a. · ${periodLabel}`} tone={(performance.mwr ?? 0) >= 0 ? "good" : "bad"} />
            <Metric label="Liquidität & Tagesgeld" value={eur.format(data.cashEur)} hint={`${data.totalValueEur ? percent.format(data.cashEur / data.totalValueEur) : "0 %"} des Vermögens`} />
            <Metric label="Dividenden & Zinsen" value={eur.format(performance.incomeEur)} hint={`Erträge · ${periodLabel}`} />
          </section>

          <section className="split" id="portfolio">
            <article className="card chart-card">
              <div className="section-head"><div><p className="eyebrow">Verlauf</p><h2>Portfoliowert</h2></div><span className="tag">EUR · {periodLabel}</span></div>
              <PortfolioChart points={performance.series} />
            </article>
            <article className="card allocation-card">
              <div className="section-head"><div><p className="eyebrow">Allokation</p><h2>Nach Anlage</h2></div></div>
              <div className="allocation-bar">
                {data.holdings.map((holding, index) => <span key={holding.asset.id} style={{ width: `${holding.allocation * 100}%`, background: palette[index % palette.length] }} />)}
                <span style={{ width: `${data.totalValueEur ? data.cashEur / data.totalValueEur * 100 : 0}%`, background: "#dfe3dc" }} />
              </div>
              <div className="legend">
                {data.holdings.map((holding, index) => <Legend key={holding.asset.id} color={palette[index % palette.length]} name={holding.asset.name} value={holding.allocation} />)}
                <Legend color="#dfe3dc" name="Liquidität & Tagesgeld" value={data.totalValueEur ? data.cashEur / data.totalValueEur : 0} />
              </div>
            </article>
          </section>

          <section className="card" id="holdings">
            <div className="section-head"><div><p className="eyebrow">Positionen</p><h2>Meine Anlagen</h2></div><span className="subtle">{data.holdings.length} Positionen</span></div>
            <div className="table-wrap"><table><thead><tr><th>Anlage</th><th>Stück</th><th>Kurs</th><th>Wert</th><th>Gewinn / Verlust</th><th>Anteil</th></tr></thead>
              <tbody>{data.holdings.map((holding) => <tr key={holding.asset.id}>
                <td><div className="asset"><span className={`asset-icon ${holding.asset.type.toLowerCase()}`}>{holding.asset.type === "ETF" ? "E" : holding.asset.name[0]}</span><div><strong>{holding.asset.name}</strong><small>{holding.asset.ticker} · {holding.asset.type}</small></div></div></td>
                <td>{number.format(holding.quantity)}</td><td>{eur.format(holding.priceEur)}</td><td><strong>{eur.format(holding.valueEur)}</strong></td>
                <td className={holding.gainEur >= 0 ? "positive-text" : "negative-text"}>{holding.gainEur >= 0 ? "+" : ""}{eur.format(holding.gainEur)}<small>{holding.gainPercent === null ? "–" : percent.format(holding.gainPercent)}</small></td>
                <td>{percent.format(holding.allocation)}</td>
              </tr>)}</tbody></table></div>
          </section>

          <section className="split exposure" id="exposure">
            <article className="card">
              <div className="section-head"><div><p className="eyebrow">ETF-Look-through</p><h2>Welche Aktien besitze ich wirklich?</h2></div></div>
              {lookThrough.rows.length ? <div className="exposure-list">{lookThrough.rows.slice(0, 8).map((row, index) => <div className="exposure-row" key={row.asset.id}>
                <span className="rank">{String(index + 1).padStart(2, "0")}</span><div><strong>{row.asset.name}</strong><span className="mini-bar"><i style={{ width: `${Math.min(100, row.allocation * 800)}%` }} /></span></div><b>{percent.format(row.allocation)}</b>
              </div>)}</div> : <p className="empty-copy">Noch keine ETF-Bestandteile hinterlegt.</p>}
              {lookThrough.unclassifiedEur > 0 && <p className="note">{eur.format(lookThrough.unclassifiedEur)} der ETF-Werte sind noch nicht einzelnen Aktien zugeordnet.</p>}
            </article>
            <article className="card explainer"><span className="illustration"><WalletCards size={34} /></span><p className="eyebrow">Warum das wichtig ist</p><h2>Versteckte Konzentration erkennen</h2><p>Direkte Aktien und ihre Anteile in ETFs werden zusammengezählt. So siehst du echte Überschneidungen statt nur Fondsnamen.</p></article>
          </section>

          <section className="card" id="activity">
            <div className="section-head"><div><p className="eyebrow">Journal</p><h2>Letzte Aktivitäten</h2></div></div>
            <div className="activity-list">{[...data.transactions].reverse().slice(0, 8).map((transaction) => {
              const asset = data.assets.find((item) => item.id === transaction.assetId);
              return <div className="activity" key={transaction.id}><span className="activity-icon">{transaction.type === "INTEREST" ? "%" : transaction.type === "DIVIDEND" ? "D" : "↕"}</span><div><strong>{transactionNames[transaction.type]}{asset ? ` · ${asset.name}` : ""}</strong><small>{new Intl.DateTimeFormat("de-DE").format(new Date(`${transaction.date}T12:00:00`))}{transaction.note ? ` · ${transaction.note}` : ""}</small></div><b>{eur.format(transaction.amountEur)}</b></div>;
            })}</div>
          </section>
        </>
      )}
      <footer>Portfolio Kompass · Deine Daten bleiben in deiner SQLite-Datenbank.</footer>
    </main>
  );
}

const palette = ["#193d33", "#c5ff65", "#5b7c70", "#e9b949", "#8ebcae"];

function Metric({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: "good" | "bad" }) {
  return <article className="metric"><span>{label}</span><strong className={tone}>{value}</strong><small>{hint}</small></article>;
}

function Legend({ color, name, value }: { color: string; name: string; value: number }) {
  return <div><span className="dot" style={{ background: color }} /><span>{name}</span><b>{percent.format(value)}</b></div>;
}

function PortfolioChart({ points }: { points: PortfolioPoint[] }) {
  if (points.length < 2) return <div className="chart-empty">Mit Kursen und Buchungen entsteht hier dein Verlauf.</div>;
  const width = 800, height = 260, pad = 18;
  const values = points.map((point) => point.valueEur);
  const min = Math.min(...values) * 0.96, max = Math.max(...values) * 1.02;
  const coordinates = points.map((point, index) => ({ x: pad + index / (points.length - 1) * (width - 2 * pad), y: height - pad - (point.valueEur - min) / (max - min || 1) * (height - 2 * pad) }));
  const line = coordinates.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
  const area = `${line} L${coordinates.at(-1)!.x},${height} L${coordinates[0].x},${height} Z`;
  return <div className="chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Entwicklung des Portfoliowerts"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c5ff65" stopOpacity=".42" /><stop offset="1" stopColor="#c5ff65" stopOpacity="0" /></linearGradient></defs><path d={area} fill="url(#area)" /><path d={line} fill="none" stroke="#193d33" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg><div className="chart-labels"><span>{new Intl.DateTimeFormat("de-DE", { month: "short", year: "2-digit" }).format(new Date(points[0].date))}</span><span>{new Intl.DateTimeFormat("de-DE", { month: "short", year: "2-digit" }).format(new Date(points.at(-1)!.date))}</span></div></div>;
}

function EmptyState() {
  return <section className="empty-state"><span><Landmark size={36} /></span><h2>Baue dein Portfolio auf</h2><p>Lege zuerst ein Depot oder Tagesgeldkonto an. Danach kannst du Anlagen und Buchungen erfassen.</p><p className="note">Zum Erkunden: <code>pnpm db:seed</code> legt ein Demo-Portfolio an.</p></section>;
}

function EntryForms({ accounts, assets, etfs, stocks }: { accounts: ReturnType<typeof listAccounts>; assets: ReturnType<typeof dashboardData>["assets"]; etfs: ReturnType<typeof dashboardData>["assets"]; stocks: ReturnType<typeof dashboardData>["assets"] }) {
  const today = new Date().toISOString().slice(0, 10);
  return <div className="forms">
    <details open><summary>Buchung</summary><form action={createTransaction} className="form-grid">
      <label>Konto<select name="accountId" required><option value="">Auswählen</option>{accounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label>
      <label>Art<select name="type" required>{Object.entries(transactionNames).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
      <label>Wertpapier<select name="assetId"><option value="">Keines / Geldkonto</option>{assets.map((asset) => <option value={asset.id} key={asset.id}>{asset.name}</option>)}</select></label>
      <label>Datum<input name="date" type="date" defaultValue={today} required /></label><label>Stück<input name="quantity" type="number" min="0" step="any" defaultValue="0" /></label>
      <label>Betrag gesamt (€)<input name="amountEur" type="number" min="0.01" step="0.01" required /></label><label>Gebühren (€)<input name="feesEur" type="number" min="0" step="0.01" defaultValue="0" /></label>
      <label className="wide">Notiz<input name="note" /></label><button className="button primary wide" type="submit">Buchung speichern</button>
    </form></details>
    <details><summary>Konto</summary><form action={createAccount} className="form-grid"><label className="wide">Name<input name="name" required placeholder="z. B. ING Tagesgeld" /></label><label className="wide">Typ<select name="type"><option value="BROKERAGE">Depot</option><option value="SAVINGS">Tagesgeld</option></select></label><button className="button primary wide">Konto anlegen</button></form></details>
    <details><summary>Aktie / ETF</summary><form action={createAsset} className="form-grid"><label className="wide">Name<input name="name" required /></label><label>Ticker<input name="ticker" required placeholder="AAPL oder VWCE:XETR" /></label><label>ISIN<input name="isin" /></label><label>Typ<select name="type"><option value="STOCK">Aktie</option><option value="ETF">ETF</option></select></label><label>Währung<input name="currency" defaultValue="EUR" minLength={3} maxLength={3} /></label><button className="button primary wide">Anlage speichern</button></form></details>
    <details><summary>ETF-Bestandteil</summary><form action={createEtfHolding} className="form-grid"><label className="wide">ETF<select name="etfAssetId" required>{etfs.map((asset) => <option value={asset.id} key={asset.id}>{asset.name}</option>)}</select></label><label className="wide">Enthaltene Aktie<select name="underlyingAssetId" required>{stocks.map((asset) => <option value={asset.id} key={asset.id}>{asset.name}</option>)}</select></label><label>Stichtag<input name="asOf" type="date" defaultValue={today} required /></label><label>Gewicht (%)<input name="weightPercent" type="number" min="0.0001" max="100" step="any" required /></label><button className="button primary wide">Anteil speichern</button></form></details>
  </div>;
}
