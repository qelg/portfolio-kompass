# Portfolio Kompass

Eine lokale Web-Anwendung zum Erfassen und Analysieren von Aktien, ETFs, Tagesgeld, Dividenden und Zinsen. Alle Werte und historischen Kurse werden in EUR in einer SQLite-Datenbank gespeichert.

## Enthalten

- Depots und Tagesgeldkonten
- Käufe, Verkäufe, Ein-/Auszahlungen, Gebühren, Dividenden und Zinsen
- historische Tageskurse über Twelve Data oder den persönlichen Portfolio-Performance-Zugang
- zeitgewichtete Rendite (TWR) und kapitalgewichtete Rendite (MWR/XIRR)
- Einstandskosten nach gleitendem Durchschnitt
- ETF-Look-through: direkte und indirekte Aktienpositionen werden aggregiert
- responsives Dashboard und Buchungsjournal

## Lokal starten

Voraussetzungen: Node.js 22+ und pnpm.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Alternativ stellt der Nix-Development-Shell Node.js und pnpm in den passenden Versionen bereit:

```bash
nix develop
pnpm install --frozen-lockfile
```

Ohne API-Key lässt sich alles außer dem Kursimport nutzen. Für ein gefülltes Beispielportfolio:

```bash
pnpm db:seed
```

Der Seed löscht vorhandene lokale Daten. Die produktiven Daten liegen standardmäßig unter `data/portfolio.db` und werden nicht in Git eingecheckt.

## Kursdaten

In `.env.local` einen `TWELVE_DATA_API_KEY` setzen. Ticker müssen dem Twelve-Data-Format entsprechen, beispielsweise `AAPL` oder `VWCE:XETR`. Der Button **Kurse aktualisieren** importiert die gesamte verfügbare Tageshistorie und ersetzt vorhandene Werte desselben Datums.

Alternativ kann der persönliche historische Kursdienst von Portfolio Performance verwendet werden. Die Anmeldung nutzt den regulären OAuth-PKCE-Ablauf und speichert ausschließlich das rotierbare Refresh-Token mit Dateimodus `0600`:

```bash
node scripts/portfolio-performance-auth.mjs data/portfolio-performance-refresh-token
```

Die ausgegebene Adresse im Browser öffnen und danach in `.env.local` konfigurieren:

```dotenv
PORTFOLIO_PERFORMANCE_TOKEN_PATH=data/portfolio-performance-refresh-token
```

Der Import sucht Wertpapiere bevorzugt per ISIN, wählt eine EUR-Notierung auf Xetra und lädt bis zu zehn Jahre Tageshistorie. Dieser Dienst ist keine dokumentierte Drittanbieter-API. Seine Nutzung erfolgt auf eigenes Risiko und nur im Rahmen der [Portfolio-Performance-Nutzungsbedingungen](https://www.portfolio-performance.app/terms); Zugangsdaten oder Kursdaten dürfen nicht an Dritte weitergegeben werden.

Für einen automatischen täglichen Import `CRON_SECRET` setzen und einen externen Scheduler konfigurieren:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://example.org/api/sync-prices
```

## Renditelogik

- **TWR** verkettet die Periodenrenditen und neutralisiert Ein- und Auszahlungen. Käufe und Verkäufe sind interne Umschichtungen; Dividenden und Zinsen sind Erträge.
- **MWR/XIRR** berücksichtigt Höhe und Zeitpunkt des eingesetzten Kapitals und wird als annualisierte Rendite angezeigt.
- Kurse werden mit dem letzten bekannten Schlusskurs fortgeschrieben. An Tagen ohne Börsenkurs bleibt der letzte Wert bestehen.
- ETF-Bestandteile sind stichtagsbezogen. Für die aktuelle Durchleuchtung wird je ETF der neueste Stichtag verwendet; der nicht erfasste Rest wird separat ausgewiesen.

## Prüfen

```bash
pnpm test
pnpm build
```

Das MVP ist für eine einzelne lokale Nutzerin bzw. einen einzelnen lokalen Nutzer ausgelegt. Vor einer öffentlichen Bereitstellung sollten Anmeldung, CSRF-Schutz, Backups und ein servergeeigneter persistenter Datenbankdienst ergänzt werden.
