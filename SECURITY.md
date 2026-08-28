# Security Policy

Dieses Repository enthält ausschließlich **deklarative Daten** (Händler→Kategorie-Zuordnungen,
Bank-CSV-Spaltenformate) — keinen ausführbaren Code. Der Schaden, den ein fehlerhafter oder
bösartiger Beitrag anrichten kann, ist dadurch strukturell begrenzt: Klarwert schreibt aus diesen
Daten ausschließlich in die Tabellen `merchants`/`merchant_aliases`, liest nie Beträge/Kontodaten und
führt keinen der übermittelten Werte als Code aus.

## Was wir trotzdem ernst nehmen

### ReDoS über `regex`-Aliase

Der `regex`-Alias-Typ wird von der Klarwert-App bei **jeder** Transaktions-Kategorisierung ausgeführt
(`new RegExp(value).test(...)`). Ein böswillig oder versehentlich konstruiertes Pattern mit
katastrophalem Backtracking (z. B. `(a+)+$`) kann die App bei jedem Import einfrieren.

**Gegenmaßnahme:** `npm run validate` prüft jedes `regex`-Alias gegen eine konservative, statische
Heuristik (siehe `checkRegexSafety()` in [`scripts/validate.mjs`](scripts/validate.mjs)):
verschachtelte Quantifizierer, unverhältnismäßig hohe Wiederholungszähler und Gesamtkomplexität werden
abgelehnt. Diese Heuristik ist **kein formaler Beweis** (ReDoS-Erkennung ist algorithmisch nicht
allgemein entscheidbar), sondern ein bewusst konservativer Filter, der im Zweifel eher zu viele als
zu wenige Patterns ablehnt. Wir verzichten bewusst auf eine Laufzeit-Timeout-Prüfung, weil eine
`setTimeout`/`Promise.race`-basierte "Timeout"-Prüfung eine bereits hängende, synchrone
`RegExp.test()`-Ausführung in JavaScript **nicht tatsächlich unterbrechen kann** — das wäre eine
scheinbar sichere, in Wirklichkeit aber wirkungslose Lösung.

Zusätzlich vertraut die Klarwert-App Community-Daten nicht blind: der Download wird vor der
Verarbeitung mit einem Laufzeit-Schema validiert (siehe Klarwert-App-Repo,
`src/db/repositories/merchants.ts`).

### Keine automatisierte PR-Verarbeitung mit Shell-Zugriff

Eine frühere interne Vorlage für dieses Projekt enthielt eine GitHub Action, die Issue-Inhalte per
`execSync()` in Git-Befehle einsetzte — das ist eine Command-Injection-Schwachstelle (beliebiger
Shell-Code über einen präparierten Issue-Titel/-Body). Diese Version verzichtet bewusst vollständig
auf jede Automatisierung, die Fremdeingaben (Issue-Body, PR-Titel, o. Ä.) in einen Shell-Befehl oder
`git`-Aufruf einsetzt. Der einzige automatisierte Schreibzugriff (`.github/workflows/ci.yml`, Job
`publish-dist`) verarbeitet ausschließlich bereits gemergte, menschlich reviewte Inhalte auf `main`.

### Keine personenbezogenen Daten

`npm run validate` lehnt Werte ab, die wie eine IBAN oder E-Mail-Adresse aussehen. Das ist eine
zusätzliche Absicherung, **kein Ersatz** für Sorgfalt beim Beitragen — siehe [CONTRIBUTING.md](CONTRIBUTING.md).

## Eine Schwachstelle melden

Bitte melde Sicherheitsprobleme (z. B. ein Regex-Pattern, das die Prüfung umgeht, oder eine Lücke in
der Validierung) über den "Security"-Tab dieses GitHub-Repositories (privater Meldeweg) oder per
E-Mail über das Profil des Maintainers, nicht über ein öffentliches Issue.

## Unterstützte Version

Es gibt nur einen aktiven Stand: `main`. Ältere Distributionsdateien werden nicht rückwirkend gepatcht.
